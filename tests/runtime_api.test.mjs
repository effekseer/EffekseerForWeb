import test from "node:test";
import assert from "node:assert/strict";

import {
  createContext,
  getLastWebGPUError,
  initRuntime,
} from "../dist/index.js";

function createNativeModule(initValue) {
  const calls = [];
  const memory = new ArrayBuffer(1024 * 1024);
  let nextPtr = 8;

  const module = {
    calls,
    HEAP8: new Int8Array(memory),
    HEAPU8: new Uint8Array(memory),
    HEAPF32: new Float32Array(memory),
    GL: {
      registerContext(_context, attrs) {
        calls.push(["GL.registerContext", attrs.majorVersion]);
        return 77;
      },
      makeContextCurrent(handle) {
        calls.push(["GL.makeContextCurrent", handle]);
      },
    },
    AL: {
      currentCtx: {
        audioCtx: {
          state: "running",
          resume: async () => {},
        },
      },
    },
    effekseerLastWebGPUError: "validation-message",
    __effekseerImportWebGPURenderPassEncoder(renderPassEncoder) {
      calls.push(["importRenderPass", renderPassEncoder]);
      return 707;
    },
    cwrap(name, returnType) {
      return (...args) => {
        calls.push([name, ...args]);
        if (name === "EffekseerSetProjectionMatrix" || name === "EffekseerSetCameraMatrix") {
          const ptr = Number(args[1]);
          calls.push([`${name}:matrix`, Array.from(module.HEAPF32.slice(ptr >> 2, (ptr >> 2) + 16))]);
        }
        if (name === "EffekseerInitWebGL" || name === "EffekseerInitWebGPU" || name === "EffekseerLoadEffect") {
          return initValue;
        }
        if (
          name === "EffekseerBeginWebGPUFrame" ||
          name === "EffekseerDrawToExternalWebGPURenderPass" ||
          name === "EffekseerResizeWebGPU" ||
          name === "EffekseerSetWebGPUPremultipliedAlpha"
        ) {
          return 1;
        }
        if (name === "EffekseerReadWebGPUFrameBuffer") {
          const ptr = Number(args[1]);
          const bytes = [12, 34, 56, 78, 90, 123, 156, 200];
          module.HEAPU8.set(bytes, ptr);
          return bytes.length;
        }
        if (name === "EffekseerPlayEffect") {
          return 10;
        }
        if (returnType === "number") {
          return 0;
        }
        return undefined;
      };
    },
    _malloc(size) {
      const ptr = nextPtr;
      nextPtr += Math.max(size, 1);
      return ptr;
    },
    _free() {},
    stackSave() {
      return nextPtr;
    },
    stackRestore(ptr) {
      nextPtr = ptr;
    },
    stackAlloc(size) {
      const ptr = nextPtr;
      nextPtr += size;
      return ptr;
    },
  };

  return module;
}

test("WebGL context registers and releases through the native API", async () => {
  const native = createNativeModule(101);
  await initRuntime({
    backend: "webgl",
    moduleFactory: async () => native,
  });

  const context = await createContext({
    backend: "webgl",
    graphicsContext: {},
  });

  context.update(1);
  context.draw();
  context.release();

  assert.equal(context.nativePtr, 0);
  assert.deepEqual(native.calls.slice(0, 3), [
    ["GL.registerContext", 1],
    ["GL.makeContextCurrent", 77],
    ["EffekseerInitWebGL", 4000, 10000, 1, 0],
  ]);
  assert.ok(native.calls.some((call) => call[0] === "GL.makeContextCurrent" && call[1] === 77));
  assert.ok(native.calls.some((call) => call[0] === "EffekseerTerminate"));
});

test("WebGPU high-level canvas path calls begin, draw, end, and submit", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      gpu: {
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    },
  });

  const native = createNativeModule(202);
  await initRuntime({
    backend: "webgpu",
    device: new EventTarget(),
    moduleFactory: async (options) => {
      native.preinitializedWebGPUDevice = options.preinitializedWebGPUDevice;
      return native;
    },
  });

  const context = await createContext({
    backend: "webgpu",
    device: new EventTarget(),
    colorFormat: "bgra8unorm",
    depthFormat: "depth32float",
  });

  context.drawToCanvas();
  context.release();

  const names = native.calls.map((call) => call[0]);
  assert.ok(names.includes("EffekseerBeginWebGPUFrame"));
  assert.ok(names.includes("EffekseerDrawWebGPUFrame"));
  assert.ok(names.includes("EffekseerEndWebGPURenderPass"));
  assert.ok(names.includes("EffekseerSubmitWebGPUFrame"));
  assert.equal(getLastWebGPUError(), "validation-message");
});

