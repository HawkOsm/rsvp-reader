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

"""Dark theme: a small palette plus the application-wide stylesheet."""

from __future__ import annotations

BG = "#16181d"
BG_RAISED = "#1e2128"
BG_HOVER = "#272b34"
BORDER = "#32373f"
TEXT = "#e6e8ec"
TEXT_DIM = "#8c93a0"
ACCENT = "#ff5a5f"      # the ORP letter and the progress fill
ACCENT_DIM = "#7a2e31"
GUIDE = "#3a404a"       # the focus-point tick marks

DARK_QSS = f"""
QWidget {{
    background: {BG};
    color: {TEXT};
    font-size: 13px;
}}

QToolBar {{
    background: {BG_RAISED};
    border-bottom: 1px solid {BORDER};
    padding: 4px;
    spacing: 4px;
}}
QToolBar QToolButton {{
    padding: 5px 10px;
    border-radius: 5px;
    color: {TEXT};
}}
QToolBar QToolButton:hover {{ background: {BG_HOVER}; }}

QStatusBar {{
    background: {BG_RAISED};
    border-top: 1px solid {BORDER};
    color: {TEXT_DIM};
}}

QPushButton {{
    background: {BG_RAISED};
    border: 1px solid {BORDER};
    border-radius: 6px;
    padding: 7px 16px;
    color: {TEXT};
}}
QPushButton:hover {{ background: {BG_HOVER}; }}
QPushButton:pressed {{ background: {BORDER}; }}
QPushButton:disabled {{ color: {TEXT_DIM}; border-color: {BG_RAISED}; }}
QPushButton#primary {{
    background: {ACCENT};
    border: 1px solid {ACCENT};
    color: #14161a;
    font-weight: 600;
}}
QPushButton#primary:hover {{ background: #ff7276; }}

QLabel#hint, QLabel#counter {{ color: {TEXT_DIM}; }}
QLabel#title {{ font-size: 15px; font-weight: 600; }}

QTableWidget {{
    background: {BG};
    alternate-background-color: {BG_RAISED};
    gridline-color: {BG};
    border: 1px solid {BORDER};
    border-radius: 8px;
    selection-background-color: {ACCENT_DIM};
    selection-color: {TEXT};
}}
QTableWidget::item {{ padding: 8px 6px; border: none; }}
QTableWidget::item:hover {{ background: {BG_HOVER}; }}
QHeaderView::section {{
    background: {BG_RAISED};
    color: {TEXT_DIM};
    border: none;
    border-bottom: 1px solid {BORDER};
    padding: 7px 6px;
    font-weight: 600;
}}

QSpinBox {{
    background: {BG_RAISED};
    border: 1px solid {BORDER};
    border-radius: 5px;
    padding: 5px 8px;
    min-width: 58px;
}}
QSpinBox:focus {{ border-color: {ACCENT}; }}

QSlider::groove:horizontal {{
    height: 4px;
    background: {BORDER};
    border-radius: 2px;
}}
QSlider::sub-page:horizontal {{ background: {ACCENT_DIM}; border-radius: 2px; }}
QSlider::handle:horizontal {{
    background: {TEXT};
    width: 14px;
    height: 14px;
    margin: -6px 0;
    border-radius: 7px;
}}
QSlider::handle:horizontal:hover {{ background: {ACCENT}; }}

QMenu {{
    background: {BG_RAISED};
    border: 1px solid {BORDER};
    padding: 4px;
}}
QMenu::item {{ padding: 6px 22px 6px 12px; border-radius: 4px; }}
QMenu::item:selected {{ background: {BG_HOVER}; }}

QMessageBox {{ background: {BG_RAISED}; }}

/* --- page panel --- */
QSplitter::handle {{ background: {BORDER}; }}
QSplitter::handle:hover {{ background: {ACCENT_DIM}; }}

QWidget#panelHeader {{
    background: {BG_RAISED};
    border-bottom: 1px solid {BORDER};
}}
QPushButton#pageStep {{
    background: transparent;
    border: none;
    padding: 3px 0;
    border-radius: 4px;
    font-size: 15px;
    color: {TEXT_DIM};
}}
QLabel#pageCounter {{ background: transparent; color: {TEXT_DIM}; }}
QPushButton#pageStep {{ color: {TEXT}; }}
QPushButton#pageStep:hover {{ background: {BG_HOVER}; color: {ACCENT}; }}
QPushButton#pageStep:disabled {{ color: {BORDER}; background: transparent; }}

/* The page image sits on a neutral ground, not the page-white. */
QScrollArea {{ border: none; background: #0f1115; }}
QScrollArea > QWidget > QWidget {{ background: transparent; }}

QScrollBar:vertical {{ background: {BG}; width: 10px; margin: 0; }}
QScrollBar::handle:vertical {{
    background: {BORDER}; border-radius: 5px; min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{ background: {TEXT_DIM}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QScrollBar:horizontal {{ background: {BG}; height: 10px; }}
QScrollBar::handle:horizontal {{
    background: {BORDER}; border-radius: 5px; min-width: 30px;
}}
"""
