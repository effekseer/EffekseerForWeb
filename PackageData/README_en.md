# EffekseerForWeb

This package contains the prebuilt EffekseerForWeb runtime, sample effects, and a Three.js playback sample.

## Contents

- `effekseer.js`
- `effekseer.d.ts`
- `effekseer-webgl.js`
- `effekseer-webgl.wasm`
- `effekseer-webgpu.js`
- `effekseer-webgpu.wasm`
- `Resources/`
  - sample effects and their textures, models, and material files
- `Sample/`
  - WebGL and WebGPU playback samples
  - local `three.min.js`

## Run The Sample

Serve this directory with a local HTTP server, then open `Sample/index.html`. From there, choose the WebGL or WebGPU sample.

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/Sample/index.html
```

You can also open each sample directly:

```text
http://localhost:8000/Sample/webgl.html
http://localhost:8000/Sample/webgpu.html
```

Browsers generally cannot load `.wasm` and effect resources correctly from `file://`, so use HTTP even for local testing.

## Backend Usage

WebGL and WebGPU differ in runtime initialization and in the rendering target passed to `createContext()`. Loading, playing, updating, and normal canvas drawing follow the same flow.

| Purpose | WebGL | WebGPU |
| --- | --- | --- |
| Runtime | `backend: "webgl"` with `effekseer-webgl.js` / `.wasm` | `backend: "webgpu"` with `effekseer-webgpu.js` / `.wasm` and `GPUDevice` |
| Context target | `graphicsContext` from `canvas.getContext("webgl2")`, `webgl`, or `OffscreenCanvas` | `canvasContext` from `canvas.getContext("webgpu")` or `OffscreenCanvas`, plus `device` |
| Normal draw loop | `context.update(1); context.draw();` | `context.update(1); context.draw();` |
| App-owned render pass | Not provided | `context.drawToRenderPass(renderPassEncoder, options)` |

The normal playback code is backend-independent.

```js
const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
context.play(effect, 0, 0, 0);

function render() {
  requestAnimationFrame(render);
  context.update(1);
  context.draw();
}
render();
```

## Minimal WebGL Usage

```html
<canvas id="canvas" width="720" height="480"></canvas>
<script src="./Sample/three.min.js"></script>
<script type="module">
  import { initRuntime, createContext } from "./effekseer.js";

  const canvas = document.getElementById("canvas");
  const renderer = new window.THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setSize(canvas.width, canvas.height, false);

  await initRuntime({
    backend: "webgl",
    scriptPath: "./effekseer-webgl.js",
    wasmPath: "./effekseer-webgl.wasm",
  });

  const context = await createContext({
    backend: "webgl",
    graphicsContext: renderer.getContext(),
  });

  const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
  context.play(effect, 0, 0, 0);

  function render() {
    requestAnimationFrame(render);
    context.update(1);
    renderer.clear();
    context.draw();
  }
  render();
</script>
```

See `Sample/webgl.js` for a complete Three.js render loop. The sample uses the bundled `Sample/three.min.js`.

WebGL also accepts a WebGL context created from `OffscreenCanvas` through the same `graphicsContext` option. In a Worker, provide the native module factory through `moduleFactory` instead of using `scriptPath`, which depends on document script loading.

When you render with a Three.js camera, call `setCameraFromThree(camera)`. The helper calls `camera.updateMatrixWorld()` by default, copies `camera.projectionMatrix.elements` and `camera.matrixWorldInverse.elements` into Effekseer, and works for both WebGL and WebGPU contexts. Pass `{ updateMatrixWorld: false }` if your render loop already updated the camera.

```js
camera.aspect = canvas.width / canvas.height;
camera.updateProjectionMatrix();
context.setCameraFromThree(camera);
```

## Minimal WebGPU Usage

```html
<canvas id="canvas" width="720" height="480"></canvas>
<script type="module">
  import { initRuntime, createContext } from "./effekseer.js";

  const canvas = document.getElementById("canvas");
  const canvasContext = canvas.getContext("webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();

  await initRuntime({
    backend: "webgpu",
    device,
    scriptPath: "./effekseer-webgpu.js",
    wasmPath: "./effekseer-webgpu.wasm",
  });

  const context = await createContext({
    backend: "webgpu",
    canvas,
    canvasContext,
    device,
  });

  const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
  context.play(effect, 0, 0, 0);

  function render() {
    requestAnimationFrame(render);
    context.update(1);
    context.draw();
  }
  render();
</script>
```

Use `drawToRenderPass(renderPassEncoder, options)` when your application fully owns the WebGPU render pass. In that mode, your application begins and ends the render pass and submits the command buffer.

The bundled `Sample/webgpu.html` and `Sample/webgpu.js` use this external render pass path for the WebGPU sample.

WebGPU also accepts a `webgpu` context created from `OffscreenCanvas` through the same `canvasContext` option. The normal `draw()` path renders to that `GPUCanvasContext` current texture. In a Worker, provide the native module factory through `moduleFactory`.

## Audio

Browser autoplay policy usually requires audio to be resumed after a user gesture. Call `resumeSound()` from a button or click handler.

```js
button.addEventListener("click", async () => {
  await context.resumeSound();
});
```

## Resource Loading

`loadEffect()` returns a Promise. WebGL textures are decoded through the JavaScript image loader; WebGPU textures are loaded through the native binary texture loader.

```js
const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
const handle = context.play(effect, 0, 0, 0);
```

For easier migration from EffekseerForWebGL, the loader also accepts the callback form used by the older package while still returning the same Promise.

```js
context.loadEffect(
  "./Resources/00_Basic/Laser01.efkefc",
  1.0,
  (effect) => {
    context.play(effect, 0, 0, 0);
  },
  (error) => {
    console.error(error);
  },
);
```

The same compatibility form is available for `loadEffectPackage(data, Unzip, scale, onload, onerror)`.

Release native resources when they are no longer needed.

```js
handle?.stop();
effect.release();
context.release();
```
