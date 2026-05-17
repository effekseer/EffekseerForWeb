declare global {
  type GPUFeatureName = string;
  type GPUTextureFormat = string;
  type GPUCanvasAlphaMode = "opaque" | "premultiplied";

  interface GPURequestAdapterOptions {
    powerPreference?: "low-power" | "high-performance";
    forceFallbackAdapter?: boolean;
  }

  interface GPUDeviceDescriptor {
    label?: string;
    requiredFeatures?: Iterable<GPUFeatureName>;
    requiredLimits?: Record<string, number>;
    defaultQueue?: { label?: string };
  }

  interface GPUFeatureSet {
    has(feature: GPUFeatureName): boolean;
  }

  interface GPUAdapter {
    readonly features: GPUFeatureSet;
    requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
  }

  interface GPUQueue {}

  interface GPUDevice extends EventTarget {
    readonly queue: GPUQueue;
  }

  interface GPUTexture {}

  interface GPUCanvasConfiguration {
    device: GPUDevice;
    format: GPUTextureFormat;
    alphaMode?: GPUCanvasAlphaMode;
  }

  interface GPUCanvasContext {
    readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    configure(configuration: GPUCanvasConfiguration): void;
    unconfigure?(): void;
    getCurrentTexture(): GPUTexture;
  }

  interface GPURenderPassEncoder {}

  interface GPU {
    requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
  }

  interface Navigator {
    readonly gpu: GPU;
  }
}

export type BackendType = "webgl" | "webgpu";

export class EffekseerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class RuntimeNotInitializedError extends EffekseerError {}
export class UnsupportedBackendError extends EffekseerError {}
export class WebGPUUnavailableError extends EffekseerError {}
export class WebGLContextLostError extends EffekseerError {}
export class NativeInitializationError extends EffekseerError {}
export class ResourceLoadError extends EffekseerError {}
export class EffectLoadError extends EffekseerError {}
export class SoundLoadError extends EffekseerError {}
export class MaterialCompileError extends EffekseerError {}
export class InvalidOperationError extends EffekseerError {}

type NativeValueType = "number" | "void" | "string";
type NativeArgType = "number" | "string";

export interface NativeModule {
  cwrap(name: string, returnType: NativeValueType, argTypes: NativeArgType[]): (...args: number[]) => number | void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAP8?: Int8Array;
  HEAPU8?: Uint8Array;
  HEAPF32: Float32Array;
  stackSave(): number;
  stackRestore(stack: number): void;
  stackAlloc(size: number): number;
  GL?: {
    registerContext(context: WebGLRenderingContext | WebGL2RenderingContext, attrs: Record<string, unknown>): number;
    makeContextCurrent(contextHandle: number): void;
  };
  AL?: {
    currentCtx?: {
      audioCtx?: AudioContext;
      ctx?: AudioContext;
    };
  };
  resourcesMap?: Record<string, ArrayBuffer>;
  _loadBinary?: (path: string, isRequired: number) => ArrayBuffer | null;
  _loadImage?: (path: string) => TexImageSource | null;
  _isPowerOfTwo?: (image: { width: number; height: number }) => boolean;
  preinitializedWebGPUDevice?: GPUDevice;
  effekseerLastWebGPUError?: string;
  effekseerWebGPUErrors?: string[];
  __effekseerImportWebGPURenderPassEncoder?: (renderPassEncoder: GPURenderPassEncoder) => number;
}

export type NativeModuleFactory = (options?: Record<string, unknown>) => NativeModule | Promise<NativeModule>;

export interface RuntimeOptionsBase {
  backend: BackendType;
  wasmPath?: string;
  scriptPath?: string;
  moduleFactory?: NativeModuleFactory;
  locateFile?: (path: string, prefix: string) => string;
}

export interface WebGLRuntimeOptions extends RuntimeOptionsBase {
  backend: "webgl";
}

export interface WebGPURuntimeOptions extends RuntimeOptionsBase {
  backend: "webgpu";
  device?: GPUDevice;
  adapterOptions?: GPURequestAdapterOptions;
  deviceDescriptor?: GPUDeviceDescriptor;
}

export type RuntimeOptions = WebGLRuntimeOptions | WebGPURuntimeOptions;

export interface ContextOptionsBase {
  backend: BackendType;
  instanceMaxCount?: number;
  squareMaxCount?: number;
  audioContext?: AudioContext;
}

export interface WebGLContextOptions extends ContextOptionsBase {
  backend: "webgl";
  graphicsContext: WebGLRenderingContext | WebGL2RenderingContext;
  enableExtensionsByDefault?: boolean;
  enablePremultipliedAlpha?: boolean;
  enableTimerQuery?: boolean;
  onTimerQueryReport?: (nanoseconds: number) => void;
  timerQueryReportIntervalCount?: number;
}

export interface WebGPUContextOptions extends ContextOptionsBase {
  backend: "webgpu";
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  canvasContext?: GPUCanvasContext;
  device?: GPUDevice;
  colorFormat?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
  width?: number;
  height?: number;
}

export interface WebGPUExternalRenderPassOptions {
  colorFormat?: GPUTextureFormat;
  depthFormat?: GPUTextureFormat;
}

export type ContextOptions = WebGLContextOptions | WebGPUContextOptions;

export interface Matrix4Like {
  elements: ArrayLike<number>;
}

export interface ThreeCameraLike {
  projectionMatrix: Matrix4Like;
  matrixWorldInverse: Matrix4Like;
  updateMatrixWorld?: () => void;
}

export interface ThreeCameraOptions {
  updateMatrixWorld?: boolean;
}

export interface EffectLoadOptions {
  scale?: number;
  redirect?: (url: string) => string;
  resourceLoader?: ResourceLoader;
}

export type EffectLoadCallback = (effect: EffekseerEffect) => void;
export type EffectLoadErrorCallback = (error: unknown) => void;

export type ResourceType = "binary" | "image" | "sound" | "material";

export type ResourceLoader = (
  url: string,
  type: ResourceType,
  baseDir: string,
) => Promise<ArrayBuffer | Blob | TexImageSource> | ArrayBuffer | Blob | TexImageSource;

export interface UnzipLike {
  decompress(path: string): Uint8Array;
}

export type UnzipConstructor = new (data: Uint8Array) => UnzipLike;

