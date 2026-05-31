import { createServer } from "node:http";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const renderableExtensions = new Set([".efk", ".efkefc"]);
const targetPresets = {
  "effekseer-for-webgl": [
    { effect: "TestData/Effects/10/SimpleLaser.efk", frames: 30 },
    { effect: "TestData/Effects/10/FCurve_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Ribbon_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Ring_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Track_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Sprite_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Distortions1.efk", frames: 30 },
    { effect: "TestData/Effects/10/Parents1.efk", frames: 30 },
    { effect: "TestData/Effects/14/Model_Parameters1.efk", frames: 30 },
    { effect: "TestData/Effects/15/Lighing_Parameters1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/DynamicParameter1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_Sampler1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_Refraction.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_WorldPositionOffset.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/BasicRenderSettings_Blend.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/BasicRenderSettings_Inherit_Color.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/ForceFieldLocal_Turbulence1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/ForceFieldLocal_Old.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_FresnelRotatorPolarCoords.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Update_Easing.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Update_MultiModel.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_UV1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_UV2.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/SpawnMethodParameter1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_CustomData1.efkefc", frames: 30 },
    { effect: "TestData/Effects/15/Material_CustomDataMax.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/DrawWithoutInstancing.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/AlphaBlendTexture01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/AlphaCutoffEdgeColor01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/BasicRenderSettings_Emissive.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/Curve01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/EdgeFallOff01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/Flip01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/Flip_UV_01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/ForceFieldLocal02.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/ForceFieldLocal03.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/Material_EffectScale.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/ProcedualModel01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/ProcedualModel02.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/ProcedualModel03.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/AlphaCutoffParameter01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/RotateScale01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/FollowParent01.efkefc", frames: 30 },
    { effect: "TestData/Effects/16/SoftParticle01.efkefc", frames: 30 },
    { effect: "TestData/Effects/17/Flip_UV_02.efkefc", frames: 57 },
    { effect: "TestData/Effects/17/Gradient1.efkefc", frames: 60 },
    { effect: "TestData/Effects/17/KillRules01.efkefc", frames: 60 },
    { effect: "TestData/Effects/17/Light1.efkefc", frames: 60 },
    { effect: "TestData/Effects/17/LocalTime.efkefc", frames: 60 },
    { effect: "TestData/Effects/17/Noise1.efkefc", frames: 60 },
  ],
};

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join("-");
}

function parseArgs(argv) {
  const options = {
    backend: "webgpu",
    mode: "canvas",
    browser: process.env.CHROME_BIN || process.env.EDGE_BIN || "",
    port: 0,
    frames: 30,
    timeout: 45000,
    input: "TestData",
    out: "",
    preset: "",
    background: "distortion-grid",
    continueOnError: true,
    allowFailedCaptures: process.env.EFK_ALLOW_FAILED_SCREENSHOTS === "1",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--backend") {
      options.backend = next();
    } else if (arg === "--mode") {
      options.mode = next();
    } else if (arg === "--browser") {
      options.browser = next();
    } else if (arg === "--port") {
      options.port = Number(next());
    } else if (arg === "--frames") {
      options.frames = Number(next());
    } else if (arg === "--timeout") {
      options.timeout = Number(next());
    } else if (arg === "--input") {
      options.input = next();
    } else if (arg === "--out") {
      options.out = next();
    } else if (arg === "--preset") {
      options.preset = next();
    } else if (arg === "--background") {
      options.background = next();
    } else if (arg === "--fail-fast") {
      options.continueOnError = false;
    } else if (arg === "--allow-failed-captures") {
      options.allowFailedCaptures = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.backend !== "webgl" && options.backend !== "webgpu") {
    throw new Error(`Unsupported backend: ${options.backend}`);
  }
  if (options.mode !== "canvas" && options.mode !== "external") {
    throw new Error(`Unsupported mode: ${options.mode}`);
  }

  return options;
}

targetPresets["webgpu-ci"] = targetPresets["effekseer-for-webgl"];

