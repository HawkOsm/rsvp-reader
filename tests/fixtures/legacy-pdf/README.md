# Legacy PDF golden files

What the original Python reader (`text_extract.py`'s `tokenize_pdf`, PyMuPDF
`get_text("words")`, tag `v-legacy`) produced for the PDFs next to this
folder. `tests/parse/pdf-legacy-parity.test.ts` holds the TypeScript
extractor to them.

Regenerate with `generate.py` (needs `pip install pymupdf`; run from the repo
root):

    git show v-legacy:text_extract.py > /tmp/legacy/text_extract.py
    python tests/fixtures/legacy-pdf/generate.py /tmp/legacy

Fields: `words` (every token's text, in order), `paraEnd` (indexes of tokens
that end a paragraph), `pageStarts` (page number -> index of its first token).
