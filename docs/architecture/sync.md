# Sync design (draft)

Status: phase 1 (section 15) is built and tested: identity, clock, merge, the change log, an
in-memory transport and the sync run. Nothing calls it yet: there is no Drive transport, no auth
and no UI, so the app still makes no network calls. Scope: cross-device sync of reading state and
a new notes/drawing feature, using the user's own Google Drive as the only shared storage.

**Where the code is:** `core/sync/hlc.ts` (clock), `core/sync/merge.ts` (changes and the merge
rule), `storage/sync-log.ts` (recording local changes), `storage/sync-id.ts` (book identity),
`sync/coordinator.ts` (`syncOnce`), `sync/identity.ts` (filling in older books), `sync/offers.ts`
(other devices' positions, offered, never applied), `sync/transport.ts` (`Transport`,
`MemoryTransport`). See "As built" at the end of this page for where phase 1 differs from the
design below.

## 1. Goals and non-goals

**Goals**

- Reading progress, settings, book metadata and notes/drawings follow the user across web/PWA,
  Tauri desktop and Android.
- No server of ours. Google Drive's hidden per-app folder (`drive.appdata` scope) is the shared
  store. Free for us; counts against the user's own Drive quota.
- Local-first: the app always works fully offline. Sync never blocks reading.
- Never silently lose user-authored content (notes, drawings). Reading position is the only
  thing allowed to be overwritten by "newest wins".
- A device left open and idle must not clobber progress made on another device.
- Bounded growth: the shared data cannot grow forever.

**Non-goals (v1)**

- Multi-user sharing, accounts, a backend, real-time collaboration.
- End-to-end encryption (decided: not needed, see section 12).
- Other transports (WebDAV, folder). Decided: Drive only.

Book files **do** sync (decision 9). They are large, so they are treated differently from
operations (immutable, content-addressed, downloaded on demand; see section 6).

Sync is **strictly opt-in**: nothing leaves the device until the user presses "Connect Google
Drive". The app collects no data of its own.

**Architecture decision:** monolith. Sync is a client-side module with swappable seams, not a
service. If a backend is ever wanted it becomes one more `Transport` implementation.

## 2. Modules (all client-side)

| Module              | Responsibility                                                               | Platform-specific? |
| ------------------- | ---------------------------------------------------------------------------- | ------------------ |
| Identity            | Stable cross-device ID per book (content hash, `syncId`)                     | no                 |
| Clock               | Hybrid logical clock for ordering changes                                    | no                 |
| Change log (outbox) | Records every local change as an immutable operation                         | no                 |
| Merge               | Pure function: applies operations to local state per the rules in section 7  | no                 |
| Transport           | `list / read / write / delete` files in the shared store; first impl = Drive | per provider       |
| Auth                | Obtains and refreshes access tokens                                          | **per shell**      |
| Coordinator         | The handshake (section 8): pull, merge, push, compact, retry                 | no                 |
| UI                  | Connect, status, "Sync now", device list, conflict chooser                   | no                 |

Merge, Clock and Identity are pure and tested without any network. Transport and Auth are the
only parts that vary.

## 3. Login and credentials

Drive access uses the `drive.appdata` scope only: the app sees only its own hidden folder, not the
user's other files. This is a non-sensitive scope, so it avoids Google's heavy verification.

A Google Cloud project holds **one OAuth client per shell type**. Client IDs are public
identifiers and are fine to ship in the app. Any client _secret_ must not be committed to the
repo or pasted into chat. (If you have a snippet with an "id": a client ID is fine; a secret or
API key is not. Never share those.)

