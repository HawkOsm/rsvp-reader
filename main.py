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

"""RSVP Reader — a local, single-user speed reader.

Run with:  python main.py [file ...]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PyQt6.QtGui import QFont, QIcon
from PyQt6.QtWidgets import QApplication

from db import Database, default_db_path
from ui.main_window import MainWindow
from ui.style import DARK_QSS

APP_ID = "rsvp-reader"
VERSION = "1.0"


def resource_path(name: str) -> Path:
    """Find a bundled data file, running from source or from a frozen build.

    PyInstaller unpacks data files into a temporary directory and points
    ``sys._MEIPASS`` at it; from a source checkout they sit next to this
    module.
    """
    base = getattr(sys, "_MEIPASS", None)
    root = Path(base) if base else Path(__file__).resolve().parent
    return root / name


def parse_args(argv: list[str]):
    """Our own options; anything else is handed through to Qt."""
    parser = argparse.ArgumentParser(
        prog=APP_ID,
        description="Read documents one word at a time, at a pace you set.",
        epilog=f"Library and reading positions live in {default_db_path()}",
    )
    parser.add_argument(
        "files", nargs="*", metavar="FILE",
        help="documents to add to the library and open (.txt, .pdf)",
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {VERSION}")
    return parser.parse_known_args(argv[1:])


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv if argv is None else argv
    args, qt_args = parse_args(argv)

    app = QApplication([argv[0], *qt_args])
    app.setApplicationName("RSVP Reader")
    app.setApplicationDisplayName("RSVP Reader")
    app.setApplicationVersion(VERSION)
    # Matches the .desktop file, so Wayland compositors show the right icon.
    app.setDesktopFileName(APP_ID)
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_QSS)

    # Window and taskbar icon.  On Linux the installed .desktop file
    # usually supplies this, but a frozen build has no desktop entry.
    icon = resource_path("share/rsvp-reader.png")
    if icon.exists():
        app.setWindowIcon(QIcon(str(icon)))

    ui_font = QFont()
    ui_font.setFamilies(["Inter", "Noto Sans", "DejaVu Sans", "Arial"])
    ui_font.setPointSize(10)
    app.setFont(ui_font)

    db = Database()
    window = MainWindow(db)
    window.show()

    # Files named on the command line go straight into the library.
    files = []
    for name in args.files:
        if Path(name).is_file():
            files.append(name)
        else:
            print(f"{APP_ID}: no such file: {name}", file=sys.stderr)
    if files:
        window.add_paths(files)

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
