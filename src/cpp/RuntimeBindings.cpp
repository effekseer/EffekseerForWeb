#include "RuntimeContext.h"

#define EXPORT EMSCRIPTEN_KEEPALIVE

extern "C"
{
	Context* EXPORT EffekseerInitWebGL(int instanceMaxCount, int squareMaxCount, int isExtensionsEnabled, int isPremultipliedAlphaEnabled)
	{
		Effekseer::SetLogger([](Effekseer::LogType, const std::string& s) -> void { PrintEffekseerLog("EffekseerLog: " + s); });
#if defined(EFFEKSEER_FOR_WEB_WEBGL)
		auto context = new Context();
		if (!context->InitWebGL(instanceMaxCount, squareMaxCount, isExtensionsEnabled != 0, isPremultipliedAlphaEnabled != 0))
		{
			context->Terminate();
			delete context;
			return nullptr;
		}
		return context;
#else
		(void)instanceMaxCount;
		(void)squareMaxCount;
		(void)isExtensionsEnabled;
		(void)isPremultipliedAlphaEnabled;
		return nullptr;
#endif
	}

	Context* EXPORT EffekseerInitWebGPU(
		int instanceMaxCount,
		int squareMaxCount,
		int width,
		int height,
		int isPremultipliedAlphaEnabled,
		int useNativeCanvasSurface)
	{
		Effekseer::SetLogger([](Effekseer::LogType, const std::string& s) -> void { PrintEffekseerLog("EffekseerLog: " + s); });
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		auto context = new Context();
		if (!context->InitWebGPU(instanceMaxCount, squareMaxCount, width, height, isPremultipliedAlphaEnabled != 0, useNativeCanvasSurface != 0))
		{
			context->Terminate();
			delete context;
			return nullptr;
		}
		return context;
#else
		(void)instanceMaxCount;
		(void)squareMaxCount;
		(void)width;
		(void)height;
		(void)isPremultipliedAlphaEnabled;
		(void)useNativeCanvasSurface;
		return nullptr;
#endif
	}

	void EXPORT EffekseerTerminate(Context* context)
	{
		if (context == nullptr)
			return;
		context->Terminate();
		delete context;
	}

	void EXPORT EffekseerUpdate(Context* context, float deltaFrames)
	{
		if (context == nullptr)
			return;
		deltaFrames += context->restDeltaTime;
		context->restDeltaTime = deltaFrames - static_cast<int>(deltaFrames);
		for (int loop = 0; loop < static_cast<int>(deltaFrames); loop++)
		{
			context->Update(1.0f);
		}
		context->time += deltaFrames / 60.0f;
		context->renderer->SetTime(context->time);
	}

	void EXPORT EffekseerBeginUpdate(Context* context)
	{
		context->manager->BeginUpdate();
		context->isFirstUpdate = true;
	}

	void EXPORT EffekseerEndUpdate(Context* context)
	{
		context->manager->EndUpdate();
		context->renderer->SetTime(context->time);
	}

	void EXPORT EffekseerUpdateHandle(Context* context, int handle, float deltaFrame)
	{
		context->manager->UpdateHandle(handle, deltaFrame);
		if (context->isFirstUpdate)
		{
			context->time += deltaFrame / 60.0f;
			context->isFirstUpdate = false;
		}
	}

	void EXPORT EffekseerDraw(Context* context) { context->Draw(); }

	int EXPORT EffekseerBeginWebGPUFrame(Context* context)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr && context->BeginWebGPUFrame() ? 1 : 0;
#else
		(void)context;
		return 0;
#endif
	}

	void EXPORT EffekseerDrawWebGPUFrame(Context* context)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		if (context != nullptr)
		{
			context->DrawInternal();
		}
#else
		(void)context;
#endif
	}

	void EXPORT EffekseerEndWebGPURenderPass(Context* context)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		if (context != nullptr)
		{
			context->EndWebGPURenderPass();
		}
#else
		(void)context;
#endif
	}

	void EXPORT EffekseerSubmitWebGPUFrame(Context* context)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		if (context != nullptr)
		{
			context->SubmitWebGPUFrame();
		}
#else
		(void)context;
#endif
	}

	int EXPORT EffekseerReadWebGPUFrameBuffer(Context* context, void* destination, int destinationSize)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr ? context->ReadWebGPUFrameBuffer(static_cast<uint8_t*>(destination), destinationSize) : 0;
#else
		(void)context;
		(void)destination;
		(void)destinationSize;
		return 0;
#endif
	}

	int EXPORT EffekseerResizeWebGPU(Context* context, int width, int height)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr && context->ResizeWebGPU(width, height) ? 1 : 0;
#else
		(void)context;
		(void)width;
		(void)height;
		return 0;