| Shell               | Flow                                                          | Notes                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web / PWA           | Google Identity Services token flow (popup)                   | ~1 hour access tokens, no refresh token. Needs a user gesture to renew, so the app shows "Sync paused, tap to reconnect" instead of failing. Popup blockers and iOS standalone PWAs are flaky. |
| Tauri desktop       | OAuth 2.0 + PKCE, loopback redirect, system browser           | Google blocks embedded webview sign-in. Refresh token stored in the OS keychain.                                                                                                               |
| Android (Capacitor) | System browser (Custom Tabs) + PKCE, or native Google Sign-In | Android OAuth client is bound to the package name + signing-key SHA-1. Debug and release keys differ: register both.                                                                           |

Rules for all shells:

- Auth is an interface (`getToken`, `signIn`, `signOut`). The sync engine only ever sees a token.
- A 401 triggers a silent refresh; if that fails, sync enters "needs reconnect", local use
  continues, pending changes stay queued.
- Google "Testing" mode limits users and expires refresh tokens after 7 days. Don't mistake that
  for a bug during development; publish the consent screen once the flows work.
- Tokens live in the platform's safest store (keychain on desktop, Keystore on Android, memory
  or IndexedDB on web), never in the Drive data.

## 4. Why an operation log, not "copy the latest file"

