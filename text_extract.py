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

"""Document -> token list.

The whole pipeline is: read the file, normalise the raw text into
paragraphs, then split paragraphs on whitespace.  Punctuation stays glued
to its word ("word," not "word" + ",") because the pacing logic in
rsvp_engine.py reads the trailing character to decide how long to hold.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

TEXT_SUFFIXES = {".txt", ".md", ".markdown", ".text", ".rst", ".org"}
PDF_SUFFIXES = {".pdf"}
SUPPORTED_SUFFIXES = TEXT_SUFFIXES | PDF_SUFFIXES

#: Filter string for QFileDialog.
FILE_FILTER = (
    "Readable documents (*.txt *.md *.markdown *.text *.rst *.org *.pdf);;"
    "Plain text (*.txt *.md *.markdown *.text *.rst *.org);;"
    "PDF (*.pdf);;All files (*)"
)


@dataclass(frozen=True, slots=True)
class Token:
    """One displayed word.

    ``para_end`` marks the last word of a paragraph so the engine can add
    a flat breathing pause there.

    ``page`` and ``bbox`` are filled in for PDFs only, and are what lets
    the page panel show where in the document you are: ``page`` is
    0-based, ``bbox`` is the word's rectangle in PDF points.  Plain text
    has no pages, so they stay ``-1`` and ``None``.
    """

    text: str
    para_end: bool = False
    page: int = -1
    bbox: tuple[float, float, float, float] | None = None

    @property
    def has_place(self) -> bool:
        return self.page >= 0 and self.bbox is not None


class ExtractionError(RuntimeError):
    pass


# --------------------------------------------------------------- extraction


def suggest_title(path: str | Path) -> str:
    """A display name for a file: the PDF's own title if it has a sane one,
    otherwise the file name without its extension."""
    p = Path(path)
    if p.suffix.lower() in PDF_SUFFIXES:
        try:
            import pymupdf as fitz
        except ImportError:
            try:
                import fitz
            except ImportError:
                return p.stem
        try:
            with fitz.open(p) as doc:
                title = (doc.metadata or {}).get("title", "") or ""
        except Exception:
            return p.stem
        title = title.strip()
        # Producers often leave junk here: a path, an untitled marker, or
        # the raw file name.  Only trust something that looks like prose.
        if 2 < len(title) < 120 and not title.lower().startswith("untitled"):
            if "/" not in title and "\\" not in title:
                return title
    return p.stem



def extract_text(path: str | Path) -> str:
    p = Path(path)
    suffix = p.suffix.lower()
    if suffix in PDF_SUFFIXES:
        return _extract_pdf(p)
    if suffix in TEXT_SUFFIXES:
        return _extract_plain(p)
    # Unknown extension: try to read it as text rather than refusing outright.
    return _extract_plain(p)


def _extract_plain(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def import_fitz():
    """PyMuPDF, under whichever name this version exposes."""
    try:
        import pymupdf
        return pymupdf
    except ImportError:
        pass
    try:
        import fitz  # PyMuPDF < 1.24 only exposed the `fitz` name
        return fitz
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise ExtractionError(
            "PDF support needs PyMuPDF.  Install it with:  pip install PyMuPDF"
        ) from exc


def open_pdf(path: str | Path):
    """Open a PDF, raising ExtractionError for the cases we can explain."""
    fitz = import_fitz()
    try:
        doc = fitz.open(path)
    except Exception as exc:
        raise ExtractionError(f"Could not open PDF: {exc}") from exc
    if doc.needs_pass:
        doc.close()
        raise ExtractionError("This PDF is password protected.")
    return doc


def _extract_pdf(path: Path) -> str:
    with open_pdf(path) as doc:
        pages = [page.get_text("text") for page in doc]

    text = "\n\n".join(pages)
    if not text.strip():
        raise ExtractionError(
            "No text found in this PDF - it is probably a scan and would "
            "need OCR first."
        )
    return text


# ------------------------------------------------------------- normalisation

_SOFT_HYPHEN = "­"

# A hyphen at the end of a line, between two letters, is almost always a
# word broken across lines by the typesetter.
_LINE_HYPHEN = re.compile(r"(?<=\w)[-‐‑]\n(?=[a-zà-ÿ])")

# A single newline inside a paragraph is a soft wrap; a blank line is a
# real paragraph break.
_SOFT_WRAP = re.compile(r"(?<!\n)\n(?!\n)")
_BLANK_LINES = re.compile(r"\n{2,}")
_HORIZONTAL_SPACE = re.compile(r"[ \t   ]+")


def normalize(raw: str) -> str:
    """Collapse a raw extraction into paragraphs separated by blank lines."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace(_SOFT_HYPHEN, "").replace("\f", "\n\n")
    text = _LINE_HYPHEN.sub("", text)
    text = _BLANK_LINES.sub("\n\n", text)
    text = _SOFT_WRAP.sub(" ", text)
    text = _HORIZONTAL_SPACE.sub(" ", text)
    return text.strip()


