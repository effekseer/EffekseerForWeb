import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("sample menu exposes the basic Three.js WebGPU demo", async () => {
  const index = await readText("PackageData/Sample/index.html");

  assert.match(index, /href="\.\/basic-threejs-webgpu\.html"/);
  assert.match(index, /Basic Three\.js WebGPU Demo/);
});

test("basic Three.js WebGPU demo loads Three.js and the WebGPU sample module", async () => {
  const html = await readText("PackageData/Sample/basic-threejs-webgpu.html");
  const script = await readText("PackageData/Sample/basic-threejs-webgpu.js");

  assert.match(html, /<script src="\.\/three\.min\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\.\/basic-threejs-webgpu\.js"><\/script>/);
  assert.match(script, /new THREE\.PerspectiveCamera/);
  assert.match(script, /setCameraFromThree\(camera/);
  assert.match(script, /drawToRenderPass\(pass/);
  assert.match(script, /camera: "three"/);
});

test("browser CI includes the Three.js WebGPU camera smoke case", async () => {
  const packageJson = JSON.parse(await readText("package.json"));

  assert.match(packageJson.scripts["test:browser:ci"], /--case webgpu-three-camera/);
});
