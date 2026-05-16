import argparse
import fnmatch
import hashlib
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_PRODUCT_NAME = "EffekseerForWeb"
DISTRIBUTION_RUNTIME_FILES = [
    ("index.js", "effekseer.js"),
    ("index.d.ts", "effekseer.d.ts"),
    ("effekseer-webgl-native.js", "effekseer-webgl.js"),
    ("effekseer-webgl-native.wasm", "effekseer-webgl.wasm"),
    ("effekseer-webgpu-native.js", "effekseer-webgpu.js"),
    ("effekseer-webgpu-native.wasm", "effekseer-webgpu.wasm"),
]
README_FILES = [
    "README.md",
    "README_ja.md",
    "README_en.md",
]
DEFAULT_EXCLUDES = [
    ".git",
    ".git/**",
    "**/.git",
    "**/.git/**",
    "__pycache__",
    "**/__pycache__/**",
]


def read_package_json():
    with (ROOT / "package.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def should_exclude(relative_path, patterns):
    posix = relative_path.as_posix()
    name = relative_path.name
    for pattern in [*DEFAULT_EXCLUDES, *patterns]:
        if fnmatch.fnmatch(posix, pattern) or fnmatch.fnmatch(name, pattern):
            return True
    return False


def copy_tree_filtered(source, destination, exclude_patterns):
    if source.is_file():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return

    for path in source.rglob("*"):
        relative = path.relative_to(source)
        if should_exclude(relative, exclude_patterns):
            continue
        target = destination / relative
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)


def copy_runtime_files(stage_root):
    dist = ROOT / "dist"
    missing = [source for source, _ in DISTRIBUTION_RUNTIME_FILES if not (dist / source).exists()]
    if missing:
        raise FileNotFoundError(
            "Missing build outputs in dist/: "
            + ", ".join(missing)
            + ". Run `python build.py` before creating a distribution package."
        )
    for source, destination in DISTRIBUTION_RUNTIME_FILES:
        shutil.copy2(dist / source, stage_root / destination)


def copy_package_data(stage_root, manifest_path):
    with manifest_path.open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    copied = []
    for entry in manifest.get("include", []):
        source = ROOT / entry["from"]
        destination = stage_root / entry["to"]
        if not source.exists():
            raise FileNotFoundError(f"Package data source was not found: {source}")
        copy_tree_filtered(source, destination, entry.get("exclude", []))
        copied.append({"from": entry["from"], "to": entry["to"]})

    return {"manifest": str(manifest_path.relative_to(ROOT)), "copied": copied}


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_archives(stage_parent, stage_root, output_dir, archive_base):
    output_dir.mkdir(parents=True, exist_ok=True)
    for pattern in [
        f"{archive_base}.zip",
        f"{archive_base}.tar.gz",
        "effekseer-for-web-*",
        "effekseer-for-web-*.zip",
        "effekseer-for-web-*.tar.gz",
        "SHA256SUMS",
    ]:
        for stale_file in output_dir.glob(pattern):
            if stale_file.is_file():
                stale_file.unlink()
            elif stale_file.is_dir():
                shutil.rmtree(stale_file)

    archives = []
    work_base = stage_parent / f"{archive_base}-archive"
    for format_name, suffix in [("zip", ".zip"), ("gztar", ".tar.gz")]:
        archive_path = shutil.make_archive(
            str(work_base),
            format_name,
            root_dir=stage_parent,
            base_dir=stage_root.name,
        )
        final_path = output_dir / f"{archive_base}{suffix}"
        if Path(archive_path) != final_path:
            Path(archive_path).replace(final_path)
        archives.append(final_path)

    checksum_path = output_dir / "SHA256SUMS"
    with checksum_path.open("w", encoding="utf-8", newline="\n") as f:
        for archive in archives:
            f.write(f"{sha256(archive)}  {archive.name}\n")
    archives.append(checksum_path)
    return archives


def main():
    parser = argparse.ArgumentParser(description="Create distributable EffekseerForWeb archives.")
    parser.add_argument("--output-dir", default="artifacts")
    parser.add_argument("--manifest", default="PackageData/manifest.json")
    parser.add_argument("--stage-dir", default=".tmp/distribution")
    args = parser.parse_args()

    package_info = read_package_json()
    archive_base = f"{ARCHIVE_PRODUCT_NAME}{package_info['version']}"
    stage_parent = ROOT / args.stage_dir
    stage_root = stage_parent / archive_base
    output_dir = ROOT / args.output_dir
    manifest_path = ROOT / args.manifest

    if stage_root.exists():
        shutil.rmtree(stage_root)
    stage_root.mkdir(parents=True)

    for readme in README_FILES:
        shutil.copy2(ROOT / "PackageData" / readme, stage_root / readme)
    copy_runtime_files(stage_root)
    copy_package_data(stage_root, manifest_path)
    archives = create_archives(stage_parent, stage_root, output_dir, archive_base)

    print(json.dumps({"ok": True, "archives": [str(p.relative_to(ROOT)) for p in archives]}, indent=2))


if __name__ == "__main__":
    main()
