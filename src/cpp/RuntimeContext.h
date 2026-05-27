#pragma once

#include "Effekseer.h"
#include "EffekseerSoundAL.h"
#include <AL/al.h>
#include <AL/alc.h>
#include <algorithm>
#include <array>
#include <cstring>
#include <emscripten.h>
#include <math.h>
#include <memory>
#include <stdlib.h>
#include <string>
#include <vector>

#include "CustomFile.h"

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
#include "EffekseerRendererGL.h"
#include <EffekseerRendererGL/EffekseerRendererGL.MaterialLoader.h>
#include <EffekseerRendererGL/EffekseerRendererGL.RendererImplemented.h>
#include <EffekseerRendererGL/GraphicsDevice.h>
#endif

#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
#include "EffekseerRendererWebGPU.h"
#include <EffekseerRendererLLGI/Common.h>
#include <EffekseerRendererLLGI/EffekseerRendererLLGI.Renderer.h>
#include <EffekseerRendererLLGI/EffekseerRendererLLGI.RendererImplemented.h>
#include <EffekseerRendererLLGI/GraphicsDevice.h>
#include <LLGI.Buffer.h>
#include <LLGI.CommandList.h>
#include <LLGI.Graphics.h>
#include <LLGI.PipelineState.h>
#include <LLGI.Platform.h>
#include <LLGI.Shader.h>
#include <LLGI.Texture.h>
#include <Utils/LLGI.CommandListPool.h>
#include <WebGPU/LLGI.CompilerWebGPU.h>
#include <WebGPU/LLGI.PlatformWebGPU.h>
#endif

namespace
{

static bool g_isEffekseerLogEnabled = false;

void PrintEffekseerLog(const std::string& message)
{
	if (g_isEffekseerLogEnabled)
	{
		printf("%s\n", message.c_str());
	}
}

void ArrayToMatrix44(const float* array, Effekseer::Matrix44& matrix)
{
	for (int i = 0; i < 4; i++)
	{
		for (int j = 0; j < 4; j++)
		{
			matrix.Values[i][j] = array[i * 4 + j];
		}
	}
}

void ArrayToMatrix43(const float* array, Effekseer::Matrix43& matrix)
{
	for (int i = 0; i < 4; i++)
	{
		for (int j = 0; j < 3; j++)
		{
			matrix.Value[i][j] = array[i * 4 + j];
		}
	}
}

void CalculateCameraDirectionAndPosition(const Effekseer::Matrix44& matrix, Effekseer::Vector3D& direction, Effekseer::Vector3D& position)
{
	const auto& mat = matrix;
	direction = -Effekseer::Vector3D(matrix.Values[0][2], matrix.Values[1][2], matrix.Values[2][2]);

	const auto localPos = Effekseer::Vector3D(-mat.Values[3][0], -mat.Values[3][1], -mat.Values[3][2]);
	const auto f = Effekseer::Vector3D(mat.Values[0][2], mat.Values[1][2], mat.Values[2][2]);
	const auto r = Effekseer::Vector3D(mat.Values[0][0], mat.Values[1][0], mat.Values[2][0]);
	const auto u = Effekseer::Vector3D(mat.Values[0][1], mat.Values[1][1], mat.Values[2][1]);
	position = r * localPos.X + u * localPos.Y + f * localPos.Z;
}

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
class WebGLTextureLoader : public Effekseer::TextureLoader
{
	Effekseer::Backend::GraphicsDevice* graphicsDevice_ = nullptr;

public:
	explicit WebGLTextureLoader(Effekseer::Backend::GraphicsDevice* graphicsDevice)
		: graphicsDevice_(graphicsDevice)
	{
	}

