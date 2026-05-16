# EffekseerForWeb

EffekseerForWeb は、Effekseer で作成したエフェクトを Web ブラウザ上で再生するための JavaScript / WebAssembly ランタイムです。WebGL と WebGPU の 2 つの backend を選んで利用できます。

EffekseerForWeb is a JavaScript / WebAssembly runtime for playing Effekseer effects in web browsers. You can choose either the WebGL or WebGPU backend.

- [Official website / 公式サイト](http://effekseer.github.io)
- [Effekseer main repository / Effekseer 本体](https://github.com/effekseer/Effekseer)
- [Design notes / 設計メモ](docs/Design_ja.md)
- [Design notes (English)](docs/Design_en.md)
- [Distribution notes / 配布メモ](docs/Distribution.md)

## Overview / 概要

EffekseerForWeb を使うと、`.efkefc` などの Effekseer エフェクトファイルを Web アプリケーションに組み込めます。ランタイム本体は `.js` と `.wasm` で構成され、エフェクト、テクスチャ、モデル、音声などの関連リソースをブラウザから読み込みます。

EffekseerForWeb lets you embed Effekseer effect files such as `.efkefc` into web applications. The runtime is made of `.js` and `.wasm` files, and it loads effect resources such as textures, models, and sounds through the browser.

主な用途:

Common use cases:

- Web ゲームやインタラクティブコンテンツで Effekseer エフェクトを再生する
- Play Effekseer effects in web games and interactive content
- WebGL 既存アプリケーションにエフェクト描画を追加する
- Add effect rendering to existing WebGL applications
- WebGPU render pass に Effekseer の描画を組み込む
- Record Effekseer rendering into a WebGPU render pass

## Package Contents / 配布内容

配布アーカイブには、ブラウザで実行するために必要な runtime とサンプルが含まれています。

The distributable archive contains the runtime files and samples needed to run in a browser.

- `effekseer.js` - 共通 JavaScript API / common JavaScript API
- `effekseer.d.ts` - TypeScript 型定義 / TypeScript declarations
- `effekseer-webgl.js` / `effekseer-webgl.wasm` - WebGL runtime
- `effekseer-webgpu.js` / `effekseer-webgpu.wasm` - WebGPU runtime
- `Resources/` - サンプルエフェクト / sample effects
- `Sample/` - WebGL / WebGPU サンプル / WebGL and WebGPU samples
- `README.md`, `README_ja.md`, `README_en.md` - usage documents

アプリケーションに組み込む場合は、少なくとも `effekseer.js` と、使いたい backend の `.js` / `.wasm` を Web サーバーから配信してください。

When embedding the runtime into your application, serve at least `effekseer.js` and the `.js` / `.wasm` files for the backend you want to use.

## Quick Start / クイックスタート

まずはサンプルを起動して、ブラウザで runtime が動くことを確認します。

First, run the bundled sample and confirm that the runtime works in your browser.

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/Sample/index.html
```

`Sample/index.html` から WebGL と WebGPU のサンプルを選択できます。

You can choose the WebGL or WebGPU sample from `Sample/index.html`.

`file://` から直接 HTML を開くと `.wasm` やエフェクト関連リソースの読み込みに失敗することがあります。ローカル確認でも HTTP サーバーを使ってください。

Opening HTML files directly through `file://` can fail when loading `.wasm` and effect resources. Use an HTTP server even for local testing.

## Minimal WebGL Example / 最小 WebGL 例

WebGL では、既存の `WebGLRenderingContext` または `WebGL2RenderingContext` を EffekseerForWeb に渡します。次の例では Three.js の renderer から WebGL context を取得しています。

For WebGL, pass an existing `WebGLRenderingContext` or `WebGL2RenderingContext` to EffekseerForWeb. This example gets the WebGL context from a Three.js renderer.

```html
<canvas id="canvas" width="720" height="480"></canvas>
<script src="./Sample/three.min.js"></script>
<script type="module">
  import { createContext, initRuntime } from "./effekseer.js";

  const canvas = document.getElementById("canvas");
  const renderer = new window.THREE.WebGLRenderer({ canvas, alpha: true });
  renderer.setSize(canvas.width, canvas.height, false);

  const camera = new window.THREE.PerspectiveCamera(35, canvas.width / canvas.height, 1, 1000);
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

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
    context.setCameraFromThree(camera);
    renderer.clear();
    context.draw();
    renderer.resetState();
  }

  render();
</script>
```

Three.js の scene も描画する場合は、`renderer.render(scene, camera)` の後に `context.draw()` を呼びます。完全な例は `Sample/webgl.js` を参照してください。

When also rendering a Three.js scene, call `context.draw()` after `renderer.render(scene, camera)`. See `Sample/webgl.js` for a complete example.

## Minimal WebGPU Example / 最小 WebGPU 例

WebGPU では `GPUDevice` と canvas の `GPUCanvasContext` を用意してから runtime を初期化します。WebGPU は対応ブラウザと環境が必要です。

For WebGPU, prepare a `GPUDevice` and the canvas `GPUCanvasContext`, then initialize the runtime. WebGPU requires a supported browser and environment.

```html
<canvas id="canvas" width="720" height="480"></canvas>
<script type="module">
  import { createContext, initRuntime } from "./effekseer.js";

  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  const canvas = document.getElementById("canvas");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("Failed to request a WebGPU adapter.");
  }

  const device = await adapter.requestDevice();
  const canvasContext = canvas.getContext("webgpu");
  if (!canvasContext) {
    throw new Error("Failed to create a WebGPU canvas context.");
  }

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

アプリケーション側で WebGPU の render pass を管理したい場合は、`drawToRenderPass(renderPassEncoder, options)` を使います。完全な例は `Sample/webgpu.js` を参照してください。

If your application manages the WebGPU render pass, use `drawToRenderPass(renderPassEncoder, options)`. See `Sample/webgpu.js` for a complete example.

## Loading Effects / エフェクトの読み込み

`loadEffect()` は Promise を返します。エフェクトファイルと関連リソースは、HTML を配信しているサーバーから読み込める場所に置いてください。

`loadEffect()` returns a Promise. Put the effect file and related resources somewhere reachable from the server that serves your HTML.

```js
const effect = await context.loadEffect("./Resources/00_Basic/Laser01.efkefc");
const handle = context.play(effect, 0, 0, 0);
```

使い終わったら native resource を解放します。

Release native resources when they are no longer needed.

```js
handle?.stop();
effect.release();
context.release();
```

## Audio / 音声

ブラウザの自動再生ポリシーにより、音声はユーザー操作後に再開する必要があります。ボタンやクリックイベントから `resumeSound()` を呼び出してください。

Because of browser autoplay policies, audio usually needs to be resumed after a user gesture. Call `resumeSound()` from a button or click handler.

```js
button.addEventListener("click", async () => {
  await context.resumeSound();
});
```

## Build From Source / ソースからビルド

開発環境では submodule と npm dependencies を用意してから build / test を実行します。

For development, initialize submodules and npm dependencies before running builds or tests.

```sh
git submodule update --init --recursive
npm install
npm run build:ts
npm test
```

native wasm まで含めてビルドする場合は Emscripten 環境を有効にしてから実行してください。

To build the native wasm outputs, enable an Emscripten environment first.

```sh
npm run build
```

配布アーカイブを作成するには次を実行します。

To create distributable archives, run:

```sh
npm run package:distribution
```

生成される主なファイル:

Main generated files:

- `artifacts/EffekseerForWeb<version>.zip`
- `artifacts/EffekseerForWeb<version>.tar.gz`
- `artifacts/SHA256SUMS`

## Troubleshooting / トラブルシューティング

`.wasm` が読み込めない場合は、HTTP サーバー経由で開いているか、`.wasm` ファイルが正しい場所にあるか確認してください。

If `.wasm` fails to load, make sure you are using an HTTP server and that the `.wasm` file is in the expected location.

エフェクトが表示されない場合は、エフェクトファイルだけでなく、テクスチャ、モデル、マテリアル、音声などの関連ファイルも同じ相対パスで配置されているか確認してください。

If an effect is not visible, make sure the related files such as textures, models, materials, and sounds are also placed with the expected relative paths.

WebGPU サンプルが動かない場合は、ブラウザと GPU が WebGPU に対応しているか確認してください。まず WebGL サンプルで基本的な読み込みを確認するのも有効です。

If the WebGPU sample does not run, check whether your browser and GPU support WebGPU. Running the WebGL sample first is also useful for confirming basic resource loading.

## License / ライセンス

MIT License. See [LICENSE](LICENSE).