interface NativeCore {
  InitWebGL(instanceMaxCount: number, squareMaxCount: number, extensions: number, premultipliedAlpha: number): number;
  InitWebGPU(instanceMaxCount: number, squareMaxCount: number, width: number, height: number): number;
  Terminate(context: number): void;
  Update(context: number, deltaFrames: number): void;
  BeginUpdate(context: number): void;
  EndUpdate(context: number): void;
  UpdateHandle(context: number, handle: number, deltaFrames: number): void;
  Draw(context: number): void;
  BeginDraw(context: number): void;
  EndDraw(context: number): void;
  DrawHandle(context: number, handle: number): void;
  BeginWebGPUFrame(context: number): number;
  DrawWebGPUFrame(context: number): void;
  EndWebGPURenderPass(context: number): void;
  SubmitWebGPUFrame(context: number): void;
  ResizeWebGPU(context: number, width: number, height: number): number;
  DrawToExternalWebGPURenderPass(context: number, renderPassEncoder: number, colorFormat: number, depthFormat: number): number;
  ReleaseImportedWebGPURenderPassEncoder(renderPassEncoder: number): void;
  SetProjectionMatrix(context: number, matrix: number): void;
  SetProjectionPerspective(context: number, fov: number, aspect: number, near: number, far: number): void;
  SetProjectionOrthographic(context: number, width: number, height: number, near: number, far: number): void;
  SetCameraMatrix(context: number, matrix: number): void;
  SetCameraLookAt(context: number, eyeX: number, eyeY: number, eyeZ: number, atX: number, atY: number, atZ: number, upX: number, upY: number, upZ: number): void;
  LoadEffect(context: number, data: number, size: number, scale: number): number;
  ReleaseEffect(context: number, effect: number): void;
  ReloadResources(context: number, effect: number, data: number, size: number): void;
  StopAllEffects(context: number): void;
  PlayEffect(context: number, effect: number, x: number, y: number, z: number): number;
  StopEffect(context: number, handle: number): void;
  StopRoot(context: number, handle: number): void;
  Exists(context: number, handle: number): number;
  SetFrame(context: number, handle: number, frame: number): void;
  SetLocation(context: number, handle: number, x: number, y: number, z: number): void;
  SetRotation(context: number, handle: number, x: number, y: number, z: number): void;
  SetScale(context: number, handle: number, x: number, y: number, z: number): void;
  SetMatrix(context: number, handle: number, matrix: number): void;
  GetDynamicInput(context: number, handle: number, index: number): number;
  SetDynamicInput(context: number, handle: number, index: number, value: number): void;
  SendTrigger(context: number, handle: number, index: number): void;
  SetAllColor(context: number, handle: number, r: number, g: number, b: number, a: number): void;
  SetTargetLocation(context: number, handle: number, x: number, y: number, z: number): void;
  SetPaused(context: number, handle: number, paused: number): void;
  SetShown(context: number, handle: number, shown: number): void;
  SetSpeed(context: number, handle: number, speed: number): void;
  SetRandomSeed(context: number, handle: number, seed: number): void;
  GetRestInstancesCount(context: number): number;
  GetUpdateTime(context: number): number;
  GetDrawTime(context: number): number;
  IsVertexArrayObjectSupported(context: number): number;
  SetRestorationOfStatesFlag(context: number, flag: number): void;
  CaptureBackground(context: number, x: number, y: number, width: number, height: number): void;
  ResetBackground(context: number): void;
  SetListener(context: number, px: number, py: number, pz: number, ax: number, ay: number, az: number, ux: number, uy: number, uz: number): void;
  SetSoundVolume(context: number, volume: number): void;
  PauseSound(context: number, paused: number): void;
  ResumeSound(context: number): void;
  SetLogEnabled(flag: number): void;
}

type BinaryResource = {
  kind: "binary";
  path: string;
  required: boolean;
  loaded: boolean;
  buffer: ArrayBuffer | null;
  promise?: Promise<void>;
};

type ImageResource = {
  kind: "image";
  path: string;
  required: true;
  loaded: boolean;
  image: TexImageSource | null;
  promise?: Promise<void>;
};

type EffectResource = BinaryResource | ImageResource;

const runtimes = new Map<BackendType, EffekseerRuntime>();

function cwrapNumber(module: NativeModule, name: string, args: NativeArgType[]): (...args: number[]) => number {
  return module.cwrap(name, "number", args) as (...args: number[]) => number;
}

function cwrapVoid(module: NativeModule, name: string, args: NativeArgType[]): (...args: number[]) => void {
  return module.cwrap(name, "void", args) as (...args: number[]) => void;
}

