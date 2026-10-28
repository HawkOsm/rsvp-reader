# Storage

`src/storage/`: Dexie over IndexedDB, in the webview's own per-origin storage. No server, no
account.

## Tables (`storage/schema.ts`)

| Table           | Key                       | Holds                                                                                    |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `books`         | `id`                      | `BookRecord`: title, fingerprint, `formatId`, `layout`, `page`, `chapters`, `ocr`, dates |
| `tokens`        | `bookId`                  | the whole packed word list, so a large PDF is never parsed again                         |
| `progress`      | `bookId`                  | word index, WPM, mode; separate so frequent saves don't touch the book list              |
| `settings`      | `key`                     | one row per preference (the app store's `Settings`)                                      |
| `files`         | `bookId`                  | the original bytes, for paged books only, so pages draw offline                          |
| `covers`        | `bookId`                  | the library grid's cover image; not backed up, it comes back from the file               |
| `shelves`       | `id`, indexed by `syncId` | `ShelfRecord`: a name, a colour token, the ids of the books on it, and a random sync id  |
| `bookmarks`     | `id`, indexed by `bookId` | `BookmarkRecord`: a word index and the few words from it                                 |
| `notes`         | `id`, `noteId`, `bookId`  | `NoteRecord`: a note as shown, the fold of its edits (kept in `syncRegisters`)           |
| `syncRegisters` | `key`                     | the newest known version of each synced value; `pending` until sent                      |
| `syncState`     | `id`                      | one row: this device's id, clock, next sequence number, cursors                          |

Saving progress, a synced setting, a book's words, or removing a book also records the change for
sync (`sync-log.ts`), in the same transaction. This happens whether or not sync is connected.

The accessors (`library.ts`, `files.ts`, `covers.ts`, `settings.ts`, `shelves.ts`, `bookmarks.ts`) take the `db` as their first argument,
so tests run them on a fresh database each time (`getDb(name)` with fake-indexeddb). The UI never
sees `db`: the `api/` folders call `getDb()` and pass it in.

## The import flow (`features/library/api/import-book.ts`)

1. `fingerprintOf(file)`: if the book is already there **and whole** (fresh tokens, plus its file
   if it's paged), return it without reading anything.
2. Otherwise parse it (`parseFileInWorker`), or OCR it if the user chose that.
3. `addBook`, which inserts a row or returns the existing one for that fingerprint; then update
   the row with the new reading. The row gets its `syncId` (`sync-id.ts`): a hash of the file for
   a paged book, of its words for a reflowed one.
4. `saveTokens`, and `saveFile` for paged books. An EPUB that names a cover image has it saved
   with `saveCover`.

A paged book gets its cover later: the first time the library shows it, `getCover`
(`features/library/api/covers.ts`) draws page 1 from the stored file and keeps it. A book with
no cover shows its title's initial instead.

"Whole" matters because a book restored from a backup has its row but no tokens, and an
interrupted import may be missing its file. Both get read again.

## Migrations

Versions so far: **v1** is the old web app's exact raw-IndexedDB layout (same database name, so
existing users upgrade in place), **v2** is this app's tables, **v3** changes `pages` to
`formatId` + `layout`, **v4** gives every book a frozen page size, **v5** adds the `covers` table, **v6** adds the
`shelves` table, **v7** adds the `bookmarks` table, **v8** gives every book a `chapters`
list (empty for books imported before it: they are not parsed again to find theirs), and **v9**
adds the sync tables and indexes `books.syncId`. v9 has no upgrade: hashing can't run inside an
IndexedDB transaction, so `ensureSyncIds` (`src/sync/identity.ts`) fills in older books' ids when
sync runs. **v10** gives every shelf a random `syncId` (the same shelf's id on every device) and
indexes it. **v11** adds the `notes` table.

Rules for changing the schema:

- **Add a version. Never edit an old one.** Dexie checks the declared history against the real
  database; editing history can leave a user's real library on a layout the code never declared.
- **Migrate rows, don't re-parse.** Derive new fields from stored ones (as `pages` became
  `layout`). Tokens are never re-extracted by a migration.
- **One normaliser for every source.** `normalizeBookRecord` serves both the Dexie upgrade and
  importing an old backup, so the two paths can't drift apart.
- **Test against an old database.** Build one at the previous version in the test, open it with
  the new code, and check the rows (`tests/storage/legacy-migration.test.ts`,
  `book-record.test.ts`).

## Known gaps

- `backup.ts` (`exportBackup` / `importBackup`) is implemented and tested but **not wired into
  the UI**.
- Backups leave out shelves and bookmarks.
- `BookSource` still lists `'gutendex'`, even though Gutendex import has been removed. Kept so
  old rows still type-check.
