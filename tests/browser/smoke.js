import {
  createContext,
  getLastWebGPUError,
  getWebGPUErrors,
  initRuntime,
  setLogEnabled,
} from "../../dist/index.js";

const result = document.getElementById("result");
const canvas = document.getElementById("canvas");
const params = new URLSearchParams(location.search);
const backend = params.get("backend") || "webgl";
const mode = params.get("mode") || "canvas";
const native = params.get("native") || `../../dist/effekseer-${backend}-native.js`;
const wasm = params.get("wasm") || `../../dist/effekseer-${backend}-native.wasm`;
const effectPath = params.get("effect") || "";
const frames = Number(params.get("frames") || "30");
const cameraMode = params.get("camera") || "";
const alphaMode = params.get("alphaMode") || "";
const compositeBackground = params.get("compositeBackground") || "";
const testBackground = params.get("testBackground") || "";
const allowWebGPUReadbackSkip = params.get("allowWebGPUReadbackSkip") === "1";
const cameraPosition = { x: 20, y: 20, z: 20 };
const cameraTarget = { x: 0, y: 0, z: 0 };
const cameraFov = 30;

if (compositeBackground) {
  document.documentElement.style.background = compositeBackground;
  document.body.style.background = compositeBackground;
  canvas.style.background = "transparent";
} else if (testBackground === "distortion-grid") {
  const gridBackground = [
    "linear-gradient(135deg, rgba(255,80,160,0.5) 0 2px, transparent 2px 28px)",
    "linear-gradient(45deg, rgba(72,220,255,0.5) 0 2px, transparent 2px 28px)",
    "repeating-linear-gradient(0deg, #152033 0 31px, #f7fbff 31px 33px, #152033 33px 64px)",
    "repeating-linear-gradient(90deg, rgba(250,210,70,0.9) 0 31px, #0b1726 31px 33px, rgba(60,180,255,0.9) 33px 64px)",
  ].join(", ");
  document.documentElement.style.background = gridBackground;
  document.body.style.background = gridBackground;
  canvas.style.background = "transparent";
}

let smokeStage = "startup";
let webgpuStatus = backend === "webgpu"
  ? {
      requested: true,
      status: "pending",
      navigatorGpu: false,
      adapter: false,
      device: false,
      initialized: false,
      contextCreated: false,
      rendered: false,
      readbackUnavailable: false,
      readbackUnavailableReason: "",
      unavailableReason: "",
      failureStage: "",
    }
  : undefined;

