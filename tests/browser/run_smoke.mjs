import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const defaultCases = [
  {
    name: "webgl-basic",
    backend: "webgl",
    mode: "canvas",
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
    allowWebGPUSkip: process.env.EFK_ALLOW_WEBGPU_SKIP === "1",
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
    } else if (arg === "--allow-webgpu-skip") {
      options.allowWebGPUSkip = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
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
    const evaluated = await client.send("Runtime.evaluate", {
      expression: "window.__effekseerSmokeResult || null",
      returnByValue: true,
    });
    const value = evaluated?.result?.value;
    if (value) {
      return value;
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

async function runCase(browser, origin, testCase, options) {
  const url = new URL("/tests/browser/smoke.html", origin);
  url.searchParams.set("backend", testCase.backend);
  url.searchParams.set("mode", testCase.mode);
  url.searchParams.set("effect", `/${options.effect || testCase.effect}`);
  url.searchParams.set("frames", String(options.frames));
  if (testCase.camera) {
    url.searchParams.set("camera", testCase.camera);
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
      if (testCase.backend === "webgpu" && options.allowWebGPUSkip && /WebGPU|navigator\.gpu|GPU/.test(message)) {
        return { ...result, skipped: true, stderr };
      }
      throw new Error(`${testCase.name} failed: ${message}\n${result.stack ?? ""}\n${stderr}`);
    }
    if (typeof result.changedPixels === "number" && result.changedPixels <= 0) {
      throw new Error(`${testCase.name} rendered no changed pixels.\n${JSON.stringify(result, null, 2)}`);
    }
    if (testCase.requirePixelStats && typeof result.changedPixels !== "number") {
      throw new Error(`${testCase.name} did not report changed pixel count.\n${JSON.stringify(result, null, 2)}`);
    }

    const needsPixelStats = testCase.minColorBuckets !== undefined || testCase.maxWhiteLikeRatio !== undefined;
    if (needsPixelStats && !result.pixelStats) {
      throw new Error(`${testCase.name} did not report pixel statistics.\n${JSON.stringify(result, null, 2)}`);
    }
    if (testCase.minColorBuckets !== undefined && result.pixelStats.colorBuckets < testCase.minColorBuckets) {
      throw new Error(`${testCase.name} rendered too few color buckets.\n${JSON.stringify(result, null, 2)}`);
    }
    if (testCase.maxWhiteLikeRatio !== undefined && result.pixelStats.changedPixels > 0) {
      const whiteLikeRatio = result.pixelStats.whiteLikePixels / result.pixelStats.changedPixels;
      if (whiteLikeRatio > testCase.maxWhiteLikeRatio) {
        throw new Error(`${testCase.name} rendered mostly white fallback pixels.\n${JSON.stringify(result, null, 2)}`);
      }
    }
    if (result.webgpuError) {
      throw new Error(`${testCase.name} reported WebGPU validation error: ${result.webgpuError}`);
    }
    return { ...result, stderr };
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
      results.push({
        name: testCase.name,
        ...(await runCase(browser, origin, testCase, options)),
      });
    }
    console.log(JSON.stringify({ ok: true, browser, origin, results }, null, 2));
  } finally {
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