Copying the newest full state from one device loses whatever the other device did. Example:
device A (idle) added a note on chapter 2; device B only read further. "Latest device wins
everything" deletes A's note. So changes are recorded as small immutable **operations** per
record, and every device applies operations it hasn't seen. Two devices editing different
things never conflict. "Newest wins" is applied only per single value (a book's progress).

## 5. Data model

All synced entities have a globally unique ID generated on the creating device.

- **Book**: `syncId` = SHA-256 of file bytes (or of normalized text for non-binary sources).
  Local autoincrement `id` stays local-only. Existing books are backfilled by a DB migration.
  **Fuzzy matching (decision 2):** when a newly added file has no exact `syncId` match, compare a
  normalized title + author + approximate word count/size against known books. A likely match is
  _offered_ ("Is this the same book as X? Link notes and progress") and never merged
  automatically, because a wrong silent merge would attach notes to the wrong book. A confirmed
  link records an alias, so both hashes resolve to one logical book on every device.
- **Progress** (one per book): word index, WPM, mode.
- **Setting**: key, value.
- **Note**: `noteId`, `bookSyncId`, anchor (section 9), kind (`text` | `drawing`), body, created/
  edited metadata.
- **Stroke** (belongs to a drawing note): `strokeId`, points (normalized coordinates), pen
  properties.
- **Tombstone**: ID of a deleted book/note/stroke + deletion time, so deletes propagate and the
  item doesn't reappear.

### Operation

An operation is an immutable record:

- `opId` = `deviceId` + per-device sequence number (monotonic, gap-free per device)
- `hlc` = hybrid logical clock value (see below)
- `entity` type + ID
- `kind` (set field, add, delete)
- `payload`
- `baseVersion` for note edits: which version of the note the editor was looking at

### Ordering: hybrid logical clock

Device wall clocks can be wrong, so plain timestamps are unsafe. Each device keeps an HLC: wall
time plus a counter, advanced to be strictly greater than anything it has seen. Ties are broken by
`deviceId`. This gives a total order that respects causality and tolerates clock skew. A device
whose clock is far in the future is clamped (changes beyond a skew tolerance are flagged) so it
can't dominate "newest wins" forever.

## 6. Drive layout (inside `appDataFolder`)

Core principle: **every file has exactly one writer**, so there are no concurrent-write
conflicts on Drive (which has no multi-file transactions).

```
appDataFolder/
  meta.json                     format version, creation info (written once, rarely changed)
  device-<deviceId>.json        written only by that device: name, platform, lastSeen,
                                state, and its ack cursors (highest op sequence it has
                                applied from each other device)
  log-<deviceId>-<segment>.json written only by that device: its own operations, split into
                                bounded segments
  snapshot-<hlc>.json           immutable compacted state (see section 10); any device may
                                write one; the highest hlc is current
  book-<syncId>                 the original book file, immutable and content-addressed
                                (the name is its hash), so two devices uploading the same
                                book can't conflict
```

Book files: uploaded in the background (user-visible progress, can be paused, optionally
Wi-Fi-only on Android), downloaded on demand when the user opens a book that isn't local. Removing
a book tombstones it; its file is deleted from Drive once no device still references it. The
user's Drive quota is the limit: show used space for the app's folder and a clear "Drive full"
state. Per-book "don't sync this file" is a cheap escape hatch.

Why this layout:

- No shared "registry file" to fight over: the device list is the set of `device-*.json` files.
- Each device appends only to its own log, so two devices uploading at once can't corrupt
  anything.
- Snapshots are immutable and named by clock value; if two devices write one at the same time,
  both are valid (merge is deterministic) and the newest wins.
- Segments keep each file small; old segments are deleted whole.

Cheap change detection: use Drive's `changes` feed (start page token) or `modifiedTime` on
`device-*.json`/`log-*` to learn whether anything is new before downloading.

## 7. Conflict rules per data type

| Data           | Rule                                                                                                                                                           | User sees a conflict?                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress       | Newest HLC wins per book                                                                                                                                       | No conflict screen, but the app **always asks first** (decision 7): "Continue from <device> at <position>?" It never jumps silently. Declining keeps the local position and is itself a newer change. |
| Settings       | Newest HLC wins per key                                                                                                                                        | No                                                                                                                                                                                                    |
| Books          | Union by `syncId`; delete via tombstone; re-adding after delete beats the tombstone only if newer                                                              | No                                                                                                                                                                                                    |
| Notes (create) | Union by `noteId`; both devices' notes survive                                                                                                                 | No                                                                                                                                                                                                    |
| Notes (edit)   | If the edit's `baseVersion` matches the current version: apply. If not (both devices edited the same note independently): **keep both versions** as a conflict | **Yes**, choose one, keep both, or merge by hand                                                                                                                                                      |
| Notes (delete) | Tombstone. A delete concurrent with an edit: the edit wins (the note is restored) and the user is told                                                         | Yes, light notice                                                                                                                                                                                     |
| Strokes        | Add-only set by `strokeId`; delete via tombstone                                                                                                               | No                                                                                                                                                                                                    |

Progress is the only value where "newest wins" is acceptable. Anything the user wrote is
preserved unless the user deletes it.

## 8. The handshake and sync cycle

Triggers: app start, app returning to foreground, leaving the reader, after a batch of local
changes (debounced, not per word), and a manual "Sync now". Never on every progress tick.

Sequence on a device D:

1. **Check auth.** If unavailable, skip; changes stay in the local outbox.
2. **Register/heartbeat.** Update `device-D.json` (lastSeen, ack cursors).
3. **Detect change.** Ask Drive whether anything is new since the last-seen marker. If not, go to
   step 6.
4. **Pull.** Download new `log-*` segments and any newer snapshot.
5. **Merge.** Apply operations in HLC order into local state, skipping ones already applied (ops
   are idempotent by `opId`). Present conflicts (section 7). Advance D's ack cursors.
6. **Push.** Append D's unsent operations to its own log segment. Retry with backoff on failure.
   Because D is the sole writer of that file, no write conflict is possible.
7. **Compact/purge** if eligible (section 10).
8. Record "last synced" and the new change marker locally.

Everything is idempotent: a crash or lost connection at any step is safe to retry from the top.

### The stale-device scenario

Device A is left open on book X at word 100 and idle. The user keeps reading on B to word 5,000.
When A wakes (foreground event), it runs the handshake, pulls B's progress op (newer HLC), and
offers "Continue from B at word 5,000?". It does not push A's stale position, because A made no
new change; an idle device generates no operations. If the user reads on A first, the new
operations carry newer HLCs and win normally.

## 9. Notes and drawing

Notes are an **annotation layer**, separate from the reading engine.

**Anchoring.** A note must survive re-tokenization (the token cache is rebuilt when
`CACHE_VERSION` changes) and differ across devices. Each anchor stores:

- `bookSyncId`
- position hint: word index range (and page number for PDFs)
- a short **text context** (the words around the anchor) used to re-find the position if the
  index shifts
- for freehand drawings on a page or margin: coordinates **normalized** to the page/pane
  (0-1), plus the pane identity, so they scale across screen sizes

**Drawings** are stored as vector strokes (lists of points), never images: small, mergeable by
union, and each stroke has its own ID so partial edits don't conflict. Points are simplified
before storing. Hard caps on points per stroke and strokes per note prevent runaway size.

**Text notes** have an ID and a monotonically increasing version for the base-version conflict
check in section 7.

**Notes belong to the book file (decision 3).** They are keyed by `bookSyncId` and travel with
the book, whatever device it's opened on. They can be **exported to Markdown directly**. Each
note becomes an entry containing:

- the page number (PDFs) or position (other formats),
- the anchored text at the start (the quoted passage the note refers to),
- the note text, and
- for drawings, the drawing itself rendered as an embedded image (SVG preferred since strokes are
  vectors; PNG as a fallback), saved next to the Markdown file.

The existing JSON backup also includes notes. Export is read-only and not part of sync.

**Still open:** how drawings behave in reflowed (non-PDF) text, where the layout depends on screen
size. Options: anchor drawings only to PDF pages and margins; or anchor to a word range and render
in the margin beside it.

## 10. Retention, purge, snapshots, devices

### Device states

- **Active**: seen within the dormancy window (30 days, decision 8).
- **Dormant**: not seen for longer. Does **not** block purging.
- **Revoked/removed**: the user removed it from the device list; ignored entirely.

A returning dormant device is simply active again; see "full resync" below.

### Purge rule

An operation may be deleted once **every active device's ack cursor covers it**, or once it is
older than the **maximum retention** (default 90 days), whichever comes first. Each device deletes
only its **own** old log segments (single-writer principle), based on the other devices'
`device-*.json` ack cursors.

### Snapshots and compaction

Periodically (for example when the log exceeds a size/segment threshold) a device writes an
immutable `snapshot-<hlc>.json` containing the full merged state as of that clock value. Logs
older than the snapshot's coverage can then be purged even if a dormant device hasn't seen them.
Snapshots exclude tombstones older than retention; keep older snapshots until a newer one exists.

### Full resync of a returning/new device

If a device's cursors are older than the oldest retained operation (or it's a fresh install):

