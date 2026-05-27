import { createContext, getLastWebGPUError, initRuntime } from "../effekseer.js";

const canvas = document.getElementById("canvas");
const status = document.getElementById("status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function resizeCanvas(context) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
  const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context?.configureSurface({ width, height });
  }
}

async function main() {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  resizeCanvas();
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("Failed to request a WebGPU adapter.");
  }

  const device = await adapter.requestDevice();
  device.addEventListener?.("uncapturederror", (event) => {
    setStatus(event.error?.message ?? "WebGPU validation error.", true);
  });

  const canvasContext = canvas.getContext("webgpu");
  if (!canvasContext) {
    throw new Error("Failed to create a WebGPU canvas context.");
  }

  await initRuntime({
    backend: "webgpu",
    device,
    scriptPath: "../effekseer-webgpu.js",
    wasmPath: "../effekseer-webgpu.wasm",
  });

  const context = await createContext({
    backend: "webgpu",
    canvas,
    canvasContext,
    device,
    width: canvas.width,
    height: canvas.height,
  });

  const effect = await context.loadEffect("../Resources/00_Basic/Laser01.efkefc");
  context.play(effect, 0, 0, 0);
  context.setProjectionPerspective(45, canvas.width / canvas.height, 1, 1000);
  context.setCameraLookAt(0, 0, 20, 0, 0, 0);
  setStatus("Basic WebGPU demo ready.");

  window.addEventListener("resize", () => {
    resizeCanvas(context);
    context.setProjectionPerspective(45, canvas.width / canvas.height, 1, 1000);
  });

  let reportedReady = false;
  function render() {
    requestAnimationFrame(render);
    context.update(1);
    context.drawToCanvas();

    const webgpuError = getLastWebGPUError();
    if (webgpuError) {
      setStatus(webgpuError, true);
      return;
    }

    if (!reportedReady) {
      reportedReady = true;
      window.__effekseerBasicWebGPUDemo = {
        ok: true,
        effect: "Resources/00_Basic/Laser01.efkefc",
        backend: "webgpu",
      };
    }
  }

  render();
}

main().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
  window.__effekseerBasicWebGPUDemo = {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    webgpuError: getLastWebGPUError(),
  };
});
