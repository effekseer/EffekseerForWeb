import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const defaultCases = [
  {
    name: "webgl-basic",
    backend: "webgl",
    mode: "canvas",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
  },
  {
    name: "webgl-offscreen",
    backend: "webgl",
    mode: "offscreen",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
  },
  {
    name: "webgl-material",
    backend: "webgl",
    mode: "canvas",
    effect: "TestData/Effects/15/Material_Img6.efkefc",
  },
  {
    name: "webgl-curve",
    backend: "webgl",
    mode: "canvas",
    effect: "TestData/Effects/16/Curve01.efkefc",
  },
  {
    name: "webgl-model",
    backend: "webgl",
    mode: "canvas",
    effect: "TestData/Effects/16/AnimatedModel01.efkefc",
  },
  {
    name: "webgpu-canvas",
    backend: "webgpu",
    mode: "canvas",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
    requirePixelStats: true,
    minColorBuckets: 8,
  },
  {
    name: "webgpu-alpha-premultiplied",
    backend: "webgpu",
    mode: "canvas",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
    alphaMode: "premultiplied",
    compositeBackground: [34, 170, 102],
    compositeExpectation: "background",
    compositeSample: { x: 12, y: 12 },
    requirePixelStats: true,
  },
  {
    name: "webgpu-alpha-opaque",
    backend: "webgpu",
    mode: "canvas",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
    alphaMode: "opaque",
    compositeBackground: [34, 170, 102],
    compositeExpectation: "opaque",
    compositeSample: { x: 12, y: 12 },
    requirePixelStats: true,
  },
  {
    name: "webgpu-external",
    backend: "webgpu",
    mode: "external",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
  },
  {
    name: "webgpu-three-camera",
    backend: "webgpu",
    mode: "external",
    camera: "three",
    effect: "TestData/Effects/10/Sprite_Parameters1.efk",
  },
  {
    name: "webgpu-texture",
    backend: "webgpu",
    mode: "external",
    effect: "TestData/Effects/16/AlphaBlendTexture01.efkefc",
    minColorBuckets: 64,
    maxWhiteLikeRatio: 0.25,
  },
  {
    name: "webgpu-material",
    backend: "webgpu",
    mode: "external",
    effect: "TestData/Effects/15/Material_Img6.efkefc",
    minColorBuckets: 8,
    maxWhiteLikeRatio: 0.25,
    disabledByDefault: true,
  },
];