1. Load the newest snapshot.
2. Apply any retained log operations newer than the snapshot.
3. **Re-apply its own unsent local operations** through merge (idempotent, HLC-ordered), so offline
   work done while dormant is not lost. Note edits whose base is gone surface as ordinary
   conflicts (section 7).

### Size budget

Progress and settings are KBs. Notes with strokes are the growth risk. Targets: keep the snapshot
under a few MB for typical use; cap strokes/points; warn the user when notes approach a soft
limit. Drive quota errors surface as a clear "Drive full" state, not silent failure.

## 11. Failure cases

| Case                                    | Behavior                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Offline                                 | Queue in the outbox; sync on reconnect                                                                                                                                                                                                                                               |
| Token expired / revoked                 | "Needs reconnect"; local use unaffected                                                                                                                                                                                                                                              |
| Crash mid-push                          | Retry; ops are idempotent by `opId`; per-device sequence has no gaps, so a gap indicates an incomplete upload and the reader waits/retries                                                                                                                                           |
| Two devices upload at once              | No conflict: different files                                                                                                                                                                                                                                                         |
| Two devices write a snapshot at once    | Both valid; newest HLC is current                                                                                                                                                                                                                                                    |
| Purge races with a returning device     | Purge only uses published ack cursors; a device returning after the retention window does a full resync (section 10)                                                                                                                                                                 |
| Device clock wrong                      | HLC plus skew clamp; flagged, can't dominate                                                                                                                                                                                                                                         |
| Newer app version writes a newer format | Older versions detect `meta.json` format version and **refuse to write**, prompting an update. **Before an update is applied the app runs a final sync** (decision 4), so the format upgrade starts from fully merged data and no unsent operations are stranded on the old version. |
| Drive API rate limit / 5xx              | Exponential backoff with jitter                                                                                                                                                                                                                                                      |
| User deletes the Drive app data         | App detects an empty store and offers to re-seed it from local state                                                                                                                                                                                                                 |
| Same note edited on two devices         | Conflict UI; both versions kept until chosen                                                                                                                                                                                                                                         |
| Book file missing on this device        | Show "not on this device"; keep notes/progress; re-adding the file matches by `syncId`                                                                                                                                                                                               |
| User signs out                          | Local data stays; stale device entry remains until removed or dormant                                                                                                                                                                                                                |

