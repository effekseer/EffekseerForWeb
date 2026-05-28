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
http://localhost:8000/Sample/webgpu.html
```

多くのブラウザでは `file://` から `.wasm` やエフェクトの関連リソースを正しく読み込めません。ローカルで確認する場合も HTTP サーバーを使ってください。

## backend の使い分け

WebGL と WebGPU は、runtime の初期化と `createContext()` に渡す描画先が異なります。エフェクトの読み込み、再生、更新、通常の canvas 描画は同じ流れで扱えます。

| 目的 | WebGL | WebGPU |
| --- | --- | --- |
| runtime | `backend: "webgl"` と `effekseer-webgl.js` / `.wasm` | `backend: "webgpu"` と `effekseer-webgpu.js` / `.wasm`、`GPUDevice` |
| 描画先 | `canvas.getContext("webgl2")`、`webgl`、または `OffscreenCanvas` から作った `graphicsContext` | `canvas.getContext("webgpu")` または `OffscreenCanvas` から作った `canvasContext` と `device` |
| 通常の描画ループ | `context.update(1); context.draw();` | `context.update(1); context.draw();` |
| アプリ側 render pass | なし | `context.drawToRenderPass(renderPassEncoder, options)` |

通常の再生コードは backend に依存しません。

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

WebGL では `OffscreenCanvas` から作成した WebGL context も同じ `graphicsContext` で渡せます。Worker 内で使う場合は `scriptPath` による script tag 読み込みではなく、`moduleFactory` で native module factory を渡してください。

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
    context.draw();
  }
  render();
</script>
```

WebGPU の描画先をアプリケーション側の render pass で完全に管理する場合は、`drawToRenderPass(renderPassEncoder, options)` を使用します。この場合、render pass の開始、終了、command buffer の submit はアプリケーション側で行います。

配布パッケージの `Sample/webgpu.html` と `Sample/webgpu.js` は、この外部 render pass を使った WebGPU サンプルです。

WebGPU でも `OffscreenCanvas` から `webgpu` context を作成し、同じ `canvasContext` option で渡せます。通常の `draw()` はその `GPUCanvasContext` の current texture へ描画します。Worker 内では `moduleFactory` で native module factory を渡してください。

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
