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

"""QTimer-driven RSVP playback.

The engine owns (tokens, index, wpm) and nothing else - it knows how long
to hold each word and when to move on, and emits a signal each time the
displayed word changes.  All drawing lives in ui/reader_view.py.
"""

from __future__ import annotations

from typing import Sequence

from PyQt6.QtCore import QObject, QTimer, Qt, pyqtSignal

from text_extract import Token

# ------------------------------------------------------------------ pacing

#: Words longer than this get extra time, per character over the limit.
LONG_WORD_THRESHOLD = 6
MS_PER_EXTRA_CHAR = 30.0

#: Multipliers applied for the punctuation a word ends on.
SHORT_PAUSE_MULT = 1.5   # , ; : - and friends
LONG_PAUSE_MULT = 2.5    # . ! ? ...

#: Flat extra pause at the end of a paragraph, on top of everything else.
PARAGRAPH_PAUSE_MS = 350.0

MIN_DELAY_MS = 20.0

MIN_WPM = 50
MAX_WPM = 1500
DEFAULT_WPM = 300

_SHORT_PAUSE_CHARS = frozenset(",;:—–")
_LONG_PAUSE_CHARS = frozenset(".!?…")

#: Trailing characters that wrap real punctuation and should be looked past.
_CLOSERS = "\"'’”»)]}*_"


def _core(word: str) -> str:
    """The word without surrounding punctuation/quotes."""
    return word.strip("\"'‘’“”«»()[]{}.,;:!?…—–-*_")


def punctuation_multiplier(word: str) -> float:
    """How much longer to hold a word, based on what it ends with."""
    trimmed = word.rstrip(_CLOSERS)
    if not trimmed:
        return 1.0
    last = trimmed[-1]
    if last in _LONG_PAUSE_CHARS:
        return LONG_PAUSE_MULT
    if last in _SHORT_PAUSE_CHARS:
        return SHORT_PAUSE_MULT
    return 1.0


def delay_for(token: Token, wpm: int) -> float:
    """Milliseconds to hold ``token`` on screen at ``wpm``."""
    base = 60000.0 / max(1, wpm)
    length = len(_core(token.text)) or len(token.text)
    base += MS_PER_EXTRA_CHAR * max(0, length - LONG_WORD_THRESHOLD)
    delay = base * punctuation_multiplier(token.text)
    if token.para_end:
        delay += PARAGRAPH_PAUSE_MS
    return max(MIN_DELAY_MS, delay)


def orp_index(word: str) -> int:
    """Index of the Optimal Recognition Point letter within ``word``.

    Standard heuristic on the *letters* of the word (leading quotes and
    brackets are skipped): 1 letter -> the 1st, 2-5 -> the 2nd, 6-9 -> the
    3rd, 10-13 -> the 4th, longer -> the 5th.
    """
    if not word:
        return 0
    start = 0
    while start < len(word) - 1 and not word[start].isalnum():
        start += 1
    core = _core(word[start:]) or word[start:]
    n = len(core)
    if n <= 1:
        offset = 0
    elif n <= 5:
        offset = 1
    elif n <= 9:
        offset = 2
    elif n <= 13:
        offset = 3
    else:
        offset = 4
    return min(start + offset, len(word) - 1)


# ------------------------------------------------------------------ engine


class RsvpEngine(QObject):
    """Steps through a token list, one word at a time."""

    #: Emitted whenever the displayed word changes (also on seek/load).
    wordChanged = pyqtSignal(int)
    #: Emitted when playback starts or stops.
    playingChanged = pyqtSignal(bool)
    #: Emitted once the last word has been held for its full delay.
    finished = pyqtSignal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._tokens: list[Token] = []
        self._index = 0
        self._wpm = DEFAULT_WPM
        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.setTimerType(Qt.TimerType.PreciseTimer)
        self._timer.timeout.connect(self._advance)

    # ------------------------------------------------------------ state

    @property
    def tokens(self) -> list[Token]:
        return self._tokens

    @property
    def count(self) -> int:
        return len(self._tokens)

    @property
    def index(self) -> int:
        return self._index

    @property
    def current_token(self) -> Token | None:
        if 0 <= self._index < len(self._tokens):
            return self._tokens[self._index]
        return None

    @property
    def wpm(self) -> int:
        return self._wpm

    @property
    def is_playing(self) -> bool:
        return self._timer.isActive()

    @property
    def at_end(self) -> bool:
        return self._index >= len(self._tokens) - 1

    def progress(self) -> float:
        if not self._tokens:
            return 0.0
        return self._index / len(self._tokens)

    # ----------------------------------------------------------- control

    def load(self, tokens: Sequence[Token], index: int = 0) -> None:
        self.pause()
        self._tokens = list(tokens)
        self._index = self._clamp(index)
        self.wordChanged.emit(self._index)

    def set_wpm(self, wpm: int) -> None:
        """Live-adjustable: the next word already uses the new rate."""
        self._wpm = max(MIN_WPM, min(MAX_WPM, int(wpm)))

    def play(self) -> None:
        if not self._tokens or self.is_playing:
            return
        if self.at_end:
            # Restarting after the end rewinds rather than doing nothing.
            self.seek(0)
        self._schedule()
        self.playingChanged.emit(True)

    def pause(self) -> None:
        if self._timer.isActive():
            self._timer.stop()
            self.playingChanged.emit(False)

    def toggle(self) -> None:
        self.pause() if self.is_playing else self.play()

    def seek(self, index: int) -> None:
        """Jump to an absolute index, keeping play/pause state."""
        if not self._tokens:
            return
        self._index = self._clamp(index)
        self.wordChanged.emit(self._index)
        if self.is_playing:
            self._schedule()

    def skip(self, delta: int) -> None:
        self.seek(self._index + delta)

    # ---------------------------------------------------------- internals

    def _clamp(self, index: int) -> int:
        if not self._tokens:
            return 0
        return max(0, min(int(index), len(self._tokens) - 1))

    def _schedule(self) -> None:
        token = self.current_token
        if token is None:
            return
        self._timer.start(round(delay_for(token, self._wpm)))

    def _advance(self) -> None:
        if self._index >= len(self._tokens) - 1:
            self.playingChanged.emit(False)
            self.finished.emit()
            return
        self._index += 1
        self.wordChanged.emit(self._index)
        self._schedule()