function bindCore(module: NativeModule): NativeCore {
  return {
    InitWebGL: cwrapNumber(module, "EffekseerInitWebGL", ["number", "number", "number", "number"]),
    InitWebGPU: cwrapNumber(module, "EffekseerInitWebGPU", ["number", "number", "number", "number"]),
    Terminate: cwrapVoid(module, "EffekseerTerminate", ["number"]),
    Update: cwrapVoid(module, "EffekseerUpdate", ["number", "number"]),
    BeginUpdate: cwrapVoid(module, "EffekseerBeginUpdate", ["number"]),
    EndUpdate: cwrapVoid(module, "EffekseerEndUpdate", ["number"]),
    UpdateHandle: cwrapVoid(module, "EffekseerUpdateHandle", ["number", "number", "number"]),
    Draw: cwrapVoid(module, "EffekseerDraw", ["number"]),
    BeginDraw: cwrapVoid(module, "EffekseerBeginDraw", ["number"]),
    EndDraw: cwrapVoid(module, "EffekseerEndDraw", ["number"]),
    DrawHandle: cwrapVoid(module, "EffekseerDrawHandle", ["number", "number"]),
    BeginWebGPUFrame: cwrapNumber(module, "EffekseerBeginWebGPUFrame", ["number"]),
    DrawWebGPUFrame: cwrapVoid(module, "EffekseerDrawWebGPUFrame", ["number"]),
    EndWebGPURenderPass: cwrapVoid(module, "EffekseerEndWebGPURenderPass", ["number"]),
    SubmitWebGPUFrame: cwrapVoid(module, "EffekseerSubmitWebGPUFrame", ["number"]),
    ResizeWebGPU: cwrapNumber(module, "EffekseerResizeWebGPU", ["number", "number", "number"]),
    DrawToExternalWebGPURenderPass: cwrapNumber(module, "EffekseerDrawToExternalWebGPURenderPass", ["number", "number", "number", "number"]),
    ReleaseImportedWebGPURenderPassEncoder: cwrapVoid(module, "EffekseerReleaseImportedWebGPURenderPassEncoder", ["number"]),
    SetProjectionMatrix: cwrapVoid(module, "EffekseerSetProjectionMatrix", ["number", "number"]),
    SetProjectionPerspective: cwrapVoid(module, "EffekseerSetProjectionPerspective", ["number", "number", "number", "number", "number"]),
    SetProjectionOrthographic: cwrapVoid(module, "EffekseerSetProjectionOrthographic", ["number", "number", "number", "number", "number"]),
    SetCameraMatrix: cwrapVoid(module, "EffekseerSetCameraMatrix", ["number", "number"]),
    SetCameraLookAt: cwrapVoid(module, "EffekseerSetCameraLookAt", ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number"]),
    LoadEffect: cwrapNumber(module, "EffekseerLoadEffect", ["number", "number", "number", "number"]),
    ReleaseEffect: cwrapVoid(module, "EffekseerReleaseEffect", ["number", "number"]),
    ReloadResources: cwrapVoid(module, "EffekseerReloadResources", ["number", "number", "number", "number"]),
    StopAllEffects: cwrapVoid(module, "EffekseerStopAllEffects", ["number"]),
    PlayEffect: cwrapNumber(module, "EffekseerPlayEffect", ["number", "number", "number", "number", "number"]),
    StopEffect: cwrapVoid(module, "EffekseerStopEffect", ["number", "number"]),
    StopRoot: cwrapVoid(module, "EffekseerStopRoot", ["number", "number"]),
    Exists: cwrapNumber(module, "EffekseerExists", ["number", "number"]),
    SetFrame: cwrapVoid(module, "EffekseerSetFrame", ["number", "number", "number"]),
    SetLocation: cwrapVoid(module, "EffekseerSetLocation", ["number", "number", "number", "number", "number"]),
    SetRotation: cwrapVoid(module, "EffekseerSetRotation", ["number", "number", "number", "number", "number"]),
    SetScale: cwrapVoid(module, "EffekseerSetScale", ["number", "number", "number", "number", "number"]),
    SetMatrix: cwrapVoid(module, "EffekseerSetMatrix", ["number", "number", "number"]),
    GetDynamicInput: cwrapNumber(module, "EffekseerGetDynamicInput", ["number", "number", "number"]),
    SetDynamicInput: cwrapVoid(module, "EffekseerSetDynamicInput", ["number", "number", "number", "number"]),
    SendTrigger: cwrapVoid(module, "EffekseerSendTrigger", ["number", "number", "number"]),
    SetAllColor: cwrapVoid(module, "EffekseerSetAllColor", ["number", "number", "number", "number", "number", "number"]),
    SetTargetLocation: cwrapVoid(module, "EffekseerSetTargetLocation", ["number", "number", "number", "number", "number"]),
    SetPaused: cwrapVoid(module, "EffekseerSetPaused", ["number", "number", "number"]),
    SetShown: cwrapVoid(module, "EffekseerSetShown", ["number", "number", "number"]),
    SetSpeed: cwrapVoid(module, "EffekseerSetSpeed", ["number", "number", "number"]),
    SetRandomSeed: cwrapVoid(module, "EffekseerSetRandomSeed", ["number", "number", "number"]),
    GetRestInstancesCount: cwrapNumber(module, "EffekseerGetRestInstancesCount", ["number"]),
    GetUpdateTime: cwrapNumber(module, "EffekseerGetUpdateTime", ["number"]),
    GetDrawTime: cwrapNumber(module, "EffekseerGetDrawTime", ["number"]),
    IsVertexArrayObjectSupported: cwrapNumber(module, "EffekseerIsVertexArrayObjectSupported", ["number"]),
    SetRestorationOfStatesFlag: cwrapVoid(module, "EffekseerSetRestorationOfStatesFlag", ["number", "number"]),
    CaptureBackground: cwrapVoid(module, "EffekseerCaptureBackground", ["number", "number", "number", "number", "number"]),
    ResetBackground: cwrapVoid(module, "EffekseerResetBackground", ["number"]),
    SetListener: cwrapVoid(module, "EffekseerSetListener", ["number", "number", "number", "number", "number", "number", "number", "number", "number", "number"]),
    SetSoundVolume: cwrapVoid(module, "EffekseerSetSoundVolume", ["number", "number"]),
    PauseSound: cwrapVoid(module, "EffekseerPauseSound", ["number", "number"]),
    ResumeSound: cwrapVoid(module, "EffekseerResumeSound", ["number"]),
    SetLogEnabled: cwrapVoid(module, "EffekseerSetLogEnabled", ["number"]),
  };
}

async function loadScript(path: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new RuntimeNotInitializedError("scriptPath loading requires a browser document.");
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = path;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new RuntimeNotInitializedError(`Failed to load native script: ${path}`));
    document.head.appendChild(script);
  });
}

function getGlobalFactory(backend: BackendType): NativeModuleFactory | undefined {
  const key = backend === "webgl" ? "effekseer_webgl_native" : "effekseer_webgpu_native";
  return (globalThis as unknown as Record<string, NativeModuleFactory | undefined>)[key];
}

async function requestWebGPUDevice(options: WebGPURuntimeOptions): Promise<GPUDevice> {
  if (options.device) {
    return options.device;
  }
  if (!("gpu" in navigator) || navigator.gpu == null) {
    throw new WebGPUUnavailableError("navigator.gpu is not available.");
  }

  const adapter = await navigator.gpu.requestAdapter(options.adapterOptions);
  if (!adapter) {
    throw new WebGPUUnavailableError("Failed to request a WebGPU adapter.");
  }

  const optional = ["float32-filterable", "texture-formats-tier2", "texture-compression-bc"] as GPUFeatureName[];
  const requiredFeatures = optional.filter((feature) => adapter.features.has(feature));
  return adapter.requestDevice({
    ...options.deviceDescriptor,
    requiredFeatures: options.deviceDescriptor?.requiredFeatures ?? requiredFeatures,
  });
}

function toNativeWebGPUColorFormat(format: GPUTextureFormat | undefined): number {
  switch (format ?? "rgba8unorm") {
    case "rgba8unorm":
      return 1;
    case "bgra8unorm":
      return 2;
    case "rgba8unorm-srgb":
      return 3;
    case "bgra8unorm-srgb":
      return 4;
    default:
      throw new InvalidOperationError(`Unsupported WebGPU color format for Effekseer: ${format}`);
  }
}

function toNativeWebGPUDepthFormat(format: GPUTextureFormat | undefined): number {
  switch (format) {
    case undefined:
      return 0;
    case "depth32float":
      return 1;
    case "depth24plus-stencil8":
      return 2;
    case "depth32float-stencil8":
      return 3;
    default:
      throw new InvalidOperationError(`Unsupported WebGPU depth format for Effekseer: ${format}`);
  }
}

