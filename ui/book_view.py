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

"""Normal reading: the document laid out as an open book.

By default you get a **two-page spread**, left and right, the way a book
sits open.  A single-page layout is one button away.

Two backends, picked by what the file actually is:

* a PDF shows its **real rendered pages**, so the original layout, figures
  and columns are exactly as typeset;
* plain text has no pages, so its words are **reflowed** into book-shaped
  columns laid out to fit the window.

Either way a page is a range of token indices, so the RSVP position and the
book position are the same number and switching modes keeps your place.
"""

from __future__ import annotations

import bisect

from PyQt6.QtCore import QEvent, QPointF, QRectF, Qt, pyqtSignal
from PyQt6.QtGui import (
    QColor,
    QFont,
    QFontMetricsF,
    QImage,
    QPainter,
    QPixmap,
)
from PyQt6.QtWidgets import (
    QScrollArea,
    QSizePolicy,
    QStackedLayout,
    QWidget,
)

from pdf_render import PdfRenderer, RenderedPage
from text_extract import Token
from ui import style

#: Reading column: serif, generously spaced, and not too wide to scan.
BOOK_FONT_FAMILIES = ["Noto Serif", "DejaVu Serif", "Georgia", "Charter",
                      "Liberation Serif", "serif"]
BOOK_FONT_PX = 18
LINE_SPACING = 1.62
COLUMN_MAX_WIDTH = 620
PAGE_MARGIN_X = 40
PAGE_MARGIN_Y = 22

#: The gap down the middle of an open book.
GUTTER = 38

#: Page layouts.
LAYOUT_SPREAD = "spread"   # two pages, left and right
LAYOUT_SINGLE = "single"   # one page at a time

#: How pages are sized to the window.  "page" shows them whole; "width"
#: fills the width and lets you scroll down.
FIT_PAGE = "page"
FIT_WIDTH = "width"

#: Fraction of the viewport a scroll step covers, so no lines are skipped.
SCROLL_STEP = 0.85


def pages_for(layout: str) -> int:
    return 2 if layout == LAYOUT_SPREAD else 1


