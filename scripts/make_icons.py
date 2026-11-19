#!/usr/bin/env python3
"""Render the PRIVIA app icon and generate every platform size from it.

The repository ships no binary assets, so icons are drawn from code at build
time. The mark is a "P" built from a stem and a ring, with a small red core:
your space, with the intelligence inside it.

Usage:
    python scripts/make_icons.py            # writes the 1024px source and runs `tauri icon`
    python scripts/make_icons.py --png-only # writes only the source PNG

Requires Pillow (``pip install pillow``) and, without ``--png-only``, the
desktop app's npm dependencies.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "apps" / "desktop"
SOURCE = DESKTOP / "src-tauri" / "icons" / "source.png"

SIZE = 1024
SCALE = 4  # draw large, then downsample for clean anti-aliased edges

SURFACE = (13, 14, 16, 255)  # #0D0E10
BORDER = (48, 48, 52, 255)  # #303034
INK = (244, 244, 245, 255)  # #F4F4F5
RED = (168, 50, 54, 255)  # #A83236


def render() -> Image.Image:
    s = SCALE
    canvas = Image.new("RGBA", (SIZE * s, SIZE * s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    # Rounded square on the macOS icon grid (824px content in a 1024px canvas).
    inset, radius = 100 * s, 186 * s
    box = (inset, inset, SIZE * s - inset, SIZE * s - inset)
    draw.rounded_rectangle(box, radius=radius, fill=SURFACE, outline=BORDER, width=6 * s)

    # The bowl of the P: a ring.
    cx, cy, outer, stroke = 528 * s, 420 * s, 190 * s, 64 * s
    draw.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), outline=INK, width=stroke)

    # The stem overlaps the ring's left band so the two read as one stroke.
    left = cx - outer
    draw.rounded_rectangle(
        (left, cy - outer + stroke // 2, left + stroke, 800 * s), radius=stroke // 2, fill=INK
    )

    # The core.
    core = 62 * s
    draw.ellipse((cx - core, cy - core, cx + core, cy + core), fill=RED)

    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--png-only", action="store_true")
    args = parser.parse_args(argv)

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    render().save(SOURCE)
    print(f"wrote {SOURCE.relative_to(ROOT)}")
    if args.png_only:
        return 0

    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    subprocess.run([npx, "tauri", "icon", str(SOURCE)], cwd=DESKTOP, check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
