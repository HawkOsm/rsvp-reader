# RSVP Reader - a local desktop speed reader.
# Copyright (C) 2026 Osman Sahin Guler
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Render share/rsvp-reader.svg into the raster icons the installers need.

    python tools/make_icons.py
    python tools/make_icons.py --iconset build/rsvp-reader.iconset

Writes share/rsvp-reader.png (512px, for Linux and the in-app window icon)
and share/rsvp-reader.ico (multi-size, for the Windows executable).

With --iconset it also writes an Apple .iconset directory, which CI turns
into an .icns with iconutil (a tool that only exists on macOS).

Only PyQt6 is needed - no Pillow, no ImageMagick.  The .ico container is
written by hand because Qt cannot save that format.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

from PyQt6.QtCore import QBuffer, QIODevice, QRectF
from PyQt6.QtGui import QImage, QPainter
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtWidgets import QApplication

HERE = Path(__file__).resolve().parent.parent
SVG = HERE / "share" / "rsvp-reader.svg"
PNG = HERE / "share" / "rsvp-reader.png"
ICO = HERE / "share" / "rsvp-reader.ico"

ICO_SIZES = [16, 32, 48, 64, 128, 256]
PNG_SIZE = 512


def render(renderer: QSvgRenderer, size: int) -> QImage:
    image = QImage(size, size, QImage.Format.Format_ARGB32)
    image.fill(0)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(painter, QRectF(0, 0, size, size))
    painter.end()
    return image


def png_bytes(image: QImage) -> bytes:
    # The QBuffer must own its storage: passing a temporary QByteArray lets
    # Python collect it while Qt is still writing, which segfaults.
    buffer = QBuffer()
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    image.save(buffer, "PNG")
    buffer.close()
    return bytes(buffer.data())


def write_ico(images: list[QImage], path: Path) -> None:
    """A PNG-compressed .ico, which every Windows since Vista reads."""
    blobs = [png_bytes(image) for image in images]
    # ICONDIR: reserved, type 1 (icon), image count.
    header = struct.pack("<HHH", 0, 1, len(blobs))
    offset = len(header) + 16 * len(blobs)
    entries, payload = b"", b""
    for image, blob in zip(images, blobs):
        side = image.width()
        entries += struct.pack(
            "<BBBBHHII",
            0 if side >= 256 else side,   # 256 is recorded as 0
            0 if side >= 256 else side,
            0, 0,                          # palette, reserved
            1, 32,                         # colour planes, bits per pixel
            len(blob), offset,
        )
        payload += blob
        offset += len(blob)
    path.write_bytes(header + entries + payload)


def write_iconset(renderer: QSvgRenderer, directory: Path) -> None:
    """Apple's .iconset layout, ready for `iconutil -c icns`."""
    directory.mkdir(parents=True, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        render(renderer, base).save(
            str(directory / f"icon_{base}x{base}.png"), "PNG")
        render(renderer, base * 2).save(
            str(directory / f"icon_{base}x{base}@2x.png"), "PNG")
    print(f"wrote {directory} (10 images)")


def main() -> int:
    app = QApplication(sys.argv)   # Qt needs one to rasterise anything
    renderer = QSvgRenderer(str(SVG))
    if not renderer.isValid():
        print(f"could not read {SVG}", file=sys.stderr)
        return 1

    render(renderer, PNG_SIZE).save(str(PNG), "PNG")
    write_ico([render(renderer, s) for s in ICO_SIZES], ICO)
    print(f"wrote {PNG.relative_to(HERE)} ({PNG_SIZE}x{PNG_SIZE})")
    print(f"wrote {ICO.relative_to(HERE)} ({', '.join(map(str, ICO_SIZES))})")

    if "--iconset" in sys.argv:
        write_iconset(renderer, Path(sys.argv[sys.argv.index("--iconset") + 1]))

    app.quit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
