# To do

What is left, as of v0.3.2 (2026-11-25; first published as v0.5, then renumbered). Sync and notes are built and on for everyone since 2026-11-25; sync does nothing until Drive is
connected in Settings. Design and history: [docs/architecture/sync.md](architecture/sync.md) and
[decisions.md](architecture/decisions.md).

## Needs the owner (Google Cloud console, GitHub, keys)

- [x] Android's OAuth client ("TVs and Limited Input devices"), its ID in the code and its
      secret in `GOOGLE_DEVICE_CLIENT_SECRET` (2026-11-23).
- [x] Move `assets/secrets/LICENSE` (the downloaded Android client file) out of the
      repository's folder: it is now `~/.config/rsvp-reader/google-android-client.json`
      (2026-11-25). Its secret is also in `.env.local` and in the repository's secrets.
- [ ] **Release keystore secrets** (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Without them every release APK is signed
      with a throwaway key, so it can't install over the last one.
- [x] `GOOGLE_DESKTOP_CLIENT_SECRET` repository secret (set 2026-11-03).
- [x] **Publish the consent screen**: "In production" since 2026-11-25, so any Google account
      can connect. The home page is the web build and the privacy page is its `privacy.html`;
      `hawkosm.github.io` is the authorized domain. No review was needed: the app asks only for
      `drive.file`, which Google does not class as sensitive. The Cloud project is now named
      "RSVP Reader" (its id is still `gen-lang-client-0927837107`).
- [ ] **Verify the branding** (Google Auth Platform → Branding). Until then Google does not
      show the app's name and links on its sign-in screen; signing in works without it. It
      needs the domain proved in Google Search Console.
- [x] Deploy the web build (`deploy-app.yml`, by hand): done 2026-11-25, the first time this
      app replaced the old one at that address. It is built with `--base=/rsvp-reader/`.
- [x] **Add the PWA's real address**: `https://hawkosm.github.io` is in the Web client's
      authorized JavaScript origins, beside `http://localhost:5180` (2026-11-25).
- [x] **Reset the Web client's secret**: the one that was shared is disabled, and a new one
      made (2026-11-25). Nothing in the app uses either. The disabled one can be deleted in
      the console whenever.

## Sync

- [x] Try the new folder layout (Books / Notes / App data, format 3) against real Drive: the
      owner ran it and reported it working (2026-11-25).
- [ ] Try the notes files against real Drive: edit `Notes/<title>.md` in Drive and see the
      note change in the app. (A file saved with CRLF line endings and a byte-order mark
      parses the same; there is a test.)
- [x] Two devices that read the same hand-added note section at once no longer each add it:
      the note's id is hashed from the section (2026-11-25).

- [x] Android sign-in (by code) on a real phone: the owner signed in several times and it
      works (2026-11-27).
- [x] Reconnect after updating to the visible folder: done on the owner's desktop, where sync
      against real Drive works (2026-11-25).
- [x] Two devices connecting for the very first time in the same moment: a device that has
      just made the "RSVP Reader" folder looks again before using it, takes the older one if
      there is one, and removes its own while it is empty (2026-11-25). Drive's listing can
      lag, so the gap is narrowed to that lag, not closed.
- [ ] Maybe later: native one-tap sign-in on Android, if the code screen proves annoying.
- [ ] Try snapshots and purging (phase 6) against real Drive; so far against fakes only.
      (Book upload and download, and notes between devices, passed against real Drive on
      2026-11-23.)
- [x] Remove the `sync` flag, and update the README's "never leave this device" line with it
      (2026-11-25).
- [ ] Maybe: a code sign-in on the desktop (Google's device flow), if the copy-link fallback
      isn't enough when a browser extension blocks sign-in (sync.md, still open 4).
- [ ] Book files: a per-book "don't sync this file" switch; Wi-Fi-only uploads on Android.
- [x] Web: a reload no longer needs Reconnect; the token is kept for the tab (2026-11-25).
      After its hour, or in a new tab, Reconnect is still a press (sync.md, still open 2).

## Book mode

- [x] Full screen with F11 in the desktop app (`Platform.toggleFullScreen`, 2026-11-25); a
      browser has its own. Compiled and tested against stand-ins, not yet seen in the app.
- [ ] A grid of small page pictures to pick from (KOReader's page browser, Readest's
      thumbnails) was considered for the jump panel and left out: drawing every page costs.
- [ ] Try the touch gestures on a real phone: tap zones, swipe, pinch (above all a pinch with
      one finger above the other, where the browser may take the touch for a scroll), and the
      controls coming and going. So far only with made-up touches in a browser.
- [ ] Check on Android that the reader's bottom edge is on screen (the root's height now
      leaves out the safe-area insets; unseen on a device).
- [x] A pinch keeps the spot between the fingers in place, and a Ctrl+wheel zoom the spot
      under the pointer; the page no longer flickers back to its old size (2026-11-25).
      The wheel has a browser test; the pinch only made-up touches, like the other gestures.
- [ ] Pages go soft when zoomed far in on a dense screen: a page is drawn whole, capped at 16
      million pixels. Drawing only the part in view would fix it.
- [x] Escape and Android's Back close the chapter list or the notes before they leave the
      book (`lib/dismiss.ts`, 2026-11-25).
- [x] Dragging the progress bar while playing no longer fights the playback: it pauses for
      the drag and goes on after (2026-11-25).
- [ ] From a review on 2026-11-24, read but not acted on: the PDF worker is not restarted
      after an error inside MuPDF itself (unconfirmed). Its other point, that going back to a
      taller page can land short of its bottom, did not happen when tried with pages of two
      sizes (2026-11-25); there is now a browser test for it.
- [x] A page with no words (a full-page picture) can be turned to: it is shown apart from
      the reader's place (`blankPage`, 2026-11-25).

## Notes

- [x] Save as .md on the desktop, through a save dialog (Tauri's dialog plugin, 2026-11-25).
      Compiled and tested against stand-ins, not yet seen in the app.
- [x] A note on the words selected: in book mode a selection brings up "Add note", and the
      note quotes exactly those words (2026-11-27). Checked in Chromium with a PDF and an
      EPUB; not yet on a phone, where the system's own copy bar also appears.
- [x] Remove the `notes` flag (2026-11-25).

## Desktop

- [ ] A book row with no `layout` appeared on a real library upgrading from v0.2 (schema v2 to
      v11) and vanished; the cause is unknown. Rows are now normalized when read, so it can't
      stop sync again.
- [ ] WebKit: one "Could not open PDF" (`n.Document.openDocument`) on first launch, while covers
      were being made. Maybe two `import('mupdf')` at once on WebKit; unconfirmed, since the e2e
      tests only run Chromium. Both covers were made anyway. Worth sharing one import.
- [x] Selecting text on a PDF page in the desktop app painted a band across the page beside
      the selected lines (WebKit fills the gaps between them); only the lines are selectable
      now. Seen fixed in WebKitGTK (2026-11-27).
- [x] The desktop app no longer comes back maximized or full screen, which on a tiling window
      manager (Hyprland) took it out of its tiling (2026-11-27). Compiled, not yet seen.
- [ ] The desktop app sometimes quits at once when started under Wayland (it stays open under
      X11, `GDK_BACKEND=x11`). Not investigated yet.
