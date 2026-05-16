import {
  createContext,
  getLastWebGPUError,
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

function report(payload) {
  result.textContent = JSON.stringify(payload, null, 2);
  window.__effekseerSmokeResult = payload;
}

function analyzePixelRows(pixels, width, height, bytesPerRow) {
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
      if (r !== 0 || g !== 0 || b !== 0 || a !== 0) {
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

  setLogEnabled(true);
  await initRuntime({
    backend,
    scriptPath: native,
    wasmPath: wasm,
  });

  let context;
  let gl = null;
  let webgpuDevice = null;
  let colorFormat = "bgra8unorm";
  const depthFormat = "depth32float";
  if (backend === "webgl") {
    const contextAttributes = {
      alpha: true,
      depth: true,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true,
    };
    gl = canvas.getContext("webgl2", contextAttributes) || canvas.getContext("webgl", contextAttributes);
    if (!gl) {
      throw new Error("Failed to create WebGL context.");
    }
    context = await createContext({
      backend: "webgl",
      graphicsContext: gl,
    });
  } else {
    if (!navigator.gpu) {
      throw new Error("navigator.gpu is not available.");
    }
    colorFormat = navigator.gpu.getPreferredCanvasFormat();
    const canvasContext = canvas.getContext("webgpu");
    context = await createContext({
      backend: "webgpu",
      canvas,
      canvasContext,
      colorFormat,
      depthFormat,
    });
    webgpuDevice = context.device;
  }

  const effect = await context.loadEffect(effectPath);
  const handle = context.play(effect, 0, 0, 0);
  context.setProjectionPerspective(45, canvas.width / canvas.height, 1, 1000);
  context.setCameraLookAt(0, 0, 20, 0, 0, 0);

  let pixelStats;
  if (backend === "webgpu" && mode === "external") {
    if (!webgpuDevice) {
      throw new Error("WebGPU device is not available.");
    }
    pixelStats = await drawAndAnalyzeWebGPUExternalFrames(context, webgpuDevice, colorFormat, depthFormat, canvas.width, canvas.height, frames);
  } else {
    for (let i = 0; i < frames; i++) {
      context.update(1);
      context.draw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (gl) {
      pixelStats = analyzeWebGLPixels(gl, canvas.width, canvas.height);
    } else {
      const canvasStats = await analyzeCanvasPixels(canvas);
      pixelStats = canvasStats && canvasStats.changedPixels > 0 ? canvasStats : undefined;
    }
  }

  const payload = {
    ok: true,
    backend,
    mode,
    frames,
    handleExists: handle?.exists ?? false,
    changedPixels: pixelStats?.changedPixels,
    pixelStats,
    webgpuError: getLastWebGPUError(),
  };

  context.releaseEffect(effect);
  context.release();
  report(payload);
}

main().catch((error) => {
  report({
    ok: false,
    backend,
    mode,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    webgpuError: getLastWebGPUError(),
  });
});
