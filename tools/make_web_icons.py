# SPDX-License-Identifier: GPL-3.0-or-later
"""Render the app icon into the PNG sizes a PWA manifest needs."""
import sys
from pathlib import Path
from PyQt6.QtCore import QRectF
from PyQt6.QtGui import QImage, QPainter, QColor
from PyQt6.QtSvg import QSvgRenderer
from PyQt6.QtWidgets import QApplication

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "share" / "rsvp-reader.svg"
OUT = ROOT / "web" / "icons"
SIZES = [192, 512]

app = QApplication(sys.argv)
r = QSvgRenderer(str(SVG))
OUT.mkdir(parents=True, exist_ok=True)
for size in SIZES:
    img = QImage(size, size, QImage.Format.Format_ARGB32)
    img.fill(0)
    p = QPainter(img); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    r.render(p, QRectF(0, 0, size, size)); p.end()
    img.save(str(OUT / f"icon-{size}.png"), "PNG")
    print(f"  icons/icon-{size}.png")

# A maskable icon needs its art inside the safe circle, so pad it by 20%.
for size in (512,):
    img = QImage(size, size, QImage.Format.Format_ARGB32)
    img.fill(QColor("#16181d"))
    p = QPainter(img); p.setRenderHint(QPainter.RenderHint.Antialiasing)
    inset = size * 0.2
    r.render(p, QRectF(inset, inset, size - 2 * inset, size - 2 * inset))
    p.end()
    img.save(str(OUT / f"icon-{size}-maskable.png"), "PNG")
    print(f"  icons/icon-{size}-maskable.png")
app.quit()
