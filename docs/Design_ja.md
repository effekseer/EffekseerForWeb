# EffekseerForWeb Design

## 目的

EffekseerForWeb は、既存の EffekseerForWebGL の利用感を保ちながら、WebGL と WebGPU の両方を同じ TypeScript API から扱える Web 向けランタイムとして設計する。

初期実装で重視する点は次の通り。

- WebGL と WebGPU を明示的に選択する。
- WebGL 利用時に WebGPU device や WebGPU wasm を要求しない。
- WebGPU 利用時に WebGL context を要求しない。
- 非同期 API は Promise ベースに統一する。
- 音声、画像、モデル、曲線、マテリアルを初期スコープに含める。
- WebGPU は高レイヤー canvas presentation API と、利用者管理の低レイヤー render pass API の両方を提供する。

## レイヤー構成

### TypeScript レイヤー

TypeScript レイヤーは、利用者向け API とブラウザリソースの非同期ロードを担当する。

主な責務:

- wasm module factory のロード
- WebGPU device の要求または受け取り
- WebGL context の Emscripten 登録
- Effect / Handle / Context API の提供
- fetch、Blob decode、ImageBitmap / HTMLImageElement の選択
- Effekseer package の展開
- Promise rejection と例外型の整理
- AudioContext resume の導線

主要な公開型:

- `EffekseerRuntime`
- `WebGLEffekseerContext`
- `WebGPUEffekseerContext`
- `EffekseerEffect`
- `EffekseerHandle`
- `RuntimeOptions`
- `ContextOptions`

### Native C++ レイヤー

C++ レイヤーは Effekseer 本体、Renderer、Sound、FileInterface、GPU bridge をまとめる。

主な責務:

- `Effekseer::Manager`
- backend 別 `EffekseerRenderer`
- `EffekseerSoundAL`
- `CustomFileInterface`
- WebGL texture loader
- WebGPU LLGI command list / render pass 管理
- C ABI の exported function

TypeScript から C++ へは `cwrap` した exported function 経由でアクセスする。公開関数名は `Effekseer...` に統一する。

### Build レイヤー

WebGL と WebGPU の wasm は分けて出力する。

- WebGL: `effekseer-webgl-native.js` / `.wasm`
- WebGPU: `effekseer-webgpu-native.js` / `.wasm`

`build.py` は TypeScript build と Emscripten CMake build をまとめるための入口とする。

配布 archive では EffekseerForWebGL の表記に合わせ、build output を root 配下の `effekseer.js`、`effekseer.d.ts`、`effekseer-webgl.js` / `.wasm`、`effekseer-webgpu.js` / `.wasm` として格納する。`dist/` 配下の内部 build 名は配布物には直接出さない。

## Runtime 初期化

`initRuntime(options)` は backend ごとに runtime を作成し、内部 map に登録する。

Runtime 作成の流れ:

1. `moduleFactory` が渡されていれば使う。
2. `scriptPath` が渡されていれば script をロードして global factory を探す。
3. global factory が存在すれば使う。
4. WebGPU backend の場合は `GPUDevice` を準備し、`preinitializedWebGPUDevice` として Emscripten module に渡す。
5. module を作成し、exported function を bind する。

WebGPU device は次の順で決定する。

1. 利用者が渡した `device`
2. `navigator.gpu.requestAdapter()` と `adapter.requestDevice()`

WebGPU 未対応時は `WebGPUUnavailableError` を投げる。WebGL runtime には影響させない。

## Context 設計

### 共通 Context

共通 Context は update、draw、camera、projection、effect load、sound control を提供する。

代表 API:

- `update(deltaFrames)`
- `beginUpdate()`
- `updateHandle(handle, deltaFrames)`
- `endUpdate()`
- `draw()`
- `loadEffect(data, options)`
- `loadEffectPackage(data, Unzip, options)`
- `play(effect, x, y, z)`
- `setProjectionMatrix(matrix)`
- `setCameraMatrix(matrix)`
- `setCameraFromThree(camera)`
- `setSoundVolume(volume)`
- `resumeSound()`
- `pauseSound()`

Effect 読み込みは native 側の loader が同期的にファイル要求する構造のため、TypeScript 側では「試行、足りないリソースを非同期ロード、再試行」というループで Promise 化する。

### WebGL Context

WebGL Context は既存 EffekseerForWebGL の方針を踏襲する。

主な仕様:

- 利用者が渡した `WebGLRenderingContext` / `WebGL2RenderingContext` を Emscripten `Module.GL.registerContext` に登録する。
- draw 前に `makeContextCurrent()` を呼ぶ。
- texture upload は native WebGL texture loader から `Module._loadImage()` を呼び、TypeScript が返す `TexImageSource` を使う。
- 背景キャプチャ、state restoration、VAO support query を提供する。

### WebGPU Context

WebGPU Context は 2 種類の描画経路を持つ。

高レイヤー API:

