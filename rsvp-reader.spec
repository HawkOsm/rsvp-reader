# -*- mode: python ; coding: utf-8 -*-
# SPDX-License-Identifier: GPL-3.0-or-later
#
# PyInstaller build for RSVP Reader.
#
#     pip install pyinstaller
#     pyinstaller rsvp-reader.spec
#
# Produces dist/rsvp-reader (Linux), dist/rsvp-reader.exe (Windows) or
# dist/RSVP Reader.app (macOS).  See .github/workflows/build.yml for how
# releases are built.

import sys
from pathlib import Path

APP_NAME = "rsvp-reader"
ROOT = Path(SPECPATH)

# Data files the app opens at runtime, kept at the same relative path so
# main.resource_path() finds them either frozen or from source.
datas = [(str(ROOT / "share" / "rsvp-reader.png"), "share")]

# Qt pulls in a great deal that a small app never touches.  Trimming these
# keeps the download reasonable without changing behaviour.
excludes = [
    "tkinter", "unittest", "pydoc_data", "test",
    "PyQt6.QtNetwork", "PyQt6.QtQml", "PyQt6.QtQuick", "PyQt6.QtQuick3D",
    "PyQt6.QtMultimedia", "PyQt6.QtWebEngineCore", "PyQt6.QtWebEngineWidgets",
    "PyQt6.QtBluetooth", "PyQt6.QtNfc", "PyQt6.QtPositioning",
    "PyQt6.QtSerialPort", "PyQt6.QtSql", "PyQt6.QtTest", "PyQt6.QtCharts",
    "PyQt6.QtDataVisualization", "PyQt6.Qt3DCore", "PyQt6.QtDesigner",
    "PyQt6.QtPdf", "PyQt6.QtPdfWidgets",   # we render PDFs with PyMuPDF
]

a = Analysis(
    ["main.py"],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=["pymupdf"],
    hookspath=[],
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

if sys.platform == "darwin":
    # A .app bundle, so macOS treats it as a proper application.
    exe = EXE(
        pyz, a.scripts, [],
        exclude_binaries=True,
        name=APP_NAME,
        console=False,
        argv_emulation=True,
        icon=str(ROOT / "share" / "rsvp-reader.icns")
        if (ROOT / "share" / "rsvp-reader.icns").exists() else None,
    )
    coll = COLLECT(exe, a.binaries, a.datas, name=APP_NAME)
    app = BUNDLE(
        coll,
        name="RSVP Reader.app",
        icon=str(ROOT / "share" / "rsvp-reader.icns")
        if (ROOT / "share" / "rsvp-reader.icns").exists() else None,
        bundle_identifier="io.github.hawkosm.rsvpreader",
        info_plist={
            "CFBundleDisplayName": "RSVP Reader",
            "CFBundleShortVersionString": "1.1",
            "NSHighResolutionCapable": True,
        },
    )
else:
    # One self-contained file for Linux and Windows.
    exe = EXE(
        pyz, a.scripts, a.binaries, a.datas, [],
        name=APP_NAME,
        upx=False,
        console=False,          # no console window on Windows
        icon=str(ROOT / "share" / "rsvp-reader.ico")
        if (ROOT / "share" / "rsvp-reader.ico").exists() else None,
    )
