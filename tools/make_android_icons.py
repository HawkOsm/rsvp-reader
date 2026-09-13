# SPDX-License-Identifier: GPL-3.0-or-later
"""Render the app icon into the Android mipmap densities."""
import sys
from pathlib import Path
from PyQt6.QtCore import QRectF
from PyQt6.QtGui import QImage, QPainter
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtWidgets import QApplication

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "share" / "rsvp-reader.svg"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

app = QApplication(sys.argv)
renderer = QSvgRenderer(str(SVG))
for name, size in DENSITIES.items():
    out = RES / f"mipmap-{name}"
    out.mkdir(parents=True, exist_ok=True)
    image = QImage(size, size, QImage.Format.Format_ARGB32)
    image.fill(0)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(painter, QRectF(0, 0, size, size))
    painter.end()
    image.save(str(out / "ic_launcher.png"), "PNG")
    image.save(str(out / "ic_launcher_round.png"), "PNG")
    print(f"  mipmap-{name}/ic_launcher.png ({size}px)")
app.quit()
