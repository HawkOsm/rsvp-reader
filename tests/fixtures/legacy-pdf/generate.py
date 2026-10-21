"""Regenerate the golden files in this folder from the legacy Python reader.

usage: python generate.py <dir containing the legacy text_extract.py>
"""
import json
import pathlib
import sys

sys.path.insert(0, sys.argv[1])
import text_extract  # noqa: E402

here = pathlib.Path(__file__).parent
for pdf in ("two-column-text", "hyphenated-line-breaks"):
    tokens = text_extract.tokenize_pdf(here.parent / f"{pdf}.pdf")
    page_starts = {}
    for i, t in enumerate(tokens):
        page_starts.setdefault(t.page, i)
    out = {
        "words": [t.text for t in tokens],
        "paraEnd": [i for i, t in enumerate(tokens) if t.para_end],
        "pageStarts": page_starts,
    }
    (here / f"{pdf}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
