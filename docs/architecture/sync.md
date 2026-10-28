# Sync design (draft)

Status: phases 1-3 (section 15) are built for the web, behind the `sync` flag (Settings →
Advanced → Experimental): identity, clock, merge, the change log, sign-in with Google, the Drive
transport, sync while the app is open, position offers, Settings → Sync and the sync log.
Progress, settings, shelves, bookmarks and book removals sync; book files don't yet. With the
flag off, or until the user connects, the app makes no network calls. Scope: cross-device sync
of reading state and a new notes/drawing feature, using the user's own Google Drive as the only
shared storage.

**Where the code is:** `core/sync/hlc.ts` (clock), `core/sync/merge.ts` (changes and the merge
rule), `core/sync/run.ts` (a run as the log keeps it), `storage/sync-log.ts` (recording local
changes), `storage/sync-id.ts` (book identity), `sync/coordinator.ts` (`syncOnce`),
`sync/identity.ts` (filling in older books), `sync/offers.ts` (other devices' positions, offered,
never applied), `sync/transport.ts` (`Transport`, `MemoryTransport`), `sync/drive.ts`
(`DriveTransport`), `sync/runner.ts` and `sync/status.ts` (when runs happen, what they came to),
`platform/google-auth.ts` (sign-in on the web), `stores/sync-store.ts` (running it in the app),
`lib/sync-runs.ts` (the sync log). See "As built" at the end of this page for where the code
differs from the design below.

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

1. ~~How drawings anchor in reflowed (non-PDF) text (section 9).~~ Settled: there are no
   drawings, only text notes (decisions.md, 2026-10-28).
2. Web/PWA token renewal UX, given no refresh token in the browser.
3. Whether book-file sync should be Wi-Fi-only by default on Android.
4. A code sign-in on the desktop (Google's device flow: show a code, enter it at
   google.com/device), as a sure route when a browser extension blocks the loopback sign-in.
   Google allows it for `drive.appdata`. It needs a "TVs and Limited Input devices" client,
   whose secret is handled like the desktop one, and the keychain would have to remember which
   client a refresh token belongs to. Deferred (2026-10-27): the copy-link fallback covers it.

## 18. As built

Where the code differs from the design above, and why.

### Phase 1

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

### Phase 2 (web only, behind the `sync` flag)

- **Auth** is `Platform.syncAuth` (`platform/types.ts`): `getToken`, `renewToken`, `signIn`,
  `signOut`, and a `state` the UI subscribes to (`signed-out`, `signing-in`, `signed-in`,
  `needs-reconnect`). The web one (`platform/google-auth.ts`) uses Google Identity Services'
  token flow with the `drive.appdata` scope. Google's script is added to the page when the user
  presses Connect, never before. The token lives in memory only; what is remembered (in
  localStorage) is that the user connected, so a reopened app shows "Reconnect". The browser
  flow has no refresh token and a new token needs a click, so `renewToken` on the web always
  gives up and sync waits in `needs-reconnect`. Desktop and Android have `syncAuth: null` until
  phase 5. The client ID is `GOOGLE_CLIENT_ID` in `platform/web.ts` (`VITE_GOOGLE_CLIENT_ID`
  overrides it for local testing).
- **Pressing Connect** (`platform/sign-in-attempts.ts`, used by the web and the desktop sign-in
  alike). An attempt that hasn't finished after 20 seconds gives the button back with a message,
  so a sign-in window that never reports back can't leave it stuck on "Connecting…". Pressing
  again starts a new attempt and abandons the earlier one: whatever it brings back later is
  ignored, and on the desktop its loopback listener stops and frees its port. If the newest
  attempt finishes after the 20 seconds (a password and a second step take time), it still
  signs in. Signing out abandons every attempt still out. Why the newest attempt failed is kept
  (`SyncAuth.signInError`) and shown under "Google Drive" even when it fails after the 20
  seconds, which a real sign-in usually takes. On the desktop, each step is logged to the
  terminal running `tauri dev` (listening, browser back, Google's status and error name; never
  a code or token).