function prepareNativeWebGPUCanvas(canvas: HTMLCanvasElement | OffscreenCanvas | undefined): void {
  if (
    typeof document === "undefined" ||
    typeof HTMLCanvasElement === "undefined" ||
    !(canvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  if (canvas.id === "canvas") {
    return;
  }

  const existing = document.getElementById("canvas");
  if (existing && existing !== canvas) {
    throw new NativeInitializationError("The native WebGPU backend renders to #canvas, but another element already uses that id.");
  }

  canvas.id = "canvas";
}

function arrayBufferFromView(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function normalizeResourcePath(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/\/{2,}/g, "/");
  return normalized;
}

function resourcePathCandidates(path: string, baseDir = ""): string[] {
  const candidates = new Set<string>();
  const normalized = normalizeResourcePath(path);
  candidates.add(normalized);
  candidates.add(normalized.replace(/^\/+/, ""));

  if (baseDir) {
    const base = normalizeResourcePath(baseDir).replace(/\/?$/, "/");
    if (normalized.startsWith(base)) {
      candidates.add(normalized.slice(base.length));
    } else {
      candidates.add(normalizeResourcePath(base + normalized));
    }
  }

  return [...candidates].filter((candidate) => candidate.length > 0);
}

function addPackageResource(resources: Map<string, ArrayBuffer>, path: string, buffer: ArrayBuffer, baseDir = ""): void {
  for (const candidate of resourcePathCandidates(path, baseDir)) {
    resources.set(candidate, buffer);
  }
}

async function decodeImageFromBlob(blob: Blob): Promise<TexImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      // Fall through to HTMLImageElement for browsers that expose ImageBitmap but reject this input.
    }
  }

  if (typeof Image === "undefined") {
    throw new ResourceLoadError("ImageBitmap is unavailable and HTMLImageElement cannot be created.");
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ResourceLoadError("Failed to decode image resource."));
    };
    image.src = url;
  });
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ResourceLoadError(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

class EffekseerRuntime {
  readonly backend: BackendType;
  readonly module: NativeModule;
  readonly core: NativeCore;
  imageCrossOrigin = "";
  audioContext: AudioContext | null = null;
  loadingEffect: EffekseerEffect | null = null;

  private constructor(backend: BackendType, module: NativeModule) {
    this.backend = backend;
    this.module = module;
    this.core = bindCore(module);

    module.resourcesMap = module.resourcesMap ?? {};
    module._isPowerOfTwo = (image) => image.width > 0 && image.height > 0 && (image.width & (image.width - 1)) === 0 && (image.height & (image.height - 1)) === 0;
    module._loadBinary = (path, isRequired) => this.loadingEffect?.requestBinary(path, isRequired !== 0) ?? null;
    module._loadImage = (path) => this.loadingEffect?.requestImage(path) ?? null;
  }

  static async create(options: RuntimeOptions): Promise<EffekseerRuntime> {
    let factory = options.moduleFactory;
    if (!factory && options.scriptPath) {
      await loadScript(options.scriptPath);
      factory = getGlobalFactory(options.backend);
    }
    if (!factory) {
      factory = getGlobalFactory(options.backend);
    }
    if (!factory) {
      throw new RuntimeNotInitializedError(`Native module factory for ${options.backend} was not found.`);
    }

    const moduleOptions: Record<string, unknown> = {};
    if (options.locateFile) {
      moduleOptions.locateFile = options.locateFile;
    } else if (options.wasmPath) {
      const wasmPath = options.wasmPath;
      moduleOptions.locateFile = (path: string) => path.endsWith(".wasm") ? wasmPath : path;
    }

    if (options.backend === "webgpu") {
      moduleOptions.preinitializedWebGPUDevice = await requestWebGPUDevice(options);
    }

    const module = await factory(moduleOptions);
    return new EffekseerRuntime(options.backend, module);
  }

  setLogEnabled(flag: boolean): void {
    this.core.SetLogEnabled(flag ? 1 : 0);
  }

  setImageCrossOrigin(crossOrigin: string): void {
    this.imageCrossOrigin = crossOrigin;
  }

  setAudioContext(audioContext: AudioContext): void {
    this.audioContext = audioContext;
  }

  async resumeAudio(): Promise<void> {
    const nativeContext = this.module.AL?.currentCtx?.audioCtx ?? this.module.AL?.currentCtx?.ctx;
    const context = this.audioContext ?? nativeContext ?? null;
    if (context && context.state !== "running") {
      await context.resume();
    }
  }

  withNativeBuffer<T>(buffer: ArrayBuffer, callback: (ptr: number, size: number) => T): T {
    const ptr = this.module._malloc(buffer.byteLength);
    try {
      const heap = this.module.HEAPU8 ?? this.module.HEAP8;
      if (!heap) {
        throw new NativeInitializationError("The native module does not expose a writable heap.");
      }
      heap.set(new Uint8Array(buffer), ptr);
      return callback(ptr, buffer.byteLength);
    } finally {
      this.module._free(ptr);
    }
  }
}

export async function initRuntime(options: RuntimeOptions): Promise<void> {
  const runtime = await EffekseerRuntime.create(options);
  runtimes.set(options.backend, runtime);
}

export function getLastWebGPUError(): string | undefined {
  return runtimes.get("webgpu")?.module.effekseerLastWebGPUError;
}

export function getWebGPUErrors(): readonly string[] {
  return runtimes.get("webgpu")?.module.effekseerWebGPUErrors ?? [];
}

function getRuntime(backend: BackendType): EffekseerRuntime {
  const runtime = runtimes.get(backend);
  if (!runtime) {
    throw new RuntimeNotInitializedError(`Runtime for ${backend} has not been initialized.`);
  }
  return runtime;
}

export function setLogEnabled(flag: boolean): void {
  for (const runtime of runtimes.values()) {
    runtime.setLogEnabled(flag);
  }
}

export function setImageCrossOrigin(crossOrigin: string): void {
  for (const runtime of runtimes.values()) {
    runtime.setImageCrossOrigin(crossOrigin);
  }
}

export function setAudioContext(audioContext: AudioContext): void {
  for (const runtime of runtimes.values()) {
    runtime.setAudioContext(audioContext);
  }
}

abstract class BaseEffekseerContext {
  readonly runtime: EffekseerRuntime;
  readonly backend: BackendType;
  nativePtr: number;
  private released = false;

  protected constructor(runtime: EffekseerRuntime, backend: BackendType, nativePtr: number) {
    this.runtime = runtime;
    this.backend = backend;
    this.nativePtr = nativePtr;
    if (nativePtr === 0) {
      throw new NativeInitializationError(`Failed to initialize ${backend} context.`);
    }
  }

  protected assertAlive(): void {
    if (this.released || this.nativePtr === 0) {
      throw new InvalidOperationError("Effekseer context has been released.");
    }
  }

  release(): void {
    if (!this.released && this.nativePtr !== 0) {
      this.runtime.core.Terminate(this.nativePtr);
      this.nativePtr = 0;
      this.released = true;
    }
  }

  update(deltaFrames = 1.0): void {
    this.assertAlive();
    this.runtime.core.Update(this.nativePtr, deltaFrames);
  }

  beginUpdate(): void {
    this.assertAlive();
    this.runtime.core.BeginUpdate(this.nativePtr);
  }

  endUpdate(): void {
    this.assertAlive();
    this.runtime.core.EndUpdate(this.nativePtr);
  }

  updateHandle(handle: EffekseerHandle, deltaFrames: number): void {
    this.assertAlive();
    this.runtime.core.UpdateHandle(this.nativePtr, handle.native, deltaFrames);
  }

  draw(): void {
    this.assertAlive();
    this.runtime.core.Draw(this.nativePtr);
  }

  beginDraw(): void {
    this.assertAlive();
    this.runtime.core.BeginDraw(this.nativePtr);
  }

  drawHandle(handle: EffekseerHandle): void {
    this.assertAlive();
    this.runtime.core.DrawHandle(this.nativePtr, handle.native);
  }

  endDraw(): void {
    this.assertAlive();
    this.runtime.core.EndDraw(this.nativePtr);
  }

  setProjectionMatrix(matrixArray: ArrayLike<number>): void {
    this.withStackMatrix(matrixArray, (ptr) => this.runtime.core.SetProjectionMatrix(this.nativePtr, ptr));
  }

  setProjectionPerspective(fov: number, aspect: number, near: number, far: number): void {
    this.assertAlive();
    this.runtime.core.SetProjectionPerspective(this.nativePtr, fov, aspect, near, far);
  }

  setProjectionOrthographic(width: number, height: number, near: number, far: number): void {
    this.assertAlive();
    this.runtime.core.SetProjectionOrthographic(this.nativePtr, width, height, near, far);
  }

  setCameraMatrix(matrixArray: ArrayLike<number>): void {
    this.withStackMatrix(matrixArray, (ptr) => this.runtime.core.SetCameraMatrix(this.nativePtr, ptr));
  }

  setCameraLookAt(positionX: number, positionY: number, positionZ: number, targetX: number, targetY: number, targetZ: number, upX = 0, upY = 1, upZ = 0): void {
    this.assertAlive();
    this.runtime.core.SetCameraLookAt(this.nativePtr, positionX, positionY, positionZ, targetX, targetY, targetZ, upX, upY, upZ);
  }

  setCameraLookAtFromVector(position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, up = { x: 0, y: 1, z: 0 }): void {
    this.setCameraLookAt(position.x, position.y, position.z, target.x, target.y, target.z, up.x, up.y, up.z);
  }

  setCameraFromThree(camera: ThreeCameraLike, options: ThreeCameraOptions = {}): void {
    if (options.updateMatrixWorld !== false) {
      camera.updateMatrixWorld?.();
    }
    this.setProjectionMatrix(camera.projectionMatrix.elements);
    this.setCameraMatrix(camera.matrixWorldInverse.elements);
  }

  loadEffect(
    data: string | ArrayBuffer,
    scaleOrOptions?: number | EffectLoadOptions,
    onload?: EffectLoadCallback,
    onerror?: EffectLoadErrorCallback,
    redirect?: (url: string) => string,
  ): Promise<EffekseerEffect> {
    this.assertAlive();
    const options = typeof scaleOrOptions === "number"
      ? { scale: scaleOrOptions, redirect }
      : (scaleOrOptions ?? {});

    const promise = this.loadEffectAsync(data, options);
    if (onload || onerror) {
      promise.then((effect) => onload?.(effect), (error: unknown) => onerror?.(error));
    }
    return promise;
  }

  loadEffectPackage(
    data: string | ArrayBuffer,
    Unzip: UnzipConstructor | UnzipLike,
    scaleOrOptions: number | EffectLoadOptions = 1.0,
    onload?: EffectLoadCallback,
    onerror?: EffectLoadErrorCallback,
  ): Promise<EffekseerEffect> {
    const options = typeof scaleOrOptions === "number" ? { scale: scaleOrOptions } : scaleOrOptions;
    const promise = this.loadEffectPackageAsync(data, Unzip, options);
    if (onload || onerror) {
      promise.then((effect) => onload?.(effect), (error: unknown) => onerror?.(error));
    }
    return promise;
  }

  private async loadEffectAsync(data: string | ArrayBuffer, options: EffectLoadOptions): Promise<EffekseerEffect> {
    const effect = new EffekseerEffect(this, options);
    if (typeof data === "string") {
      effect.baseDir = data.includes("/") ? data.slice(0, data.lastIndexOf("/") + 1) : "";
      await effect.loadFromBuffer(await fetchArrayBuffer(options.redirect ? options.redirect(data) : data));
    } else {
      await effect.loadFromBuffer(data);
    }
    return effect;
  }

  private async loadEffectPackageAsync(data: string | ArrayBuffer, Unzip: UnzipConstructor | UnzipLike, options: EffectLoadOptions): Promise<EffekseerEffect> {
    const buffer = typeof data === "string" ? await fetchArrayBuffer(data) : data;
    const unzip = typeof Unzip === "function" ? new Unzip(new Uint8Array(buffer)) : Unzip;
    const meta = JSON.parse(new TextDecoder().decode(unzip.decompress("metafile.json"))) as {
      files: Record<string, { type: string; dependencies?: string[] }>;
    };

    let effectPath = "";
    let effectArchivePath = "";
    const packageResources = new Map<string, ArrayBuffer>();
    for (const [path, info] of Object.entries(meta.files)) {
      const normalizedPath = normalizeResourcePath(path);
      if (info.type === "Effect") {
        effectPath = normalizedPath;
        effectArchivePath = path;
      } else {
        const decompressed = unzip.decompress(path);
        addPackageResource(packageResources, normalizedPath, arrayBufferFromView(decompressed));
        if (info.type === "Curve" && info.dependencies?.[0]) {
          addPackageResource(packageResources, `${normalizedPath}.efkcurve`, arrayBufferFromView(unzip.decompress(info.dependencies[0])));
        } else if (info.type === "Model" && info.dependencies?.[0]) {
          addPackageResource(packageResources, normalizedPath, arrayBufferFromView(unzip.decompress(info.dependencies[0])));
        } else if (info.dependencies) {
          for (const dependency of info.dependencies) {
            const normalizedDependency = normalizeResourcePath(dependency);
            addPackageResource(packageResources, normalizedDependency, arrayBufferFromView(unzip.decompress(dependency)));
          }
        }
      }
    }

    if (!effectPath) {
      throw new EffectLoadError("Effect package does not contain an Effect entry.");
    }

    const effect = new EffekseerEffect(this, options, packageResources);
    await effect.loadFromBuffer(arrayBufferFromView(unzip.decompress(effectArchivePath || effectPath)));
    return effect;
  }

  releaseEffect(effect: EffekseerEffect): void {
    this.assertAlive();
    effect.release();
  }

  play(effect: EffekseerEffect, x = 0, y = 0, z = 0): EffekseerHandle | null {
    this.assertAlive();
    if (!effect.isLoaded || effect.nativePtr === 0) {
      return null;
    }
    const handle = this.runtime.core.PlayEffect(this.nativePtr, effect.nativePtr, x, y, z);
    return handle >= 0 ? new EffekseerHandle(this, handle) : null;
  }

  stopAll(): void {
    this.assertAlive();
    this.runtime.core.StopAllEffects(this.nativePtr);
  }

  setSoundVolume(volume: number): void {
    this.assertAlive();
    this.runtime.core.SetSoundVolume(this.nativePtr, volume);
  }

  setListener(position: { x: number; y: number; z: number }, at: { x: number; y: number; z: number }, up = { x: 0, y: 1, z: 0 }): void {
    this.assertAlive();
    this.runtime.core.SetListener(this.nativePtr, position.x, position.y, position.z, at.x, at.y, at.z, up.x, up.y, up.z);
  }

  async resumeSound(): Promise<void> {
    this.assertAlive();
    await this.runtime.resumeAudio();
    this.runtime.core.ResumeSound(this.nativePtr);
  }

  pauseSound(): void {
    this.assertAlive();
    this.runtime.core.PauseSound(this.nativePtr, 1);
  }

  getRestInstancesCount(): number {
    this.assertAlive();
    return this.runtime.core.GetRestInstancesCount(this.nativePtr);
  }

  getUpdateTime(): number {
    this.assertAlive();
    return this.runtime.core.GetUpdateTime(this.nativePtr);
  }

  getDrawTime(): number {
    this.assertAlive();
    return this.runtime.core.GetDrawTime(this.nativePtr);
  }

  getLastWebGPUError(): string | undefined {
    return this.backend === "webgpu" ? this.runtime.module.effekseerLastWebGPUError : undefined;
  }

  private withStackMatrix(matrixArray: ArrayLike<number>, callback: (ptr: number) => void): void {
    this.assertAlive();
    if (matrixArray.length < 16) {
      throw new InvalidOperationError("Matrix arrays must contain at least 16 elements.");
    }
    const stack = this.runtime.module.stackSave();
    try {
      const ptr = this.runtime.module.stackAlloc(4 * 16);
      this.runtime.module.HEAPF32.set(Array.from(matrixArray).slice(0, 16), ptr >> 2);
      callback(ptr);
    } finally {
      this.runtime.module.stackRestore(stack);
    }
  }
}

export class WebGLEffekseerContext extends BaseEffekseerContext {
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private glContextHandle: number;

  constructor(runtime: EffekseerRuntime, options: WebGLContextOptions) {
    if (!runtime.module.GL) {
      throw new NativeInitializationError("The native WebGL module did not expose Module.GL.");
    }
    const isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" &&
      options.graphicsContext instanceof WebGL2RenderingContext;
    const glContextHandle = runtime.module.GL.registerContext(options.graphicsContext, {
      majorVersion: isWebGL2 ? 2 : 1,
      minorVersion: 0,
      enableExtensionsByDefault: options.enableExtensionsByDefault ?? true,
    });
    runtime.module.GL.makeContextCurrent(glContextHandle);
    const nativePtr = runtime.core.InitWebGL(
      options.instanceMaxCount ?? 4000,
      options.squareMaxCount ?? 10000,
      options.enableExtensionsByDefault === false ? 0 : 1,
      options.enablePremultipliedAlpha ? 1 : 0,
    );
    super(runtime, "webgl", nativePtr);
    this.gl = options.graphicsContext;
    this.glContextHandle = glContextHandle;
  }

  makeContextCurrent(): void {
    this.runtime.module.GL?.makeContextCurrent(this.glContextHandle);
  }

  override draw(): void {
    this.makeContextCurrent();
    super.draw();
  }

  setRestorationOfStatesFlag(flag: boolean): void {
    this.runtime.core.SetRestorationOfStatesFlag(this.nativePtr, flag ? 1 : 0);
  }

  isVertexArrayObjectSupported(): boolean {
    return this.runtime.core.IsVertexArrayObjectSupported(this.nativePtr) !== 0;
  }

  captureBackground(x: number, y: number, width: number, height: number): void {
    this.runtime.core.CaptureBackground(this.nativePtr, x, y, width, height);
  }

  resetBackground(): void {
    this.runtime.core.ResetBackground(this.nativePtr);
  }
}

export class WebGPUEffekseerContext extends BaseEffekseerContext {
  readonly device: GPUDevice | undefined;
  readonly canvasContext: GPUCanvasContext | undefined;
  private frameActive = false;
  private renderPassActive = false;
  private colorFormat: GPUTextureFormat;
  private depthFormat: GPUTextureFormat | undefined;

  constructor(runtime: EffekseerRuntime, options: WebGPUContextOptions) {
    const canvas = options.canvas ?? options.canvasContext?.canvas;
    prepareNativeWebGPUCanvas(canvas);
    const width = options.width ?? ("width" in (canvas ?? {}) ? Number((canvas as HTMLCanvasElement).width) : 640);
    const height = options.height ?? ("height" in (canvas ?? {}) ? Number((canvas as HTMLCanvasElement).height) : 480);
    const colorFormat = options.colorFormat ?? navigator.gpu.getPreferredCanvasFormat();
    options.canvasContext?.configure({
      device: options.device ?? runtime.module.preinitializedWebGPUDevice!,
      format: colorFormat,
      alphaMode: "premultiplied",
    });
    const nativePtr = runtime.core.InitWebGPU(options.instanceMaxCount ?? 4000, options.squareMaxCount ?? 10000, width, height);
    super(runtime, "webgpu", nativePtr);
    this.device = options.device ?? runtime.module.preinitializedWebGPUDevice;
    this.canvasContext = options.canvasContext;
    this.colorFormat = colorFormat;
    this.depthFormat = options.depthFormat;
  }

  configureSurface(options: { width?: number; height?: number; colorFormat?: GPUTextureFormat; depthFormat?: GPUTextureFormat; alphaMode?: GPUCanvasAlphaMode } = {}): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new InvalidOperationError("configureSurface cannot be called while a WebGPU frame is active.");
    }

    if (this.canvasContext && this.device) {
      this.colorFormat = options.colorFormat ?? this.colorFormat;
      this.canvasContext.configure({
        device: this.device,
        format: this.colorFormat,
        alphaMode: options.alphaMode ?? "premultiplied",
      });
    }
    this.depthFormat = options.depthFormat ?? this.depthFormat;

    const width = options.width ?? (this.canvasContext?.canvas && "width" in this.canvasContext.canvas ? Number(this.canvasContext.canvas.width) : undefined);
    const height = options.height ?? (this.canvasContext?.canvas && "height" in this.canvasContext.canvas ? Number(this.canvasContext.canvas.height) : undefined);
    if (width !== undefined && height !== undefined && this.runtime.core.ResizeWebGPU(this.nativePtr, width, height) === 0) {
      throw new NativeInitializationError("Failed to resize the native WebGPU surface.");
    }
  }

  override draw(): void {
    this.drawToCanvas();
  }

  drawToCanvas(): void {
    this.beginRenderPass();
    try {
      this.drawCurrentFrame();
    } finally {
      this.endRenderPass();
    }
    this.submit();
  }

  beginRenderPass(): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new InvalidOperationError("A WebGPU frame is already active.");
    }
    if (this.runtime.core.BeginWebGPUFrame(this.nativePtr) === 0) {
      throw new NativeInitializationError("Failed to begin the native WebGPU frame.");
    }
    this.frameActive = true;
    this.renderPassActive = true;
  }

  drawCurrentFrame(): void {
    this.assertAlive();
    if (!this.renderPassActive) {
      throw new InvalidOperationError("drawCurrentFrame requires an active native WebGPU render pass.");
    }
    this.runtime.core.DrawWebGPUFrame(this.nativePtr);
  }

  drawToRenderPass(renderPassEncoder: GPURenderPassEncoder, options: WebGPUExternalRenderPassOptions = {}): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new InvalidOperationError("drawToRenderPass cannot run while a native WebGPU frame is active.");
    }
    const importRenderPass = this.runtime.module.__effekseerImportWebGPURenderPassEncoder;
    if (!importRenderPass) {
      throw new InvalidOperationError("The native WebGPU module does not expose render-pass object import.");
    }

    const nativeRenderPass = importRenderPass(renderPassEncoder);
    let consumed = false;
    try {
      const colorFormat = toNativeWebGPUColorFormat(options.colorFormat ?? this.colorFormat);
      const depthFormat = toNativeWebGPUDepthFormat(options.depthFormat ?? this.depthFormat);
      const ok = this.runtime.core.DrawToExternalWebGPURenderPass(this.nativePtr, nativeRenderPass, colorFormat, depthFormat) !== 0;
      consumed = ok;
      if (!ok) {
        throw new NativeInitializationError("Failed to draw into the external WebGPU render pass.");
      }
    } finally {
      if (!consumed) {
        this.runtime.core.ReleaseImportedWebGPURenderPassEncoder(nativeRenderPass);
      }
    }
  }

  endRenderPass(): void {
    this.assertAlive();
    if (!this.renderPassActive) {
      return;
    }
    this.runtime.core.EndWebGPURenderPass(this.nativePtr);
    this.renderPassActive = false;
  }

  submit(): void {
    this.assertAlive();
    if (!this.frameActive) {
      return;
    }
    if (this.renderPassActive) {
      this.endRenderPass();
    }
    this.runtime.core.SubmitWebGPUFrame(this.nativePtr);
    this.frameActive = false;
  }

  override release(): void {
    if (this.frameActive) {
      this.submit();
    }
    super.release();
  }
}

