# RSVP Reader

**A local desktop speed reader for Linux.** Words from a document are flashed
one at a time at a fixed screen position, so your eyes never move across the
page. When you want to read normally instead, it opens as a two-page book.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![PyQt6](https://img.shields.io/badge/GUI-PyQt6-41cd52.svg)](https://pypi.org/project/PyQt6/)

Each word is aligned by its **Optimal Recognition Point** — one letter,
slightly left of centre, is highlighted and pinned to the exact same pixel for
every word, so there is no horizontal drift to track.

![reader](docs/reader.png)

### What it does

- **RSVP playback** at 50–1500 WPM, live-adjustable, with pacing that slows
  for long words, punctuation and paragraph breaks
- **ORP alignment** computed from real font metrics, so the focus letter lands
  on the same pixel for every word — no fixed-width assumptions
- **Book mode** — PDFs open as a real two-page spread; text files reflow into
  book-shaped columns
- **Page panel** showing the actual PDF page you are on, with your word
  highlighted, and click-to-jump
- **Library with resume** — SQLite-backed, remembers your place in every
  document and prompts to continue
- **Fully local.** No account, no cloud, no telemetry. Your files are never
  copied or uploaded.

## Requirements

- Python 3.10 or newer
- [PyQt6](https://pypi.org/project/PyQt6/) and
  [PyMuPDF](https://pypi.org/project/PyMuPDF/)

On Arch: `pacman -S python-pyqt6 python-pymupdf`, or use a virtualenv as below.

## Install & run

```bash
git clone https://github.com/HawkOsm/rsvp-reader.git
cd rsvp-reader
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python main.py
```

You can also pass files straight in: `python main.py ~/books/essay.pdf`,
or `rsvp-reader ~/books/essay.pdf` once installed (see below).

## Adding it to your applications

```bash
./install.sh
```

That puts **RSVP Reader** in your desktop application menu with an icon, and
`rsvp-reader` on your `PATH`. Nothing is copied but the icon — the menu entry
points at this directory, so edits here take effect immediately. Everything
lands under `~/.local`; no root needed.

The entry deliberately claims **no file types**, so it cannot become your
default PDF opener. If you do want it offered under "Open With":

```bash
./install.sh --associate
```

That pins your existing defaults first, so adding this app cannot quietly
take them over. To remove everything again (your library is left alone):

```bash
./install.sh --uninstall
```

## Adding a book

Three ways, all equivalent:

- **Add book…** in the toolbar or on the Library screen (`Ctrl+O`)
- **Drag and drop** a file anywhere onto the window
- Name it on the command line

Supported formats are `.txt` (plus `.md`, `.rst`, `.org`) and `.pdf`. PDF text
is extracted with PyMuPDF; words broken across lines by a hyphen are rejoined,
and blank lines are treated as paragraph breaks.

Click any row in the Library to start reading it. Right-click a row for
**Reset progress** and **Remove from library**.

A PDF that is a pure scan has no text layer to extract, so it is rejected with
a message rather than opening empty — it would need OCR first.

## Reading normally: book mode

RSVP is one way to read, not the only one. Press **B** (or the **Book**
button) and the document opens as a **two-page spread**, left and right, the
way a book sits open.

![book mode](docs/book-mode.png)

- **PDFs show their real pages**, rendered as typeset — original layout,
  figures, columns and all.
- **Text files are reflowed** into book-shaped columns, since they have no
  real pages to show.
- **Single page** swaps the spread for one page at a time.
- **Fit width** fills the width and lets you scroll down a page; **Fit page**
  shows the whole thing at once. (PDFs only — reflowed text always fits.)
- The word you were on stays highlighted, and **switching back to RSVP
  resumes from exactly where the book left you** — turning pages moves your
  place, so you can read a few pages by eye and then hit **B** to carry on
  word-at-a-time.

## The page panel

RSVP strips a document down to a stream of words, which makes it easy to lose
your bearings. Press **P** (or the **Page ›** button) and a panel slides out
from the right showing the actual PDF page you are on, with the current word
highlighted on it.

![page panel](docs/page-panel.png)

- It **follows along** as you read, turning pages by itself.
- **Click any word on the page** to jump the reader there.
- **‹ / ›** in the panel header step a page at a time.
- **Drag the divider** to make the page bigger; it re-renders at the new size.
- The panel remembers whether you left it open.

Even with the panel closed, the word counter reads
`word 746 / 1,776 · 42.0% · page 2 / 4`.

Plain text files have no pages, so the button is disabled for them.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Back / forward one word |
| `Shift`+`←` / `→` | Back / forward ten words |
| `↑` / `↓` | Speed up / down by 25 WPM |
| `Home` / `End` | Jump to start / end |
| `P` | Show / hide the page panel |
| `B` | Book mode / back to RSVP |
| `Esc` | Back to the library |
| `Ctrl+L` | Library |
| `Ctrl+O` | Add book |
| `Ctrl+Q` | Quit |

In book mode the keys change to suit reading:

| Key | Action |
| --- | --- |
| `Space` / `→` / `↓` | Onward — down a tall page, then turn it |
| `←` / `↑` | Back the same way |
| `PgUp` / `PgDn` | Turn the page regardless |
| `Home` / `End` | First / last page |
| `D` | One page or two |
| `F` | Fit width / fit page |

The progress bar is clickable and draggable — scrub it to jump anywhere in the
document. WPM is live-adjustable while playing; the new rate takes effect on
the next word.

## Resuming

Your position is written to disk every 20 words, and again whenever you pause,
go back to the library, or close the app. Re-opening a book you are partway
through asks whether to **Resume**, **Start over**, or **Cancel**.

## Pacing

Base delay is `60000 / WPM` milliseconds per word, adjusted by:

| Condition | Effect |
| --- | --- |
| Word longer than 6 characters | `+30 ms` per extra character |
| Ends in `,` `;` `:` `—` | × 1.5 |
| Ends in `.` `!` `?` `…` | × 2.5 |
| Last word of a paragraph | `+350 ms` flat |

Trailing quotes and brackets are looked past, so `said."` still counts as a
sentence end. The constants live at the top of `rsvp_engine.py`.

## Where your data lives

```
~/.config/rsvp-reader/library.db
```

A single SQLite file (`$XDG_CONFIG_HOME` is honoured if set), holding:

- `books` — one row per file: path, title, total words, last word index,
  timestamps, and a `fingerprint` of the source file
- `tokens` — the precomputed word list per book, so re-opening a large PDF
  never re-parses it. For PDFs each row also stores the word's page number
  and its rectangle on that page, which is what the page panel draws with.

The fingerprint is `v<cache version>:<mtime>:<size>`. If a source file changes
on disk, or the token format itself changes in a new version, the fingerprint
stops matching and the tokens are rebuilt automatically on next open — your
reading positions are kept. Databases from an earlier version have the newer
columns added in place on first run. Deleting the database loses your
library and reading positions; the source documents are never touched or
copied.

## Layout

| File | Purpose |
| --- | --- |
| `main.py` | Entry point: app, theme, database, window |
| `db.py` | SQLite schema and CRUD |
| `text_extract.py` | PDF/text → token list, punctuation attached |
| `pdf_render.py` | Renders PDF pages to images for the panel |
| `rsvp_engine.py` | QTimer playback: pacing, ORP index, seek/pause |
| `ui/library_view.py` | The library table |
| `ui/reader_view.py` | RSVP display widget and transport controls |
| `ui/page_view.py` | The sliding page panel |
| `ui/book_view.py` | Book mode: page spreads and text reflow |
| `ui/main_window.py` | Wires the two views together |
| `ui/style.py` | Dark palette and stylesheet |

## Contributing

Issues and pull requests are welcome. The code aims for clarity over
cleverness — matching the surrounding style matters more than being clever.
There is no build step: edit, then `.venv/bin/python main.py`.

`.venv/bin/python -m pyflakes *.py ui/*.py` should stay clean.

## Licence

**GNU General Public License v3.0 or later** — see [LICENSE](LICENSE).

You may use, study, share and modify this program freely. If you distribute a
modified version, you must release your source under the same licence, so that
whoever receives it keeps the same freedoms.

This is not merely a preference. The app depends on:

| Dependency | Licence |
| --- | --- |
| [PyQt6](https://pypi.org/project/PyQt6/) | GPL-3.0-only (or a commercial Riverbank licence) |
| [PyMuPDF](https://pypi.org/project/PyMuPDF/) | AGPL-3.0 (or a commercial Artifex licence) |

A permissive licence such as MIT would therefore have been misleading: it would
advertise a freedom to ship this inside closed software that the dependencies
do not actually grant. If you need that, you would have to buy commercial
licences from Riverbank and Artifex and replace this project's own terms.

Copyright © 2026 Osman Sahin Guler.
