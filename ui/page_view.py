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

"""The page panel: the real PDF page, with the current word marked on it.

This is the "where am I actually?" view.  It renders the page the current
word sits on, highlights that word, and follows along as you read.  Words
on the page are clickable, so it doubles as a way to jump somewhere.
"""

from __future__ import annotations

from PyQt6.QtCore import QRectF, QSize, Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QImage, QPainter, QPen, QPixmap
from PyQt6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)

from pdf_render import PdfRenderer, RenderedPage
from text_extract import Token
from ui import style

#: Width the panel opens at, and the range the splitter allows.
DEFAULT_WIDTH = 380
MIN_WIDTH = 240

#: Re-rendering while the splitter is being dragged is wasteful; wait for
#: the drag to settle first.
RESIZE_DEBOUNCE_MS = 120

#: A click this many PDF points away from a word still selects it.
CLICK_SLACK = 12.0


class PageCanvas(QWidget):
    """Paints one rendered page plus the highlight for the current word."""

    wordClicked = pyqtSignal(int)  # token index

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._pixmap: QPixmap | None = None
        self._rendered: RenderedPage | None = None
        self._highlight: tuple[float, float, float, float] | None = None
        self._placeable: list[tuple[int, tuple]] = []
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)

    def set_page(self, rendered: RenderedPage | None,
                 placeable: list[tuple[int, tuple]]) -> None:
        """Show a rendered page, and take the (index, bbox) pairs on it."""
        self._rendered = rendered
        self._placeable = placeable
        if rendered is None:
            self._pixmap = None
            self.setFixedSize(1, 1)
        else:
            image = QImage.fromData(rendered.png, "PNG")
            self._pixmap = QPixmap.fromImage(image)
            self.setFixedSize(rendered.width, rendered.height)
        self.update()

    def set_highlight(self, bbox: tuple | None) -> None:
        """Mark a word, given its rectangle in PDF points."""
        if bbox is None or self._rendered is None:
            self._highlight = None
        else:
            self._highlight = self._rendered.rect_to_pixels(bbox)
        self.update()

    def highlight_centre(self) -> tuple[float, float] | None:
        if self._highlight is None:
            return None
        x, y, w, h = self._highlight
        return (x + w / 2, y + h / 2)

    def paintEvent(self, event) -> None:  # noqa: N802
        if self._pixmap is None:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.drawPixmap(0, 0, self._pixmap)

        if self._highlight is not None:
            x, y, w, h = self._highlight
            # Padded a touch so the mark reads as a highlighter stroke
            # rather than a tight box.
            rect = QRectF(x - 1.5, y - 1.5, w + 3, h + 3)
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QColor(255, 90, 95, 70))
            painter.drawRoundedRect(rect, 2, 2)
            pen = QPen(QColor(style.ACCENT))
            pen.setWidthF(2.0)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawLine(
                int(rect.left()), int(rect.bottom()),
                int(rect.right()), int(rect.bottom()))
        painter.end()

    def mousePressEvent(self, event) -> None:  # noqa: N802
        """Clicking a word on the page jumps the reader to it."""
        if self._rendered is None or not self._placeable:
            return
        scale = self._rendered.scale or 1.0
        x = event.position().x() / scale
        y = event.position().y() / scale

        best_index = None
        best_distance = None
        for index, (x0, y0, x1, y1) in self._placeable:
            if x0 <= x <= x1 and y0 <= y <= y1:
                best_index = index
                break
            # Not inside: fall back to the nearest word within a margin.
            dx = max(x0 - x, 0.0, x - x1)
            dy = max(y0 - y, 0.0, y - y1)
            distance = (dx * dx + dy * dy) ** 0.5
            if distance <= CLICK_SLACK and (
                    best_distance is None or distance < best_distance):
                best_distance = distance
                best_index = index
        if best_index is not None:
            self.wordClicked.emit(best_index)


