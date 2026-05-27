# EffekseerForWeb

このパッケージには、ビルド済みの EffekseerForWeb ランタイム、サンプルエフェクト、Three.js を使った再生サンプルが含まれています。

## 内容

- `effekseer.js`
- `effekseer.d.ts`
- `effekseer-webgl.js`
- `effekseer-webgl.wasm`
- `effekseer-webgpu.js`
- `effekseer-webgpu.wasm`
- `Resources/`
  - サンプルエフェクトと、必要なテクスチャ、モデル、マテリアルファイル
- `Sample/`
  - WebGL と WebGPU の再生サンプル
  - サンプル用の `three.min.js`

## サンプルの実行

このディレクトリをローカル HTTP サーバーで配信し、`Sample/index.html` を開きます。そこから WebGL / WebGPU の各サンプルを選択できます。

```sh
python -m http.server 8000
```

ブラウザで次の URL を開きます。

```text
http://localhost:8000/Sample/index.html
```

直接開く場合は次の URL を使用します。

```text
http://localhost:8000/Sample/webgl.html
http://localhost:8000/Sample/basic-webgpu.html
http://localhost:8000/Sample/webgpu.html
```

`Sample/basic-webgpu.html` は最小構成の WebGPU デモです。WebGPU backend を初期化し、`Resources/00_Basic/Laser01.efkefc` を読み込んで canvas に再生し、Three.js やアプリケーション側の render pass を使わずに `drawToCanvas()` で描画します。より大きい Three.js / external render pass の例は `Sample/webgpu.html` を参照してください。

多くのブラウザでは `file://` から `.wasm` やエフェクトの関連リソースを正しく読み込めません。ローカルで確認する場合も HTTP サーバーを使ってください。

## 最小構成の WebGL 利用例

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

Three.js と組み合わせた完全な描画ループは `Sample/webgl.js` を参照してください。サンプルは同梱の `Sample/three.min.js` を使用します。

Three.js のカメラで描画する場合は、`setCameraFromThree(camera)` を呼び出してください。このヘルパーはデフォルトで `camera.updateMatrixWorld()` を呼び出し、`camera.projectionMatrix.elements` と `camera.matrixWorldInverse.elements` を Effekseer にコピーします。WebGL と WebGPU の両方の context で使えます。描画ループ側ですでにカメラを更新している場合は `{ updateMatrixWorld: false }` を渡してください。

```js
camera.aspect = canvas.width / canvas.height;
camera.updateProjectionMatrix();
context.setCameraFromThree(camera);
```

## 最小構成の WebGPU 利用例

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

WebGPU の描画先をアプリケーション側の render pass で完全に管理する場合は、`drawToRenderPass(renderPassEncoder, options)` を使用します。この場合、render pass の開始、終了、command buffer の submit はアプリケーション側で行います。

配布パッケージの `Sample/webgpu.html` と `Sample/webgpu.js` は、この外部 render pass を使った WebGPU サンプルです。
配布パッケージの `Sample/basic-webgpu.html` と `Sample/basic-webgpu.js` は、最小構成の `drawToCanvas()` パスを示します。

## 音声を使う場合

ブラウザの自動再生ポリシーにより、音声はユーザー操作後に再開する必要があります。ボタンやクリックイベントの中で `resumeSound()` を呼び出してください。

```js
button.addEventListener("click", async () => {
  await context.resumeSound();
});
```

## リソース読み込み

`loadEffect()` は Promise を返します。WebGL のテクスチャは JavaScript の画像ローダーで decode し、WebGPU のテクスチャは native binary texture loader で読み込みます。

```js
const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
const handle = context.play(effect, 0, 0, 0);
```

既存の EffekseerForWebGL から移行しやすいように、従来の callback 形式も利用できます。この形式でも同じ Promise を返します。

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

`loadEffectPackage(data, Unzip, scale, onload, onerror)` でも同じ互換形式を利用できます。

使い終わったら `release()` を呼び出して、ネイティブ側のリソースを解放してください。

```js
handle?.stop();
effect.release();
context.release();
```