	Effekseer::TextureRef Load(const EFK_CHAR* path, Effekseer::TextureType) override
	{
		const int loaded = EM_ASM_INT({ return Module._loadImage(Module.UTF16ToString($0)) != null; }, path);
		if (!loaded)
		{
			return nullptr;
		}

		GLuint texture = 0;
		glGenTextures(1, &texture);

		const int hasMipmap = EM_ASM_INT(
			{
				const binding = GLctx.getParameter(GLctx.TEXTURE_BINDING_2D);
				const img = Module._loadImage(Module.UTF16ToString($0));
				GLctx.bindTexture(GLctx.TEXTURE_2D, GL.textures[$1]);

				const pa = GLctx.getParameter(GLctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
				const oldFlipY = GLctx.getParameter(GLctx.UNPACK_FLIP_Y_WEBGL);
				GLctx.pixelStorei(GLctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
				GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, false);
				GLctx.texImage2D(GLctx.TEXTURE_2D, 0, GLctx.RGBA, GLctx.RGBA, GLctx.UNSIGNED_BYTE, img);
				const isPowerOfTwo = Module._isPowerOfTwo(img);
				if (isPowerOfTwo) {
					GLctx.generateMipmap(GLctx.TEXTURE_2D);
				}
				GLctx.pixelStorei(GLctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pa);
				GLctx.pixelStorei(GLctx.UNPACK_FLIP_Y_WEBGL, oldFlipY);
				GLctx.bindTexture(GLctx.TEXTURE_2D, binding);
				return isPowerOfTwo ? 1 : 0;
			},
			path,
			texture);

		std::array<char, 260> path8{};
		Effekseer::ConvertUtf16ToUtf8(path8.data(), static_cast<int32_t>(path8.size()), path);
		const std::string pathStr = path8.data();

		auto backend = static_cast<EffekseerRendererGL::Backend::GraphicsDevice*>(graphicsDevice_)
						   ->CreateTexture(texture, hasMipmap != 0, [texture, pathStr]() -> void {
							   glDeleteTextures(1, &texture);
							   PrintEffekseerLog("EffekseerForWeb unload texture: " + pathStr);
						   });

		auto textureData = Effekseer::MakeRefPtr<Effekseer::Texture>();
		textureData->SetBackend(backend);
		PrintEffekseerLog("EffekseerForWeb load texture: " + pathStr);
		return textureData;
	}

	void Unload(Effekseer::TextureRef) override {}
};
#endif

#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
const char* CopyVS = R"(
struct VSInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn main(input: VSInput) -> VSOutput {
    var output: VSOutput;
    output.position = vec4<f32>(input.position, 1.0);
    output.uv = input.uv;
    output.color = input.color;
    return output;
}
)";

const char* CopyPS = R"(
@group(1) @binding(0) var colorTexture: texture_2d<f32>;
@group(2) @binding(0) var colorSampler: sampler;

struct PSInput {
    @location(0) uv: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@fragment
fn main(input: PSInput) -> @location(0) vec4<f32> {
    return textureSample(colorTexture, colorSampler, input.uv);
}
)";

struct WebGPUCopyVertex
{
	LLGI::Vec3F Pos;
	LLGI::Vec2F UV;
	LLGI::Color8 Color;
};

Effekseer::Backend::TextureFormatType ToBackendColorFormat(int32_t format)
{
	switch (format)
	{
	case 1:
		return Effekseer::Backend::TextureFormatType::R8G8B8A8_UNORM;
	case 2:
		return Effekseer::Backend::TextureFormatType::B8G8R8A8_UNORM;
	case 3:
		return Effekseer::Backend::TextureFormatType::R8G8B8A8_UNORM_SRGB;
	case 4:
		return Effekseer::Backend::TextureFormatType::B8G8R8A8_UNORM_SRGB;
	default:
		return Effekseer::Backend::TextureFormatType::R8G8B8A8_UNORM;
	}
}

Effekseer::Backend::TextureFormatType ToBackendDepthFormat(int32_t format)
{
	switch (format)
	{
	case 1:
		return Effekseer::Backend::TextureFormatType::D32;
	case 2:
		return Effekseer::Backend::TextureFormatType::D24S8;
	case 3:
		return Effekseer::Backend::TextureFormatType::D32S8;
	default:
		return Effekseer::Backend::TextureFormatType::Unknown;
	}
}
#endif

class Context
{
public:
	Effekseer::ManagerRef manager = nullptr;
	EffekseerRenderer::RendererRef renderer = nullptr;
	EffekseerSound::SoundRef sound = nullptr;
	Effekseer::RefPtr<EffekseerForWeb::CustomFileInterface> fileInterface = nullptr;
	Effekseer::Matrix44 projectionMatrix;
	Effekseer::Matrix44 cameraMatrix;
	float time = 0.0f;
	float restDeltaTime = 0.0f;
	bool isFirstUpdate = false;