- **When the browser gets in the way.** A privacy extension (ClearURLs was the case found) can
  stop Google's sign-in from ever returning to the app, with Google showing only "Something went
  wrong". The app can't detect or fix another program's extensions, so, as other desktop apps
  do, Settings offers the sign-in under way as a link (`SyncAuth.signInLink`, desktop only) with
  "Copy sign-in link", to finish in a private window or another browser: it returns to the same
  loopback address, which listens for five minutes. On the web, Google's window is opened by its
  script, so there is no link to give. None of this touches the device's
  id: that is made once per install (`localSyncState`) and never changes on retries,
  disconnecting or reconnecting, so a device is registered on Drive once.
- **Drive transport** (`sync/drive.ts`): `DriveTransport` implements `Transport` with plain
  `fetch` against Drive v3 in `appDataFolder`; no Google library. Drive names files by id, so
  ids are learned from `list` (ordered by creation time, so if two devices ever made the same
  name, every device uses the older file). 429, 5xx, Drive's rate-limit 403s and a lost
  connection are retried with full-jitter exponential backoff, six tries in all. A 401 asks
  auth for a new token once, then throws `NeedsReconnectError`; `storageQuotaExceeded` throws
  `DriveFullError`; no answer at all throws `OfflineError`. Any of these leaves unsent changes
  pending, since a register is only marked sent after its log file is written. Tested against
  an in-memory fake of the Drive API (`tests/sync/fake-drive.ts`), never the real one.
- **Shelves and bookmarks sync** (new `Change` kinds in `core/sync/merge.ts`). A shelf is one
  register, `shelf:<shelf syncId>`, so the newest version wins whole (name, colour, books); its
  books are listed by book `syncId`. Each shelf has a random `syncId` from schema v10. A book on
  the shelf on another device but not on this one stays in the list when this device changes
  the shelf, and is left off the shelf here until it exists here. Bookmarks are a set:
  `bookmark:<book syncId>:<word index>`, and a removal is a tombstone. Both are recorded in the
  same transaction as the local write (`storage/shelves.ts`, `storage/bookmarks.ts`), and what
  existed before is seeded by `ensureSyncIds` with its `createdAt`. Known gaps: two devices that
  each made a "Favourites" shelf before syncing end up with two; a book added after a shelf
  arrived (or a bookmark for it) isn't put on the shelf until the shelf next changes; a book
  with no `syncId` yet can't be named on a shelf. There is no UI to delete a shelf yet, so
  shelf tombstones are only applied, never made. `SyncResult.libraryChanged` says the library
  should be read again.
- **Running sync** (`stores/sync-store.ts`, started by `app/hooks/useSync.ts` only with the
  `sync` flag on). Runs when the app opens, when the user connects, when it comes back online
  or to the front, every five minutes while in front, and five quiet seconds after a pause in
  reading or leaving the reader (`useAutosaveProgress`); not "after a batch of local changes"
  as such. `sync/runner.ts` keeps it to one run at a time: anything asked for during a run gets
  one more run after it. A run needs a signed-in token; without one nothing is sent and no
  request is made. Each run is added to the sync log; a failure goes to the error log too,
  unless it is offline or needs-reconnect, which sync just waits out. Before the PWA applies an
  update, the Reload button waits for one last run, at most ten seconds (decision 4). A run that
  brings changes in bumps `revision`, which the library and the reader watch, and reloads the
  settings if a synced setting changed.
- **Device names.** Each `device-<id>.json` now has a `name` from the browser's user agent
  ("Firefox on Linux"), and a run reads the other devices' files to list them in the sync log.
- **Settings → Sync** (`features/settings/components/SyncSection.tsx`, only with the flag on):
  Connect / Reconnect / Disconnect, where sync stands (off, connecting, syncing, synced at a
  time, needs reconnect, offline, Drive full, failed; `sync-text.ts`), Sync now, and a plain
  statement of what goes to Drive and that Google can read it (section 12). Disconnecting
  forgets the token, the sync log and that the user connected; the data already on Drive and
  in the local registers stays. On a phone, Settings now also links to the Experimental flags,
  which it had no way to reach before.
- **Sync log** (phase 3, `features/settings/components/SyncLog.tsx`; below the Sync card on a
  wide screen, its own page on a phone): the last 50 runs (time, outcome, sent, received,
  skewed, error), this device's id, the other devices seen and when, and Copy log. Kept in
  localStorage by `lib/sync-runs.ts`, like the error log. Token state is the Sync card's status
  line; the log doesn't repeat it.