class ReflowCanvas(QWidget):
    """Lays plain text out into pages and paints one or two of them."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Expanding,
                           QSizePolicy.Policy.Expanding)
        self._tokens: list[Token] = []
        self._pages: list[list[list[tuple[int, str, float]]]] = []
        self._page_first: list[int] = []
        self._page = 0
        self._highlight = -1
        self._columns = 2
        self._width_cache: dict[str, float] = {}

        self._font = QFont()
        self._font.setFamilies(BOOK_FONT_FAMILIES)
        self._font.setStyleHint(QFont.StyleHint.Serif)
        self._font.setPixelSize(BOOK_FONT_PX)

    # ------------------------------------------------------------- layout

    def set_tokens(self, tokens: list[Token]) -> None:
        self._tokens = tokens
        self._width_cache.clear()
        self.relayout()

    def set_columns(self, columns: int) -> None:
        if columns != self._columns:
            self._columns = columns
            self.relayout()

    @property
    def columns(self) -> int:
        return self._columns

    def _advance(self, metrics: QFontMetricsF, word: str) -> float:
        """Measured width, cached - documents repeat words constantly."""
        width = self._width_cache.get(word)
        if width is None:
            width = metrics.horizontalAdvance(word)
            self._width_cache[word] = width
        return width

    def _geometry(self) -> tuple[float, float]:
        """(column width, left edge of the first column)."""
        available = self.width() - 2 * PAGE_MARGIN_X
        gutters = GUTTER * (self._columns - 1)
        content = min(available,
                      COLUMN_MAX_WIDTH * self._columns + gutters)
        column = (content - gutters) / self._columns
        return column, (self.width() - content) / 2.0

    def relayout(self) -> None:
        """Break the token stream into lines, and lines into pages."""
        self._pages = []
        self._page_first = []
        if not self._tokens:
            return

        metrics = QFontMetricsF(self._font)
        column, _ = self._geometry()
        line_height = metrics.height() * LINE_SPACING
        usable = self.height() - 2 * PAGE_MARGIN_Y
        if column <= 0 or line_height <= 0 or usable < line_height:
            return
        lines_per_page = max(1, int(usable / line_height))

        space = self._advance(metrics, " ")
        pages: list[list] = []
        page: list = []
        line: list = []
        x = 0.0

        def end_line() -> None:
            nonlocal line, x, page
            page.append(line)
            line = []
            x = 0.0
            if len(page) >= lines_per_page:
                pages.append(page)
                page = []

        for index, token in enumerate(self._tokens):
            width = self._advance(metrics, token.text)
            if line and x + space + width > column:
                end_line()
            if line:
                x += space
            line.append((index, token.text, x))
            x += width
            if token.para_end:
                end_line()
                # A gap between paragraphs, unless the page just turned.
                if page:
                    page.append([])
                    if len(page) >= lines_per_page:
                        pages.append(page)
                        page = []
        if line:
            page.append(line)
        if page:
            pages.append(page)

        self._pages = pages
        self._page_first = [
            next((idx for ln in pg for idx, _, _ in ln), 0) for pg in pages
        ]
        # Re-flowing renumbers every page, so the page to show has to be
        # found again from the word being read - clamping the old number
        # would drift, and lands on the last page when the layout grows.
        if self._highlight >= 0:
            page = self.page_of_index(self._highlight)
            self._page = (page // self._columns) * self._columns
        else:
            self._page = min(self._page, max(0, len(pages) - 1))

    # ----------------------------------------------------------- position

    @property
    def page_count(self) -> int:
        return len(self._pages)

    @property
    def page(self) -> int:
        return self._page

    def page_of_index(self, index: int) -> int:
        if not self._page_first:
            return 0
        return max(0, bisect.bisect_right(self._page_first, index) - 1)

    def first_index_of(self, page: int) -> int:
        if not self._page_first:
            return 0
        page = max(0, min(page, len(self._page_first) - 1))
        return self._page_first[page]

    def show_page(self, page: int, highlight: int = -1) -> None:
        self._page = max(0, min(page, max(0, len(self._pages) - 1)))
        self._highlight = highlight
        self.update()

    # ----------------------------------------------------------- painting

    def paintEvent(self, event) -> None:  # noqa: N802
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
        painter.fillRect(self.rect(), QColor(style.BG))
        if not self._pages:
            painter.end()
            return

        painter.setFont(self._font)
        metrics = QFontMetricsF(self._font)
        line_height = metrics.height() * LINE_SPACING
        column, left_edge = self._geometry()

        for slot in range(self._columns):
            page = self._page + slot
            if page >= len(self._pages):
                break
            left = left_edge + slot * (column + GUTTER)
            self._paint_page(painter, metrics, self._pages[page],
                             left, line_height)

        # The crease down the middle of the open book.
        if self._columns == 2 and self._page + 1 < len(self._pages):
            crease = left_edge + column + GUTTER / 2.0
            painter.setPen(QColor(style.BORDER))
            painter.drawLine(int(crease), PAGE_MARGIN_Y,
                             int(crease), self.height() - PAGE_MARGIN_Y)
        painter.end()

    def _paint_page(self, painter: QPainter, metrics: QFontMetricsF,
                    page, left: float, line_height: float) -> None:
        y = PAGE_MARGIN_Y + metrics.ascent()
        for line in page:
            for index, text, offset in line:
                x = left + offset
                if index == self._highlight:
                    width = self._advance(metrics, text)
                    painter.fillRect(
                        QRectF(x - 2, y - metrics.ascent(),
                               width + 4, metrics.height()),
                        QColor(255, 90, 95, 55))
                    painter.setPen(QColor(style.ACCENT))
                else:
                    painter.setPen(QColor(style.TEXT))
                painter.drawText(QPointF(x, y), text)
            y += line_height

    def resizeEvent(self, event) -> None:  # noqa: N802
        super().resizeEvent(event)
        self.relayout()


class PdfSpreadCanvas(QWidget):
    """Paints one or two rendered PDF pages side by side."""

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self._slots: list[tuple[RenderedPage, QPixmap]] = []
        self._highlight: tuple[int, tuple] | None = None

    def set_pages(self, rendered: list[RenderedPage]) -> None:
        self._slots = [
            (page, QPixmap.fromImage(QImage.fromData(page.png, "PNG")))
            for page in rendered
        ]
        if self._slots:
            width = sum(p.width() for _, p in self._slots) \
                + GUTTER * (len(self._slots) - 1)
            height = max(p.height() for _, p in self._slots)
            self.setFixedSize(int(width), int(height))
        else:
            self.setFixedSize(1, 1)
        self.update()

    def set_highlight(self, slot: int, bbox: tuple | None) -> None:
        self._highlight = None if bbox is None else (slot, bbox)
        self.update()

    def _slot_origin(self, slot: int) -> float:
        return sum(
            self._slots[i][1].width() + GUTTER for i in range(slot)
        )

    def paintEvent(self, event) -> None:  # noqa: N802
        if not self._slots:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        for slot, (_, pixmap) in enumerate(self._slots):
            painter.drawPixmap(int(self._slot_origin(slot)), 0, pixmap)

        if self._highlight is not None:
            slot, bbox = self._highlight
            if slot < len(self._slots):
                rendered = self._slots[slot][0]
                bx, by, bw, bh = rendered.rect_to_pixels(bbox)
                x = self._slot_origin(slot) + bx
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(QColor(255, 90, 95, 70))
                painter.drawRoundedRect(
                    QRectF(x - 1.5, by - 1.5, bw + 3, bh + 3), 2, 2)
        painter.end()


class BookView(QWidget):
    """Page-at-a-time reading, backed by whichever canvas suits the file."""

    #: Emitted when turning a page moves the reading position.
    indexChanged = pyqtSignal(int)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._tokens: list[Token] = []
        self._renderer: PdfRenderer | None = None
        self._by_page_first: dict[int, int] = {}
        self._pdf_pages: list[int] = []
        self._index = 0
        self._page = 0
        self._layout = LAYOUT_SPREAD
        self._fit = FIT_PAGE

        self._stack = QStackedLayout(self)
        self._stack.setContentsMargins(0, 0, 0, 0)
        self.reflow = ReflowCanvas()

        self.pdf = PdfSpreadCanvas()
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(False)
        self.scroll.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.scroll.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.scroll.setWidget(self.pdf)

        self._stack.addWidget(self.reflow)
        self._stack.addWidget(self.scroll)

        self._rendering = False
        # The viewport is the thing whose size decides the page scale, and
        # it settles a layout pass after the view is switched to.
        self.scroll.viewport().installEventFilter(self)

    @property
    def is_pdf(self) -> bool:
        return self._renderer is not None

    @property
    def layout_mode(self) -> str:
        return self._layout

    @property
    def fit(self) -> str:
        return self._fit

    @property
    def per_spread(self) -> int:
        return pages_for(self._layout)

    # --------------------------------------------------------------- book

    def set_book(self, renderer: PdfRenderer | None,
                 tokens: list[Token]) -> None:
        self._renderer = renderer
        self._tokens = tokens
        self._by_page_first = {}
        for index, token in enumerate(tokens):
            if token.has_place:
                self._by_page_first.setdefault(token.page, index)
        self._pdf_pages = sorted(self._by_page_first)
        self._page = 0

        if renderer is not None and self._pdf_pages:
            self._stack.setCurrentWidget(self.scroll)
        else:
            self._renderer = None
            self.reflow.set_columns(self.per_spread)
            self.reflow.set_tokens(tokens)
            self._stack.setCurrentWidget(self.reflow)

    # ------------------------------------------------------------ options

    def set_layout_mode(self, mode: str) -> None:
        if mode == self._layout:
            return
        self._layout = mode
        # A spread is meant to be seen whole; a single page usually wants
        # the width.  The reader can still override with the fit button.
        self._fit = FIT_PAGE if mode == LAYOUT_SPREAD else FIT_WIDTH
        self._page = self._spread_start(self._page)
        if self.is_pdf:
            self._render_pdf()
        else:
            # Re-flowing at a new column width renumbers the pages, so the
            # page to show has to come from the reading position.
            self.reflow.set_columns(self.per_spread)
        self.set_index(self._index)

    def set_fit(self, mode: str) -> None:
        self._fit = mode
        if self.is_pdf:
            self._render_pdf(keep_scroll=True)
            self.set_index(self._index)

    def _spread_start(self, page: int) -> int:
        """The left-hand page of the spread that ``page`` belongs to."""
        per = self.per_spread
        return (page // per) * per

    # ----------------------------------------------------------- position

    def set_index(self, index: int) -> None:
        """Show whichever page holds ``index``, without re-emitting."""
        self._index = index
        token = self._tokens[index] if 0 <= index < len(self._tokens) else None

        if self.is_pdf:
            placed = token is not None and token.has_place
            page = token.page if placed else 0
            spread = self._spread_start(page)
            if spread != self._page or not self.pdf._slots:
                self._page = spread
                self._render_pdf()
            self.pdf.set_highlight(
                page - self._page, token.bbox if placed else None)
        else:
            page = self.reflow.page_of_index(index)
            self.reflow.show_page(self._spread_start(page), index)

    @property
    def page_count(self) -> int:
        if self.is_pdf:
            return self._renderer.page_count if self._renderer else 0
        return self.reflow.page_count

    @property
    def current_page(self) -> int:
        return self._page if self.is_pdf else self.reflow.page

    def page_label(self) -> str:
        total = self.page_count
        if not total:
            return "—"
        first = self.current_page + 1
        last = min(first + self.per_spread - 1, total)
        if last > first:
            return f"pages {first}–{last} / {total}"
        return f"page {first} / {total}"

    # ------------------------------------------------------------ drawing

    def _render_pdf(self, keep_scroll: bool = False) -> None:
        """Render the pages of the current spread at the requested size."""
        if self._renderer is None or self._rendering:
            return
        total = self._renderer.page_count
        pages = [p for p in range(self._page, self._page + self.per_spread)
                 if p < total]
        if not pages:
            return

        viewport = self.scroll.viewport()
        margin = 16
        gutters = GUTTER * (len(pages) - 1)
        width = max(80, (viewport.width() - margin - gutters) // len(pages))
        if self._fit == FIT_PAGE:
            aspect = max(self._renderer.page_aspect(p) for p in pages)
            if aspect > 0:
                width = int(min(width, (viewport.height() - margin) / aspect))

        offset = self.scroll.verticalScrollBar().value() if keep_scroll else 0
        self._rendering = True
        try:
            rendered = [self._renderer.render(p, width) for p in pages]
            self.pdf.set_pages(rendered)
            self.scroll.verticalScrollBar().setValue(offset)
        except Exception:
            return
        finally:
            self._rendering = False

    # ------------------------------------------------------------- paging

    def turn(self, delta: int) -> None:
        """Flip to the next or previous spread."""
        self.go_to_page(self._spread_start(self.current_page)
                        + delta * self.per_spread)

    def go_to_page(self, page: int) -> None:
        total = self.page_count
        if not total:
            return
        page = self._spread_start(max(0, min(page, total - 1)))
        if page == self._spread_start(self.current_page):
            return
        if self.is_pdf:
            index = self._first_index_at(page)
            self._page = page
            self._render_pdf()
            self.pdf.set_highlight(0, None)
            self.scroll.verticalScrollBar().setValue(0)
        else:
            index = self.reflow.first_index_of(page)
            self.reflow.show_page(page, index)
        self._index = index
        self.indexChanged.emit(index)

    def _first_index_at(self, page: int) -> int:
        """First word on this spread, falling back to the nearest text."""
        for candidate in range(page, page + self.per_spread):
            if candidate in self._by_page_first:
                return self._by_page_first[candidate]
        if not self._pdf_pages:
            return 0
        nearest = min(self._pdf_pages, key=lambda p: abs(p - page))
        return self._by_page_first[nearest]

    def scroll_or_turn(self, delta: int) -> bool:
        """Scroll down a tall spread first, and only then turn it.

        Returns True if it scrolled, False if the page was turned (or
        there was nowhere left to go).
        """
        if not self.is_pdf:
            self.turn(delta)
            return False
        bar = self.scroll.verticalScrollBar()
        room_left = (bar.value() < bar.maximum()) if delta > 0 \
            else (bar.value() > bar.minimum())
        if bar.maximum() > 0 and room_left:
            step = int(self.scroll.viewport().height() * SCROLL_STEP)
            bar.setValue(bar.value() + step * (1 if delta > 0 else -1))
            return True
        self.turn(delta)
        if delta < 0:  # arriving from below, start at the bottom
            bar.setValue(bar.maximum())
        return False

    def eventFilter(self, obj, event) -> bool:  # noqa: N802
        if (obj is self.scroll.viewport()
                and event.type() == QEvent.Type.Resize and self.is_pdf):
            self._render_pdf(keep_scroll=True)
        return super().eventFilter(obj, event)