	ALCdevice* alcDevice = nullptr;
	ALCcontext* alcContext = nullptr;

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
	GLuint backgroundTexture = 0;
	uint32_t backgroundTextureWidth = 0;
	uint32_t backgroundTextureHeight = 0;
#endif

#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
	LLGI::Window* webgpuWindow = nullptr;
	LLGI::Platform* webgpuPlatform = nullptr;
	LLGI::Graphics* webgpuGraphics = nullptr;
	LLGI::SingleFrameMemoryPool* webgpuMemoryPool = nullptr;
	std::shared_ptr<LLGI::CommandListPool> webgpuCommandListPool = nullptr;
	std::shared_ptr<LLGI::CommandList> webgpuCommandList = nullptr;
	LLGI::RenderPass* webgpuRenderPass = nullptr;
	LLGI::Texture* webgpuColorBuffer = nullptr;
	LLGI::Texture* webgpuDepthBuffer = nullptr;
	Effekseer::RefPtr<EffekseerRenderer::SingleFrameMemoryPool> webgpuEffekseerMemoryPool = nullptr;
	Effekseer::RefPtr<EffekseerRenderer::CommandList> webgpuEffekseerCommandList = nullptr;
	int32_t webgpuWidth = 0;
	int32_t webgpuHeight = 0;
	bool webgpuPremultipliedAlpha = false;
	bool webgpuFrameActive = false;
	bool webgpuRenderPassActive = false;

	LLGI::Shader* copyVS = nullptr;
	LLGI::Shader* copyPS = nullptr;
	LLGI::Buffer* copyVB = nullptr;
	LLGI::Buffer* copyIB = nullptr;
	LLGI::PipelineState* copyPipeline = nullptr;
	LLGI::TextureFormatType copyScreenFormat = LLGI::TextureFormatType::R8G8B8A8_UNORM;
#endif

	bool InitializeSound()
	{
		alcDevice = alcOpenDevice(nullptr);
		if (alcDevice == nullptr)
		{
			return false;
		}
		alcContext = alcCreateContext(alcDevice, nullptr);
		if (alcContext == nullptr)
		{
			alcCloseDevice(alcDevice);
			alcDevice = nullptr;
			return false;
		}
		alcMakeContextCurrent(alcContext);
		sound = EffekseerSound::Sound::Create(32);
		if (sound == nullptr)
		{
			alcMakeContextCurrent(nullptr);
			alcDestroyContext(alcContext);
			alcCloseDevice(alcDevice);
			alcContext = nullptr;
			alcDevice = nullptr;
			return false;
		}
		return sound != nullptr;
	}

