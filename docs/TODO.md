# To do

What is left, as of v0.3 (2026-10-28). Sync and notes are built but behind experimental flags
(Settings → Advanced → Experimental); nothing here changes the app for someone who leaves them
off. Design and history: [docs/architecture/sync.md](architecture/sync.md) and
[decisions.md](architecture/decisions.md).

## Needs the owner (Google Cloud console, GitHub, keys)

- [ ] **Android OAuth client.** Create it with the release keystore's SHA-1 (and the debug
      key's), then send its client ID, so Android sign-in can be built.
- [ ] **`GOOGLE_DESKTOP_CLIENT_SECRET` repository secret** (GitHub → Settings → Secrets and
      variables → Actions), so released desktop builds can sign in. Local builds read it from
      `.env.local`.
- [ ] **Publish the consent screen** ("In production") before anyone but test users signs in.
      Testing mode caps users at 100 and expires desktop sign-ins after about 7 days. Google
      will want a homepage and a privacy-policy link.
- [ ] **Add the PWA's real address** (GitHub Pages) to the Web client's authorized JavaScript
      origins; only `http://localhost:5180` is there.
- [ ] **Reset the Web client's secret**, which was shared once; nothing in the app uses it.

## Sync

- [ ] Android sign-in (phase 5): a native Google sign-in plugin, once the client exists.
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

- [ ] The desktop app sometimes quits at once when started under Wayland (it stays open under
      X11, `GDK_BACKEND=x11`). Not investigated yet.
