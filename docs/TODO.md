# To do

What is left, as of v0.3 (2026-10-28). Sync and notes are built but behind experimental flags
(Settings → Advanced → Experimental); nothing here changes the app for someone who leaves them
off. Design and history: [docs/architecture/sync.md](architecture/sync.md) and
[decisions.md](architecture/decisions.md).

## Needs the owner (Google Cloud console, GitHub, keys)

- [ ] **Android's OAuth client.** Create a client of type "TVs and Limited Input devices",
      put its ID in `ANDROID_CLIENT_ID` (`src/platform/capacitor.ts`) and its secret in the
      `GOOGLE_DEVICE_CLIENT_SECRET` repository secret.
- [ ] **Release keystore secrets** (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Without them every release APK is signed
      with a throwaway key, so it can't install over the last one.
- [x] `GOOGLE_DESKTOP_CLIENT_SECRET` repository secret (set 2026-11-03).
- [ ] **Publish the consent screen** ("In production") before anyone but test users signs in.
      Testing mode caps users at 100 and expires desktop sign-ins after about 7 days. Google
      will want a homepage and a privacy-policy link.
- [ ] **Add the PWA's real address** (GitHub Pages) to the Web client's authorized JavaScript
      origins; only `http://localhost:5180` is there.
- [ ] **Reset the Web client's secret**, which was shared once; nothing in the app uses it.

## Sync

- [ ] Try Android sign-in (by code) on a real phone: it is built and unit-tested, but has not
      run on a device. Check that the google.com/device link opens the phone's browser.
- [ ] Maybe later: native one-tap sign-in on Android, if the code screen proves annoying.
- [ ] Try book files (phase 4) and snapshots/purge (phase 6) against real Drive; so far they
      are tested against fakes only.
- [ ] A two-device check of notes over real Drive.
- [ ] Remove the `sync` flag once it has been used for a while, and update the README's
      "never leave this device" line with it.
- [ ] Maybe: a code sign-in on the desktop (Google's device flow), if the copy-link fallback
      isn't enough when a browser extension blocks sign-in (sync.md, still open 4).
- [ ] Book files: a per-book "don't sync this file" switch; Wi-Fi-only uploads on Android.
- [ ] Web: Reconnect is needed after every reload (no refresh token in the browser); see
      sync.md, still open 2.

## Notes

- [ ] Save as .md on the desktop (needs Tauri's dialog plugin); it has Copy only.
- [ ] Notes on a range of words, not only one word.
- [ ] Remove the `notes` flag once notes have been used for a while.

## Desktop

- [ ] A book row with no `layout` appeared on a real library upgrading from v0.2 (schema v2 to
      v11) and vanished; the cause is unknown. Rows are now normalized when read, so it can't
      stop sync again.
- [ ] WebKit: one "Could not open PDF" (`n.Document.openDocument`) on first launch, while covers
      were being made. Maybe two `import('mupdf')` at once on WebKit; unconfirmed, since the e2e
      tests only run Chromium. Both covers were made anyway. Worth sharing one import.
- [ ] The desktop app sometimes quits at once when started under Wayland (it stays open under
      X11, `GDK_BACKEND=x11`). Not investigated yet.