function parseArgs(argv) {
  const options = {
    browser: process.env.CHROME_BIN || process.env.EDGE_BIN || "",
    port: 0,
    frames: 30,
    timeout: 45000,
    caseNames: [],
    effect: "",
    report: process.env.EFK_BROWSER_SMOKE_REPORT || "",
    allowWebGPUSkip: process.env.EFK_ALLOW_WEBGPU_SKIP === "1",
    allowWebGPUReadbackSkip: process.env.EFK_ALLOW_WEBGPU_READBACK_SKIP === "1",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--browser") {
      options.browser = next();
    } else if (arg === "--port") {
      options.port = Number(next());
    } else if (arg === "--frames") {
      options.frames = Number(next());
    } else if (arg === "--timeout") {
      options.timeout = Number(next());
    } else if (arg === "--case") {
      options.caseNames.push(next());
    } else if (arg === "--effect") {
      options.effect = next();
    } else if (arg === "--report") {
      options.report = next();
    } else if (arg === "--allow-webgpu-skip") {
      options.allowWebGPUSkip = true;
    } else if (arg === "--allow-webgpu-readback-skip") {
      options.allowWebGPUReadbackSkip = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function writeSmokeReport(reportPath, report) {
  if (!reportPath) {
    return;
  }

  const outputPath = resolve(root, reportPath);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (outputPath !== root && !outputPath.startsWith(rootWithSep)) {
    throw new Error(`Smoke report path must be inside the repository: ${reportPath}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function findBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Chrome or Edge was not found. Pass --browser <path> or set CHROME_BIN.");
}

function mimeType(path) {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".tga":
      return "image/x-tga";
    default:
      return "application/octet-stream";
  }
}

function resolveRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const localPath = normalize(join(root, decoded));
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (localPath !== root && !localPath.startsWith(rootWithSep)) {
    return null;
  }
  return localPath;
}

async function startServer(port) {
  const server = createServer(async (request, response) => {
    try {
      const localPath = resolveRequestPath(request.url ?? "/");
      if (!localPath) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const filePath = localPath.endsWith(sep) ? join(localPath, "index.html") : localPath;
      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": mimeType(filePath),
        "cross-origin-embedder-policy": "require-corp",
        "cross-origin-opener-policy": "same-origin",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, "127.0.0.1", resolvePromise);
  });

  return server;
}

function browserFlags(testCase, userDataDir) {
  const flags = [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu-sandbox",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-popup-blocking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
  ];

  if (testCase.backend === "webgl") {
    flags.splice(4, 0, "--use-angle=swiftshader");
  }

  flags.push("about:blank");
  return flags;
}

async function waitForDevToolsPort(userDataDir, timeout) {
  const portFile = join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(portFile, "utf8");
      const [port] = text.trim().split(/\r?\n/);
      if (port) {
        return Number(port);
      }
    } catch {
      // Chrome creates DevToolsActivePort asynchronously.
    }
    await delay(100);
  }
  throw new Error("Timed out while waiting for Chrome DevTools port.");
}

async function createTarget(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) {
    response = await fetch(endpoint);
  }
  if (!response.ok) {
    throw new Error(`Failed to create Chrome target: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

class CDPClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolvePromise, rejectPromise) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", rejectPromise, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handleMessage(event));
  }

  handleMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails;
      this.events.push(details?.text ?? details?.exception?.description ?? "Runtime exception");
    } else if (message.method === "Log.entryAdded") {
      const entry = message.params?.entry;
      if (entry?.level === "error") {
        this.events.push(entry.text);
      }
    }
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForSmokeResult(client, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const evaluated = await client.send("Runtime.evaluate", {
        expression: "window.__effekseerSmokeResult || null",
        returnByValue: true,
      });
      const value = evaluated?.result?.value;
      if (value) {
        return value;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("Cannot find default execution context") &&
        !message.includes("Execution context was destroyed")
      ) {
        throw error;
      }
    }
    await delay(250);
  }

  const details = client.events.length > 0 ? `\nBrowser events:\n${client.events.join("\n")}` : "";
  throw new Error(`Timed out while waiting for smoke result.${details}`);
}

async function stopBrowser(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise((resolvePromise) => {
    child.once("exit", resolvePromise);
  });
  child.kill();
  await Promise.race([exited, delay(5000)]);
}

