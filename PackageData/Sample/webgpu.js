import { createContext, getLastWebGPUError, initRuntime } from "../effekseer.js";

const THREE = window.THREE;
if (!THREE) {
  throw new Error("three.min.js was not loaded.");
}

const canvas = document.getElementById("canvas");
const status = document.getElementById("status");
const depthFormat = "depth32float";

let colorFormat = "bgra8unorm";
let depthTexture = null;
let depthWidth = 0;
let depthHeight = 0;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function resizeCanvas(effekseer) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(window.innerWidth * pixelRatio));
  const height = Math.max(1, Math.floor(window.innerHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    depthTexture?.destroy();
    depthTexture = null;
    if (effekseer) {
      effekseer.configureSurface({ width, height, colorFormat, depthFormat });
    }
  }
}

function getDepthView(device) {
  if (!depthTexture || depthWidth !== canvas.width || depthHeight !== canvas.height) {
    depthTexture?.destroy();
    depthWidth = canvas.width;
    depthHeight = canvas.height;
    depthTexture = device.createTexture({
      size: { width: depthWidth, height: depthHeight },
      format: depthFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  return depthTexture.createView();
}

async function main() {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  resizeCanvas();
  colorFormat = navigator.gpu.getPreferredCanvasFormat();

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

  const effekseer = await createContext({
    backend: "webgpu",
    canvas,
    canvasContext,
    device,
    colorFormat,
    depthFormat,
    width: canvas.width,
    height: canvas.height,
  });

  const camera = new THREE.PerspectiveCamera(35, canvas.width / canvas.height, 1, 1000);
  const clock = new THREE.Clock();

  const effectFiles = {
    laser1: "../Resources/00_Basic/Laser01.efkefc",
    laser2: "../Resources/00_Basic/Laser02.efkefc",
    laser3: "../Resources/00_Basic/Laser03.efkefc",
    fireworks: "../Resources/00_Basic/Simple_Turbulence_Fireworks.efkefc",
    track: "../Resources/00_Basic/Simple_Track1.efkefc",
  };

  const effects = new Map();
  const handles = [];

  const failedEffects = [];
  for (const [name, path] of Object.entries(effectFiles)) {
    try {
      effects.set(name, await effekseer.loadEffect(path));
    } catch (error) {
      const button = document.querySelector(`[data-effect="${name}"]`);
      if (button) {
        button.disabled = true;
        button.title = error instanceof Error ? error.message : String(error);
      }
      failedEffects.push(path);
    }
  }

  if (effects.size === 0) {
    throw new Error(`Failed to load all sample effects: ${failedEffects.join(", ")}`);
  }

  function playEffect(name) {
    const effect = effects.get(name);
    if (!effect) {
      return;
    }
    const handle = effekseer.play(effect, 0, 0, 0);
    if (handle) {
      handles.push(handle);
    }
  }

  function stopAll() {
    for (const handle of handles.splice(0)) {
      handle.stop();
    }
  }

  for (const button of document.querySelectorAll("[data-effect]")) {
    button.addEventListener("click", () => playEffect(button.dataset.effect));
  }
  document.getElementById("stop").addEventListener("click", stopAll);

  window.addEventListener("resize", () => {
    resizeCanvas(effekseer);
    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();
  });

  playEffect("laser1");
  setStatus(
    failedEffects.length > 0
      ? `WebGPU sample ready. Failed effects: ${failedEffects.join(", ")}`
      : "WebGPU sample ready.",
    failedEffects.length > 0,
  );

  function render() {
    requestAnimationFrame(render);

    const deltaFrames = clock.getDelta() * 60.0;
    const elapsed = clock.elapsedTime;
    camera.position.set(Math.sin(elapsed * 0.25) * 20, 12, Math.cos(elapsed * 0.25) * 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    effekseer.update(deltaFrames);
    effekseer.setProjectionMatrix(camera.projectionMatrix.elements);
    effekseer.setCameraMatrix(camera.matrixWorldInverse.elements);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasContext.getCurrentTexture().createView(),
          clearValue: { r: 0.082, g: 0.098, b: 0.122, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: getDepthView(device),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    effekseer.drawToRenderPass(pass, { colorFormat, depthFormat });
    pass.end();
    device.queue.submit([encoder.finish()]);

    const webgpuError = getLastWebGPUError();
    if (webgpuError) {
      setStatus(webgpuError, true);
    }
  }

  render();
}

main().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
