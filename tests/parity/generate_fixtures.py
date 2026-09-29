"""Dump golden fixtures from the Python engine for the TypeScript port to
match exactly: tokens, per-token delay at 300 and 600 WPM, and the ORP index.

The already-generated JSON fixtures in this directory are what
tests/parity/*.test.ts actually runs against — this script itself doesn't
need to run for the test suite to pass. It's only for regenerating them
(e.g. if a Python-side bug is found and fixed retroactively, which
shouldn't happen now that rsvp_engine.py/text_extract.py have been
retired to the `legacy` branch): check out rsvp_engine.py and
text_extract.py from `legacy` into the repo root first, recreate a
venv with PyMuPDF, then:

    python tests/parity/generate_fixtures.py

The output JSON is what tests/parity/*.test.ts compares the TS core
(tokenize.ts / pacing.ts / orp.ts) against. Only tokenize()'s plain-text path
has a TS counterpart (Phase 1); the PDF fixtures are dumped for Phase 3's
own comparison, which uses a different (pdf.js-based) algorithm entirely —
see DECISIONS.md's Phase 3 log for why an exact match isn't expected there.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from rsvp_engine import delay_for, orp_index  # noqa: E402
from text_extract import Token, normalize, extract_text, tokenize, tokenize_pdf  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "tests" / "fixtures"
OUT_DIR = REPO_ROOT / "tests" / "parity"

BOOKS = {
    "stevenson-jekyll-and-hyde": FIXTURES_DIR / "stevenson-jekyll-and-hyde.txt",
    "melville-moby-dick": FIXTURES_DIR / "melville-moby-dick.txt",
    "two-column-text": FIXTURES_DIR / "two-column-text.pdf",
    "hyphenated-line-breaks": FIXTURES_DIR / "hyphenated-line-breaks.pdf",
}

WPM_RATES = (300, 600)

# Keep the golden JSON small enough to commit: for a book long enough that
# dumping every token would bloat the repo (looking at you, Moby-Dick),
# sample the start (where most punctuation/pacing cases show up) and the
# tail (to keep the true end-of-book paraEnd covered).
MAX_TOKENS = 4000
TAIL_SAMPLE = 200


def token_record(token: Token) -> dict:
    record = {
        "text": token.text,
        "paraEnd": token.para_end,
        "orp": orp_index(token.text),
        "delayMs": {wpm: round(delay_for(token, wpm), 6) for wpm in WPM_RATES},
    }
    if token.has_place:
        record["page"] = token.page
        record["bbox"] = list(token.bbox)
    return record


def build_fixture(path: Path) -> dict:
    if path.suffix.lower() == ".pdf":
        tokens = tokenize_pdf(path)
    else:
        tokens = tokenize(normalize(extract_text(path)))

    total = len(tokens)
    truncated = total > MAX_TOKENS
    if truncated:
        head = tokens[: MAX_TOKENS - TAIL_SAMPLE]
        tail = tokens[-TAIL_SAMPLE:]
        sample = head + tail
    else:
        sample = tokens

    return {
        "source": path.name,
        "totalTokenCount": total,
        "truncated": truncated,
        "headCount": len(sample) - TAIL_SAMPLE if truncated else total,
        "tailCount": TAIL_SAMPLE if truncated else 0,
        "tokens": [token_record(t) for t in sample],
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, path in BOOKS.items():
        if not path.exists():
            raise SystemExit(f"missing fixture source: {path}")
        fixture = build_fixture(path)
        out_path = OUT_DIR / f"{name}.json"
        out_path.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(
            f"wrote {out_path} ({len(fixture['tokens'])}/{fixture['totalTokenCount']} tokens)"
        )


if __name__ == "__main__":
    main()
