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

"""The reader: a fixed-position RSVP word display plus transport controls."""

from __future__ import annotations

from pathlib import Path

from PyQt6.QtCore import (
    QEasingCurve,
    QPointF,
    QRectF,
    QSettings,
    Qt,
    QVariantAnimation,
    pyqtSignal,
)
from PyQt6.QtGui import QColor, QFont, QFontMetricsF, QPainter, QPen
from PyQt6.QtWidgets import (
    QAbstractSpinBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSizePolicy,
    QSlider,
    QSpinBox,
    QSplitter,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

import rsvp_engine
import text_extract
from ui import book_view
from db import Book, Database
from pdf_render import PdfRenderer
from rsvp_engine import RsvpEngine, orp_index
from ui import style
from ui.page_view import DEFAULT_WIDTH as PANEL_WIDTH
from ui.page_view import MIN_WIDTH as PANEL_MIN_WIDTH
from ui.book_view import BookView
from ui.page_view import PagePanel

#: Write the resume position to SQLite every this many words.
SAVE_EVERY = 20

#: Horizontal position of the ORP letter, as a fraction of the widget width.
FOCUS_X_RATIO = 0.42

#: Word display font, largest first - the first one installed wins.
FONT_FAMILIES = [
    "Inter",
    "Noto Sans",
    "DejaVu Sans",
    "Liberation Sans",
    "Helvetica Neue",
    "Arial",
]
BASE_FONT_PX = 56

#: How long the page panel takes to slide in or out.
PANEL_SLIDE_MS = 180


class RsvpDisplay(QWidget):
    """Draws one word with its ORP letter pinned to a fixed screen pixel.

    Each word is offset horizontally by the measured advance width of the
    characters before its ORP letter (plus half that letter), so the
    highlighted letter lands on exactly the same x every time and the eye
    never has to move.
    """

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setMinimumHeight(200)
        self.setSizePolicy(QSizePolicy.Policy.Expanding,
                           QSizePolicy.Policy.Expanding)
        self._word = ""
        self._orp = 0
        self._font = QFont()
        self._font.setFamilies(FONT_FAMILIES)
        self._font.setStyleHint(QFont.StyleHint.SansSerif)
        self._font.setPixelSize(BASE_FONT_PX)
        self._font.setWeight(QFont.Weight.Medium)

    def set_word(self, word: str) -> None:
        self._word = word
        self._orp = orp_index(word) if word else 0
        self.update()

    def clear(self) -> None:
        self.set_word("")

    def focus_x(self) -> float:
        return self.width() * FOCUS_X_RATIO

    def _fitted_font(self, focus_x: float) -> QFont:
        """Shrink the font if the current word would not fit around the
        focus point.

        The word is pinned by its ORP letter, so the two sides have to be
        checked separately: only ``focus_x`` pixels are available to the
        left, and only the rest of the widget to the right.
        """
        font = QFont(self._font)
        if not self._word or self.width() <= 0:
            return font

        margin = 12.0
        room_left = max(1.0, focus_x - margin)
        room_right = max(1.0, self.width() - focus_x - margin)

        # Two passes: font metrics do not scale perfectly linearly, so the
        # first estimate is verified and nudged down again if needed.
        for _ in range(2):
            metrics = QFontMetricsF(font)
            half = metrics.horizontalAdvance(self._word[self._orp]) / 2.0
            need_left = metrics.horizontalAdvance(self._word[: self._orp]) + half
            need_right = half + metrics.horizontalAdvance(
                self._word[self._orp + 1 :])
            scale = min(1.0, room_left / max(need_left, 0.01),
                        room_right / max(need_right, 0.01))
            if scale >= 0.999:
                break
            size = max(12, int(font.pixelSize() * scale))
            if size == font.pixelSize():
                break
            font.setPixelSize(size)
        return font

    def paintEvent(self, event) -> None:  # noqa: N802 (Qt naming)
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
        painter.fillRect(self.rect(), QColor(style.BG))

        focus_x = self.focus_x()
        centre_y = self.height() / 2.0

        font = self._fitted_font(focus_x)
        painter.setFont(font)
        metrics = QFontMetricsF(font)

        self._draw_guides(painter, focus_x, centre_y, metrics)

        if not self._word:
            painter.end()
            return

        prefix = self._word[: self._orp]
        letter = self._word[self._orp]
        suffix = self._word[self._orp + 1 :]

        # Left edge such that the middle of the ORP letter sits on focus_x.
        x = focus_x - metrics.horizontalAdvance(prefix) \
            - metrics.horizontalAdvance(letter) / 2.0
        baseline = centre_y + metrics.capHeight() / 2.0

        # Drawn segment by segment so the ORP letter can take its own colour.
        painter.setPen(QColor(style.TEXT))
        painter.drawText(QPointF(x, baseline), prefix)
        x += metrics.horizontalAdvance(prefix)

        painter.setPen(QColor(style.ACCENT))
        painter.drawText(QPointF(x, baseline), letter)
        x += metrics.horizontalAdvance(letter)

        painter.setPen(QColor(style.TEXT))
        painter.drawText(QPointF(x, baseline), suffix)
        painter.end()

    def _draw_guides(self, painter: QPainter, focus_x: float,
                     centre_y: float, metrics: QFontMetricsF) -> None:
        """Small tick marks above and below the focus point."""
        pen = QPen(QColor(style.GUIDE))
        pen.setWidth(2)
        painter.setPen(pen)
        half = metrics.height() * 0.75
        painter.drawLine(int(focus_x), int(centre_y - half - 14),
                         int(focus_x), int(centre_y - half))
        painter.drawLine(int(focus_x), int(centre_y + half),
                         int(focus_x), int(centre_y + half + 14))


class ScrubBar(QWidget):
    """A thin progress bar you can click or drag to seek."""

    scrubbed = pyqtSignal(float)  # fraction 0.0 - 1.0

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setFixedHeight(16)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._fraction = 0.0

    def set_fraction(self, fraction: float) -> None:
        self._fraction = max(0.0, min(1.0, fraction))
        self.update()

    def paintEvent(self, event) -> None:  # noqa: N802
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        y = self.height() / 2.0 - 2
        track = QRectF(0, y, self.width(), 4)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(style.BORDER))
        painter.drawRoundedRect(track, 2, 2)
        if self._fraction > 0:
            filled = QRectF(0, y, self.width() * self._fraction, 4)
            painter.setBrush(QColor(style.ACCENT))
            painter.drawRoundedRect(filled, 2, 2)
        painter.end()

    def _emit_for(self, x: float) -> None:
        if self.width() > 0:
            self.scrubbed.emit(max(0.0, min(1.0, x / self.width())))

    def mousePressEvent(self, event) -> None:  # noqa: N802
        self._emit_for(event.position().x())

    def mouseMoveEvent(self, event) -> None:  # noqa: N802
        if event.buttons() & Qt.MouseButton.LeftButton:
            self._emit_for(event.position().x())