def tokenize(text: str) -> list[Token]:
    """Split normalised text into display tokens, punctuation attached."""
    tokens: list[Token] = []
    for paragraph in text.split("\n\n"):
        words = paragraph.split()
        if not words:
            continue
        for word in words[:-1]:
            tokens.append(Token(word))
        tokens.append(Token(words[-1], para_end=True))
    return tokens


def tokenize_pdf(path: str | Path) -> list[Token]:
    """Tokenize a PDF word by word, keeping each word's page and rectangle.

    PyMuPDF's ``"words"`` extraction hands back one tuple per word with its
    bounding box, block and line numbers.  Working at that level (rather
    than flattening to a string) is what lets the page panel point at the
    word you are on.  A block change is treated as a paragraph break, and a
    hyphen at the end of a line is rejoined with the word that follows.
    """
    tokens: list[Token] = []
    # A fragment left dangling by a line-ending hyphen, awaiting its tail.
    pending: tuple[str, int, tuple] | None = None
    previous_block: tuple[int, int] | None = None

    with open_pdf(path) as doc:
        for page_no, page in enumerate(doc):
            words = page.get_text("words")
            for position, entry in enumerate(words):
                x0, y0, x1, y1, raw, block_no, line_no, _ = entry
                text = raw.strip()
                if not text:
                    continue
                bbox = (x0, y0, x1, y1)

                block = (page_no, block_no)
                if previous_block is not None and block != previous_block \
                        and tokens:
                    tokens[-1] = _with_para_end(tokens[-1])
                previous_block = block

                if pending is not None:
                    stem, stem_page, stem_bbox = pending
                    pending = None
                    # Lower-case continuation means the hyphen only existed
                    # to break the line; anything else was a real hyphen.
                    joined = stem + text if text[:1].islower() \
                        else f"{stem}-{text}"
                    # Anchored where the word started, so the panel points
                    # at the line the reader would have begun on.
                    tokens.append(Token(joined, page=stem_page,
                                        bbox=stem_bbox))
                    continue

                if len(text) > 1 and text[-1] in "-‐‑" \
                        and _breaks_line(words, position, block_no, line_no):
                    pending = (text[:-1], page_no, bbox)
                    continue

                tokens.append(Token(text, page=page_no, bbox=bbox))

    if pending is not None:  # trailing hyphen with nothing after it
        stem, stem_page, stem_bbox = pending
        tokens.append(Token(stem, page=stem_page, bbox=stem_bbox))

    if tokens:
        tokens[-1] = _with_para_end(tokens[-1])
    return tokens


def _with_para_end(token: Token) -> Token:
    return Token(token.text, True, token.page, token.bbox)


def _breaks_line(words, position: int, block_no: int, line_no: int) -> bool:
    """True when the next word on this page starts a new line."""
    if position + 1 >= len(words):
        return True  # last word on the page: the tail is overleaf
    _, _, _, _, _, next_block, next_line, _ = words[position + 1]
    return (next_block, next_line) != (block_no, line_no)


def page_count(path: str | Path) -> int:
    with open_pdf(path) as doc:
        return doc.page_count


def tokenize_file(path: str | Path) -> list[Token]:
    """Convenience: file on disk -> token list."""
    if Path(path).suffix.lower() in PDF_SUFFIXES:
        tokens = tokenize_pdf(path)
        if not tokens:
            raise ExtractionError(
                "No text found in this PDF - it is probably a scan and "
                "would need OCR first."
            )
        return tokens

    tokens = tokenize(normalize(extract_text(path)))
    if not tokens:
        raise ExtractionError("The document contains no readable words.")
    return tokens
