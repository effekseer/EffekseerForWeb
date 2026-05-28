# EffekseerForWeb Design

## Purpose

EffekseerForWeb is designed as a web runtime that keeps the general usage model of the existing EffekseerForWebGL package while exposing both WebGL and WebGPU through one TypeScript API.

The initial implementation focuses on these decisions:

- WebGL and WebGPU are selected explicitly.
- WebGL usage must not request a WebGPU device or load the WebGPU wasm.
- WebGPU usage must not require a WebGL context.
- Public asynchronous APIs are Promise-based.
- Audio, images, models, curves, and materials are included in the initial scope.
- WebGPU provides both a high-level canvas presentation API and a low-level user-managed render pass API.

## Layer Structure

### TypeScript Layer

The TypeScript layer owns the user-facing API and asynchronous browser resource loading.

Responsibilities:

- Load the wasm module factory.
- Request or receive a WebGPU device.
- Register a WebGL context with Emscripten.
- Expose Effect / Handle / Context APIs.
- Fetch resources, decode Blob data, and choose ImageBitmap or HTMLImageElement.
- Expand Effekseer packages.
- Normalize Promise rejections and error classes.
- Provide an AudioContext resume path.

Main public types:

- `EffekseerRuntime`
- `WebGLEffekseerContext`
- `WebGPUEffekseerContext`
- `EffekseerEffect`
- `EffekseerHandle`
- `RuntimeOptions`
- `ContextOptions`

### Native C++ Layer

The C++ layer combines Effekseer core, renderers, sound, file access, and GPU bridge code.

Responsibilities:

- `Effekseer::Manager`
- backend-specific `EffekseerRenderer`
- `EffekseerSoundAL`
- `CustomFileInterface`
- WebGL texture loader
- WebGPU LLGI command list and render pass management
- exported C ABI functions

TypeScript calls the C++ layer through Emscripten `cwrap` bindings. Exported function names use the `Effekseer...` prefix.

### Build Layer

WebGL and WebGPU are built as separate wasm outputs.

- WebGL: `effekseer-webgl-native.js` / `.wasm`
- WebGPU: `effekseer-webgpu-native.js` / `.wasm`

`build.py` is the entry point that combines the TypeScript build and the Emscripten CMake build.

The distributable archive follows the EffekseerForWebGL naming style. Build outputs are staged at the archive root as `effekseer.js`, `effekseer.d.ts`, `effekseer-webgl.js` / `.wasm`, and `effekseer-webgpu.js` / `.wasm`. Internal build names under `dist/` are not exposed directly in the distribution.

## Runtime Initialization

`initRuntime(options)` creates one runtime per backend and stores it in an internal map.

Runtime creation flow:

1. Use `moduleFactory` when it is provided.
2. If `scriptPath` is provided, load the script and find the global factory.
3. If a global factory is available, use it.
4. For WebGPU, prepare a `GPUDevice` and pass it to the Emscripten module as `preinitializedWebGPUDevice`.
5. Create the module and bind exported native functions.

The WebGPU device is selected in this order:

1. A user-provided `device`
2. `navigator.gpu.requestAdapter()` and `adapter.requestDevice()`

When WebGPU is unavailable, `WebGPUUnavailableError` is thrown. This must not affect the WebGL runtime.

## Context Design

### Shared Context

The shared context API provides update, draw, camera, projection, effect loading, and sound control.

Representative APIs:

- `update(deltaFrames)`
- `beginUpdate()`
- `updateHandle(handle, deltaFrames)`
- `endUpdate()`
- `draw()`
- `loadEffect(data, options)`
- `loadEffectPackage(data, Unzip, options)`
- EffekseerForWebGL-style `loadEffect(data, scale, onload, onerror, redirect)` and `loadEffectPackage(data, Unzip, scale, onload, onerror)` compatibility forms
- `play(effect, x, y, z)`
- `setProjectionMatrix(matrix)`
- `setCameraMatrix(matrix)`
- `setCameraFromThree(camera)`
- `setSoundVolume(volume)`
- `resumeSound()`
- `pauseSound()`

Native loaders request files synchronously, so TypeScript turns effect loading into a Promise by repeatedly trying native creation, loading missing resources asynchronously, and retrying until dependencies converge.

### WebGL Context

The WebGL context follows the existing EffekseerForWebGL approach.

Requirements:

- Register the user-provided `WebGLRenderingContext` or `WebGL2RenderingContext` with `Module.GL.registerContext`.
- `OffscreenCanvas` is supported by passing its WebGL context through the same `graphicsContext` option. The runtime does not require a DOM canvas for WebGL drawing.
- Call `makeContextCurrent()` before drawing.
- Let the native WebGL texture loader call `Module._loadImage()`, with TypeScript returning a `TexImageSource`.
- Provide background capture/reset, state restoration, and VAO support query APIs.

### WebGPU Context

The WebGPU context has two drawing paths.

High-level API:

- `draw()`
- `drawToCanvas()`
- `beginRenderPass()`
- `drawCurrentFrame()`
- `endRenderPass()`
- `submit()`
- `configureSurface(options)`