	bool InitializeManager(int32_t instanceMaxCount)
	{
		fileInterface = Effekseer::MakeRefPtr<EffekseerForWeb::CustomFileInterface>();
		manager = Effekseer::Manager::Create(instanceMaxCount);
		if (manager == nullptr || renderer == nullptr)
		{
			return false;
		}

		manager->SetSpriteRenderer(renderer->CreateSpriteRenderer());
		manager->SetRibbonRenderer(renderer->CreateRibbonRenderer());
		manager->SetRingRenderer(renderer->CreateRingRenderer());
		manager->SetModelRenderer(renderer->CreateModelRenderer());
		manager->SetTrackRenderer(renderer->CreateTrackRenderer());

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
		manager->SetTextureLoader(Effekseer::MakeRefPtr<WebGLTextureLoader>(renderer->GetGraphicsDevice().Get()));
#else
		manager->SetTextureLoader(renderer->CreateTextureLoader(fileInterface));
#endif
		manager->SetModelLoader(renderer->CreateModelLoader(fileInterface));
		manager->SetMaterialLoader(renderer->CreateMaterialLoader(fileInterface));
		manager->SetCurveLoader(Effekseer::MakeRefPtr<Effekseer::CurveLoader>(fileInterface));

		if (sound != nullptr)
		{
			manager->SetSoundPlayer(sound->CreateSoundPlayer());
			manager->SetSoundLoader(sound->CreateSoundLoader(fileInterface));
		}

		manager->SetCoordinateSystem(Effekseer::CoordinateSystem::RH);
		return true;
	}

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
	bool InitWebGL(int32_t instanceMaxCount, int32_t squareMaxCount, bool isExtensionsEnabled, bool isPremultipliedAlphaEnabled)
	{
		InitializeSound();
		renderer = EffekseerRendererGL::Renderer::Create(
			squareMaxCount,
			EffekseerRendererGL::OpenGLDeviceType::OpenGLES2,
			isExtensionsEnabled,
			isPremultipliedAlphaEnabled);
		return InitializeManager(instanceMaxCount);
	}
#endif

#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
	bool CreateCopyShaders()
	{
		auto compiler = new LLGI::CompilerWebGPU();
		compiler->Initialize();

		LLGI::CompilerResult resultVS;
		LLGI::CompilerResult resultPS;
		std::vector<LLGI::DataStructure> dataVS;
		std::vector<LLGI::DataStructure> dataPS;

		compiler->Compile(resultVS, CopyVS, LLGI::ShaderStageType::Vertex);
		compiler->Compile(resultPS, CopyPS, LLGI::ShaderStageType::Pixel);
		compiler->Release();

		if (resultVS.Message != "" || resultPS.Message != "")
		{
			return false;
		}

		for (auto& b : resultVS.Binary)
		{
			LLGI::DataStructure d;
			d.Data = b.data();
			d.Size = static_cast<int32_t>(b.size());
			dataVS.push_back(d);
		}
		for (auto& b : resultPS.Binary)
		{
			LLGI::DataStructure d;
			d.Data = b.data();
			d.Size = static_cast<int32_t>(b.size());
			dataPS.push_back(d);
		}

		copyVS = webgpuGraphics->CreateShader(dataVS.data(), static_cast<int32_t>(dataVS.size()));
		copyPS = webgpuGraphics->CreateShader(dataPS.data(), static_cast<int32_t>(dataPS.size()));
		return copyVS != nullptr && copyPS != nullptr;
	}

	void ReleaseWebGPUFrameResources()
	{
		LLGI::SafeRelease(webgpuRenderPass);
		LLGI::SafeRelease(webgpuColorBuffer);
		LLGI::SafeRelease(webgpuDepthBuffer);
	}

	bool CreateWebGPUFrameResources(int32_t width, int32_t height)
	{
		webgpuWidth = width;
		webgpuHeight = height;
		ReleaseWebGPUFrameResources();

		LLGI::RenderTextureInitializationParameter renderParam;
		renderParam.Size = LLGI::Vec2I(width, height);
		webgpuColorBuffer = webgpuGraphics->CreateRenderTexture(renderParam);

		LLGI::DepthTextureInitializationParameter depthParam;
		depthParam.Size = LLGI::Vec2I(width, height);
		depthParam.Mode = LLGI::DepthTextureMode::Depth;
		webgpuDepthBuffer = webgpuGraphics->CreateDepthTexture(depthParam);

		LLGI::Texture* textures[] = {webgpuColorBuffer};
		webgpuRenderPass = webgpuGraphics->CreateRenderPass(textures, 1, webgpuDepthBuffer);
		if (webgpuRenderPass == nullptr)
		{
			return false;
		}

		if ((copyVS == nullptr || copyPS == nullptr) && !CreateCopyShaders())
		{
			return false;
		}

		if (copyVB != nullptr && copyIB != nullptr)
		{
			return true;
		}

		copyVB = webgpuGraphics->CreateBuffer(LLGI::BufferUsageType::Vertex | LLGI::BufferUsageType::MapWrite, sizeof(WebGPUCopyVertex) * 4);
		copyIB = webgpuGraphics->CreateBuffer(LLGI::BufferUsageType::Index | LLGI::BufferUsageType::MapWrite, 2 * 6);
		auto vb = static_cast<WebGPUCopyVertex*>(copyVB->Lock());
		vb[0].Pos = LLGI::Vec3F(-1.0f, 1.0f, 0.5f);
		vb[1].Pos = LLGI::Vec3F(1.0f, 1.0f, 0.5f);
		vb[2].Pos = LLGI::Vec3F(1.0f, -1.0f, 0.5f);
		vb[3].Pos = LLGI::Vec3F(-1.0f, -1.0f, 0.5f);
		vb[0].UV = LLGI::Vec2F(0.0f, 0.0f);
		vb[1].UV = LLGI::Vec2F(1.0f, 0.0f);
		vb[2].UV = LLGI::Vec2F(1.0f, 1.0f);
		vb[3].UV = LLGI::Vec2F(0.0f, 1.0f);
		vb[0].Color = vb[1].Color = vb[2].Color = vb[3].Color = LLGI::Color8(255, 255, 255, 255);
		copyVB->Unlock();

		auto ib = static_cast<uint16_t*>(copyIB->Lock());
		ib[0] = 0;
		ib[1] = 1;
		ib[2] = 2;
		ib[3] = 0;
		ib[4] = 2;
		ib[5] = 3;
		copyIB->Unlock();
		return true;
	}

