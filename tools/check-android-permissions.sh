#!/usr/bin/env bash
# Fails if the Android manifest declares any permission beyond the
# allow-list below. The old Kotlin app asked for none; this app added
# exactly one on purpose (INTERNET, for Gutendex search/import — see
# DECISIONS.md's Phase 8 log) and nothing else should sneak in un-reviewed.
set -euo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"
ALLOWED=("android.permission.INTERNET")

if [[ ! -f "$MANIFEST" ]]; then
  echo "error: $MANIFEST not found (run from the repo root, after \`npx cap add android\`)" >&2
  exit 1
fi

found=$(grep -o 'android:name="android\.permission\.[A-Z_]*"' "$MANIFEST" \
  | sed -E 's/android:name="(.*)"/\1/' | sort -u)

unexpected=()
while IFS= read -r perm; do
  [[ -z "$perm" ]] && continue
  allowed=false
  for a in "${ALLOWED[@]}"; do
    [[ "$perm" == "$a" ]] && allowed=true && break
  done
  $allowed || unexpected+=("$perm")
done <<< "$found"

if [[ ${#unexpected[@]} -gt 0 ]]; then
  echo "error: AndroidManifest.xml declares permission(s) not on the allow-list:" >&2
  printf '  %s\n' "${unexpected[@]}" >&2
  echo "If this is intentional, add it to ALLOWED in tools/check-android-permissions.sh" >&2
  echo "and explain why in DECISIONS.md." >&2
  exit 1
fi

echo "OK: AndroidManifest.xml only declares ${ALLOWED[*]}"