class PagePanel(QWidget):
    """Page image, page counter, and page-step buttons."""

    seekRequested = pyqtSignal(int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setMinimumWidth(MIN_WIDTH)
        self._renderer: PdfRenderer | None = None
        self._tokens: list[Token] = []
        self._by_page: dict[int, list[tuple[int, tuple]]] = {}
        self._page_starts: dict[int, int] = {}
        self._current_page = -1
        self._index = 0

        self._resize_timer = QTimer(self)
        self._resize_timer.setSingleShot(True)
        self._resize_timer.setInterval(RESIZE_DEBOUNCE_MS)
        self._resize_timer.timeout.connect(self._rerender)

        self._build_ui()

    def minimumSizeHint(self) -> QSize:  # noqa: N802
        """Zero, so the splitter can slide the panel all the way shut.

        The practical floor when the panel is open is applied by the reader
        with setMinimumWidth(); without this override the header's buttons
        would set a ~140px floor the close animation could not get past.
        """
        return QSize(0, 0)

    def _build_ui(self) -> None:
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        header = QWidget()
        header.setObjectName("panelHeader")
        # A plain QWidget ignores a stylesheet background without this.
        header.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, True)
        bar = QHBoxLayout(header)
        bar.setContentsMargins(8, 6, 8, 6)
        bar.setSpacing(6)
        self.prev_button = QPushButton("‹")
        self.next_button = QPushButton("›")
        for button in (self.prev_button, self.next_button):
            button.setObjectName("pageStep")
            button.setFixedWidth(28)
            button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.prev_button.clicked.connect(lambda: self._step_page(-1))
        self.next_button.clicked.connect(lambda: self._step_page(1))
        self.page_label = QLabel("—")
        self.page_label.setObjectName("pageCounter")
        self.page_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        bar.addWidget(self.prev_button)
        bar.addWidget(self.page_label, 1)
        bar.addWidget(self.next_button)
        root.addWidget(header)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(False)
        self.scroll.setAlignment(Qt.AlignmentFlag.AlignHCenter
                                 | Qt.AlignmentFlag.AlignTop)
        self.scroll.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.canvas = PageCanvas()
        self.canvas.wordClicked.connect(self.seekRequested.emit)
        self.scroll.setWidget(self.canvas)
        root.addWidget(self.scroll, 1)

        self.notice = QLabel("")
        self.notice.setObjectName("hint")
        self.notice.setWordWrap(True)
        self.notice.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.notice.setVisible(False)
        root.addWidget(self.notice, 1)

    # --------------------------------------------------------------- book

    def set_book(self, renderer: PdfRenderer | None,
                 tokens: list[Token]) -> None:
        """Attach a book.  ``renderer`` is None for files without pages."""
        self._renderer = renderer
        self._tokens = tokens
        self._by_page = {}
        self._page_starts = {}
        self._current_page = -1

        for index, token in enumerate(tokens):
            if not token.has_place:
                continue
            self._by_page.setdefault(token.page, []).append(
                (index, token.bbox))
            self._page_starts.setdefault(token.page, index)

        has_pages = renderer is not None and bool(self._by_page)
        self.scroll.setVisible(has_pages)
        self.notice.setVisible(not has_pages)
        for button in (self.prev_button, self.next_button):
            button.setEnabled(has_pages)
        if not has_pages:
            self.canvas.set_page(None, [])
            self.page_label.setText("no pages")
            self.notice.setText(
                "This file has no pages to show.\n\n"
                "Plain text is just a stream of words — open a PDF to see "
                "the page you are on."
            )

    def clear(self) -> None:
        self.set_book(None, [])

    # ------------------------------------------------------------ position

    def set_index(self, index: int) -> None:
        """Follow the reader to ``index``."""
        self._index = index
        if self._renderer is None or not self._by_page:
            return
        token = self._tokens[index] if 0 <= index < len(self._tokens) else None
        page = token.page if token is not None and token.has_place else None
        if page is None:
            page = self._nearest_page(index)
        if page is None:
            return

        if page != self._current_page:
            self._current_page = page
            self._render_current()
        self.canvas.set_highlight(
            token.bbox if token is not None and token.has_place else None)
        self._update_label()
        self._scroll_to_highlight()

    def _nearest_page(self, index: int) -> int | None:
        """The page of the closest preceding word that has one."""
        for candidate in range(index, -1, -1):
            token = self._tokens[candidate]
            if token.has_place:
                return token.page
        return self._current_page if self._current_page >= 0 else None

    # ------------------------------------------------------------ painting

    def _render_width(self) -> int:
        width = self.scroll.viewport().width()
        bar = self.scroll.verticalScrollBar()
        if bar is not None and bar.isVisible():
            width -= 0  # viewport already excludes the bar
        return max(MIN_WIDTH - 24, width - 16)

    def _render_current(self) -> None:
        if self._renderer is None or self._current_page < 0:
            return
        try:
            rendered = self._renderer.render(
                self._current_page, self._render_width())
        except Exception:
            self.canvas.set_page(None, [])
            return
        self.canvas.set_page(
            rendered, self._by_page.get(self._current_page, []))

    def _rerender(self) -> None:
        if self._current_page < 0:
            return
        self._render_current()
        token = self._tokens[self._index] \
            if 0 <= self._index < len(self._tokens) else None
        self.canvas.set_highlight(
            token.bbox if token is not None and token.has_place else None)
        self._scroll_to_highlight()

    def _scroll_to_highlight(self) -> None:
        centre = self.canvas.highlight_centre()
        if centre is None:
            return
        # A generous vertical margin keeps the word off the panel edge.
        self.scroll.ensureVisible(
            int(centre[0]), int(centre[1]), 20,
            max(40, self.scroll.viewport().height() // 3))

    def _update_label(self) -> None:
        if self._renderer is None:
            return
        self.page_label.setText(
            f"page {self._current_page + 1} / {self._renderer.page_count}")
        self.prev_button.setEnabled(self._current_page > 0)
        self.next_button.setEnabled(
            self._current_page < self._renderer.page_count - 1)

    def _step_page(self, delta: int) -> None:
        """Jump the reader to the first word of the neighbouring page."""
        target = self._current_page + delta
        start = self._page_starts.get(target)
        if start is None:
            return
        self.seekRequested.emit(start)

    def resizeEvent(self, event) -> None:  # noqa: N802
        super().resizeEvent(event)
        self._resize_timer.start()