	bool InitWebGPU(int32_t instanceMaxCount, int32_t squareMaxCount, int32_t width, int32_t height, bool isPremultipliedAlphaEnabled)
	{
		InitializeSound();
		webgpuPremultipliedAlpha = isPremultipliedAlphaEnabled;

		webgpuWindow = LLGI::CreateWindow("EffekseerForWeb", LLGI::Vec2I(width, height));
		if (webgpuWindow == nullptr)
		{
			return false;
		}

		LLGI::PlatformParameter platformParam;
		platformParam.Device = LLGI::DeviceType::WebGPU;
		platformParam.WaitVSync = false;
		platformParam.IsPremultipliedAlphaEnabled = isPremultipliedAlphaEnabled;
		webgpuPlatform = LLGI::CreatePlatform(platformParam, webgpuWindow);
		if (webgpuPlatform == nullptr)
		{
			return false;
		}

		webgpuGraphics = webgpuPlatform->CreateGraphics();
		if (webgpuGraphics == nullptr)
		{
			return false;
		}

		webgpuMemoryPool = webgpuGraphics->CreateSingleFrameMemoryPool(1024 * 1024 * 8, 128);
		webgpuCommandListPool = std::make_shared<LLGI::CommandListPool>(webgpuGraphics, webgpuMemoryPool, 3);
		if (!CreateWebGPUFrameResources(width, height))
		{
			return false;
		}

		EffekseerRendererWebGPU::RenderPassInformation renderPassInfo;
		renderPassInfo.DoesPresentToScreen = false;
		renderPassInfo.RenderTextureCount = 1;
		renderPassInfo.RenderTextureFormats[0] = wgpu::TextureFormat::RGBA8Unorm;
		renderPassInfo.DepthFormat = wgpu::TextureFormat::Depth32Float;

		auto graphicsDevice = Effekseer::MakeRefPtr<EffekseerRendererLLGI::Backend::GraphicsDevice>(webgpuGraphics);
		renderer = EffekseerRendererWebGPU::Create(graphicsDevice, renderPassInfo, squareMaxCount, isPremultipliedAlphaEnabled);
		if (renderer == nullptr)
		{
			return false;
		}

		webgpuEffekseerMemoryPool = EffekseerRenderer::CreateSingleFrameMemoryPool(renderer->GetGraphicsDevice());
		return InitializeManager(instanceMaxCount);
	}

	bool AttachWebGPUEffekseerCommandList()
	{
		webgpuEffekseerMemoryPool->NewFrame();
		auto memoryPool = static_cast<EffekseerRendererLLGI::SingleFrameMemoryPool*>(webgpuEffekseerMemoryPool.Get());
		webgpuEffekseerCommandList = Effekseer::MakeRefPtr<EffekseerRendererLLGI::CommandList>(
			webgpuGraphics,
			webgpuCommandList.get(),
			memoryPool->GetInternal());
		renderer->SetCommandList(webgpuEffekseerCommandList);
		return true;
	}

