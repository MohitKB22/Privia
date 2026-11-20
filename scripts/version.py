#!/usr/bin/env python3
"""Keep PRIVIA's version identical everywhere it is declared.

    python scripts/version.py show
    python scripts/version.py check [--tag v1.2.3]   # exit 1 on any mismatch
    python scripts/version.py set 1.2.3              # rewrite every file

The version lives in five files: the Python package, the shared-types module,
the desktop package.json, tauri.conf.json and Cargo.toml. A release tag must
match all of them, or the installers would report the wrong version.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")

# file -> regex with one group capturing the version
LOCATIONS: dict[str, str] = {
    "pyproject.toml": r'(?m)^version = "([^"]+)"',
    "packages/shared-types/privia_shared/__init__.py": r'(?m)^__version__ = "([^"]+)"',
    "apps/desktop/package.json": r'(?m)^  "version": "([^"]+)"',
    "apps/desktop/src-tauri/tauri.conf.json": r'(?m)^  "version": "([^"]+)"',
    "apps/desktop/src-tauri/Cargo.toml": r'(?m)^version = "([^"]+)"',
}


def read_all() -> dict[str, str]:
    found: dict[str, str] = {}
    for relative, pattern in LOCATIONS.items():
        match = re.search(pattern, (ROOT / relative).read_text(encoding="utf-8"))
        if not match:
            raise SystemExit(f"No version found in {relative}")
        found[relative] = match.group(1)
    return found


def set_all(version: str) -> None:
    if not SEMVER.match(version):
        raise SystemExit(f"'{version}' is not a semantic version like 1.2.3 or 1.2.3-beta.1")
    for relative, pattern in LOCATIONS.items():
        path = ROOT / relative
        text = path.read_text(encoding="utf-8")
        match = re.search(pattern, text)
        assert match is not None
        start, end = match.span(1)
        path.write_text(text[:start] + version + text[end:], encoding="utf-8")
    # package-lock.json carries the version twice at the top.
    lock = ROOT / "apps/desktop/package-lock.json"
    data = json.loads(lock.read_text(encoding="utf-8"))
    data["version"] = version
    data.get("packages", {}).get("", {})["version"] = version
    lock.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"set version {version} in {len(LOCATIONS) + 1} files")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("show")
    check = sub.add_parser("check")
    check.add_argument("--tag", help="release tag that must match, e.g. v1.2.3")
    setter = sub.add_parser("set")
    setter.add_argument("version")
    args = parser.parse_args(argv)

    if args.command == "set":
        set_all(args.version)
        return 0

    found = read_all()
    for relative, version in found.items():
        print(f"{version:>16}  {relative}")
    if args.command == "show":
        return 0

    versions = set(found.values())
    if len(versions) != 1:
        print("error: the version differs between files", file=sys.stderr)
        return 1
    if args.tag:
        expected = args.tag.removeprefix("refs/tags/").removeprefix("v")
        if expected not in versions:
            print(f"error: tag {args.tag} does not match version {versions.pop()}", file=sys.stderr)
            return 1
    print("versions match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