async function removeProfileDir(userDataDir) {
  let lastError;
  for (let i = 0; i < 20; i++) {
    try {
      await rm(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  console.warn(`Warning: failed to remove browser profile ${userDataDir}: ${message}`);
}

function paethPredictor(left, above, upperLeft) {
  const p = left + above - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - above);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  if (pb <= pc) {
    return above;
  }
  return upperLeft;
}

function decodePngPixels(data) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!data.subarray(0, 8).equals(signature)) {
    throw new Error("Screenshot is not a PNG image.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      const interlace = chunk[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported screenshot PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
      }
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(rowBytes * height);
  let source = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[source++];
    const row = y * rowBytes;
    const previousRow = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bytesPerPixel ? raw[row + x - bytesPerPixel] : 0;
      const above = y > 0 ? raw[previousRow + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? raw[previousRow + x - bytesPerPixel] : 0;
      let value = inflated[source++];
      if (filter === 1) {
        value += left;
      } else if (filter === 2) {
        value += above;
      } else if (filter === 3) {
        value += Math.floor((left + above) / 2);
      } else if (filter === 4) {
        value += paethPredictor(left, above, upperLeft);
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
      raw[row + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < raw.length; i += bytesPerPixel, j += 4) {
    rgba[j] = raw[i];
    rgba[j + 1] = raw[i + 1];
    rgba[j + 2] = raw[i + 2];
    rgba[j + 3] = colorType === 6 ? raw[i + 3] : 255;
  }
  return { width, height, pixels: rgba };
}

async function captureCompositePixel(client, sample) {
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {
      x: sample.x,
      y: sample.y,
      width: 1,
      height: 1,
      scale: 1,
    },
  });
  const decoded = decodePngPixels(Buffer.from(screenshot.data, "base64"));
  return Array.from(decoded.pixels.slice(0, 4));
}

function colorDistance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

async function assertCompositeExpectation(client, testCase, result, options) {
  if (!testCase.compositeExpectation) {
    return result;
  }

  if (testCase.backend === "webgpu" && options.allowWebGPUReadbackSkip && result.readbackUnavailable) {
    return {
      ...result,
      compositeUnavailable: {
        expectation: testCase.compositeExpectation,
        reason: "native WebGPU framebuffer readback is unavailable in this browser environment",
      },
    };
  }

  const background = testCase.compositeBackground;
  const sample = testCase.compositeSample ?? { x: 12, y: 12 };
  let pixel;
  try {
    pixel = await captureCompositePixel(client, sample);
  } catch (error) {
    if (testCase.backend === "webgpu" && options.allowWebGPUReadbackSkip && result.readbackUnavailable) {
      return {
        ...result,
        compositeUnavailable: {
          expectation: testCase.compositeExpectation,
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    }
    throw error;
  }
  const backgroundDistance = colorDistance(pixel, background);
  const blackDistance = colorDistance(pixel, [0, 0, 0]);
  const tolerance = 12;

  if (testCase.compositeExpectation === "background" && backgroundDistance > tolerance) {
    throw new Error(
      `${testCase.name} did not composite with the HTML background. ` +
        `pixel=${pixel.join(",")} expected=${background.join(",")} distance=${backgroundDistance}`,
    );
  }

  if (testCase.compositeExpectation === "opaque" && blackDistance > tolerance) {
    throw new Error(`${testCase.name} did not remain opaque black. pixel=${pixel.join(",")} distance=${blackDistance}`);
  }

  return {
    ...result,
    composite: {
      expectation: testCase.compositeExpectation,
      sample,
      background,
      pixel,
      backgroundDistance,
      blackDistance,
    },
  };
}

function isUnavailableWebGPUSkip(testCase, options, result) {
  return (
    testCase.backend === "webgpu" &&
    options.allowWebGPUSkip &&
    result.webgpuStatus?.status === "unavailable"
  );
}

function summarizeWebGPU(results) {
  const webgpuResults = results.filter((result) => result.backend === "webgpu" || result.name?.startsWith("webgpu-"));
  const summary = {
    total: webgpuResults.length,
    executed: 0,
    skippedUnavailable: 0,
    unavailable: 0,
    canvasUnavailable: 0,
    executedFailed: 0,
    readbackUnavailable: 0,
    unknown: 0,
    cases: webgpuResults.map((result) => ({
      name: result.name,
      status: result.webgpuStatus?.status ?? "unknown",
      skipped: Boolean(result.skipped),
      stage: result.webgpuStatus?.failureStage || result.stage || "",
      readbackUnavailable: Boolean(result.readbackUnavailable || result.webgpuStatus?.readbackUnavailable),
      reason: result.skipReason || result.readbackUnavailable?.message || result.webgpuStatus?.unavailableReason || result.message || "",
    })),
  };

  for (const result of webgpuResults) {
    if (result.readbackUnavailable || result.webgpuStatus?.readbackUnavailable) {
      summary.readbackUnavailable++;
    }
    const status = result.webgpuStatus?.status;
    if (status === "executed") {
      summary.executed++;
    } else if (status === "unavailable") {
      summary.unavailable++;
      if (result.skipped) {
        summary.skippedUnavailable++;
      }
    } else if (status === "canvas-unavailable") {
      summary.canvasUnavailable++;
    } else if (status === "executed-failed") {
      summary.executedFailed++;
    } else {
      summary.unknown++;
    }
  }

  return summary;
}

function errorMessage(error) {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function makeSmokeFailureError(testCase, message, result, stderr) {
  const status = result.webgpuStatus
    ? `\nWebGPU status:\n${JSON.stringify(result.webgpuStatus, null, 2)}`
    : "";
  const browserStack = result.stack ? `\nBrowser stack:\n${result.stack}` : "";
  const browserErrors = result.webgpuErrors?.length ? `\nWebGPU errors:\n${result.webgpuErrors.join("\n")}` : "";
  const error = new Error(`${testCase.name} failed: ${message}${status}${browserStack}${browserErrors}\n${stderr}`);
  error.smokeResult = result;
  return error;
}

function isWebGPUCanvasInfrastructureFailure(testCase, options, error, stderr) {
  if (testCase.backend !== "webgpu" || testCase.mode !== "canvas" || !options.allowWebGPUReadbackSkip) {
    return false;
  }

  const text = `${errorMessage(error)}\n${stderr}`;
  return (
    text.includes("Cannot find default execution context") ||
    text.includes("Execution context was destroyed") ||
    text.includes("ContextResult::kTransientFailure") ||
    text.includes("GpuControl.CreateCommandBuffer") ||
    text.includes("SharedImageStub") ||
    text.includes("SharedImageBackingFactory") ||
    text.includes("Failed to read the native WebGPU frame buffer")
  );
}

function makeWebGPUCanvasUnavailableResult(testCase, error, stderr) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    backend: testCase.backend,
    mode: testCase.mode,
    ok: false,
    skipped: true,
    skipReason: message,
    readbackUnavailable: {
      stage: "webgpu-canvas",
      message,
    },
    webgpuStatus: {
      requested: true,
      status: "canvas-unavailable",
      navigatorGpu: false,
      adapter: false,
      device: false,
      initialized: false,
      contextCreated: false,
      rendered: false,
      readbackUnavailable: true,
      readbackUnavailableReason: message,
      unavailableReason: "",
      failureStage: "webgpu-canvas",
    },
    error: errorMessage(error),
    stderr,
  };
}

function resultFromError(testCase, error) {
  const smokeResult = error?.smokeResult ?? {};
  const webgpuStatus = smokeResult.webgpuStatus ? { ...smokeResult.webgpuStatus } : undefined;
  if (testCase.backend === "webgpu" && webgpuStatus?.status === "executed") {
    webgpuStatus.status = "executed-failed";
    webgpuStatus.failureStage = webgpuStatus.failureStage || smokeResult.stage || "runner-validation";
  }
  return {
    name: testCase.name,
    backend: testCase.backend,
    mode: testCase.mode,
    ok: false,
    failed: true,
    stage: smokeResult.stage ?? "",
    message: smokeResult.message ?? (error instanceof Error ? error.message : String(error)),
    stack: smokeResult.stack,
    webgpuError: smokeResult.webgpuError,
    webgpuErrors: smokeResult.webgpuErrors ?? [],
    webgpuStatus,
    readbackUnavailable: smokeResult.readbackUnavailable,
    compositeUnavailable: smokeResult.compositeUnavailable,
    error: errorMessage(error),
  };
}

function isAcceptedResult(result) {
  return result.ok || result.skipped;
}

async function runCase(browser, origin, testCase, options) {
  const url = new URL("/tests/browser/smoke.html", origin);
  url.searchParams.set("backend", testCase.backend);
  url.searchParams.set("mode", testCase.mode);
  url.searchParams.set("effect", `/${options.effect || testCase.effect}`);
  url.searchParams.set("frames", String(options.frames));
  if (testCase.camera) {
    url.searchParams.set("camera", testCase.camera);
  }
  if (testCase.alphaMode) {
    url.searchParams.set("alphaMode", testCase.alphaMode);
  }
  if (testCase.backend === "webgpu" && options.allowWebGPUReadbackSkip) {
    url.searchParams.set("allowWebGPUReadbackSkip", "1");
  }
  if (testCase.compositeBackground) {
    url.searchParams.set("compositeBackground", `rgb(${testCase.compositeBackground.join(",")})`);
  }

  const tmpRoot = join(root, ".tmp");
  await mkdir(tmpRoot, { recursive: true });
  const userDataDir = await mkdtemp(join(tmpRoot, "browser-profile-"));
  const child = spawn(browser, browserFlags(testCase, userDataDir), {
    cwd: root,
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  let client;
  try {
    const port = await waitForDevToolsPort(userDataDir, Math.min(options.timeout, 15000));
    const target = await createTarget(port, url.href);
    client = new CDPClient(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");
    const result = await waitForSmokeResult(client, options.timeout);
    if (!result.ok) {
      const message = result.message ?? "unknown browser smoke failure";
      if (isUnavailableWebGPUSkip(testCase, options, result)) {
        return {
          ...result,
          skipped: true,
          skipReason: result.webgpuStatus?.unavailableReason || message,
          stderr,
        };
      }
      throw makeSmokeFailureError(testCase, message, result, stderr);
    }
    try {
      if (testCase.backend === "webgpu" && result.webgpuStatus?.status !== "executed") {
        throw new Error(`${testCase.name} did not report WebGPU execution.\n${JSON.stringify(result, null, 2)}`);
      }
      if (typeof result.changedPixels === "number" && result.changedPixels <= 0) {
        throw new Error(`${testCase.name} rendered no changed pixels.\n${JSON.stringify(result, null, 2)}`);
      }
      const readbackUnavailable = Boolean(result.readbackUnavailable);
      if (testCase.requirePixelStats && typeof result.changedPixels !== "number" && !readbackUnavailable) {
        throw new Error(`${testCase.name} did not report changed pixel count.\n${JSON.stringify(result, null, 2)}`);
      }

      const needsPixelStats = testCase.minColorBuckets !== undefined || testCase.maxWhiteLikeRatio !== undefined;
      if (needsPixelStats && !result.pixelStats && !readbackUnavailable) {
        throw new Error(`${testCase.name} did not report pixel statistics.\n${JSON.stringify(result, null, 2)}`);
      }
      if (testCase.minColorBuckets !== undefined && result.pixelStats && result.pixelStats.colorBuckets < testCase.minColorBuckets) {
        throw new Error(`${testCase.name} rendered too few color buckets.\n${JSON.stringify(result, null, 2)}`);
      }
      if (testCase.maxWhiteLikeRatio !== undefined && result.pixelStats && result.pixelStats.changedPixels > 0) {
        const whiteLikeRatio = result.pixelStats.whiteLikePixels / result.pixelStats.changedPixels;
        if (whiteLikeRatio > testCase.maxWhiteLikeRatio) {
          throw new Error(`${testCase.name} rendered mostly white fallback pixels.\n${JSON.stringify(result, null, 2)}`);
        }
      }
      if (result.webgpuError) {
        throw new Error(`${testCase.name} reported WebGPU validation error: ${result.webgpuError}`);
      }
      const checkedResult = await assertCompositeExpectation(client, testCase, result, options);
      return { ...checkedResult, stderr };
    } catch (error) {
      if (error && typeof error === "object" && !error.smokeResult) {
        error.smokeResult = result;
      }
      throw error;
    }
  } catch (error) {
    if (isWebGPUCanvasInfrastructureFailure(testCase, options, error, stderr)) {
      return makeWebGPUCanvasUnavailableResult(testCase, error, stderr);
    }
    throw error;
  } finally {
    client?.close();
    await stopBrowser(child);
    await removeProfileDir(userDataDir);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let cases;
  if (options.caseNames.length > 0) {
    const casesByName = new Map(defaultCases.map((testCase) => [testCase.name, testCase]));
    const unknownCases = options.caseNames.filter((caseName) => !casesByName.has(caseName));
    if (unknownCases.length > 0) {
      throw new Error(`Unknown smoke test case: ${unknownCases.join(", ")}`);
    }
    cases = options.caseNames.map((caseName) => casesByName.get(caseName));
  } else {
    cases = defaultCases.filter((testCase) => !testCase.disabledByDefault);
  }

  const browser = findBrowser(options.browser);
  const server = await startServer(options.port);
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const results = [];
    for (const testCase of cases) {
      try {
        results.push({
          name: testCase.name,
          ...(await runCase(browser, origin, testCase, options)),
        });
      } catch (error) {
        results.push(resultFromError(testCase, error));
      }
    }
    const ok = results.every(isAcceptedResult);
    const report = {
      ok,
      browser,
      origin,
      failedCount: results.filter((result) => !isAcceptedResult(result)).length,
      webgpuSummary: summarizeWebGPU(results),
      results,
    };
    console.log(JSON.stringify(report, null, 2));
    await writeSmokeReport(options.report, report);
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