	void ChangeWebGPURenderPassPipelineState(Effekseer::Backend::TextureFormatType colorFormat,
											 Effekseer::Backend::TextureFormatType depthFormat)
	{
		EffekseerRenderer::RenderPassPipelineStateKey key;
		key.RenderTargetCount = 1;
		key.RenderTargetFormats[0] = colorFormat;
		key.DepthFormat = depthFormat;
		EffekseerRenderer::ChangeRenderPassPipelineState(renderer, key);
	}

	bool BeginWebGPUFrame()
	{
		if (webgpuFrameActive || !webgpuPlatform->NewFrame())
		{
			return false;
		}

		webgpuMemoryPool->NewFrame();
		webgpuCommandList = LLGI::CreateSharedPtr(webgpuCommandListPool->Get(true));

		LLGI::Color8 clearColor(0, 0, 0, webgpuPremultipliedAlpha ? 0 : 255);
		webgpuRenderPass->SetClearColor(clearColor);
		webgpuRenderPass->SetIsColorCleared(true);
		webgpuRenderPass->SetIsDepthCleared(true);

		webgpuCommandList->Begin();
		webgpuCommandList->BeginRenderPass(webgpuRenderPass);
		webgpuFrameActive = true;
		webgpuRenderPassActive = true;
		return AttachWebGPUEffekseerCommandList();
	}

	bool BeginExternalWebGPURenderPass(void* renderPassEncoder)
	{
		if (webgpuFrameActive || renderPassEncoder == nullptr)
		{
			return false;
		}

		webgpuMemoryPool->NewFrame();
		webgpuCommandList = LLGI::CreateSharedPtr(webgpuCommandListPool->Get(true));
		webgpuCommandList->Begin();
		if (!webgpuCommandList->BeginRenderPassWithPlatformPtr(renderPassEncoder))
		{
			webgpuCommandList->End();
			webgpuCommandList.reset();
			return false;
		}

		webgpuFrameActive = true;
		webgpuRenderPassActive = true;
		return AttachWebGPUEffekseerCommandList();
	}

	void EndWebGPURenderPass()
	{
		renderer->SetCommandList(nullptr);
		webgpuEffekseerCommandList.Reset();
		if (webgpuRenderPassActive && webgpuCommandList != nullptr)
		{
			webgpuCommandList->EndRenderPass();
			webgpuRenderPassActive = false;
		}
	}

	void EndExternalWebGPURenderPass()
	{
		renderer->SetCommandList(nullptr);
		webgpuEffekseerCommandList.Reset();
		if (webgpuRenderPassActive && webgpuCommandList != nullptr)
		{
			webgpuCommandList->EndRenderPassWithPlatformPtr();
			webgpuRenderPassActive = false;
		}
		if (webgpuCommandList != nullptr)
		{
			webgpuCommandList->EndComputePass();
			webgpuCommandList->End();
			webgpuGraphics->Execute(webgpuCommandList.get());
			webgpuCommandList.reset();
		}
		webgpuFrameActive = false;
	}

