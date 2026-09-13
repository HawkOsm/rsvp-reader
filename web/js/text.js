// RSVP Reader - a local speed reader.
// Copyright (C) 2026 Osman Sahin Guler
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.  See <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

// Document -> token list.  A port of text_extract.py, with the same
// normalisation rules so a file tokenises identically in both versions.
//
// A token is { text, paraEnd, page, bbox } - page and bbox are filled in
// for PDFs, and are what lets the page view point at the word you are on.

const SOFT_HYPHEN = "­";

// A hyphen ending a line, between two letters, is a word the typesetter
// broke across lines rather than a real hyphen.
const LINE_HYPHEN = /(\w)[-‐‑]\n(?=[a-zà-ÿ])/gu;
const BLANK_LINES = /\n{2,}/g;
const SOFT_WRAP = /(?<!\n)\n(?!\n)/g;
const HORIZONTAL_SPACE = /[ \t   ]+/g;

export function normalize(raw) {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.split(SOFT_HYPHEN).join("").replace(/\f/g, "\n\n");
  text = text.replace(LINE_HYPHEN, "$1");
  text = text.replace(BLANK_LINES, "\n\n");
  text = text.replace(SOFT_WRAP, " ");
  text = text.replace(HORIZONTAL_SPACE, " ");
  return text.trim();
}

/** Split normalised text into display tokens, punctuation attached. */
export function tokenize(text) {
  const tokens = [];
  for (const paragraph of text.split("\n\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    words.forEach((word, i) => {
      tokens.push({
        text: word,
        paraEnd: i === words.length - 1,
        page: -1,
        bbox: null,
      });
    });
  }
  return tokens;
}

export function tokenizeText(raw) {
  return tokenize(normalize(raw));
}

// ---------------------------------------------------------------- PDF

/**
 * Tokenize a PDF, keeping each word's page and rectangle.
 *
 * PDF.js hands back text as runs, not words, so each run is split on
 * whitespace and its width shared out across the pieces by character
 * count.  That is an approximation - PyMuPDF gives exact per-word boxes -
 * but it is accurate enough to highlight the right word on the page.
 */
export async function tokenizePdf(pdf, onProgress) {
  const tokens = [];
  let pending = null;          // fragment left dangling by a line hyphen
  let lastY = null;
  let lastHeight = 12;

  for (let pageNo = 0; pageNo < pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!item.str) continue;
      const height = item.height || lastHeight || 12;
      // PDF y grows upward; flip so bbox matches the rendered image.
      const x = item.transform[4];
      const yTop = viewport.height - item.transform[5] - height;

      if (lastY !== null && Math.abs(yTop - lastY) > height * 1.8
          && tokens.length) {
        // A gap bigger than a line: treat it as a paragraph break.
        tokens[tokens.length - 1].paraEnd = true;
      }
      if (item.str.trim()) { lastY = yTop; lastHeight = height; }

      const pieces = item.str.split(/\s+/).filter(Boolean);
      if (!pieces.length) continue;
      const totalChars = pieces.reduce((n, p) => n + p.length, 0) || 1;
      let cursor = x;

      for (const piece of pieces) {
        const width = (item.width || 0) * (piece.length / totalChars);
        const bbox = [cursor, yTop, cursor + width, yTop + height];
        cursor += width;

        if (pending) {
          const joined = /^[a-zà-ÿ]/.test(piece)
            ? pending.text + piece
            : `${pending.text}-${piece}`;
          tokens.push({ text: joined, paraEnd: false,
                        page: pending.page, bbox: pending.bbox });
          pending = null;
          continue;
        }
        if (piece.length > 1 && /[-‐‑]$/.test(piece)
            && piece === pieces[pieces.length - 1] && item.hasEOL) {
          pending = { text: piece.slice(0, -1), page: pageNo, bbox };
          continue;
        }
        tokens.push({ text: piece, paraEnd: false, page: pageNo, bbox });
      }
    }
    if (onProgress) onProgress(pageNo + 1, pdf.numPages);
  }

  if (pending) {
    tokens.push({ text: pending.text, paraEnd: false,
                  page: pending.page, bbox: pending.bbox });
  }
  if (tokens.length) tokens[tokens.length - 1].paraEnd = true;
  return tokens;
}