export type EffekseerContext = WebGLEffekseerContext | WebGPUEffekseerContext;

export async function createContext(options: ContextOptions): Promise<EffekseerContext> {
  const runtime = getRuntime(options.backend);
  if (options.audioContext) {
    runtime.setAudioContext(options.audioContext);
  }
  return options.backend === "webgl"
    ? new WebGLEffekseerContext(runtime, options)
    : new WebGPUEffekseerContext(runtime, options);
}

export function releaseContext(context: EffekseerContext): void {
  context.release();
}

export class EffekseerEffect {
  readonly context: BaseEffekseerContext;
  readonly options: EffectLoadOptions;
  readonly packageResources: Map<string, ArrayBuffer>;
  nativePtr = 0;
  baseDir = "";
  isLoaded = false;
  mainBuffer: ArrayBuffer | null = null;
  private resources = new Map<string, EffectResource>();
  private pending: Promise<void>[] = [];

  constructor(context: BaseEffekseerContext, options: EffectLoadOptions = {}, packageResources = new Map<string, ArrayBuffer>()) {
    this.context = context;
    this.options = options;
    this.packageResources = packageResources;
  }

  async loadFromBuffer(buffer: ArrayBuffer): Promise<void> {
    this.mainBuffer = buffer;
    let guard = 0;
    while (guard++ < 16) {
      this.pending = [];
      this.context.runtime.loadingEffect = this;
      try {
        this.context.runtime.withNativeBuffer(buffer, (ptr, size) => {
          if (this.nativePtr === 0) {
            this.nativePtr = this.context.runtime.core.LoadEffect(this.context.nativePtr, ptr, size, this.options.scale ?? 1.0);
          } else {
            this.context.runtime.core.ReloadResources(this.context.nativePtr, this.nativePtr, ptr, size);
          }
        });
      } finally {
        this.context.runtime.loadingEffect = null;
      }

      if (this.nativePtr === 0) {
        throw new EffectLoadError("Native effect creation failed.");
      }
      if (this.pending.length === 0) {
        this.isLoaded = true;
        return;
      }
      await Promise.all(this.pending);
    }

    throw new EffectLoadError("Effect resource dependency resolution did not converge.");
  }