	void SubmitWebGPUFrame()
	{
		if (!webgpuFrameActive || webgpuCommandList == nullptr)
		{
			return;
		}

		if (webgpuRenderPassActive)
		{
			EndWebGPURenderPass();
		}

		auto currentScreen = webgpuPlatform->GetCurrentScreen(LLGI::Color8(0, 0, 0, webgpuPremultipliedAlpha ? 0 : 255), true);
		if (currentScreen == nullptr)
		{
			webgpuCommandList->End();
			webgpuCommandList.reset();
			webgpuFrameActive = false;
			return;
		}
		if (copyPipeline == nullptr)
		{
			auto renderPassPipeline = webgpuGraphics->CreateRenderPassPipelineState(currentScreen);
			copyScreenFormat = renderPassPipeline->Key.RenderTargetFormats.at(0);
			copyPipeline = webgpuGraphics->CreatePiplineState();
			copyPipeline->VertexLayouts[0] = LLGI::VertexLayoutFormat::R32G32B32_FLOAT;
			copyPipeline->VertexLayouts[1] = LLGI::VertexLayoutFormat::R32G32_FLOAT;
			copyPipeline->VertexLayouts[2] = LLGI::VertexLayoutFormat::R8G8B8A8_UNORM;
			copyPipeline->VertexLayoutNames[0] = "POSITION";
			copyPipeline->VertexLayoutNames[1] = "UV";
			copyPipeline->VertexLayoutNames[2] = "COLOR";
			copyPipeline->VertexLayoutCount = 3;
			copyPipeline->IsDepthTestEnabled = false;
			copyPipeline->IsDepthWriteEnabled = false;
			copyPipeline->IsBlendEnabled = false;
			copyPipeline->Culling = LLGI::CullingMode::DoubleSide;
			copyPipeline->SetShader(LLGI::ShaderStageType::Vertex, copyVS);
			copyPipeline->SetShader(LLGI::ShaderStageType::Pixel, copyPS);
			copyPipeline->SetRenderPassPipelineState(renderPassPipeline);
			copyPipeline->Compile();
			LLGI::SafeRelease(renderPassPipeline);
		}

		if (copyPipeline == nullptr)
		{
			webgpuCommandList->End();
			webgpuCommandList.reset();
			webgpuFrameActive = false;
			return;
		}

		webgpuCommandList->BeginRenderPass(currentScreen);
		webgpuCommandList->SetVertexBuffer(copyVB, sizeof(WebGPUCopyVertex), 0);
		webgpuCommandList->SetIndexBuffer(copyIB, 2);
		webgpuCommandList->SetPipelineState(copyPipeline);
		webgpuCommandList->SetTexture(webgpuColorBuffer, LLGI::TextureWrapMode::Clamp, LLGI::TextureMinMagFilter::Linear, 0);
		webgpuCommandList->Draw(2);
		webgpuCommandList->EndRenderPass();
		webgpuCommandList->End();
		webgpuGraphics->Execute(webgpuCommandList.get());
		webgpuPlatform->Present();
		webgpuCommandList.reset();
		webgpuFrameActive = false;
	}

	bool ResizeWebGPU(int32_t width, int32_t height)
	{
		if (width <= 0 || height <= 0 || webgpuFrameActive)
		{
			return false;
		}

		if (webgpuPlatform != nullptr)
		{
			webgpuPlatform->SetWindowSize(LLGI::Vec2I(width, height));
		}
		LLGI::SafeRelease(copyPipeline);

		return CreateWebGPUFrameResources(width, height);
	}

	bool SetWebGPUPremultipliedAlpha(bool isPremultipliedAlphaEnabled)
	{
		if (webgpuFrameActive)
		{
			return false;
		}

		webgpuPremultipliedAlpha = isPremultipliedAlphaEnabled;
		LLGI::SafeRelease(copyPipeline);

		if (webgpuPlatform != nullptr)
		{
			static_cast<LLGI::PlatformWebGPU*>(webgpuPlatform)->SetPremultipliedAlphaEnabled(isPremultipliedAlphaEnabled);
		}

		if (renderer != nullptr)
		{
			auto rendererImpl = renderer.DownCast<EffekseerRendererLLGI::RendererImplemented>();
			if (rendererImpl != nullptr)
			{
				rendererImpl->GetImpl()->IsPremultipliedAlphaEnabled = isPremultipliedAlphaEnabled;
				rendererImpl->ResetPiplineStates();
			}
		}

		return true;
	}

	bool DrawToExternalWebGPURenderPass(void* renderPassEncoder, int32_t colorFormat, int32_t depthFormat)
	{
		ChangeWebGPURenderPassPipelineState(ToBackendColorFormat(colorFormat), ToBackendDepthFormat(depthFormat));

		if (!BeginExternalWebGPURenderPass(renderPassEncoder))
		{
			ChangeWebGPURenderPassPipelineState(
				Effekseer::Backend::TextureFormatType::R8G8B8A8_UNORM,
				Effekseer::Backend::TextureFormatType::D32);
			return false;
		}

		DrawInternal();
		EndExternalWebGPURenderPass();
		ChangeWebGPURenderPassPipelineState(
			Effekseer::Backend::TextureFormatType::R8G8B8A8_UNORM,
			Effekseer::Backend::TextureFormatType::D32);
		return true;
	}

