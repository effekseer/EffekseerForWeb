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

`.github/workflows/distribution.yml` builds WebGL/WebGPU wasm outputs with Emscripten, creates the distribution archives, and uploads them as workflow artifacts.

When the workflow runs for a tag starting with `v`, it also creates or updates a GitHub Release and uploads the archive files there.
