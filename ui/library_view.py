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

"""The library: a table of everything the user has added."""

from __future__ import annotations

import time

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QAction, QColor
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMenu,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from db import Book, Database
from ui import style

COLUMNS = ["Title", "Words", "Progress", "Last opened"]


def _relative_time(stamp: float | None) -> str:
    if not stamp:
        return "never"
    seconds = max(0.0, time.time() - stamp)
    for limit, divisor, unit in (
        (60, 1, "s"),
        (3600, 60, "m"),
        (86400, 3600, "h"),
        (2592000, 86400, "d"),
    ):
        if seconds < limit:
            return f"{int(seconds // divisor)}{unit} ago"
    return time.strftime("%Y-%m-%d", time.localtime(stamp))


class LibraryView(QWidget):
    """Lists the library; a single click on a row opens that book."""

    bookActivated = pyqtSignal(int)   # book id
    addRequested = pyqtSignal()

    def __init__(self, db: Database, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.db = db
        self._books: list[Book] = []
        self._build_ui()
        self.refresh()

    def _build_ui(self) -> None:
        root = QVBoxLayout(self)
        root.setContentsMargins(24, 18, 24, 18)
        root.setSpacing(12)

        header = QHBoxLayout()
        title = QLabel("Library")
        title.setObjectName("title")
        header.addWidget(title)
        header.addStretch(1)
        add_button = QPushButton("Add book…")
        add_button.setObjectName("primary")
        add_button.clicked.connect(self.addRequested.emit)
        header.addWidget(add_button)
        root.addLayout(header)

        self.table = QTableWidget(0, len(COLUMNS))
        self.table.setHorizontalHeaderLabels(COLUMNS)
        self.table.verticalHeader().setVisible(False)
        self.table.setAlternatingRowColors(True)
        self.table.setShowGrid(False)
        self.table.setWordWrap(False)
        self.table.setSelectionBehavior(
            QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(
            QAbstractItemView.SelectionMode.SingleSelection)
        self.table.setEditTriggers(
            QAbstractItemView.EditTrigger.NoEditTriggers)
        self.table.setContextMenuPolicy(
            Qt.ContextMenuPolicy.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._show_context_menu)
        self.table.cellClicked.connect(self._on_cell_clicked)

        header_view = self.table.horizontalHeader()
        header_view.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        # Match each header to the alignment of the cells beneath it.
        self.table.horizontalHeaderItem(0).setTextAlignment(
            Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        for column in range(1, len(COLUMNS)):
            self.table.horizontalHeaderItem(column).setTextAlignment(
                Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        for column in range(1, len(COLUMNS)):
            header_view.setSectionResizeMode(
                column, QHeaderView.ResizeMode.ResizeToContents)
        root.addWidget(self.table, 1)

        self.empty_label = QLabel(
            "Nothing here yet — drop a .txt or .pdf onto this window, "
            "or use “Add book…”."
        )
        self.empty_label.setObjectName("hint")
        self.empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.empty_label)

    # ------------------------------------------------------------ contents

    def refresh(self) -> None:
        self._books = self.db.list_books()
        self.table.setRowCount(len(self._books))
        for row, book in enumerate(self._books):
            missing = not book.exists
            title = book.title + ("   (file missing)" if missing else "")
            cells = [
                title,
                f"{book.total_words:,}" if book.total_words else "—",
                f"{book.progress * 100:.0f}%" if book.last_index else "—",
                _relative_time(book.last_opened_at),
            ]
            for column, text in enumerate(cells):
                item = QTableWidgetItem(text)
                item.setToolTip(book.path)
                if column:
                    item.setTextAlignment(Qt.AlignmentFlag.AlignRight
                                          | Qt.AlignmentFlag.AlignVCenter)
                if missing:
                    item.setForeground(QColor(style.TEXT_DIM))
                self.table.setItem(row, column, item)

        self.empty_label.setVisible(not self._books)
        self.table.setVisible(bool(self._books))

    def book_at_row(self, row: int) -> Book | None:
        if 0 <= row < len(self._books):
            return self._books[row]
        return None

    # -------------------------------------------------------------- events

    def _on_cell_clicked(self, row: int, _column: int) -> None:
        book = self.book_at_row(row)
        if book:
            self.bookActivated.emit(book.id)

    def _show_context_menu(self, position) -> None:
        row = self.table.rowAt(position.y())
        book = self.book_at_row(row)
        if book is None:
            return

        menu = QMenu(self)
        open_action = QAction("Open", self)
        open_action.triggered.connect(
            lambda: self.bookActivated.emit(book.id))
        reset_action = QAction("Reset progress", self)
        reset_action.triggered.connect(lambda: self._reset(book))
        remove_action = QAction("Remove from library", self)
        remove_action.triggered.connect(lambda: self._remove(book))
        menu.addAction(open_action)
        menu.addSeparator()
        menu.addAction(reset_action)
        menu.addAction(remove_action)
        menu.exec(self.table.viewport().mapToGlobal(position))

    def _reset(self, book: Book) -> None:
        self.db.reset_progress(book.id)
        self.refresh()

    def _remove(self, book: Book) -> None:
        self.db.remove_book(book.id)
        self.refresh()
