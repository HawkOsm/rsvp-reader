# Architecture deep dives

Start with the root [ARCHITECTURE.md](../../ARCHITECTURE.md), which has the code map, the layers
and the invariants. These pages go one level deeper, one subsystem each.

| Page                                     | Covers                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| [reader.md](reader.md)                   | The engine, the two reading modes, the page overlay, state, and shortcuts     |
| [formats-and-pdf.md](formats-and-pdf.md) | Adding a format, the parse workers, the MuPDF pipeline, OCR, coordinates      |
| [storage.md](storage.md)                 | IndexedDB tables, the import flow, migrations and the rules for changing them |
| [sync.md](sync.md)                       | Cross-device sync over Google Drive: **design only, not built**               |
| [decisions.md](decisions.md)             | The decision log: append-only, newest at the bottom                           |
| [archive/](archive/)                     | Finished plans, kept for history. Not a description of the code today         |

## Keeping these true

A doc that disagrees with the code is worse than no doc. When a change makes a sentence here
wrong, fix the sentence in the same commit. When you make a decision someone will later ask
"why?" about, append an entry to `decisions.md` (date, what, why, what was rejected).
