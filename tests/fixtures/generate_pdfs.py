"""Generate two synthetic PDF fixtures for parser tests: a two-column text
PDF and a PDF with words hyphenated across line breaks. Source text is a
public-domain excerpt from the Jekyll & Hyde fixture already in
tests/fixtures/.
"""
import re
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph

FIXTURES = Path(__file__).resolve().parent
SOURCE = FIXTURES / "stevenson-jekyll-and-hyde.txt"


def load_body_text() -> str:
    raw = SOURCE.read_text(encoding="utf-8")
    start = raw.find("*** START OF THE PROJECT GUTENBERG EBOOK")
    end = raw.find("*** END OF THE PROJECT GUTENBERG EBOOK")
    body = raw[start:end] if start != -1 and end != -1 else raw
    body = body.split("\n", 1)[1] if start != -1 else body
    # Collapse to a single paragraph of prose (drop blank lines / headings).
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    prose = " ".join(ln for ln in lines if not ln.isupper())
    prose = re.sub(r"\s+", " ", prose)
    return prose


def make_two_column_pdf(text: str, out_path: Path) -> None:
    doc = BaseDocTemplate(str(out_path), pagesize=LETTER)
    width, height = LETTER
    margin = 0.75 * inch
    gutter = 0.3 * inch
    col_width = (width - 2 * margin - gutter) / 2
    frame1 = Frame(margin, margin, col_width, height - 2 * margin, id="col1")
    frame2 = Frame(
        margin + col_width + gutter, margin, col_width, height - 2 * margin, id="col2"
    )
    doc.addPageTemplates([PageTemplate(id="TwoCol", frames=[frame1, frame2])])
    style = ParagraphStyle("body", fontName="Times-Roman", fontSize=10, leading=13)
    # Enough text to fill both columns across a couple of pages.
    chunk = " ".join(text.split(" ")[:2200])
    doc.build([Paragraph(chunk, style)])


def make_hyphenated_pdf(out_path: Path) -> None:
    c = canvas.Canvas(str(out_path), pagesize=LETTER)
    width, height = LETTER
    c.setFont("Times-Roman", 12)
    x = 1 * inch
    y = height - 1 * inch
    leading = 18
    # Hand-built lines with a real word broken across the line end by a
    # hyphen, the way a narrow-column justified layout would produce.
    lines = [
        "It was a night of extraor-",
        "dinary stillness, and Mr. Utterson",
        "found himself unable to under-",
        "stand the strange circum-",
        "stances that had brought him to",
        "the door of his old friend's la-",
        "boratory once again. The self-",
        "same feeling of dread, half-",
        "remembered from his student",
        "days, crept over him as he",
        "reached for the tarnished knock-",
        "er and let it fall.",
    ]
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    c.showPage()
    c.save()


def main() -> None:
    text = load_body_text()
    make_two_column_pdf(text, FIXTURES / "two-column-text.pdf")
    make_hyphenated_pdf(FIXTURES / "hyphenated-line-breaks.pdf")
    print("wrote", FIXTURES / "two-column-text.pdf")
    print("wrote", FIXTURES / "hyphenated-line-breaks.pdf")


if __name__ == "__main__":
    main()
