#!/usr/bin/env python3
"""Build CJK .cpfont packs for the simulator's virtual SD card.

The firmware's builtin UI fonts carry no CJK glyphs, so Chinese UI labels and
Chinese book text fall back to a `.cpfont` on the card. Real OnePage cards ship
LXGW WenKai, which cannot be redistributed with this repo, so this script
converts a CJK face that is already installed on the host:

    python3 simulator/make_cjk_fonts.py                  # macOS defaults
    python3 simulator/make_cjk_fonts.py MyFont.ttf       # any CJK face

Defaults on macOS:
  Hiragino Sans GB W3 -> .fonts/HiraginoSansGB/  (used by the UI fallback)
  Songti SC Regular   -> .fonts/SongtiSC/        (selectable reader font)

Output goes to simulator/sd_root/.fonts/<family>/, which is git-ignored: the
converted packs are host-font derivatives and must not be committed.

Requires: python3 -m pip install freetype-py fonttools
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

FIRMWARE_ROOT = Path(__file__).resolve().parents[1]
CONVERTER = FIRMWARE_ROOT / "lib/EpdFont/scripts/fontconvert_sdcard.py"
SD_FONTS_DIR = FIRMWARE_ROOT / "simulator/sd_root/.fonts"
SIZES = "12,14,16,18"
# cjk: ideographs + kana + fullwidth forms; reading: Latin/Greek/Cyrillic and
# the punctuation a mixed Chinese/English page needs.
INTERVALS = "cjk,reading"

# (path, face index inside the collection, family name = SD folder name)
MACOS_SOURCES = [
    ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0, "HiraginoSansGB"),
    ("/System/Library/Fonts/Supplemental/Songti.ttc", 6, "SongtiSC"),
]


def extract_face(src: Path, face_index: int, out_path: Path) -> str:
    """Copy one face out of a .ttc/.otc (or pass a plain font through)."""
    from fontTools.ttLib import TTCollection, TTFont

    if src.suffix.lower() in (".ttc", ".otc"):
        face = TTCollection(str(src)).fonts[face_index]
    else:
        face = TTFont(str(src))
    family = face["name"].getDebugName(4) or src.stem
    face.save(str(out_path))
    return family


def build(src: Path, face_index: int, name: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        ttf = Path(tmp) / f"{name}.ttf"
        family = extract_face(src, face_index, ttf)
        print(f"[{name}] {src.name} -> {family}")
        subprocess.run(
            [
                sys.executable,
                str(CONVERTER),
                str(ttf),
                "--intervals", INTERVALS,
                "--sizes", SIZES,
                "--style", "regular",
                "--name", name,
                "--output-dir", str(SD_FONTS_DIR / name),
            ],
            check=True,
        )


def main(argv: list[str]) -> int:
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0

    if argv:
        path = Path(argv[0]).expanduser()
        if not path.is_file():
            print(f"error: font not found: {path}", file=sys.stderr)
            return 1
        # Family name drives the SD folder and the settings entry, so keep it
        # filesystem- and settings-safe: no spaces or punctuation.
        name = "".join(c for c in path.stem if c.isalnum())
        build(path, 0, name)
        return 0

    if sys.platform != "darwin":
        print("error: pass a CJK font path explicitly on non-macOS hosts", file=sys.stderr)
        return 1

    SD_FONTS_DIR.mkdir(parents=True, exist_ok=True)
    built = 0
    for raw_path, face_index, name in MACOS_SOURCES:
        src = Path(raw_path)
        if not src.is_file():
            print(f"[{name}] skipped, not present: {src}")
            continue
        build(src, face_index, name)
        built += 1
    return 0 if built else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