  requestBinary(path: string, required: boolean): ArrayBuffer | null {
    const normalizedPath = normalizeResourcePath(path);
    const key = `binary:${normalizedPath}`;
    const found = this.resources.get(key) as BinaryResource | undefined;
    if (found) {
      return found.loaded ? found.buffer : null;
    }

    const resource: BinaryResource = { kind: "binary", path: normalizedPath, required, loaded: false, buffer: null };
    resource.promise = this.resolveBinary(normalizedPath, required)
      .then((buffer) => {
        resource.buffer = buffer;
        resource.loaded = true;
      })
      .catch((error: unknown) => {
        resource.loaded = true;
        if (required) {
          throw error instanceof Error ? error : new ResourceLoadError(String(error));
        }
      });
    this.resources.set(key, resource);
    this.pending.push(resource.promise);
    return null;
  }

  requestImage(path: string): TexImageSource | null {
    const normalizedPath = normalizeResourcePath(path);
    const key = `image:${normalizedPath}`;
    const found = this.resources.get(key) as ImageResource | undefined;
    if (found) {
      return found.loaded ? found.image : null;
    }

    const resource: ImageResource = { kind: "image", path: normalizedPath, required: true, loaded: false, image: null };
    resource.promise = this.resolveImage(normalizedPath).then((image) => {
      resource.image = image;
      resource.loaded = true;
    });
    this.resources.set(key, resource);
    this.pending.push(resource.promise);
    return null;
  }

