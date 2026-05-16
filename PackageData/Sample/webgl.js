import { createContext, initRuntime } from "../effekseer.js";

const THREE = window.THREE;
if (!THREE) {
  throw new Error("three.min.js was not loaded.");
}

const canvas = document.getElementById("canvas");
const status = document.getElementById("status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function main() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15191f);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(20, 20, 20);
  camera.lookAt(0, 0, 0);

  const grid = new THREE.GridHelper(24, 12, 0x5b6b7d, 0x2f3945);
  scene.add(grid);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(1, 2, 2);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x556677, 0.7));

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0xcc3344, roughness: 0.45, metalness: 0.1 }),
  );
  box.position.set(0, 1, 0);
  scene.add(box);

  const effectFiles = {
    laser1: "../Resources/00_Basic/Laser01.efkefc",
    laser2: "../Resources/00_Basic/Laser02.efkefc",
    laser3: "../Resources/00_Basic/Laser03.efkefc",
    fireworks: "../Resources/00_Basic/Simple_Turbulence_Fireworks.efkefc",
    track: "../Resources/00_Basic/Simple_Track1.efkefc",
  };

  const effects = new Map();
  const handles = [];

  await initRuntime({
    backend: "webgl",
    scriptPath: "../effekseer-webgl.js",
    wasmPath: "../effekseer-webgl.wasm",
  });

  const effekseer = await createContext({
    backend: "webgl",
    graphicsContext: renderer.getContext(),
  });

  effekseer.setRestorationOfStatesFlag(false);

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
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  const clock = new THREE.Clock();
  playEffect("laser1");
  setStatus(
    failedEffects.length > 0
      ? `WebGL sample ready. Failed effects: ${failedEffects.join(", ")}`
      : "WebGL sample ready.",
    failedEffects.length > 0,
  );

  function render() {
    requestAnimationFrame(render);
    const deltaFrames = clock.getDelta() * 60.0;
    box.rotation.y += 0.01;
    box.rotation.z += 0.005;

    effekseer.update(deltaFrames);
    renderer.render(scene, camera);

    effekseer.setCameraFromThree(camera);
    effekseer.draw();

    renderer.resetState();
  }

  render();
}

main().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});
