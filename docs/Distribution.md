# Distribution

## Local Package

Build the native outputs first, then create the distributable archives:

```sh
npm run package:distribution:build
```

If `dist/` is already up to date, only create the archives:

```sh
npm run package:distribution
```

The script writes:

- `artifacts/EffekseerForWeb<version>.zip`
- `artifacts/EffekseerForWeb<version>.tar.gz`
- `artifacts/SHA256SUMS`

## Archive Contents

The distributable archive intentionally contains only the runtime files needed by users:

- `README.md`: language selector
- `README_ja.md`: Japanese usage instructions
- `README_en.md`: English usage instructions
- `effekseer.js`: common JavaScript API
- `effekseer.d.ts`: TypeScript declarations
- `effekseer-webgl.js` / `effekseer-webgl.wasm`: WebGL native runtime
- `effekseer-webgpu.js` / `effekseer-webgpu.wasm`: WebGPU native runtime
- `Resources/`: sample effects copied from the `ResourceData` submodule
- `Sample/`: WebGL and WebGPU playback samples, including `three.min.js`

It does not include source files, build scripts, design docs, CI files, package metadata, or native tool binaries.

The file names are intentionally aligned with the EffekseerForWebGL distribution style: runtime files are placed at the archive root and use the `effekseer*.js` / `effekseer*.wasm` naming pattern. The internal build output names under `dist/` are not exposed directly in the distributable archive.

## Package Data

`PackageData/manifest.json` controls which files are copied into the archive.

Current included data:

- `ResourceData/samples` -> `Resources`
- `PackageData/Sample` -> `Sample`

Current excluded data:

- development source assets such as `.psd`, `.blend`, and `.fbx`
- submodule metadata
- native tool binaries under `ResourceData/tool/tools`
- docs/spec/source/build files

## GitHub Actions

`.github/workflows/distribution.yml` builds WebGL/WebGPU wasm outputs with Emscripten, runs browser smoke tests, captures browser-rendered WebGL screenshots, creates the distribution archives, and uploads the staged pre-archive distribution directory as a workflow artifact named `EffekseerForWeb<version>`, matching the EffekseerForWebGL distribution artifact style. GitHub Actions compresses that uploaded directory into the downloadable artifact zip.

The workflow also uploads a `browser-test-screenshots` artifact. It contains PNG captures, `summary.json`, and `index.html` for quick visual inspection of the rendered TestData samples.

When the workflow runs for a tag starting with `v`, it also creates or updates a GitHub Release and uploads the archive files there.

## Browser Smoke Tests

CI runs:

```sh
npm run test:browser:ci
```

The CI suite covers:

- `webgl-basic`
- `webgl-offscreen`
- `webgl-material`
- `webgpu-canvas`
- `webgpu-alpha-premultiplied`
- `webgpu-alpha-opaque`
- `webgpu-external`
- `webgpu-texture`

WebGL cases are required. WebGPU cases use `--allow-webgpu-skip` in CI, so they are skipped only when WebGPU is unavailable in the browser environment. CI also passes `--allow-webgpu-readback-skip` because some headless Linux WebGPU/canvas combinations can render but fail native canvas framebuffer readback. The external render-pass WebGPU cases still require pixel stats and validation error checks.

The smoke output includes a top-level `webgpuSummary` and per-case `webgpuStatus` entries. Use these fields to distinguish CI environments where WebGPU did not run from real WebGPU failures:

- `webgpuStatus.status: "executed"` means the case acquired `navigator.gpu`, adapter, device, initialized the runtime, created a context, and rendered.
- `webgpuStatus.status: "unavailable"` means the case did not execute because `navigator.gpu`, adapter, or device acquisition failed. This is the only WebGPU status that `--allow-webgpu-skip` may skip.
- `webgpuStatus.status: "canvas-unavailable"` means WebGPU is available, but the headless browser could not keep the WebGPU canvas path alive long enough to return a smoke payload. This is allowed only for WebGPU `mode: "canvas"` cases with `--allow-webgpu-readback-skip`.
- `webgpuStatus.status: "executed-failed"` means WebGPU was available and the case started, but a runtime, render, readback, validation, or pixel-stat check failed. CI must fail in this state.
- `webgpuSummary.readbackUnavailable` counts WebGPU canvas cases where rendering completed but native canvas framebuffer readback was unavailable. This is allowed only with `--allow-webgpu-readback-skip`; inspect the per-case `readbackUnavailable.message` for the reason.

When a smoke case fails, the runner still prints the full JSON summary before exiting with a non-zero status. Check `webgpuSummary.executedFailed` and the failing case's `webgpuStatus.failureStage` first.

When Chrome or Edge is not installed at a standard path, pass the browser path explicitly:

```sh
npm run test:browser -- --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

Or set `CHROME_BIN` / `EDGE_BIN`:

```sh
set "CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:browser:ci
```

PowerShell example:

```powershell
$env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run test:browser:ci
```

Audio playback is not included in the CI browser smoke suite yet because the current test data does not include an effect with configured sound assets.

## Browser Screenshots

CI captures screenshots with:

```sh
npm run test:screenshots:ci
```

The CI command renders the WebGL samples from the `effekseer-for-webgl` preset, which follows EffekseerForWebGL's browser-compatible runtime screenshot coverage for `TestData/Effects`. It writes them to `test-results/testdata-screenshots/webgl-ci`, which is uploaded as the `browser-test-screenshots` workflow artifact.

The screenshot command recreates the output directory before each capture run, so rerunning with the same `--out` path does not leave stale PNG files in the artifact. For safety, the output directory must resolve inside the repository.

For a broader local capture, run:

```sh
npm run test:screenshots
```

By default, local captures are written under `artifacts/testdata-screenshots/`.