## 12. Privacy and security

- Scope `drive.appdata` only; the app can't see the rest of the user's Drive.
- Data is stored in the user's own Drive; we operate no server and receive nothing.
- **No end-to-end encryption (decision 1).** Google can technically read the appdata contents,
  including notes and book files. The connect screen should say so plainly. Retrofitting
  encryption later would need a format version bump and a full re-upload; that cost is accepted.
- **Consent screen (decision 12):** not needed while only a few test users are involved. Note that
  in Google's "Testing" status, refresh tokens can expire after about 7 days, which will log a
  desktop/Android device out repeatedly. Moving the consent screen to "In production" fixes that
  and, for a non-sensitive scope like `drive.appdata`, normally needs no review. Check Google's
  current rules when you get there; add a privacy policy URL only if Google asks for it.
- Tokens are never stored in the synced data. "Remove device" and "sign out everywhere" are
  user-visible controls.

## 13. Local storage changes (Dexie)

A new schema version adds: `syncId` on books (backfilled by migration), an outbox of unsent
operations, per-device sync state (device ID, HLC, ack cursors, change marker), notes, strokes and
tombstones. Existing `books/tokens/progress/settings/files` tables are unchanged. The existing
JSON backup stays as a manual escape hatch and should include notes.

## 14. Testing strategy

- Pure unit tests for Merge and Clock.
- An **in-memory fake Transport** to simulate N devices: interleaved syncs, offline edits, crashes
  mid-push, concurrent snapshots, dormant-device return.
- **Convergence property test**: random operation sequences delivered in random orders to several
  devices must end in identical state.
- Clock-skew tests (device clock hours/days off).
- Real-device manual checklist per shell (sign-in, push, pull on a second device, offline edit,
  reconnect, token expiry) since Google sign-in can't be fully automated.

## 15. Phasing

Platform order (decision 5): **web, then desktop, then Android.**

1. Identity (`syncId` + migration + fuzzy-match offer), Clock, operation log, Merge, fake
   transport and tests.
2. Drive transport and Auth for web; handshake coordinator; progress + settings + book metadata.
3. Sync log view (decision 15): a screen listing recent sync runs, errors, token state, device
   list and last-synced time, with "copy log" for bug reports.
4. Book file sync (background upload, on-demand download, quota display).
5. Desktop auth flow (PKCE + loopback), then Android (keystore plan below).
6. Device list, retention/purge, snapshots, full resync.
7. Notes and drawings, Markdown export, and the conflict UI.