function resolvePresetTargets(name) {
  const preset = targetPresets[name];
  if (!preset) {
    throw new Error(`Unknown target preset: ${name}. Available presets: ${Object.keys(targetPresets).join(", ")}`);
  }

  return preset.map((target) => ({
    path: resolve(root, target.effect),
    frames: target.frames,
    background: target.background,
  }));
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

async function captureCanvasPng(client) {
  const evaluated = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const canvas = document.getElementById("canvas");
      const rect = canvas.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: window.devicePixelRatio || 1 };
    })()`,
    returnByValue: true,
  });
  const rect = evaluated?.result?.value;
  const width = Math.max(1, Math.round(rect?.width ?? 640));
  const height = Math.max(1, Math.round(rect?.height ?? 360));
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    clip: {
      x: Math.max(0, rect?.x ?? 0),
      y: Math.max(0, rect?.y ?? 0),
      width,
      height,
      scale: rect?.scale ?? 1,
    },
  });
  return Buffer.from(screenshot.data, "base64");
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

async function collectEffects(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectEffects(fullPath));
    } else if (entry.isFile() && renderableExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function safeFileName(index, effectPath) {
  const body = effectPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${String(index + 1).padStart(3, "0")}_${body}.png`;
}

async function prepareOutputDir(outDir) {
  const outputRel = relative(root, outDir);
  if (!outputRel || outputRel.startsWith("..") || isAbsolute(outputRel)) {
    throw new Error(`Refusing to clean output directory outside the repository: ${outDir}`);
  }

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function makeIndexHtml(summary) {
  const cards = summary.results.map((result) => {
    const status = result.ok ? "ok" : "failed";
    const stats = result.pixelStats
      ? `${result.pixelStats.changedPixels ?? ""} px, ${result.pixelStats.colorBuckets ?? ""} buckets`
      : "no pixel stats";
    const background = result.background ? ` / background=${result.background}` : "";
    const image = result.screenshot
      ? `<img src="${htmlEscape(result.screenshot)}" alt="${htmlEscape(result.effect)}" loading="lazy">`
      : `<div class="missing">No screenshot</div>`;
    return `<article class="${status}">
      ${image}
      <h2>${htmlEscape(result.effect)}</h2>
      <p>${htmlEscape(status)} / frames=${result.frames ?? summary.frames} / ${htmlEscape(stats)}${htmlEscape(background)}</p>
      ${result.message ? `<pre>${htmlEscape(result.message)}</pre>` : ""}
    </article>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Effekseer TestData Screenshots</title>
  <style>
    body { margin: 0; background: #20242a; color: #f5f7fa; font-family: system-ui, sans-serif; }
    header { padding: 20px 24px; border-bottom: 1px solid #3a414b; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { color: #b7c0cc; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 16px; }
    article { background: #2a3038; border: 1px solid #3a414b; border-radius: 6px; overflow: hidden; }
    article.failed { border-color: #d26868; }
    img, .missing { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #11151a; }
    .missing { display: grid; place-items: center; color: #f2a4a4; }
    h2 { margin: 10px 12px 4px; font-size: 13px; overflow-wrap: anywhere; }
    p { margin: 0 12px 12px; color: #b7c0cc; font-size: 12px; }
    pre { margin: 0 12px 12px; padding: 8px; max-height: 140px; overflow: auto; background: #15191f; color: #ffd4d4; font-size: 11px; }
  </style>
</head>
<body>
  <header>
    <h1>Effekseer TestData Screenshots</h1>
    <div class="meta">backend=${htmlEscape(summary.backend)}, mode=${htmlEscape(summary.mode)}, preset=${htmlEscape(summary.preset || "custom")}, background=${htmlEscape(summary.background || "none")}, defaultFrames=${summary.frames}, total=${summary.total}, ok=${summary.okCount}, failed=${summary.failedCount}</div>
  </header>
  <main>
    ${cards}
  </main>
</body>
</html>`;
}

async function runCapture(browser, origin, targets, options, outDir) {
  const testCase = { backend: options.backend };
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
    const devtoolsPort = await waitForDevToolsPort(userDataDir, Math.min(options.timeout, 15000));
    const target = await createTarget(devtoolsPort, "about:blank");
    client = new CDPClient(target.webSocketDebuggerUrl);
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Page.enable");

    const results = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const effectPath = relative(root, target.path).replace(/\\/g, "/");
      const frameCount = target.frames ?? options.frames;
      const background = target.background ?? options.background;
      const url = new URL("/tests/browser/smoke.html", origin);
      url.searchParams.set("backend", options.backend);
      url.searchParams.set("mode", options.mode);
      url.searchParams.set("effect", `/${effectPath}`);
      url.searchParams.set("frames", String(frameCount));
      if (background && background !== "none") {
        url.searchParams.set("testBackground", background);
      }
      if (options.backend === "webgpu") {
        url.searchParams.set("allowWebGPUReadbackSkip", "1");
      }

      const result = {
        effect: effectPath,
        frames: frameCount,
        ok: false,
        screenshot: "",
        background: background === "none" ? "" : background,
        pixelStats: null,
        message: "",
      };

      try {
        await client.send("Page.navigate", { url: url.href });
        const smoke = await waitForSmokeResult(client, options.timeout);
        result.ok = Boolean(smoke.ok);
        result.pixelStats = smoke.pixelStats ?? null;
        const webgpuErrors = Array.isArray(smoke.webgpuErrors) ? smoke.webgpuErrors.filter(Boolean) : [];
        if (!smoke.ok) {
          result.message = smoke.message ?? "unknown browser smoke failure";
          if (webgpuErrors.length > 0) {
            result.message += `\nWebGPU errors:\n${webgpuErrors.join("\n")}`;
          }
        } else if (smoke.webgpuError) {
          result.ok = false;
          result.message = `WebGPU validation error: ${webgpuErrors.length > 0 ? webgpuErrors.join("\n") : smoke.webgpuError}`;
        }

        const png = await captureCanvasPng(client);
        const screenshotName = safeFileName(i, effectPath);
        await writeFile(join(outDir, screenshotName), png);
        result.screenshot = screenshotName;
      } catch (error) {
        result.message = error instanceof Error ? error.stack || error.message : String(error);
        if (!options.continueOnError) {
          throw error;
        }
      }

      results.push(result);
      console.log(`[${i + 1}/${targets.length}] ${result.ok ? "ok" : "failed"} ${effectPath}`);
    }

    return { results, stderr };
  } finally {
    client?.close();
    await stopBrowser(child);
    await removeProfileDir(userDataDir);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputDir = resolve(root, options.input);
  const outDir = resolve(root, options.out || join("artifacts", "testdata-screenshots", `${options.backend}-${timestamp()}`));
  await prepareOutputDir(outDir);

  const targets = options.preset
    ? resolvePresetTargets(options.preset)
    : (await collectEffects(inputDir)).map((path) => ({ path, frames: options.frames }));
  if (targets.length === 0) {
    throw new Error(`No .efk or .efkefc files found under ${inputDir}`);
  }

  const browser = findBrowser(options.browser);
  const server = await startServer(options.port);
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const { results, stderr } = await runCapture(browser, origin, targets, options, outDir);
    const okCount = results.filter((result) => result.ok).length;
    const summary = {
      ok: okCount === targets.length,
      backend: options.backend,
      mode: options.mode,
      frames: options.frames,
      input: options.preset || relative(root, inputDir).replace(/\\/g, "/"),
      preset: options.preset,
      background: options.background,
      output: relative(root, outDir).replace(/\\/g, "/"),
      total: targets.length,
      okCount,
      failedCount: targets.length - okCount,
      browser,
      stderr,
      results,
    };
    await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    await writeFile(join(outDir, "index.html"), makeIndexHtml(summary));
    console.log(JSON.stringify({
      ok: summary.ok,
      backend: summary.backend,
      mode: summary.mode,
      total: summary.total,
      okCount: summary.okCount,
      failedCount: summary.failedCount,
      output: summary.output,
    }, null, 2));
    if (!summary.ok && !options.allowFailedCaptures) {
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