In the high-level path, the Context manages canvas presentation. DOM `HTMLCanvasElement` inputs use the native LLGI canvas surface, where `drawToCanvas()` is a thin wrapper over `beginRenderPass()`, `drawCurrentFrame()`, `endRenderPass()`, and `submit()`.

`OffscreenCanvas` inputs use the same public `drawToCanvas()` API, but presentation is driven from JavaScript. The TypeScript layer acquires `GPUCanvasContext.getCurrentTexture()`, creates a render pass for that texture, and routes drawing through the external render-pass bridge. This avoids the native `#canvas` selector requirement and works in worker-style canvas ownership.

Low-level API:

- `drawToRenderPass(renderPassEncoder, options)`

In the low-level path, the user manages the `GPURenderPassEncoder`, `pass.end()`, and `device.queue.submit()`. The Context records only Effekseer drawing commands into the provided render pass.

`drawToRenderPass` options:

- `colorFormat`
- `depthFormat`

If omitted, the formats from context creation are used.

## WebGPU Native Bridge

The WebGPU native bridge uses the LLGI WebGPU backend.

The native HTML canvas drawing path performs:

1. `PlatformWebGPU::NewFrame()`
2. Begin an offscreen color/depth render pass
3. Draw Effekseer
4. Begin the canvas current-screen render pass
5. Fullscreen-copy the offscreen color buffer
6. Submit the command buffer
7. Present

The OffscreenCanvas path and the low-level drawing path use the Emscripten WebGPU JavaScript object import bridge to convert a `GPURenderPassEncoder` into a native handle. LLGI `CommandListWebGPU` is extended with `BeginRenderPassWithPlatformPtr` and `EndRenderPassWithPlatformPtr` so an external render pass encoder can be used temporarily.

## Resource Loading

### Binary

The native `CustomFileInterface` calls `Module._loadBinary(path, required)`. TypeScript routes that request to the currently loading `EffekseerEffect`, then resolves it from fetch or package resources.

WebGPU effect textures use this binary path. The standard EffekseerRendererCommon `TextureLoader` decodes PNG/TGA/DDS binaries on the native side and creates `LLGI::Texture` objects.

### Image

Image decoding priority:

1. `createImageBitmap(blob)`
2. `HTMLImageElement`

This image decoding path is the standard path for the WebGL texture loader. WebGL accepts both `ImageBitmap` and `HTMLImageElement` as `TexImageSource`.

WebGPU effect textures do not use the image decoding path in the initial implementation; they are loaded through binary resources and the native `TextureLoader`. If direct JavaScript-side WebGPU texture upload is added later, `ImageBitmap` should be preferred because it fits `copyExternalImageToTexture`.

### Package

`loadEffectPackage` reads `metafile.json`, expands the effect and related resources into a `Map<string, ArrayBuffer>`, and resolves packaged resources before fetch.

## Audio

Audio is included in the initial scope.

The native layer uses `EffekseerSoundAL` through Emscripten/OpenAL and registers the sound loader/player with the Manager. The TypeScript layer can receive an `AudioContext` and exposes `resumeSound()` as a Promise API to work with browser autoplay policies.

Provided operations:

- `setSoundVolume(volume)`
- `setListener(position, at, up)`
- `resumeSound()`
- `pauseSound()`

## Material

Materials are included for both WebGL and WebGPU.

Policy:

- Load `.efkmat`.
- Support precompiled material binaries.
- WebGL uses the EffekseerMaterialCompiler OpenGL path.
- WebGPU uses the EffekseerRendererWebGPU material loader path and prioritizes precompiled WebGPU binaries.
- WebGPU runtime material compilation will be finalized after verifying how to include the required transpiler dependencies in Emscripten.

## Error Handling

User-visible error classes:

- `RuntimeNotInitializedError`
- `UnsupportedBackendError`
- `WebGPUUnavailableError`
- `WebGLContextLostError`
- `NativeInitializationError`
- `ResourceLoadError`
- `EffectLoadError`
- `SoundLoadError`
- `MaterialCompileError`
- `InvalidOperationError`

Asynchronous failures are returned as Promise rejections. Incorrect synchronous API usage throws `InvalidOperationError`.

The WebGPU module stores the latest validation error message. It is exposed through the global `getLastWebGPUError()` helper and the Context `getLastWebGPUError()` method.

## Test Policy

Initial verification should proceed in this order:

1. TypeScript type check
2. TypeScript build
3. WebGL native build
4. WebGPU native build
5. Browser smoke tests
6. Resource loading tests for images, audio, packages, and materials
7. WebGL OffscreenCanvas smoke test
8. WebGPU high-level canvas presentation test
9. WebGPU low-level external render pass test

WebGL and WebGPU output do not need to be pixel-identical. The acceptance criteria are changed pixels, non-empty rendering, and no validation errors. Browser smoke tests are run through `tests/browser/smoke.html` and `tests/browser/run_smoke.mjs`; the WebGPU low-level path is selected with `mode=external`. Real assets come from the `TestData` submodule.
