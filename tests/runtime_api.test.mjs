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
        if (name === "EffekseerInitWebGL" || name === "EffekseerInitWebGPU") {
          return initValue;
        }
        if (name === "EffekseerBeginWebGPUFrame" || name === "EffekseerDrawToExternalWebGPURenderPass") {
          return 1;
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