**Android signing (decision 13):** pick one stable release keystore before the first Android
release, back it up, and register its SHA-1 (and the debug key's) with the Android OAuth client.
Changing the signing key later breaks Google sign-in for installed users. If you ever publish
through Google Play, enroll in Play App Signing and register that key's SHA-1 too.

**Licenses (decision 14):** the project is GPL-3.0-or-later. Whenever a library is added for
auth or Drive access, check its license for compatibility and add it to `docs/THIRD_PARTY.md` in the
same change. Prefer plain `fetch` against the Drive REST API over a large SDK where possible.

Notes can be developed in parallel with phase 4 locally (no sync), but their data model must be
fixed (IDs, anchors, versions) before phase 5 so nothing needs migrating.

## 16. Decisions log

| #   | Decision                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | No end-to-end encryption                                                                                               |
| 2   | Fuzzy book matching, but offered for confirmation, never merged silently                                               |
| 3   | Notes belong to the book file; export to Markdown with page number, anchored text at the start, and the drawing itself |
| 4   | Final sync runs before an app update is applied; older versions refuse to write newer formats                          |
| 5   | Platform order: web, desktop, Android                                                                                  |
| 6   | Sync is opt-in; no data collected by the app                                                                           |
| 7   | Always ask before jumping to another device's position                                                                 |
| 8   | Dormancy window 30 days (max retention stays at 90 days)                                                               |
| 9   | Book files sync too                                                                                                    |
| 10  | Drive only                                                                                                             |
| 11  | Conflicts: show both versions with their source (device and time)                                                      |
| 12  | Consent-screen review not planned; see section 12 for the Testing-mode token caveat                                    |
| 13  | Dedicated stable Android release keystore, one OAuth client per shell                                                  |
| 14  | License check and `docs/THIRD_PARTY.md` entry for any added library                                                    |
| 15  | Sync log view for now                                                                                                  |

Assumptions made while recording these (correct me if wrong):

- Decision 4 was read as "run a last sync before applying an update."
- Decision 11 was read as "show both versions side by side, each labeled with where it came from."
- Decision 9 is a separate toggle from "sync progress and notes", on by default once connected,
  with a visible quota display.

## 17. Still open

1. How drawings anchor in reflowed (non-PDF) text (section 9).
2. Web/PWA token renewal UX, given no refresh token in the browser.
3. Whether book-file sync should be Wi-Fi-only by default on Android.

## 18. As built (phase 1)

Where the code differs from the design above, and why:

- **Registers, not an op outbox.** Progress, settings and books are all "newest wins" values, so
  each is a register (`syncRegisters`): the newest known version, marked `pending` until sent.
  A second local change to the same value before a sync replaces the first, so the queue holds at
  most one entry per book and setting, however often progress is saved. A change is stamped with
  the clock when it is saved, not when it is sent, so an offline change can't beat a newer one
  from another device by being sent later. Notes (phase 7) will need real operations with a
  `baseVersion`; `Change` gets new kinds then.
- **A book's id is hashed from its words if it reflows**, from its file if it's paged. Reflowed
  books keep no file, and an older book has to be given an id later from what it keeps. The same
  EPUB imported by two app versions whose parsers differ gets two ids; fuzzy matching (decision 2) is the planned answer.
- **Sequence numbers are given when a change is sent.** If a device crashes after writing its log
  but before saving that it did, the next run reads its own log back and carries on after it, so
  no number is used twice. Numbers can skip, and readers don't wait on a gap.
- **Clock skew.** A change stamped more than a day ahead of the receiving device is applied (every
  device must end in the same state) and counted in `SyncResult.skewed`, but the receiver's
  clock doesn't follow it.
- **Synced settings** are `theme`, `defaultWpm`, `fontFamily`, `fontSize`, `orpColor` and
  `showHints` (`SYNCED_SETTINGS`). The panel, page scale and spread belong to the screen.
- **What existed before sync** is queued on the first run, with the time it was saved (a book's
  `addedAt`, its progress's `updatedAt`). Settings have no time, so another device's settings
  win over this one's the first time it syncs.
- **A book added on another device** is recorded but not shown: its file doesn't sync until
  phase 4. A removal does propagate.

Not built: Drive transport and auth (phase 2), the sync log view, book files, device list,
purge and snapshots (`Transport` has no `delete` until purge needs it), notes. Phase 2 also has
to amend invariant 1 in ARCHITECTURE.md ("no network at runtime") to allow the opt-in Drive
calls.