	int32_t ReadWebGPUFrameBuffer(uint8_t* destination, int32_t destinationSize)
	{
		if (destination == nullptr || destinationSize <= 0 || webgpuFrameActive || webgpuColorBuffer == nullptr)
		{
			return 0;
		}

		std::vector<uint8_t> data;
		if (!webgpuColorBuffer->GetData(data))
		{
			return 0;
		}

		if (static_cast<size_t>(destinationSize) < data.size())
		{
			return -static_cast<int32_t>(data.size());
		}

		std::memcpy(destination, data.data(), data.size());
		return static_cast<int32_t>(data.size());
	}
#endif

	void Terminate()
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGL)
		ResetBackground();
#endif
		if (sound != nullptr)
		{
			sound->StopAllVoices();
			sound.Reset();
		}

		manager.Reset();
		renderer.Reset();

#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		webgpuEffekseerCommandList.Reset();
		webgpuEffekseerMemoryPool.Reset();
		LLGI::SafeRelease(copyPipeline);
		LLGI::SafeRelease(copyVB);
		LLGI::SafeRelease(copyIB);
		LLGI::SafeRelease(copyVS);
		LLGI::SafeRelease(copyPS);
		ReleaseWebGPUFrameResources();
		webgpuCommandListPool.reset();
		LLGI::SafeRelease(webgpuMemoryPool);
		LLGI::SafeRelease(webgpuGraphics);
		LLGI::SafeRelease(webgpuPlatform);
		ES_SAFE_DELETE(webgpuWindow);
#endif

		if (alcContext != nullptr)
		{
			alcMakeContextCurrent(nullptr);
			alcDestroyContext(alcContext);
			alcContext = nullptr;
		}
		if (alcDevice != nullptr)
		{
			alcCloseDevice(alcDevice);
			alcDevice = nullptr;
		}
	}

	void Update(float deltaFrames) { manager->Update(deltaFrames); }

	void DrawInternal()
	{
		Effekseer::Vector3D cameraPosition;
		Effekseer::Vector3D cameraFrontDirection;
		CalculateCameraDirectionAndPosition(cameraMatrix, cameraFrontDirection, cameraPosition);

		Effekseer::Manager::LayerParameter layerParam;
		layerParam.ViewerPosition = cameraPosition;
		manager->SetLayerParameter(0, layerParam);

		renderer->SetProjectionMatrix(projectionMatrix);
		renderer->SetCameraMatrix(cameraMatrix);
		renderer->BeginRendering();
		manager->Draw();
		renderer->EndRendering();
	}

	void Draw()
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		if (BeginWebGPUFrame())
		{
			DrawInternal();
			EndWebGPURenderPass();
			SubmitWebGPUFrame();
		}
#else
		DrawInternal();
#endif
	}

#if defined(EFFEKSEER_FOR_WEB_WEBGL)
	void CaptureBackground(int x, int y, int width, int height)
	{
		if (backgroundTextureWidth != static_cast<uint32_t>(width) || backgroundTextureHeight != static_cast<uint32_t>(height))
		{
			if (backgroundTexture == 0)
			{
				glGenTextures(1, &backgroundTexture);
			}
			glBindTexture(GL_TEXTURE_2D, backgroundTexture);
			glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, 0);
			backgroundTextureWidth = width;
			backgroundTextureHeight = height;
		}

		glBindTexture(GL_TEXTURE_2D, backgroundTexture);
		glCopyTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, x, y, width, height);
		glBindTexture(GL_TEXTURE_2D, 0);

		auto r = static_cast<EffekseerRendererGL::Renderer*>(renderer.Get());
		r->SetBackground(backgroundTexture);
	}

	void ResetBackground()
	{
		if (renderer != nullptr)
		{
			auto r = static_cast<EffekseerRendererGL::Renderer*>(renderer.Get());
			r->SetBackground(0);
		}

		if (backgroundTexture > 0)
		{
			glDeleteTextures(1, &backgroundTexture);
			backgroundTexture = 0;
		}
	}
#else
	void ResetBackground() {}
#endif
};

} // namespace