- `draw()`
- `drawToCanvas()`
- `beginRenderPass()`
- `drawCurrentFrame()`
- `endRenderPass()`
- `submit()`
- `configureSurface(options)`

高レイヤー API では Context が native surface、current texture、render pass、command buffer submit、present を管理する。`drawToCanvas()` は `beginRenderPass()`、`drawCurrentFrame()`、`endRenderPass()`、`submit()` の薄いラッパーとして扱う。

低レイヤー API:

- `drawToRenderPass(renderPassEncoder, options)`

低レイヤー API では利用者が `GPURenderPassEncoder`、`pass.end()`、`device.queue.submit()` を管理する。Context は渡された render pass に Effekseer の描画コマンドだけを記録する。

`drawToRenderPass` の `options` では次を指定できる。

- `colorFormat`
- `depthFormat`

指定しない場合は Context 作成時の `colorFormat` / `depthFormat` を使う。

## WebGPU Native Bridge

WebGPU native bridge は LLGI WebGPU backend を使う。

高レイヤー描画では native 側が次を行う。

1. `PlatformWebGPU::NewFrame()`
2. offscreen color/depth render pass 開始
3. Effekseer の描画
4. canvas current screen render pass 開始
5. offscreen color buffer を fullscreen copy
6. command buffer submit
7. present

低レイヤー描画では、Emscripten WebGPU の JS object import を利用して `GPURenderPassEncoder` を native handle に変換する。LLGI の `CommandListWebGPU` に `BeginRenderPassWithPlatformPtr` / `EndRenderPassWithPlatformPtr` を追加し、外部 render pass encoder を一時的に使えるようにする。

## Resource Loading

### Binary

native `CustomFileInterface` が `Module._loadBinary(path, required)` を呼ぶ。TypeScript 側は現在ロード中の `EffekseerEffect` に要求を集約し、fetch または package resource から `ArrayBuffer` を返す。

WebGPU の effect texture はこの binary 経路を使う。EffekseerRendererCommon の標準 `TextureLoader` が PNG/TGA/DDS binary を native 側で decode し、`LLGI::Texture` を作成する。

### Image

画像 decode は次の優先順位とする。

1. `createImageBitmap(blob)`
2. `HTMLImageElement`

この image decode 経路は WebGL texture loader の標準経路とする。WebGL では `ImageBitmap` と `HTMLImageElement` の両方を `TexImageSource` として扱う。

WebGPU の effect texture は初期実装では image decode 経路を使わず、binary resource と native `TextureLoader` によって読み込む。将来 JS 側で画像を直接 WebGPU texture に upload する用途を追加する場合は、`copyExternalImageToTexture` との相性を考慮して `ImageBitmap` を優先する。

### Package

`loadEffectPackage` は `metafile.json` を読み、Effect 本体と関連リソースを `Map<string, ArrayBuffer>` に展開する。展開済み resource は fetch より優先して解決する。

## Audio

音声は初期対応に含める。

native 側は `EffekseerSoundAL` を使い、Emscripten/OpenAL 経由で Sound loader/player を Manager に設定する。TypeScript 側は `AudioContext` を受け取れるようにし、ブラウザの autoplay policy に対応するため `resumeSound()` を Promise API として提供する。

提供する操作:

- `setSoundVolume(volume)`
- `setListener(position, at, up)`
- `resumeSound()`
- `pauseSound()`

## Material

マテリアルは WebGL と WebGPU の両方を初期スコープに含める。

方針:

- `.efkmat` を読み込む。
- 事前コンパイル済み material binary を利用できる。
- WebGL は EffekseerMaterialCompiler OpenGL 系を利用する。
- WebGPU は EffekseerRendererWebGPU の material loader 経路を使い、事前コンパイル済み WebGPU binary を優先する。
- WebGPU の runtime material compile は Emscripten で必要な transpiler 依存をどう組み込むかを確認してから確定する。

## Error Handling

利用者に見える主なエラー型:

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

非同期処理は Promise rejection として返す。同期的に API の使い方が誤っている場合は `InvalidOperationError` を投げる。

WebGPU validation error は module 側で最後の message を保持し、`getLastWebGPUError()` と Context の `getLastWebGPUError()` から参照できる。

## Test 方針

初期検証は次の順で行う。

1. TypeScript 型チェック
2. TypeScript build
3. WebGL native build
4. WebGPU native build
5. ブラウザ smoke test
6. 画像、音声、package、material のリソースロードテスト
7. WebGPU 高レイヤー canvas presentation test
8. WebGPU 低レイヤー external render pass test

WebGL と WebGPU の描画結果は完全一致ではなく、主要ピクセル、非空描画、validation error の有無を基準にする。ブラウザ smoke test は `tests/browser/smoke.html` と `tests/browser/run_smoke.mjs` で実行し、WebGPU 低レイヤー経路は `mode=external` で確認する。実 asset は `TestData` submodule を使う。