- **Position offers** (`features/reader/components/PositionOffer.tsx`): a bar under the
  reader's header, "Chrome on Android is 3 pages further on. Jump there?", in pages for a paged
  book and words for a reflowed one (`offer-text.ts`). It is looked for when the book opens and
  after every run that brought changes in. Jump there moves the reader and saves the place
  without recording a change; the × (Stay here) saves this device's place again, which makes
  it the newer one everywhere. The reader never moves on its own.
- **An idle device sends nothing, enforced at the save.** The reader saves the place when a
  book opens, on pause and when it closes, so a device that opened a book and left without
  reading used to record its old place as a newer change than another device's, and send it.
  `saveProgress` now records a change only when the place, speed or mode actually moved from
  what this device last saved (a book never saved counts as word 0). Declining an offer uses
  `keepProgress`, which records the place even though it didn't move.

### Phase 6

- **Snapshots** (`sync/compaction.ts`, file names in `sync/files.ts`). After a push, a device
  that knows of `SNAPSHOT_EVERY` (1,000) or more changes beyond the newest snapshot writes
  `snapshot-<wall>-<count>-<device>-<total>.json`: every register it holds that has been sent,
  and `covers`, the highest sequence number included from each device. `total` is the sum of
  `covers`, in the name so that "how much has happened since" needs no download. Deletions
  older than the retention window (90 days) are left out. Each device deletes its own older
  snapshots once a newer one exists.
- **Purge.** A device deletes only its own log files (single writer), never its newest one
  (the next push carries on its numbering), and only once the newest snapshot covers the file
  and either every active device has read it (`cursors` in their `device-*.json`) or its last
  change is older than 90 days. Active means seen within 30 days and not removed since.
- **Full resync.** A device whose cursor points into a log file that was purged
  (`needsSnapshot`) reads the newest snapshot first, merging its registers as if they were
  changes, then reads the logs on from `covers`. Its own unsent changes are registers, so the
  newer of the two versions wins as usual.
- **Removing a device** (a Remove button beside each device in the sync log, which also marks
  one not seen for 30 days "dormant") is a synced register, `device:<id>`. A removed device is left out of
  the device list and doesn't hold back purging. If it syncs again after the removal, it is
  back, since nothing stops it writing its own files.
- **Format version 2.** A version 1 device (phase 2) would miss whatever is purged, so a
  version 2 device raises `meta.json` to 2, and version 1 then stops and asks for an update.
- Applying thousands of changes at once (a new device reading a snapshot) was found to take
  minutes for bookmarks, which re-read every bookmark of their book each time. Each book's are
  now read once per run.

### Phase 4

- **What a book is on Drive** (`sync/book-files.ts`). Not the original file alone: an EPUB or
  text book keeps no file here, only its words. So each book is `book-<syncId>.json.gz`, its
  record (title, author, format, layout, page size, chapters, fingerprint) and its words,
  gzipped with the browser's own `CompressionStream`; and for a paged book also
  `bookfile-<syncId>`, the original file its pages are drawn from. A downloaded book is
  therefore never parsed or recognised again (invariant 2). Both files are named by the sync
  id, a hash of the content, so any device that has the book may write them; this is the one
  exception to "one writer per file", and harmless since they come out the same. The package is
  written after the file, so a device that sees the package can count on the file.
- **Download on demand.** `remoteBooks` lists books recorded by another device and not here,
  and whether their files are up yet; `downloadBook` adds one, then applies the shelf and
  bookmark registers that mention it (`applyBookRegisters`), which closes the phase 2 gap of a
  book arriving after its shelf. Its place stays an offer, as for any other device's.
- **Removing a book** deletes its files from Drive (`deleteRemovedBooks`). Any device may: a
  removal propagates everywhere, and a device that adds the book again uploads it again.
