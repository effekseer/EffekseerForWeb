import argparse
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def npm_command():
    return "npm.cmd" if os.name == "nt" else "npm"


def emcmake_command():
    return "emcmake.bat" if os.name == "nt" else "emcmake"


def run(command, cwd=ROOT):
    print(" ".join(str(c) for c in command))
    subprocess.check_call(command, cwd=str(cwd))


def cmake_configure(build_dir, backend):
    build_dir.mkdir(parents=True, exist_ok=True)
    generator = ["-G", "MinGW Makefiles"] if os.name == "nt" else []
    run(
        [
            emcmake_command(),
            "cmake",
            *generator,
            f"-DEFK_WEB_BACKEND={backend}",
            str(ROOT / "src" / "cpp"),
        ],
        cwd=build_dir,
    )


def cmake_build(build_dir):
    if os.name == "nt":
        run(["cmake", "--build", ".", "--config", "Release"], cwd=build_dir)
    else:
        run(["cmake", "--build", "."], cwd=build_dir)


def copy_native_outputs(build_dir, backend):
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    stem = f"effekseer-{backend}-native"
    for suffix in [".js", ".wasm"]:
        src = build_dir / f"{stem}{suffix}"
        if src.exists():
            shutil.copy2(src, dist / src.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", choices=["webgl", "webgpu", "all"], default="all")
    parser.add_argument("--skip-ts", action="store_true")
    parser.add_argument("--skip-native", action="store_true")
    args = parser.parse_args()

    if not args.skip_ts:
        run([npm_command(), "run", "build:ts"])

    if args.skip_native:
        return

    backends = ["webgl", "webgpu"] if args.backend == "all" else [args.backend]
    for backend in backends:
        build_dir = ROOT / f"build_{backend}"
        cmake_configure(build_dir, backend)
        cmake_build(build_dir)
        copy_native_outputs(build_dir, backend)


if __name__ == "__main__":
    main()
