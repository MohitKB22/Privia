#!/usr/bin/env python3
"""Build the backend as a single executable for the Tauri sidecar.

Tauri looks for ``src-tauri/binaries/privia-backend-<target-triple>[.exe]``.
This script freezes the backend with PyInstaller and copies the result there.

Usage (from the repository root, inside the project's virtualenv):

    pip install -e ".[keychain]" pyinstaller
    python packaging/backend/build_sidecar.py [--target <rust-target-triple>]

The target defaults to the host triple reported by ``rustc -vV``.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTRY = Path(__file__).with_name("privia_backend.py")
BINARIES = ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
WORK = ROOT / "build" / "sidecar"

# Source roots of the monorepo packages (mirrors [tool.pytest.ini_options]
# pythonpath). Passing them explicitly means the build does not depend on how,
# or whether, the project was pip-installed: editable installs use an import
# hook that PyInstaller's analysis cannot follow.
SOURCE_ROOTS = [
    "packages/shared-types",
    "packages/security",
    "packages/storage",
    "packages/observability",
    "packages/memory",
    "packages/tool-runtime",
    "packages/agent-core",
    "services/llm",
    "services/embeddings",
    "services/speech",
    "services/integrations",
    "apps/api",
]

# Imported dynamically, so PyInstaller cannot see them by analysis alone.
COLLECT_SUBMODULES = [
    "uvicorn",
    "privia_api",
    "privia_tools",
    "privia_integrations",
    "privia_llm",
    "privia_speech",
    "privia_embeddings",
    "keyring",
]
COLLECT_DATA = ["privia_storage"]  # the SQL migrations
# Heavy optional extras that the desktop build does not ship.
EXCLUDE = ["faster_whisper", "ctranslate2", "torch", "chromadb", "tkinter", "pytest"]


def host_triple() -> str:
    output = subprocess.run(["rustc", "-vV"], check=True, capture_output=True, text=True).stdout
    for line in output.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    raise SystemExit("Could not read the host target from `rustc -vV`.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the PRIVIA backend sidecar")
    parser.add_argument("--target", help="Rust target triple (default: host)")
    args = parser.parse_args(argv)
    target = args.target or host_triple()
    suffix = ".exe" if "windows" in target else ""

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "privia-backend",
        "--distpath",
        str(WORK / "dist"),
        "--workpath",
        str(WORK / "work"),
        "--specpath",
        str(WORK),
    ]
    for root in SOURCE_ROOTS:
        command += ["--paths", str(ROOT / root)]
    for module in COLLECT_SUBMODULES:
        command += ["--collect-submodules", module]
    for package in COLLECT_DATA:
        command += ["--collect-data", package]
    for module in EXCLUDE:
        command += ["--exclude-module", module]
    command.append(str(ENTRY))

    print("building", target)
    subprocess.run(command, check=True, cwd=ROOT)

    built = WORK / "dist" / f"privia-backend{suffix}"
    BINARIES.mkdir(parents=True, exist_ok=True)
    destination = BINARIES / f"privia-backend-{target}{suffix}"
    shutil.copy2(built, destination)
    print(f"sidecar ready: {destination.relative_to(ROOT)} ({destination.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
