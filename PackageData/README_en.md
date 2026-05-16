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
    context.drawToCanvas();
  }
  render();
</script>
```

Use `drawToRenderPass(renderPassEncoder, options)` when your application fully owns the WebGPU render pass. In that mode, your application begins and ends the render pass and submits the command buffer.

The bundled `Sample/webgpu.html` and `Sample/webgpu.js` use this external render pass path for the WebGPU sample.

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

Release native resources when they are no longer needed.

```js
handle?.stop();
effect.release();
context.release();
```
