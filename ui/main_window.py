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

"""Main window: switches between the library and the reader."""

from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QAction, QGuiApplication, QKeySequence
from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QMainWindow,
    QMessageBox,
    QStackedWidget,
)

import text_extract
from db import Book, Database, fingerprint_of
from text_extract import ExtractionError
from ui.library_view import LibraryView
from ui.reader_view import ReaderView

APP_NAME = "RSVP Reader"


class MainWindow(QMainWindow):
    def __init__(self, db: Database) -> None:
        super().__init__()
        self.db = db
        self.setWindowTitle(APP_NAME)
        self.resize(920, 560)
        self.setAcceptDrops(True)

        self.library_view = LibraryView(db)
        self.reader_view = ReaderView(db)
        self.stack = QStackedWidget()
        self.stack.addWidget(self.library_view)
        self.stack.addWidget(self.reader_view)
        self.setCentralWidget(self.stack)

        self.library_view.bookActivated.connect(self.open_book)
        self.library_view.addRequested.connect(self.add_books_dialog)
        self.reader_view.backRequested.connect(self.show_library)

        self._build_toolbar()
        self.statusBar().showMessage("Ready")

    def _build_toolbar(self) -> None:
        toolbar = self.addToolBar("Main")
        toolbar.setMovable(False)

        self.library_action = QAction("Library", self)
        self.library_action.setShortcut(QKeySequence("Ctrl+L"))
        self.library_action.triggered.connect(self.show_library)
        toolbar.addAction(self.library_action)

        add_action = QAction("Add book…", self)
        add_action.setShortcut(QKeySequence.StandardKey.Open)
        add_action.triggered.connect(self.add_books_dialog)
        toolbar.addAction(add_action)

        toolbar.addSeparator()
        about_action = QAction("About", self)
        about_action.triggered.connect(self.show_about)
        toolbar.addAction(about_action)

        quit_action = QAction("Quit", self)
        quit_action.setShortcut(QKeySequence.StandardKey.Quit)
        quit_action.triggered.connect(self.close)
        self.addAction(quit_action)

    def show_about(self) -> None:
        """The licence notice the GPL asks an interactive program to show."""
        import main

        QMessageBox.about(
            self,
            f"About {APP_NAME}",
            f"<h3>{APP_NAME} {main.VERSION}</h3>"
            "<p>A local desktop speed reader.</p>"
            "<p>Copyright © 2026 Osman Sahin Guler</p>"
            "<p>This program comes with <b>absolutely no warranty</b>. "
            "It is free software, and you are welcome to redistribute it "
            "under the terms of the GNU General Public License, version 3 "
            "or later.</p>"
            "<p><a href='https://www.gnu.org/licenses/gpl-3.0.html'>"
            "gnu.org/licenses/gpl-3.0.html</a><br>"
            "<a href='https://github.com/HawkOsm/rsvp-reader'>"
            "github.com/HawkOsm/rsvp-reader</a></p>"
            "<p style='color:#8c93a0'>Built with PyQt6 (GPL-3.0) and "
            "PyMuPDF (AGPL-3.0).</p>",
        )

    # ----------------------------------------------------------- navigation

    def show_library(self) -> None:
        self.reader_view.close_book()
        self.library_view.refresh()
        self.stack.setCurrentWidget(self.library_view)
        self.setWindowTitle(APP_NAME)
        self.statusBar().showMessage("Ready")

    # ------------------------------------------------------------- adding

    def add_books_dialog(self) -> None:
        paths, _ = QFileDialog.getOpenFileNames(
            self, "Add to library", str(Path.home()), text_extract.FILE_FILTER
        )
        self.add_paths(paths)

    def add_paths(self, paths) -> None:
        """Add files to the library; open one straight away if it is alone."""
        added: list[Book] = []
        for raw in paths:
            path = Path(raw)
            if not path.is_file():
                continue
            title = text_extract.suggest_title(path)
            added.append(self.db.add_book(path, title))
        if not added:
            return
        self.library_view.refresh()
        if len(added) == 1:
            self.open_book(added[0].id)
        else:
            self.statusBar().showMessage(
                f"Added {len(added)} files to the library", 4000)

    # ------------------------------------------------------------- opening

    def open_book(self, book_id: int) -> None:
        book = self.db.get_book(book_id)
        if book is None:
            return
        if not book.exists:
            QMessageBox.warning(
                self, "File missing",
                f"This file is no longer on disk:\n\n{book.path}")
            return

        tokens = self._tokens_for(book)
        if tokens is None:
            return

        book = self.db.get_book(book_id)  # reload: total_words may have changed
        assert book is not None

        start = self._resume_index(book)
        if start is None:
            return

        self.db.touch_opened(book.id)
        self.reader_view.load_book(book, tokens, start)
        self.stack.setCurrentWidget(self.reader_view)
        self.setWindowTitle(f"{book.title} — {APP_NAME}")
        self.statusBar().showMessage(
            f"{book.total_words:,} words · {Path(book.path).name}")

    def _tokens_for(self, book: Book):
        """Load cached tokens, re-parsing the source file if they are stale."""
        if self.db.tokens_are_fresh(book):
            return self.db.load_tokens(book.id)

        self.statusBar().showMessage(f"Parsing {Path(book.path).name}…")
        QGuiApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        QApplication.processEvents()
        try:
            tokens = text_extract.tokenize_file(book.path)
            self.db.save_tokens(book.id, tokens,
                                fingerprint_of(book.path))
            return tokens
        except (ExtractionError, OSError) as exc:
            QMessageBox.warning(self, "Could not read this file", str(exc))
            return None
        finally:
            QGuiApplication.restoreOverrideCursor()

    def _resume_index(self, book: Book) -> int | None:
        """Ask about resuming.  Returns the start index, or None to cancel."""
        # Nothing meaningful to resume from: at the start, or already finished.
        if book.last_index <= 0 or book.last_index >= book.total_words - 1:
            return 0

        percent = book.progress * 100
        box = QMessageBox(self)
        box.setWindowTitle("Resume?")
        box.setText(f"<b>{book.title}</b>")
        box.setInformativeText(
            f"Resume from word {book.last_index:,} of "
            f"{book.total_words:,} ({percent:.1f}%)?"
        )
        resume = box.addButton("Resume", QMessageBox.ButtonRole.AcceptRole)
        restart = box.addButton("Start over",
                                QMessageBox.ButtonRole.DestructiveRole)
        box.addButton(QMessageBox.StandardButton.Cancel)
        box.setDefaultButton(resume)
        box.exec()

        clicked = box.clickedButton()
        if clicked is resume:
            return book.last_index
        if clicked is restart:
            return 0
        return None

    # ---------------------------------------------------------- drag & drop

    @staticmethod
    def _dropped_paths(mime) -> list[str]:
        paths = []
        for url in mime.urls():
            if not url.isLocalFile():
                continue
            path = Path(url.toLocalFile())
            if path.is_file():
                paths.append(str(path))
        return paths

    def dragEnterEvent(self, event) -> None:  # noqa: N802
        if event.mimeData().hasUrls() and self._dropped_paths(event.mimeData()):
            event.acceptProposedAction()

    def dropEvent(self, event) -> None:  # noqa: N802
        paths = self._dropped_paths(event.mimeData())
        if paths:
            event.acceptProposedAction()
            self.add_paths(paths)

    # ------------------------------------------------------------- closing

    def closeEvent(self, event) -> None:  # noqa: N802
        self.reader_view.close_book()
        self.db.close()
        super().closeEvent(event)
