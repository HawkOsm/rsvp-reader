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

"""SQLite persistence for the RSVP reader.

Everything lives in a single file, by default
``~/.config/rsvp-reader/library.db`` on Linux (see
``config_dir`` for where it lands on Windows and macOS).  Two tables:

``books``   one row per file the user has added to the library
``tokens``  the precomputed word list for a book, so re-opening a large
            PDF never re-parses it

The ``fingerprint`` column on ``books`` is "<mtime>:<size>" of the source
file.  When it stops matching, the cached tokens are stale and get rebuilt.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from text_extract import Token


def config_dir() -> Path:
    """Where this platform expects an application to keep its data.

    Windows  %APPDATA%\\rsvp-reader
    macOS    ~/Library/Application Support/rsvp-reader
    Linux    $XDG_CONFIG_HOME/rsvp-reader, or ~/.config/rsvp-reader

    The Linux branch is the original location and must not move, or
    existing libraries would be orphaned.
    """
    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        root = Path(base) if base else Path.home() / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        base = os.environ.get("XDG_CONFIG_HOME")
        root = Path(base) if base else Path.home() / ".config"
    return root / "rsvp-reader"


def default_db_path() -> Path:
    return config_dir() / "library.db"


SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    path           TEXT    NOT NULL UNIQUE,
    title          TEXT    NOT NULL,
    total_words    INTEGER NOT NULL DEFAULT 0,
    last_index     INTEGER NOT NULL DEFAULT 0,
    last_opened_at REAL,
    added_at       REAL    NOT NULL,
    fingerprint    TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
    book_id  INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    idx      INTEGER NOT NULL,
    text     TEXT    NOT NULL,
    para_end INTEGER NOT NULL DEFAULT 0,
    page     INTEGER NOT NULL DEFAULT -1,
    x0       REAL,
    y0       REAL,
    x1       REAL,
    y1       REAL,
    PRIMARY KEY (book_id, idx)
) WITHOUT ROWID;
"""

#: Columns added to `tokens` after the first release, and the SQL to add
#: them to a database created before they existed.
_TOKEN_COLUMNS = {
    "page": "INTEGER NOT NULL DEFAULT -1",
    "x0": "REAL",
    "y0": "REAL",
    "x1": "REAL",
    "y1": "REAL",
}


@dataclass
class Book:
    id: int
    path: str
    title: str
    total_words: int
    last_index: int
    last_opened_at: float | None
    added_at: float
    fingerprint: str | None

    @property
    def progress(self) -> float:
        """Fraction read, 0.0 - 1.0."""
        if self.total_words <= 0:
            return 0.0
        return min(1.0, self.last_index / self.total_words)

    @property
    def exists(self) -> bool:
        return Path(self.path).exists()


#: Bumped whenever the token format changes, so caches written by an older
#: version stop matching and get rebuilt on next open.
CACHE_VERSION = 2


def fingerprint_of(path: str | Path) -> str:
    st = Path(path).stat()
    return f"v{CACHE_VERSION}:{int(st.st_mtime)}:{st.st_size}"


class Database:
    """Thin CRUD wrapper.  One instance is created in main.py and shared."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path) if path else default_db_path()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.execute("PRAGMA journal_mode = WAL")
        self.conn.executescript(SCHEMA)
        self._migrate()
        self.conn.commit()

    def _migrate(self) -> None:
        """Add columns introduced after a user's database was created."""
        present = {
            row["name"]
            for row in self.conn.execute("PRAGMA table_info(tokens)")
        }
        for column, declaration in _TOKEN_COLUMNS.items():
            if column not in present:
                self.conn.execute(
                    f"ALTER TABLE tokens ADD COLUMN {column} {declaration}")

    def close(self) -> None:
        self.conn.commit()
        self.conn.close()

    # ---------------------------------------------------------------- books

    def _row_to_book(self, row: sqlite3.Row | None) -> Book | None:
        return Book(**dict(row)) if row else None

    def list_books(self) -> list[Book]:
        rows = self.conn.execute(
            "SELECT * FROM books "
            "ORDER BY COALESCE(last_opened_at, added_at) DESC"
        ).fetchall()
        return [Book(**dict(r)) for r in rows]

    def get_book(self, book_id: int) -> Book | None:
        row = self.conn.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        return self._row_to_book(row)

    def get_book_by_path(self, path: str | Path) -> Book | None:
        row = self.conn.execute(
            "SELECT * FROM books WHERE path = ?", (str(Path(path).resolve()),)
        ).fetchone()
        return self._row_to_book(row)

    def add_book(self, path: str | Path, title: str | None = None) -> Book:
        """Add a file, or return the existing row if it is already there."""
        resolved = str(Path(path).resolve())
        existing = self.get_book_by_path(resolved)
        if existing:
            return existing
        self.conn.execute(
            "INSERT INTO books (path, title, added_at) VALUES (?, ?, ?)",
            (resolved, title or Path(resolved).stem, time.time()),
        )
        self.conn.commit()
        book = self.get_book_by_path(resolved)
        assert book is not None
        return book

    def remove_book(self, book_id: int) -> None:
        self.conn.execute("DELETE FROM tokens WHERE book_id = ?", (book_id,))
        self.conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        self.conn.commit()

    def update_progress(self, book_id: int, index: int) -> None:
        self.conn.execute(
            "UPDATE books SET last_index = ?, last_opened_at = ? WHERE id = ?",
            (int(index), time.time(), book_id),
        )
        self.conn.commit()

    def reset_progress(self, book_id: int) -> None:
        self.conn.execute(
            "UPDATE books SET last_index = 0 WHERE id = ?", (book_id,)
        )
        self.conn.commit()

    def touch_opened(self, book_id: int) -> None:
        self.conn.execute(
            "UPDATE books SET last_opened_at = ? WHERE id = ?",
            (time.time(), book_id),
        )
        self.conn.commit()

    # --------------------------------------------------------------- tokens

    def tokens_are_fresh(self, book: Book) -> bool:
        """True when the cached token list still matches the file on disk."""
        if book.total_words <= 0 or not book.exists:
            return False
        try:
            if book.fingerprint != fingerprint_of(book.path):
                return False
        except OSError:
            return False
        (count,) = self.conn.execute(
            "SELECT COUNT(*) FROM tokens WHERE book_id = ?", (book.id,)
        ).fetchone()
        return count == book.total_words

    def save_tokens(self, book_id: int, tokens: Sequence[Token],
                    fingerprint: str | None) -> None:
        rows: Iterable[tuple] = (
            (book_id, i, t.text, int(t.para_end), t.page,
             *(t.bbox if t.bbox else (None, None, None, None)))
            for i, t in enumerate(tokens)
        )
        with self.conn:
            self.conn.execute("DELETE FROM tokens WHERE book_id = ?", (book_id,))
            self.conn.executemany(
                "INSERT INTO tokens "
                "(book_id, idx, text, para_end, page, x0, y0, x1, y1) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
            self.conn.execute(
                "UPDATE books SET total_words = ?, fingerprint = ? WHERE id = ?",
                (len(tokens), fingerprint, book_id),
            )

    def load_tokens(self, book_id: int) -> list[Token]:
        rows = self.conn.execute(
            "SELECT text, para_end, page, x0, y0, x1, y1 FROM tokens "
            "WHERE book_id = ? ORDER BY idx",
            (book_id,),
        ).fetchall()
        return [
            Token(
                r["text"],
                bool(r["para_end"]),
                r["page"],
                None if r["x0"] is None
                else (r["x0"], r["y0"], r["x1"], r["y1"]),
            )
            for r in rows
        ]