test("WebGPU premultiplied alpha is passed to canvas and native initialization", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      gpu: {
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    },
  });

  const native = createNativeModule(212);
  const device = new EventTarget();
  const configureCalls = [];
  await initRuntime({
    backend: "webgpu",
    device,
    moduleFactory: async (options) => {
      native.preinitializedWebGPUDevice = options.preinitializedWebGPUDevice;
      return native;
    },
  });

  const context = await createContext({
    backend: "webgpu",
    device,
    canvasContext: {
      canvas: { width: 16, height: 8 },
      configure(configuration) {
        configureCalls.push(configuration);
      },
    },
    colorFormat: "bgra8unorm",
    enablePremultipliedAlpha: true,
  });

  assert.equal(configureCalls[0].alphaMode, "premultiplied");
  assert.ok(
    native.calls.some(
      (call) =>
        call[0] === "EffekseerInitWebGPU" &&
        call[1] === 4000 &&
        call[2] === 10000 &&
        call[3] === 16 &&
        call[4] === 8 &&
        call[5] === 1,
    ),
  );

  context.configureSurface({ alphaMode: "opaque" });
  assert.equal(configureCalls[configureCalls.length - 1].alphaMode, "opaque");
  assert.ok(native.calls.some((call) => call[0] === "EffekseerSetWebGPUPremultipliedAlpha" && call[1] === 212 && call[2] === 0));

  context.release();
});

test("WebGPU high-level frame buffer readback copies native pixels", async () => {
  const native = createNativeModule(242);
  await initRuntime({
    backend: "webgpu",
    device: new EventTarget(),
    moduleFactory: async () => native,
  });

  const context = await createContext({
    backend: "webgpu",
    device: new EventTarget(),
    colorFormat: "rgba8unorm",
    width: 2,
    height: 1,
  });

  const readback = await context.readFrameBuffer();
  assert.equal(readback.width, 2);
  assert.equal(readback.height, 1);
  assert.equal(readback.bytesPerRow, 8);
  assert.deepEqual(Array.from(readback.data), [12, 34, 56, 78, 90, 123, 156, 200]);
  assert.ok(native.calls.some((call) => call[0] === "EffekseerReadWebGPUFrameBuffer" && call[1] === 242));

  context.release();
});

test("WebGPU low-level render pass path imports the external render pass", async () => {
  const native = createNativeModule(303);
  await initRuntime({
    backend: "webgpu",
    device: new EventTarget(),
    moduleFactory: async () => native,
  });

  const context = await createContext({
    backend: "webgpu",
    device: new EventTarget(),
    colorFormat: "rgba8unorm",
  });

  const renderPass = {};
  context.drawToRenderPass(renderPass, {
    colorFormat: "rgba8unorm",
    depthFormat: "depth24plus-stencil8",
  });

  assert.ok(native.calls.some((call) => call[0] === "importRenderPass" && call[1] === renderPass));
  assert.ok(
    native.calls.some(
      (call) =>
        call[0] === "EffekseerDrawToExternalWebGPURenderPass" &&
        call[1] === 303 &&
        call[2] === 707 &&
        call[3] === 1 &&
        call[4] === 2,
    ),
  );
});

test("setCameraFromThree updates and copies Three.js camera matrices", async () => {
  const native = createNativeModule(404);
  await initRuntime({
    backend: "webgl",
    moduleFactory: async () => native,
  });

  const context = await createContext({
    backend: "webgl",
    graphicsContext: {},
  });

  const projection = Array.from({ length: 16 }, (_, index) => index + 1);
  const view = Array.from({ length: 16 }, (_, index) => index + 101);
  let updateCount = 0;

  context.setCameraFromThree({
    projectionMatrix: { elements: projection },
    matrixWorldInverse: { elements: view },
    updateMatrixWorld() {
      updateCount++;
    },
  });

  assert.equal(updateCount, 1);
  assert.deepEqual(
    native.calls.find((call) => call[0] === "EffekseerSetProjectionMatrix:matrix")?.[1],
    projection,
  );
  assert.deepEqual(
    native.calls.find((call) => call[0] === "EffekseerSetCameraMatrix:matrix")?.[1],
    view,
  );

  context.setCameraFromThree(
    {
      projectionMatrix: { elements: projection },
      matrixWorldInverse: { elements: view },
      updateMatrixWorld() {
        updateCount++;
      },
    },
    { updateMatrixWorld: false },
  );
  assert.equal(updateCount, 1);

  context.release();
});

test("loadEffect supports EffekseerForWebGL-style callbacks", async () => {
  const native = createNativeModule(505);
  await initRuntime({
    backend: "webgl",
    moduleFactory: async () => native,
  });

  const context = await createContext({
    backend: "webgl",
    graphicsContext: {},
  });

  let callbackEffect;
  const effect = await context.loadEffect(
    new ArrayBuffer(8),
    2.0,
    (loaded) => {
      callbackEffect = loaded;
    },
  );

  assert.equal(effect.nativePtr, 505);
  assert.equal(callbackEffect, effect);
  assert.ok(native.calls.some((call) => call[0] === "EffekseerLoadEffect" && call[4] === 2.0));

  effect.release();
  context.release();
});