function report(payload) {
  result.textContent = JSON.stringify(payload, null, 2);
  window.__effekseerSmokeResult = payload;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function markWebGPUUnavailable(reason) {
  if (webgpuStatus) {
    webgpuStatus.status = "unavailable";
    webgpuStatus.unavailableReason = reason;
    webgpuStatus.failureStage = smokeStage;
  }
  throw new Error(reason);
}

function isNativeWebGPUReadbackFailure(error) {
  return getErrorMessage(error).includes("Failed to read the native WebGPU frame buffer.");
}

async function requestSmokeWebGPUDevice() {
  smokeStage = "webgpu-navigator";
  if (!navigator.gpu) {
    markWebGPUUnavailable("navigator.gpu is not available.");
  }
  webgpuStatus.navigatorGpu = true;

  smokeStage = "webgpu-adapter";
  let adapter;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch (error) {
    markWebGPUUnavailable(`Failed to request a WebGPU adapter: ${getErrorMessage(error)}`);
  }
  if (!adapter) {
    markWebGPUUnavailable("Failed to request a WebGPU adapter.");
  }
  webgpuStatus.adapter = true;

  smokeStage = "webgpu-device";
  const optionalFeatures = ["float32-filterable", "texture-formats-tier2", "texture-compression-bc"];
  const requiredFeatures = optionalFeatures.filter((feature) => adapter.features?.has?.(feature));
  try {
    const device = await adapter.requestDevice({ requiredFeatures });
    webgpuStatus.device = true;
    return device;
  } catch (error) {
    markWebGPUUnavailable(`Failed to request a WebGPU device: ${getErrorMessage(error)}`);
  }
}

function encodeResourceUrl(url) {
  const normalized = url.replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "/" : "";
  const segments = [];
  for (const segment of normalized.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(encodeURIComponent(segment));
  }
  return prefix + segments.join("/");
}

function analyzePixelRows(pixels, width, height, bytesPerRow, options = {}) {
  let changedPixels = 0;
  let whiteLikePixels = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  const buckets = new Set();
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      const changed = options.ignoreAlpha ? r !== 0 || g !== 0 || b !== 0 : r !== 0 || g !== 0 || b !== 0 || a !== 0;
      if (changed) {
        changedPixels++;
        redTotal += r;
        greenTotal += g;
        blueTotal += b;
        if (r >= 240 && g >= 240 && b >= 240) {
          whiteLikePixels++;
        }
        buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 4}`);
      }
    }
  }

  return {
    changedPixels,
    colorBuckets: buckets.size,
    whiteLikePixels,
    averageColor: changedPixels > 0
      ? [
          Math.round(redTotal / changedPixels),
          Math.round(greenTotal / changedPixels),
          Math.round(blueTotal / changedPixels),
        ]
      : [0, 0, 0],
  };
}

function analyzeWebGLPixels(gl, width, height) {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return analyzePixelRows(pixels, width, height, width * 4);
}

function configureCamera(context, width, height) {
  if (!cameraMode) {
    context.setProjectionPerspective(cameraFov, width / height, 1, 1000);
    context.setCameraLookAt(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      cameraTarget.x,
      cameraTarget.y,
      cameraTarget.z,
    );
    return false;
  }

  if (cameraMode !== "three") {
    throw new Error(`Unsupported camera mode: ${cameraMode}`);
  }

  const THREE = window.THREE;
  if (!THREE || typeof THREE.PerspectiveCamera !== "function") {
    throw new Error("THREE.PerspectiveCamera is unavailable.");
  }

  const camera = new THREE.PerspectiveCamera(cameraFov, width / height, 1, 1000);
  camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
  camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  context.setCameraFromThree(camera);
  return true;
}

function createDistortionBackgroundPixels(width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = ((Math.floor(x / 32) + Math.floor(y / 32)) & 1) !== 0;
      let r = cell ? 230 : 26;
      let g = cell ? 236 : 62;
      let b = cell ? 246 : 112;

      if (x % 64 < 3 || y % 64 < 3) {
        r = 250;
        g = 250;
        b = 250;
      }
      if ((x + y) % 96 < 4) {
        r = 255;
        g = 70;
        b = 145;
      }
      if ((x - y + height) % 96 < 4) {
        r = 60;
        g = 220;
        b = 255;
      }

      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function drawWebGLDistortionBackground(gl, width, height) {
  const wasScissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
  const oldScissor = gl.getParameter(gl.SCISSOR_BOX);
  const oldClearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE);
  const oldClearDepth = gl.getParameter(gl.DEPTH_CLEAR_VALUE);

  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(26 / 255, 62 / 255, 112 / 255, 1);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);

  for (let y = 0; y < height; y += 32) {
    for (let x = 0; x < width; x += 32) {
      const w = Math.min(32, width - x);
      const h = Math.min(32, height - y);
      const cell = ((Math.floor(x / 32) + Math.floor(y / 32)) & 1) !== 0;
      if (!cell) {
        continue;
      }
      gl.scissor(x, height - y - h, w, h);
      gl.clearColor(230 / 255, 236 / 255, 246 / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  gl.clearColor(250 / 255, 250 / 255, 250 / 255, 1);
  for (let x = 0; x < width; x += 64) {
    gl.scissor(x, 0, Math.min(3, width - x), height);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  for (let y = 0; y < height; y += 64) {
    gl.scissor(0, y, width, Math.min(3, height - y));
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  gl.clearColor(oldClearColor[0], oldClearColor[1], oldClearColor[2], oldClearColor[3]);
  gl.clearDepth(oldClearDepth);
  if (wasScissorEnabled) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(oldScissor[0], oldScissor[1], oldScissor[2], oldScissor[3]);
  } else {
    gl.disable(gl.SCISSOR_TEST);
  }
}

async function analyzeCanvasPixels(sourceCanvas) {
  if (typeof createImageBitmap !== "function") {
    return undefined;
  }

  try {
    const bitmap = await createImageBitmap(sourceCanvas);
    const readbackCanvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height)
      : document.createElement("canvas");
    readbackCanvas.width = sourceCanvas.width;
    readbackCanvas.height = sourceCanvas.height;
    const context2d = readbackCanvas.getContext("2d");
    if (!context2d) {
      bitmap.close?.();
      return undefined;
    }
    context2d.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const pixels = context2d.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
    return analyzePixelRows(pixels, sourceCanvas.width, sourceCanvas.height, sourceCanvas.width * 4);
  } catch {
    return undefined;
  }
}

async function drawAndAnalyzeWebGPUExternalFrames(context, device, colorFormat, depthFormat, width, height, frameCount) {
  const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
  const colorTexture = device.createTexture({
    size: { width, height },
    format: colorFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const depthTexture = device.createTexture({
    size: { width, height },
    format: depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  try {
    for (let i = 0; i < frameCount; i++) {
      context.update(1);
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: colorTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });
      context.drawToRenderPass(pass, { colorFormat, depthFormat });
      pass.end();
      device.queue.submit([encoder.finish()]);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    const readback = device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture: colorTexture },
      { buffer: readback, bytesPerRow },
      { width, height },
    );
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const pixels = new Uint8Array(readback.getMappedRange()).slice();
    readback.unmap();
    return analyzePixelRows(pixels, width, height, bytesPerRow);
  } finally {
    colorTexture.destroy();
    depthTexture.destroy();
  }
}

async function main() {
  if (!effectPath) {
    throw new Error("Missing ?effect= path.");
  }

  let webgpuDevice = null;
  if (backend === "webgpu") {
    webgpuDevice = await requestSmokeWebGPUDevice();
  }

  smokeStage = "init-runtime";
  setLogEnabled(true);
  await initRuntime({
    backend,
    scriptPath: native,
    wasmPath: wasm,
    device: webgpuDevice ?? undefined,
  });
  if (webgpuStatus) {
    webgpuStatus.initialized = true;
  }

  let context;
  let gl = null;
  let renderCanvas = canvas;
  let colorFormat = "bgra8unorm";
  const depthFormat = "depth32float";
  if (backend === "webgl") {
    smokeStage = "create-webgl-context";
    const contextAttributes = {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true,
    };
    if (mode === "offscreen") {
      if (typeof OffscreenCanvas !== "function") {
        throw new Error("OffscreenCanvas is not available.");
      }
      renderCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    }
    gl = renderCanvas.getContext("webgl2", contextAttributes) || renderCanvas.getContext("webgl", contextAttributes);
    if (!gl) {
      throw new Error("Failed to create WebGL context.");
    }
    context = await createContext({
      backend: "webgl",
      graphicsContext: gl,
    });
  } else {
    smokeStage = "create-webgpu-context";
    if (!webgpuDevice) {
      throw new Error("WebGPU device is not available after preflight.");
    }
    colorFormat = navigator.gpu.getPreferredCanvasFormat();
    const canvasContext = canvas.getContext("webgpu");
    context = await createContext({
      backend: "webgpu",
      canvas,
      canvasContext,
      device: webgpuDevice,
      colorFormat,
      depthFormat,
      alphaMode: alphaMode || undefined,
      enablePremultipliedAlpha: alphaMode === "premultiplied" ? true : undefined,
    });
    webgpuStatus.contextCreated = true;
  }

  let backgroundApplied = "";
  if (testBackground === "distortion-grid" && backend === "webgpu" && typeof context.setBackgroundImage === "function") {
    context.setBackgroundImage(createDistortionBackgroundPixels(canvas.width, canvas.height), canvas.width, canvas.height);
    backgroundApplied = "native-webgpu-background-image";
  }

  smokeStage = "load-effect";
  const effect = await context.loadEffect(effectPath, { redirect: encodeResourceUrl });
  smokeStage = "play-effect";
  const handle = context.play(effect, 0, 0, 0);
  const threeCamera = configureCamera(context, renderCanvas.width, renderCanvas.height);

  let pixelStats;
  let readback = "";
  let readbackUnavailable;
  smokeStage = "draw";
  if (backend === "webgpu" && mode === "external") {
    if (!webgpuDevice) {
      throw new Error("WebGPU device is not available.");
    }
    pixelStats = await drawAndAnalyzeWebGPUExternalFrames(context, webgpuDevice, colorFormat, depthFormat, canvas.width, canvas.height, frames);
    readback = "external-render-pass";
  } else {
    for (let i = 0; i < frames; i++) {
      context.update(1);
      if (testBackground === "distortion-grid" && gl && typeof context.captureBackground === "function") {
        drawWebGLDistortionBackground(gl, renderCanvas.width, renderCanvas.height);
        context.captureBackground(0, 0, renderCanvas.width, renderCanvas.height);
        backgroundApplied = "webgl-captured-distortion-grid";
      }
      context.draw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (gl) {
      pixelStats = analyzeWebGLPixels(gl, renderCanvas.width, renderCanvas.height);
      readback = mode === "offscreen" ? "webgl-offscreen-readPixels" : "webgl-readPixels";
    } else if (typeof context.readFrameBuffer === "function") {
      try {
        const frameBuffer = await context.readFrameBuffer();
        pixelStats = analyzePixelRows(frameBuffer.data, frameBuffer.width, frameBuffer.height, frameBuffer.bytesPerRow, { ignoreAlpha: true });
        readback = "webgpu-native-framebuffer";
      } catch (error) {
        if (!allowWebGPUReadbackSkip || !isNativeWebGPUReadbackFailure(error)) {
          throw error;
        }

        readbackUnavailable = {
          stage: "read-framebuffer",
          message: getErrorMessage(error),
        };
        if (webgpuStatus) {
          webgpuStatus.readbackUnavailable = true;
          webgpuStatus.readbackUnavailableReason = readbackUnavailable.message;
        }
        const canvasStats = await analyzeCanvasPixels(canvas);
        pixelStats = canvasStats && canvasStats.changedPixels > 0 ? canvasStats : undefined;
        readback = pixelStats ? "canvas-image-bitmap" : "webgpu-native-framebuffer-unavailable";
      }
    } else {
      const canvasStats = await analyzeCanvasPixels(canvas);
      pixelStats = canvasStats && canvasStats.changedPixels > 0 ? canvasStats : undefined;
      readback = pixelStats ? "canvas-image-bitmap" : "";
    }
  }
  if (webgpuStatus) {
    webgpuStatus.rendered = true;
    webgpuStatus.status = "executed";
  }

  const payload = {
    ok: true,
    backend,
    mode,
    stage: smokeStage,
    camera: cameraMode || "default",
    threeCamera,
    testBackground,
    backgroundApplied,
    frames,
    handleExists: handle?.exists ?? false,
    changedPixels: pixelStats?.changedPixels,
    readback,
    pixelStats,
    readbackUnavailable,
    webgpuError: getLastWebGPUError(),
    webgpuErrors: getWebGPUErrors(),
    webgpuStatus,
  };

  context.releaseEffect(effect);
  context.release();
  report(payload);
}

main().catch((error) => {
  if (webgpuStatus && webgpuStatus.status !== "unavailable") {
    webgpuStatus.status = webgpuStatus.device ? "executed-failed" : "unavailable";
    webgpuStatus.failureStage = smokeStage;
    if (!webgpuStatus.device && !webgpuStatus.unavailableReason) {
      webgpuStatus.unavailableReason = getErrorMessage(error);
    }
  }
  report({
    ok: false,
    backend,
    mode,
    stage: smokeStage,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    webgpuError: getLastWebGPUError(),
    webgpuErrors: getWebGPUErrors(),
    webgpuStatus,
  });
});
