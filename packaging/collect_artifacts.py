#!/usr/bin/env python3
"""Copy the installers Tauri produced into ``release/`` under stable names.

    python packaging/collect_artifacts.py --label macos-arm64 [--target aarch64-apple-darwin]

Names follow ``PRIVIA-<version>-<label>.<ext>``, for example
``PRIVIA-1.0.0-windows-x64-setup.exe``. Stable names let the website and the
README link to a file without knowing Tauri's internal naming.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "apps" / "desktop" / "src-tauri"
OUT = ROOT / "release"

# bundle directory -> (glob, suffix in the published name)
KINDS = {
    "dmg": ("*.dmg", ".dmg"),
    "deb": ("*.deb", ".deb"),
    "rpm": ("*.rpm", ".rpm"),
    "appimage": ("*.AppImage", ".AppImage"),
    "msi": ("*.msi", ".msi"),
    "nsis": ("*-setup.exe", "-setup.exe"),
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--label", required=True, help="e.g. macos-arm64, linux-x64, windows-x64")
    parser.add_argument("--target", help="Rust target triple passed to `tauri build --target`")
    args = parser.parse_args(argv)

    version = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    roots = [TAURI / "target" / args.target / "release" / "bundle"] if args.target else []
    roots.append(TAURI / "target" / "release" / "bundle")

    OUT.mkdir(exist_ok=True)
    copied = 0
    for kind, (pattern, suffix) in KINDS.items():
        for root in roots:
            matches = sorted((root / kind).glob(pattern)) if (root / kind).is_dir() else []
            if matches:
                destination = OUT / f"PRIVIA-{version}-{args.label}{suffix}"
                shutil.copy2(matches[-1], destination)
                print(f"{destination.name}  ({destination.stat().st_size / 1_048_576:.1f} MB)")
                copied += 1
                break
    if not copied:
        print("No installers were found. Did `tauri build` succeed?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
