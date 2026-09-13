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

"""Rendering PDF pages to images for the page panel.

Kept apart from text_extract.py because this is about showing pages, not
reading words out of them.  One renderer is held open per book so paging
around does not reopen the file each time.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from text_extract import import_fitz, open_pdf

#: How many rendered pages to keep in memory.
CACHE_SIZE = 6

#: Never ask PyMuPDF for something silly if the panel is mid-animation.
MIN_RENDER_WIDTH = 80
MAX_RENDER_WIDTH = 2000


@dataclass(frozen=True)
class RenderedPage:
    """A page image, plus what is needed to place word boxes on it."""

    png: bytes
    width: int
    height: int
    scale: float  # image pixels per PDF point

    def rect_to_pixels(
        self, bbox: tuple[float, float, float, float]
    ) -> tuple[float, float, float, float]:
        """A word's PDF-point rectangle -> pixel rectangle on this image."""
        x0, y0, x1, y1 = bbox
        return (x0 * self.scale, y0 * self.scale,
                (x1 - x0) * self.scale, (y1 - y0) * self.scale)


class PdfRenderer:
    """Renders pages of one PDF, caching the most recent few."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._doc = open_pdf(path)
        self._fitz = import_fitz()
        self._cache: dict[tuple[int, int], RenderedPage] = {}
        self._order: list[tuple[int, int]] = []
        self._closed = False

    @property
    def page_count(self) -> int:
        """Zero once closed, so a stale reference cannot raise."""
        if self._closed:
            return 0
        return self._doc.page_count

    def page_aspect(self, page_no: int) -> float:
        """Height / width, so the panel can size a placeholder."""
        if self._closed:
            return 1.414
        rect = self._doc[self._clamp(page_no)].rect
        if rect.width <= 0:
            return 1.414
        return rect.height / rect.width

    def render(self, page_no: int, target_width: int) -> RenderedPage:
        if self._closed:
            raise ValueError("renderer is closed")
        page_no = self._clamp(page_no)
        width = int(max(MIN_RENDER_WIDTH, min(MAX_RENDER_WIDTH, target_width)))
        # Snap to 8px steps so dragging the splitter does not re-render
        # on every single pixel of movement.
        width -= width % 8
        key = (page_no, width)

        cached = self._cache.get(key)
        if cached is not None:
            self._touch(key)
            return cached

        page = self._doc[page_no]
        scale = width / page.rect.width if page.rect.width else 1.0
        pixmap = page.get_pixmap(
            matrix=self._fitz.Matrix(scale, scale), alpha=False)
        rendered = RenderedPage(
            png=pixmap.tobytes("png"),
            width=pixmap.width,
            height=pixmap.height,
            scale=scale,
        )
        self._cache[key] = rendered
        self._touch(key)
        while len(self._order) > CACHE_SIZE:
            self._cache.pop(self._order.pop(0), None)
        return rendered

    def close(self) -> None:
        self._closed = True
        self._cache.clear()
        self._order.clear()
        try:
            self._doc.close()
        except Exception:
            pass

    # ---------------------------------------------------------- internals

    def _clamp(self, page_no: int) -> int:
        return max(0, min(int(page_no), max(0, self.page_count - 1)))

    def _touch(self, key: tuple[int, int]) -> None:
        if key in self._order:
            self._order.remove(key)
        self._order.append(key)
