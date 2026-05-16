if (typeof Module === "undefined") {
  var Module = {};
}

Module.preRun = Module.preRun || [];
Module.preRun.push(function () {
  if (!Module.preinitializedWebGPUDevice) {
    return;
  }

  Module.preinitializedWebGPUDevice.addEventListener("uncapturederror", function (event) {
    Module.effekseerLastWebGPUError =
      event.error && event.error.message ? event.error.message : String(event.error);
    Module.effekseerWebGPUErrors = Module.effekseerWebGPUErrors || [];
    Module.effekseerWebGPUErrors.push(Module.effekseerLastWebGPUError);
    if (typeof console !== "undefined") {
      console.error("EFFEKSEER_WEBGPU_ERROR", Module.effekseerLastWebGPUError);
    }
  });
});