- **In the app** (`stores/sync-store.ts`). After each successful run a second runner, so a
  big upload never holds up syncing a reading position, deletes removed books' files, uploads
  this device's books that aren't on Drive yet (one at a time, oldest first, with "Uploading
  books: 1 of 3 done" in Settings), lists other devices' books, and reads Drive's usage.
  Settings → Sync → Book files switches uploading off for this device (decision 9: on by
  default); downloading still works. The library shows other devices' books under "On your
  other devices", with Download, which opens the book once it is here.
- `Transport` now reads and writes bytes (`readBlob`, `write` of a `Blob`) and reports `usage`:
  the app folder's size and the user's free Drive space.

### Phase 5 (desktop so far)

- **Desktop sign-in** (`platform/pkce-auth.ts`, native half in `src-tauri/src/oauth.rs`).
  OAuth 2.0 with PKCE (S256) in the system browser, back to `http://127.0.0.1:<free port>`,
  as Google's guide for desktop apps asks; custom URI schemes and copy-and-paste codes are no
  longer allowed. `access_type=offline` gets a refresh token, kept in the OS keychain
  (`keyring` crate: Keychain on macOS, Credential Manager on Windows, Secret Service on Linux),
  so the app stays connected across restarts and `renewToken` really renews, without asking.
  If Google refuses the refresh token (revoked, or expired after 7 days in Testing mode), it
  is forgotten and sync waits in `needs-reconnect`. The keychain is first read when the sync
  store subscribes, so with sync off nothing asks to unlock it. Each Rust command does one
  fixed thing: listen once, open only Google's sign-in page, POST only to Google's token and
  revoke endpoints, and read or write only this app's keychain entry; none takes a URL.
- **The Desktop client's secret is not in the repository.** `vite.config.ts` builds it in
  from `GOOGLE_DESKTOP_CLIENT_SECRET` (`.env.local`, git-ignored, for local builds; the Actions
  secret of that name for release builds), and only when Tauri is building, so the web and
  Android builds never contain it. It still ends up inside the
  installed app, which Google accepts for desktop clients; see decisions.md. The client ID is
  `DESKTOP_CLIENT_ID` in `platform/tauri.ts`.
- Android is not built yet: Google no longer allows custom-scheme redirects for new Android
  clients, so it needs a native sign-in plugin and an Android OAuth client with the release
  keystore's SHA-1.

### Phase 7 (text notes; there are no drawings)

- **A note is its edits** (`core/sync/notes.ts`, `storage/notes.ts`). Every add, edit,
  delete or settled conflict is a new edit, synced as its own register
  (`note:<noteId>:<editId>`), never replaced, and naming the edit it was made from (`base`),
  plus any others it settles (`resolves`). This is section 5's `baseVersion`, by edit id rather
  than a counter. The note is the fold of its edits: the edits nothing was made from are its
  "heads". One head is the note; two non-deleted heads are a conflict, both kept, the newer
  shown; a delete head beside a living one lost (section 7: the edit wins) and is shown as a
  notice until the next edit made here, which settles it. The fold is the same on every
  device whatever order the edits came in (tested over every order). Edits name their book by
  sync id; a book from before sync is given one when its first note is made (`giveSyncId`, moved
  out of `sync/identity.ts` for this).
- **The `notes` table** (schema v11) holds each note as shown, refolded whenever an edit is made
  here or arrives. A note on a book that isn't here has edits but no row until the book is
  downloaded (`applyBookRegisters` refolds its notes). Removing a book removes its rows only.
- Deletes never expire from snapshots (a note edit is never a `null` register), so a note
  deleted long ago can't come back from a device that was away.
- **In the reader** (`features/reader/components/NotesPanel.tsx`, behind the `notes` flag): a
  note is added on the word being read, quoting the next twelve words (and its PDF page). A
  conflict shows every version with its time: keep one, keep all as separate notes, or merge by
  hand. A lost delete shows "deleted on another device while it was being edited, so it was
  kept", with Delete it / Keep it.
- **Markdown export** (`notes-markdown.ts`, section 9): the place (page, or word and percent),
  the passage as a quote, the note, and every version of an unsettled conflict. Copy as
  Markdown everywhere; Save as .md where the platform can save a file (`Platform.savesFiles`:
  the web only for now; desktop would need Tauri's dialog plugin).

Not built: sign-in on Android. Book files have no per-book "don't sync
this" switch, and no Wi-Fi-only option (Android, phase 5).