#endif
	}

	int EXPORT EffekseerSetWebGPUPremultipliedAlpha(Context* context, int isPremultipliedAlphaEnabled)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr && context->SetWebGPUPremultipliedAlpha(isPremultipliedAlphaEnabled != 0) ? 1 : 0;
#else
		(void)context;
		(void)isPremultipliedAlphaEnabled;
		return 0;
#endif
	}

	int EXPORT EffekseerDrawToExternalWebGPURenderPass(Context* context, void* renderPassEncoder, int colorFormat, int depthFormat)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr && context->DrawToExternalWebGPURenderPass(renderPassEncoder, colorFormat, depthFormat) ? 1 : 0;
#else
		(void)context;
		(void)renderPassEncoder;
		(void)colorFormat;
		(void)depthFormat;
		return 0;
#endif
	}

	void EXPORT EffekseerReleaseImportedWebGPURenderPassEncoder(void* renderPassEncoder)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		if (renderPassEncoder != nullptr)
		{
			auto encoder = wgpu::RenderPassEncoder::Acquire(reinterpret_cast<WGPURenderPassEncoder>(renderPassEncoder));
			(void)encoder;
		}
#else
		(void)renderPassEncoder;
#endif
	}

	void EXPORT EffekseerBeginDraw(Context* context)
	{
		context->renderer->SetProjectionMatrix(context->projectionMatrix);
		context->renderer->SetCameraMatrix(context->cameraMatrix);
		context->renderer->BeginRendering();
	}

	void EXPORT EffekseerEndDraw(Context* context) { context->renderer->EndRendering(); }

	void EXPORT EffekseerDrawHandle(Context* context, int handle) { context->manager->DrawHandle(handle); }

	void EXPORT EffekseerSetProjectionMatrix(Context* context, const float* matrixElements)
	{
		ArrayToMatrix44(matrixElements, context->projectionMatrix);
	}

	void EXPORT EffekseerSetProjectionPerspective(Context* context, float fov, float aspect, float near, float far)
	{
		context->projectionMatrix.PerspectiveFovRH_OpenGL(fov * 3.1415926f / 180.0f, aspect, near, far);
	}

	void EXPORT EffekseerSetProjectionOrthographic(Context* context, float width, float height, float near, float far)
	{
		context->projectionMatrix.OrthographicRH(width, height, near, far);
	}

	void EXPORT EffekseerSetCameraMatrix(Context* context, const float* matrixElements)
	{
		ArrayToMatrix44(matrixElements, context->cameraMatrix);
	}

	void EXPORT EffekseerSetCameraLookAt(Context* context,
										 float eyeX,
										 float eyeY,
										 float eyeZ,
										 float atX,
										 float atY,
										 float atZ,
										 float upX,
										 float upY,
										 float upZ)
	{
		context->cameraMatrix.LookAtRH(
			Effekseer::Vector3D(eyeX, eyeY, eyeZ),
			Effekseer::Vector3D(atX, atY, atZ),
			Effekseer::Vector3D(upX, upY, upZ));
	}

	void* EXPORT EffekseerLoadEffect(Context* context, void* data, int32_t size, float magnification)
	{
		auto effect = Effekseer::Effect::Create(context->manager, data, size, magnification);
		return effect.Pin();
	}

	void EXPORT EffekseerReleaseEffect(Context*, void* effect) { Effekseer::RefPtr<Effekseer::Effect>::Unpin(effect); }

	void EXPORT EffekseerReloadResources(Context* context, Effekseer::Effect* effect, void* data, int32_t size)
	{
		auto effectRef = Effekseer::RefPtr<Effekseer::Effect>::FromPinned(effect);
		if (effectRef != nullptr)
		{
			effectRef->ReloadResources(data, size);
		}
	}

	void EXPORT EffekseerStopAllEffects(Context* context) { context->manager->StopAllEffects(); }

	int EXPORT EffekseerPlayEffect(Context* context, void* effect, float x, float y, float z)
	{
		auto effectRef = Effekseer::RefPtr<Effekseer::Effect>::FromPinned(effect);
		return context->manager->Play(effectRef, x, y, z);
	}

	void EXPORT EffekseerStopEffect(Context* context, int handle) { context->manager->StopEffect(handle); }
	void EXPORT EffekseerStopRoot(Context* context, int handle) { context->manager->StopRoot(handle); }
	int EXPORT EffekseerExists(Context* context, int handle) { return context->manager->Exists(handle) ? 1 : 0; }
	void EXPORT EffekseerSetFrame(Context* context, int handle, float frame) { context->manager->UpdateHandleToMoveToFrame(handle, frame); }
	void EXPORT EffekseerSetLocation(Context* context, int handle, float x, float y, float z) { context->manager->SetLocation(handle, x, y, z); }
	void EXPORT EffekseerSetRotation(Context* context, int handle, float x, float y, float z) { context->manager->SetRotation(handle, x, y, z); }
	void EXPORT EffekseerSetScale(Context* context, int handle, float x, float y, float z) { context->manager->SetScale(handle, x, y, z); }

	void EXPORT EffekseerSetMatrix(Context* context, int handle, const float* matrixElements)
	{
		Effekseer::Matrix43 matrix43;
		ArrayToMatrix43(matrixElements, matrix43);
		context->manager->SetMatrix(handle, matrix43);
	}

	float EXPORT EffekseerGetDynamicInput(Context* context, int handle, int32_t index)
	{
		return context->manager->GetDynamicInput(handle, index);
	}

	void EXPORT EffekseerSetDynamicInput(Context* context, int handle, int32_t index, float value)
	{
		context->manager->SetDynamicInput(handle, index, value);
	}

	void EXPORT EffekseerSendTrigger(Context* context, int handle, int32_t index)
	{
		context->manager->SendTrigger(handle, index);
	}

	void EXPORT EffekseerSetAllColor(Context* context, int handle, float r, float g, float b, float a)
	{
		context->manager->SetAllColor(handle, Effekseer::Color(r, g, b, a));
	}

	void EXPORT EffekseerSetTargetLocation(Context* context, int handle, float x, float y, float z)
	{
		context->manager->SetTargetLocation(handle, x, y, z);
	}

	void EXPORT EffekseerSetPaused(Context* context, int handle, int paused) { context->manager->SetPaused(handle, paused != 0); }
	void EXPORT EffekseerSetShown(Context* context, int handle, int shown) { context->manager->SetShown(handle, shown != 0); }
	void EXPORT EffekseerSetSpeed(Context* context, int handle, float speed) { context->manager->SetSpeed(handle, speed); }
	void EXPORT EffekseerSetRandomSeed(Context* context, int handle, float seed) { context->manager->SetRandomSeed(handle, seed); }
	int32_t EXPORT EffekseerGetRestInstancesCount(Context* context) { return context->manager->GetRestInstancesCount(); }
	int EXPORT EffekseerGetUpdateTime(Context* context) { return context->manager->GetUpdateTime(); }
	int EXPORT EffekseerGetDrawTime(Context* context) { return context->manager->GetDrawTime(); }

	int EXPORT EffekseerIsVertexArrayObjectSupported(Context* context)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGL)
		auto r = static_cast<EffekseerRendererGL::Renderer*>(context->renderer.Get());
		return r->IsVertexArrayObjectSupported() ? 1 : 0;
