if (typeof Module !== "undefined" && typeof GL !== "undefined") {
  Module.GL = GL;
}

if (typeof Module !== "undefined") {
  if (typeof HEAPU8 !== "undefined") {
    Object.defineProperty(Module, "HEAPU8", {
      configurable: true,
      get: function () {
        return HEAPU8;
      },
    });
  }
  if (typeof HEAP8 !== "undefined") {
    Object.defineProperty(Module, "HEAP8", {
      configurable: true,
      get: function () {
        return HEAP8;
      },
    });
  }
  if (typeof HEAPF32 !== "undefined") {
    Object.defineProperty(Module, "HEAPF32", {
      configurable: true,
      get: function () {
        return HEAPF32;
      },
    });
  }

  Module.__effekseerImportWebGPUCommandEncoder = function (commandEncoder) {
    if (typeof WebGPU === "undefined" || typeof WebGPU.importJsCommandEncoder !== "function") {
      throw new Error("Emscripten WebGPU object import is unavailable.");
    }
    return WebGPU.importJsCommandEncoder(commandEncoder);
  };

  Module.__effekseerImportWebGPURenderPassEncoder = function (renderPassEncoder) {
    if (typeof WebGPU === "undefined" || typeof WebGPU.importJsRenderPassEncoder !== "function") {
      throw new Error("Emscripten WebGPU object import is unavailable.");
    }
    return WebGPU.importJsRenderPassEncoder(renderPassEncoder);
  };
}