class ReaderView(QWidget):
    """RSVP display + progress + WPM + play/pause, wired to an RsvpEngine."""

    backRequested = pyqtSignal()

    def __init__(self, db: Database, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.db = db
        self.book: Book | None = None
        self.engine = RsvpEngine(self)
        self._unsaved = 0
        self._renderer: PdfRenderer | None = None
        self._book_mode = False
        self._settings = QSettings("rsvp-reader", "rsvp-reader")
        self._panel_open = self._settings.value(
            "page_panel_open", False, type=bool)
        self._book_layout = self._settings.value(
            "book_layout", book_view.LAYOUT_SPREAD, type=str)

        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self._build_ui()

        self.engine.wordChanged.connect(self._on_word_changed)
        self.engine.playingChanged.connect(self._on_playing_changed)
        self.engine.finished.connect(self._on_finished)
        self.scrub.scrubbed.connect(self._on_scrubbed)
        self.page_panel.seekRequested.connect(self._on_page_seek)

    # ------------------------------------------------------------- layout

    def _build_ui(self) -> None:
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)

        self.splitter = QSplitter(Qt.Orientation.Horizontal)
        self.splitter.setHandleWidth(1)
        outer.addWidget(self.splitter)

        reading_side = QWidget()
        self.splitter.addWidget(reading_side)
        self.page_panel = PagePanel()
        self.page_panel.setMinimumWidth(0)   # so it can slide shut
        self.page_panel.setVisible(False)
        self.splitter.addWidget(self.page_panel)
        self.splitter.setStretchFactor(0, 1)
        self.splitter.setStretchFactor(1, 0)
        self.splitter.setCollapsible(0, False)  # never squash the reader
        self.splitter.setCollapsible(1, True)   # the panel may slide shut

        self._slide = QVariantAnimation(self)
        self._slide.setDuration(PANEL_SLIDE_MS)
        self._slide.setEasingCurve(QEasingCurve.Type.InOutCubic)
        self._slide.valueChanged.connect(self._apply_panel_width)
        self._slide.finished.connect(self._on_slide_finished)

        root = QVBoxLayout(reading_side)
        root.setContentsMargins(24, 16, 24, 20)
        root.setSpacing(14)

        header = QHBoxLayout()
        self.back_button = QPushButton("‹  Library")
        self.back_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.back_button.clicked.connect(self._on_back)
        self.title_label = QLabel("")
        self.title_label.setObjectName("title")
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.mode_button = QPushButton("Book")
        self.mode_button.setCheckable(True)
        self.mode_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.mode_button.setToolTip("Read normally, a page at a time  (B)")
        self.mode_button.clicked.connect(lambda: self.toggle_book_mode())

        self.panel_button = QPushButton("Page  ›")
        self.panel_button.setCheckable(True)
        self.panel_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.panel_button.setToolTip("Show the page you are on  (P)")
        self.panel_button.clicked.connect(lambda: self.toggle_page_panel())
        # Equal widths keep the title optically centred between them.
        edge = max(self.back_button.sizeHint().width(),
                   self.panel_button.sizeHint().width())
        self.back_button.setFixedWidth(edge)
        self.panel_button.setFixedWidth(edge)

        header.addWidget(self.back_button)
        header.addStretch(1)
        header.addWidget(self.title_label)
        header.addStretch(1)
        header.addWidget(self.mode_button)
        header.addWidget(self.panel_button)
        # Balance the wider right-hand group so the title stays centred.
        right_width = (self.mode_button.sizeHint().width() + edge + 6)
        self.header_spacer = QWidget()
        self.header_spacer.setFixedWidth(max(0, right_width - edge))
        header.insertWidget(1, self.header_spacer)
        root.addLayout(header)

        self.display = RsvpDisplay()
        self.book_view = BookView()
        self.book_view.indexChanged.connect(self._on_book_paged)
        self.content = QStackedWidget()
        self.content.addWidget(self.display)     # 0 - RSVP
        self.content.addWidget(self.book_view)   # 1 - book
        root.addWidget(self.content, 1)

        self.scrub = ScrubBar()
        root.addWidget(self.scrub)

        self.controls_stack = QStackedWidget()
        self.controls_stack.setSizePolicy(QSizePolicy.Policy.Preferred,
                                          QSizePolicy.Policy.Fixed)
        rsvp_controls = QWidget()
        controls = QHBoxLayout(rsvp_controls)
        controls.setContentsMargins(0, 0, 0, 0)
        controls.setSpacing(10)

        self.play_button = QPushButton("Play")
        self.play_button.setObjectName("primary")
        self.play_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.play_button.setFixedWidth(92)
        self.play_button.clicked.connect(self.engine.toggle)
        controls.addWidget(self.play_button)

        self.counter_label = QLabel("")
        self.counter_label.setObjectName("counter")
        controls.addWidget(self.counter_label)
        controls.addStretch(1)

        controls.addWidget(QLabel("WPM"))
        self.wpm_slider = QSlider(Qt.Orientation.Horizontal)
        self.wpm_slider.setRange(rsvp_engine.MIN_WPM, rsvp_engine.MAX_WPM)
        self.wpm_slider.setFixedWidth(200)
        self.wpm_slider.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.wpm_spin = QSpinBox()
        self.wpm_spin.setRange(rsvp_engine.MIN_WPM, rsvp_engine.MAX_WPM)
        self.wpm_spin.setSingleStep(25)
        # No up/down arrows: the slider, typing, and the up/down keys are
        # the ways to change speed, and tiny spin arrows render poorly.
        self.wpm_spin.setButtonSymbols(
            QAbstractSpinBox.ButtonSymbols.NoButtons)
        self.wpm_spin.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.wpm_spin.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.wpm_slider.valueChanged.connect(self.wpm_spin.setValue)
        self.wpm_spin.valueChanged.connect(self.wpm_slider.setValue)
        self.wpm_spin.valueChanged.connect(self.engine.set_wpm)
        controls.addWidget(self.wpm_slider)
        controls.addWidget(self.wpm_spin)
        self.controls_stack.addWidget(rsvp_controls)

        book_controls = QWidget()
        turning = QHBoxLayout(book_controls)
        turning.setContentsMargins(0, 0, 0, 0)
        turning.setSpacing(10)
        self.prev_page_button = QPushButton("‹  Previous")
        self.next_page_button = QPushButton("Next  ›")
        for button, delta in ((self.prev_page_button, -1),
                              (self.next_page_button, 1)):
            button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
            button.setFixedWidth(116)
            button.clicked.connect(lambda _, d=delta: self._turn_page(d))
        self.book_page_label = QLabel("—")
        self.book_page_label.setObjectName("counter")
        self.book_page_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.layout_button = QPushButton("Single page")
        self.layout_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.layout_button.setFixedWidth(110)
        self.layout_button.setToolTip("Show one page instead of a spread  (D)")
        self.layout_button.clicked.connect(self._toggle_layout)
        self.fit_button = QPushButton("Fit width")
        self.fit_button.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.fit_button.setFixedWidth(96)
        self.fit_button.setToolTip("Fill the width and scroll down  (F)")
        self.fit_button.clicked.connect(self._toggle_fit)
        turning.addWidget(self.prev_page_button)
        turning.addStretch(1)
        turning.addWidget(self.book_page_label)
        turning.addStretch(1)
        turning.addWidget(self.layout_button)
        turning.addWidget(self.fit_button)
        turning.addWidget(self.next_page_button)
        self.controls_stack.addWidget(book_controls)
        root.addWidget(self.controls_stack)

        self.hint_label = QLabel("")
        self.hint_label.setObjectName("hint")
        self.hint_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.hint_label)

        self._update_hint()
        self.set_wpm(rsvp_engine.DEFAULT_WPM)

    # ---------------------------------------------------------- book mode

    def toggle_book_mode(self, on: bool | None = None) -> None:
        """Switch between word-at-a-time and page-at-a-time reading."""
        target = (not self._book_mode) if on is None else bool(on)
        if target == self._book_mode:
            return
        self._book_mode = target
        self.mode_button.setChecked(target)
        self.mode_button.setText("RSVP" if target else "Book")
        self.mode_button.setToolTip(
            "Back to one word at a time  (B)" if target
            else "Read normally, a page at a time  (B)")

        if target:
            # Flashing words while reading a page would be absurd.
            self.engine.pause()
            self.book_view.set_layout_mode(self._book_layout)
            self.book_view.set_book(self._renderer, self.engine.tokens)
            self.book_view.set_index(self.engine.index)
            self.content.setCurrentWidget(self.book_view)
            self.controls_stack.setCurrentIndex(1)
            self._sync_book_buttons()
        else:
            self.content.setCurrentWidget(self.display)
            self.controls_stack.setCurrentIndex(0)
            self.display.set_word(
                self.engine.current_token.text
                if self.engine.current_token else "")
        self._update_hint()
        self._refresh_readout()
        self.setFocus()

    def _update_hint(self) -> None:
        if self._book_mode:
            self.hint_label.setText(
                "space/→ onward   ←/↑ back   pgup/pgdn turn the page   "
                "d one page or two   f fit   b back to rsvp   esc library")
        else:
            self.hint_label.setText(
                "space play/pause   ←/→ skip a word   shift+←/→ ten   "
                "↑/↓ speed   b book mode   p page view   esc library")

    def _turn_page(self, delta: int) -> None:
        self.book_view.turn(delta)
        self._refresh_readout()

    def _toggle_layout(self) -> None:
        """An open book of two pages, or a single page on its own."""
        to_single = self.book_view.layout_mode == book_view.LAYOUT_SPREAD
        self._book_layout = (book_view.LAYOUT_SINGLE if to_single
                             else book_view.LAYOUT_SPREAD)
        self._settings.setValue("book_layout", self._book_layout)
        self.book_view.set_layout_mode(self._book_layout)
        self._sync_book_buttons()
        self._refresh_readout()

    def _toggle_fit(self) -> None:
        """Whole page at once, or filling the width and scrolling down it."""
        to_page = self.book_view.fit == book_view.FIT_WIDTH
        self.book_view.set_fit(
            book_view.FIT_PAGE if to_page else book_view.FIT_WIDTH)
        self._sync_book_buttons()

    def _sync_book_buttons(self) -> None:
        """Each button is labelled with what it will do next."""
        spread = self.book_view.layout_mode == book_view.LAYOUT_SPREAD
        self.layout_button.setText("Single page" if spread else "Two pages")
        self.layout_button.setToolTip(
            "Show one page instead of a spread  (D)" if spread
            else "Show two pages, like an open book  (D)")

        showing_whole = self.book_view.fit == book_view.FIT_PAGE
        self.fit_button.setText("Fit width" if showing_whole else "Fit page")
        self.fit_button.setToolTip(
            "Fill the width and scroll down  (F)" if showing_whole
            else "Show the whole spread at once  (F)")
        self.fit_button.setVisible(self.book_view.is_pdf)

    def _on_book_paged(self, index: int) -> None:
        """The book view turned a page; take the reading position with it."""
        self.engine.seek(index)
        self._refresh_readout()

    # --------------------------------------------------------- page panel

    def toggle_page_panel(self, show: bool | None = None) -> None:
        """Slide the page panel in or out."""
        target_open = (not self._panel_open) if show is None else bool(show)
        if target_open == self._panel_open and not self._slide.state():
            # Already in the requested state; just make sure the button agrees.
            self._sync_panel_button()
            return

        self._panel_open = target_open
        self._settings.setValue("page_panel_open", target_open)
        self._sync_panel_button()

        self._slide.stop()
        # The drag-resize floor has to come off in both directions, or the
        # splitter refuses to animate the panel below it.
        self.page_panel.setMinimumWidth(0)

        start = self.page_panel.width() if self.page_panel.isVisible() else 0
        if target_open:
            start = 0
            self.page_panel.setVisible(True)
            self._apply_panel_width(0)   # start shut, so it slides open
            self.page_panel.set_book(self._renderer, self.engine.tokens)
            self.page_panel.set_index(self.engine.index)

        self._slide.setStartValue(float(start))
        self._slide.setEndValue(float(PANEL_WIDTH if target_open else 0))
        self._slide.start()

    def _apply_panel_width(self, width) -> None:
        total = self.splitter.width() - self.splitter.handleWidth()
        width = int(width)
        self.splitter.setSizes([max(0, total - width), width])

    def _on_slide_finished(self) -> None:
        if self._panel_open:
            # Restore the drag-resize floor now that it is fully open.
            self.page_panel.setMinimumWidth(PANEL_MIN_WIDTH)
        else:
            self.page_panel.setVisible(False)

    def _sync_panel_button(self) -> None:
        # A book without pages can never show the panel, whatever the
        # remembered preference says.
        showing = self._panel_open and self._renderer is not None
        self.panel_button.setChecked(showing)
        self.panel_button.setText("Page  ‹" if showing else "Page  ›")

    def _on_page_seek(self, index: int) -> None:
        self.engine.seek(index)

    # ------------------------------------------------------------ loading

    def set_wpm(self, wpm: int) -> None:
        self.wpm_spin.setValue(wpm)
        self.wpm_slider.setValue(wpm)
        self.engine.set_wpm(wpm)

    def load_book(self, book: Book, tokens, start_index: int = 0) -> None:
        self.flush_progress()
        # Leave book mode and drop the old renderer before the engine emits
        # anything, or the readout would reach for a closed document.
        self.toggle_book_mode(False)
        self._release_renderer()
        self.book = book
        self.title_label.setText(book.title)
        self.engine.load(tokens, start_index)
        self._unsaved = 0

        self._renderer = self._make_renderer(book)
        self.page_panel.set_book(self._renderer, tokens)
        self.panel_button.setEnabled(self._renderer is not None)
        self.panel_button.setToolTip(
            "Show the page you are on  (P)" if self._renderer
            else "Only PDFs have pages to show")
        self._sync_panel_button()
        self._restore_panel()
        self.book_view.set_book(self._renderer, tokens)

        self._refresh_readout()
        self.setFocus()

    @staticmethod
    def _make_renderer(book: Book) -> PdfRenderer | None:
        """A renderer for PDFs; None for anything without pages."""
        if Path(book.path).suffix.lower() not in text_extract.PDF_SUFFIXES:
            return None
        try:
            return PdfRenderer(book.path)
        except Exception:
            return None  # unreadable as a PDF: just do without the panel

    def _restore_panel(self) -> None:
        """Re-open the panel if it was open last time, without animating."""
        wanted = self._panel_open and self._renderer is not None
        self._slide.stop()
        self.page_panel.setVisible(wanted)
        if wanted:
            self.page_panel.setMinimumWidth(PANEL_MIN_WIDTH)
            self._apply_panel_width(PANEL_WIDTH)
            self.page_panel.set_index(self.engine.index)

    def _release_renderer(self) -> None:
        # Both views must let go before the document is closed under them.
        self.page_panel.clear()
        self.book_view.set_book(None, [])
        if self._renderer is not None:
            self._renderer.close()
            self._renderer = None

    def close_book(self) -> None:
        self.engine.pause()
        self.flush_progress()
        self._release_renderer()
        self.book = None
        self.display.clear()

    # ------------------------------------------------------------ signals

    def _on_word_changed(self, index: int) -> None:
        token = self.engine.current_token
        self.display.set_word(token.text if token else "")
        if self.page_panel.isVisible():
            self.page_panel.set_index(index)
        if self._book_mode:
            self.book_view.set_index(index)
        self._refresh_readout()
        self._unsaved += 1
        if self._unsaved >= SAVE_EVERY:
            self.flush_progress()

    def _on_playing_changed(self, playing: bool) -> None:
        self.play_button.setText("Pause" if playing else "Play")
        if not playing:
            self.flush_progress()

    def _on_finished(self) -> None:
        self.play_button.setText("Play")
        self.flush_progress()

    def _on_scrubbed(self, fraction: float) -> None:
        if self.engine.count:
            self.engine.seek(round(fraction * (self.engine.count - 1)))

    def _on_back(self) -> None:
        self.engine.pause()
        self.flush_progress()
        self.backRequested.emit()

    def _refresh_readout(self) -> None:
        total = self.engine.count
        current = self.engine.index + 1 if total else 0
        percent = (current / total * 100.0) if total else 0.0
        if self._book_mode:
            self.book_page_label.setText(self.book_view.page_label())
            page_no = self.book_view.current_page
            last = self.book_view.page_count - 1
            self.prev_page_button.setEnabled(page_no > 0)
            # A spread of two steps two: there is no next unless a whole
            # further spread exists.
            self.next_page_button.setEnabled(
                page_no + self.book_view.per_spread <= last)

        readout = f"word {current:,} / {total:,}   ·   {percent:.1f}%"
        page = self._current_page_label()
        if page:
            readout += f"   ·   {page}"
        self.counter_label.setText(readout)
        self.scrub.set_fraction(self.engine.progress())

    def _current_page_label(self) -> str:
        """"page 12 / 340" for PDFs, empty for anything without pages."""
        if self._renderer is None:
            return ""
        token = self.engine.current_token
        if token is None or not token.has_place:
            return ""
        return f"page {token.page + 1} / {self._renderer.page_count}"

    # --------------------------------------------------------- persistence

    def flush_progress(self) -> None:
        """Write the current word index to SQLite."""
        if self.book is None:
            return
        self.db.update_progress(self.book.id, self.engine.index)
        self.book.last_index = self.engine.index
        self._unsaved = 0

    # ------------------------------------------------------------ keyboard

    def keyPressEvent(self, event) -> None:  # noqa: N802
        key = event.key()
        shift = event.modifiers() & Qt.KeyboardModifier.ShiftModifier
        step = 10 if shift else 1

        if key == Qt.Key.Key_B:
            self.toggle_book_mode()
            event.accept()
            return

        if self._book_mode:
            # In book mode every navigation key turns a page.
            if key in (Qt.Key.Key_Right, Qt.Key.Key_Space, Qt.Key.Key_Down):
                # Down a tall page first; turn it only at the bottom.
                self.book_view.scroll_or_turn(1)
                self._refresh_readout()
            elif key in (Qt.Key.Key_Left, Qt.Key.Key_Up):
                self.book_view.scroll_or_turn(-1)
                self._refresh_readout()
            elif key == Qt.Key.Key_PageDown:
                self._turn_page(1)
            elif key == Qt.Key.Key_PageUp:
                self._turn_page(-1)
            elif key == Qt.Key.Key_D:
                self._toggle_layout()
            elif key == Qt.Key.Key_F:
                if self.fit_button.isVisible():
                    self._toggle_fit()
            elif key == Qt.Key.Key_Home:
                self.book_view.go_to_page(0)
                self._refresh_readout()
            elif key == Qt.Key.Key_End:
                self.book_view.go_to_page(self.book_view.page_count - 1)
                self._refresh_readout()
            elif key == Qt.Key.Key_P:
                if self.panel_button.isEnabled():
                    self.toggle_page_panel()
            elif key == Qt.Key.Key_Escape:
                self._on_back()
            else:
                super().keyPressEvent(event)
                return
            event.accept()
            return

        if key == Qt.Key.Key_Space:
            self.engine.toggle()
        elif key == Qt.Key.Key_Left:
            self.engine.skip(-step)
        elif key == Qt.Key.Key_Right:
            self.engine.skip(step)
        elif key == Qt.Key.Key_Up:
            self.wpm_spin.setValue(self.wpm_spin.value() + 25)
        elif key == Qt.Key.Key_Down:
            self.wpm_spin.setValue(self.wpm_spin.value() - 25)
        elif key == Qt.Key.Key_Home:
            self.engine.seek(0)
        elif key == Qt.Key.Key_End:
            self.engine.seek(self.engine.count - 1)
        elif key == Qt.Key.Key_P:
            if self.panel_button.isEnabled():
                self.toggle_page_panel()
        elif key == Qt.Key.Key_Escape:
            self._on_back()
        else:
            super().keyPressEvent(event)
            return
        event.accept()