#else
		(void)context;
		return 0;
#endif
	}

	void EXPORT EffekseerSetRestorationOfStatesFlag(Context* context, int flag)
	{
		if (context != nullptr && context->renderer != nullptr)
		{
			context->renderer->SetRestorationOfStatesFlag(flag != 0);
		}
	}

	void EXPORT EffekseerCaptureBackground(Context* context, int x, int y, int width, int height)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGL)
		if (context != nullptr)
		{
			context->CaptureBackground(x, y, width, height);
		}
#else
		(void)context;
		(void)x;
		(void)y;
		(void)width;
		(void)height;
#endif
	}

	void EXPORT EffekseerResetBackground(Context* context)
	{
		if (context != nullptr)
		{
			context->ResetBackground();
		}
	}

	int EXPORT EffekseerSetBackgroundImage(Context* context, const void* data, int dataSize, int width, int height)
	{
#if defined(EFFEKSEER_FOR_WEB_WEBGPU)
		return context != nullptr && context->SetWebGPUBackgroundImage(static_cast<const uint8_t*>(data), dataSize, width, height) ? 1 : 0;
#else
		(void)context;
		(void)data;
		(void)dataSize;
		(void)width;
		(void)height;
		return 0;
#endif
	}

	void EXPORT EffekseerSetListener(Context* context,
									 float px,
									 float py,
									 float pz,
									 float ax,
									 float ay,
									 float az,
									 float ux,
									 float uy,
									 float uz)
	{
		if (context != nullptr && context->sound != nullptr)
		{
			context->sound->SetListener(
				Effekseer::Vector3D(px, py, pz),
				Effekseer::Vector3D(ax, ay, az),
				Effekseer::Vector3D(ux, uy, uz));
		}
	}

	void EXPORT EffekseerSetSoundVolume(Context*, float volume) { alListenerf(AL_GAIN, volume); }
	void EXPORT EffekseerPauseSound(Context* context, int pause)
	{
		if (context != nullptr && context->sound != nullptr)
		{
			context->sound->SetMute(pause != 0);
		}
	}
	void EXPORT EffekseerResumeSound(Context* context) { EffekseerPauseSound(context, 0); }
	void EXPORT EffekseerSetLogEnabled(int flag) { g_isEffekseerLogEnabled = flag != 0; }
}