  release(): void {
    if (this.nativePtr !== 0) {
      this.context.runtime.core.ReleaseEffect(this.context.nativePtr, this.nativePtr);
      this.nativePtr = 0;
      this.isLoaded = false;
    }
  }

  private resolveUrl(path: string): string {
    const url = normalizeResourcePath(this.baseDir + path);
    return this.options.redirect ? this.options.redirect(url) : url;
  }

  private async resolveBinary(path: string, required: boolean): Promise<ArrayBuffer | null> {
    for (const candidate of resourcePathCandidates(path, this.baseDir)) {
      const packaged = this.packageResources.get(candidate);
      if (packaged) {
        return packaged;
      }
    }

    const url = this.resolveUrl(path);
    try {
      const loaded = this.options.resourceLoader
        ? await this.options.resourceLoader(url, "binary", this.baseDir)
        : await fetchArrayBuffer(url);
      if (loaded instanceof ArrayBuffer) {
        return loaded;
      }
      if (loaded instanceof Blob) {
        return await loaded.arrayBuffer();
      }
      throw new ResourceLoadError(`Resource loader returned an image for binary resource ${url}.`);
    } catch (error) {
      if (!required) {
        return null;
      }
      throw error instanceof Error ? error : new ResourceLoadError(String(error));
    }
  }

  private async resolveImage(path: string): Promise<TexImageSource> {
    for (const candidate of resourcePathCandidates(path, this.baseDir)) {
      const packaged = this.packageResources.get(candidate);
      if (packaged) {
        return decodeImageFromBlob(new Blob([packaged]));
      }
    }

    const url = this.resolveUrl(path);
    const loaded = this.options.resourceLoader
      ? await this.options.resourceLoader(url, "image", this.baseDir)
      : await fetch(url).then(async (response) => {
        if (!response.ok) {
          throw new ResourceLoadError(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        return response.blob();
      });

    if (loaded instanceof Blob) {
      return decodeImageFromBlob(loaded);
    }
    if (loaded instanceof ArrayBuffer) {
      return decodeImageFromBlob(new Blob([loaded]));
    }
    return loaded;
  }
}

export class EffekseerHandle {
  readonly context: BaseEffekseerContext;
  readonly native: number;

  constructor(context: BaseEffekseerContext, native: number) {
    this.context = context;
    this.native = native;
  }

  stop(): void {
    this.context.runtime.core.StopEffect(this.context.nativePtr, this.native);
  }

  stopRoot(): void {
    this.context.runtime.core.StopRoot(this.context.nativePtr, this.native);
  }

  get exists(): boolean {
    return this.context.runtime.core.Exists(this.context.nativePtr, this.native) !== 0;
  }

  setFrame(frame: number): void {
    this.context.runtime.core.SetFrame(this.context.nativePtr, this.native, frame);
  }

  setLocation(x: number, y: number, z: number): void {
    this.context.runtime.core.SetLocation(this.context.nativePtr, this.native, x, y, z);
  }

  setRotation(x: number, y: number, z: number): void {
    this.context.runtime.core.SetRotation(this.context.nativePtr, this.native, x, y, z);
  }

  setScale(x: number, y: number, z: number): void {
    this.context.runtime.core.SetScale(this.context.nativePtr, this.native, x, y, z);
  }

  setMatrix(matrixArray: ArrayLike<number>): void {
    const module = this.context.runtime.module;
    const stack = module.stackSave();
    try {
      const ptr = module.stackAlloc(4 * 16);
      module.HEAPF32.set(Array.from(matrixArray).slice(0, 16), ptr >> 2);
      this.context.runtime.core.SetMatrix(this.context.nativePtr, this.native, ptr);
    } finally {
      module.stackRestore(stack);
    }
  }

  setAllColor(r: number, g: number, b: number, a: number): void {
    this.context.runtime.core.SetAllColor(this.context.nativePtr, this.native, r, g, b, a);
  }

  setTargetLocation(x: number, y: number, z: number): void {
    this.context.runtime.core.SetTargetLocation(this.context.nativePtr, this.native, x, y, z);
  }

  getDynamicInput(index: number): number {
    return this.context.runtime.core.GetDynamicInput(this.context.nativePtr, this.native, index);
  }

  setDynamicInput(index: number, value: number): void {
    this.context.runtime.core.SetDynamicInput(this.context.nativePtr, this.native, index, value);
  }

  sendTrigger(index: number): void {
    this.context.runtime.core.SendTrigger(this.context.nativePtr, this.native, index);
  }

  setPaused(paused: boolean): void {
    this.context.runtime.core.SetPaused(this.context.nativePtr, this.native, paused ? 1 : 0);
  }

  setShown(shown: boolean): void {
    this.context.runtime.core.SetShown(this.context.nativePtr, this.native, shown ? 1 : 0);
  }

  setSpeed(speed: number): void {
    this.context.runtime.core.SetSpeed(this.context.nativePtr, this.native, speed);
  }

  setRandomSeed(seed: number): void {
    this.context.runtime.core.SetRandomSeed(this.context.nativePtr, this.native, seed);
  }
}
