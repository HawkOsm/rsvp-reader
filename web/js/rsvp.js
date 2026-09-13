// RSVP Reader - a local speed reader.
// Copyright (C) 2026 Osman Sahin Guler
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 3 of the License, or (at your
// option) any later version.  See <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

// The reading engine: how long to hold each word, and which letter to pin.
// A direct port of rsvp_engine.py - the constants and the heuristic are
// deliberately identical, so both versions read at the same rhythm.

export const LONG_WORD_THRESHOLD = 6;
export const MS_PER_EXTRA_CHAR = 30;
export const SHORT_PAUSE_MULT = 1.5;   // , ; : dashes
export const LONG_PAUSE_MULT = 2.5;    // . ! ? ...
export const PARAGRAPH_PAUSE_MS = 350;
export const MIN_DELAY_MS = 20;

export const MIN_WPM = 50;
export const MAX_WPM = 1500;
export const DEFAULT_WPM = 300;

const SHORT_PAUSE_CHARS = new Set([",", ";", ":", "—", "–"]);
const LONG_PAUSE_CHARS = new Set([".", "!", "?", "…"]);

// Characters that wrap real punctuation and should be looked past.
const CLOSERS = "\"'’”»)]}*_";
const STRIPPABLE = "\"'‘’“”«»()[]{}.,;:!?…—–-*_";

function strip(word, chars) {
  let start = 0;
  let end = word.length;
  while (start < end && chars.includes(word[start])) start += 1;
  while (end > start && chars.includes(word[end - 1])) end -= 1;
  return word.slice(start, end);
}

function stripEnd(word, chars) {
  let end = word.length;
  while (end > 0 && chars.includes(word[end - 1])) end -= 1;
  return word.slice(0, end);
}

/** The word without its surrounding punctuation and quotes. */
export function core(word) {
  return strip(word, STRIPPABLE);
}

/** How much longer to hold a word, based on what it ends with. */
export function punctuationMultiplier(word) {
  const trimmed = stripEnd(word, CLOSERS);
  if (!trimmed) return 1.0;
  const last = trimmed[trimmed.length - 1];
  if (LONG_PAUSE_CHARS.has(last)) return LONG_PAUSE_MULT;
  if (SHORT_PAUSE_CHARS.has(last)) return SHORT_PAUSE_MULT;
  return 1.0;
}

/** Milliseconds to hold `token` on screen at `wpm`. */
export function delayFor(token, wpm) {
  let base = 60000 / Math.max(1, wpm);
  const length = core(token.text).length || token.text.length;
  base += MS_PER_EXTRA_CHAR * Math.max(0, length - LONG_WORD_THRESHOLD);
  let delay = base * punctuationMultiplier(token.text);
  if (token.paraEnd) delay += PARAGRAPH_PAUSE_MS;
  return Math.max(MIN_DELAY_MS, delay);
}

/**
 * Index of the Optimal Recognition Point letter within `word`.
 *
 * Standard heuristic on the letters of the word (leading quotes and
 * brackets are skipped): 1 letter -> the 1st, 2-5 -> the 2nd, 6-9 -> the
 * 3rd, 10-13 -> the 4th, longer -> the 5th.
 */
export function orpIndex(word) {
  if (!word) return 0;
  let start = 0;
  while (start < word.length - 1 && !isAlnum(word[start])) start += 1;
  const tail = word.slice(start);
  const c = core(tail) || tail;
  const n = c.length;
  let offset;
  if (n <= 1) offset = 0;
  else if (n <= 5) offset = 1;
  else if (n <= 9) offset = 2;
  else if (n <= 13) offset = 3;
  else offset = 4;
  return Math.min(start + offset, word.length - 1);
}

function isAlnum(ch) {
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Steps through a token list one word at a time.
 *
 * Uses a self-correcting timer: setTimeout drifts, and on a phone the
 * browser throttles timers in the background, so each tick schedules the
 * next from the wall clock rather than assuming the last one was punctual.
 */
export class RsvpEngine extends EventTarget {
  constructor() {
    super();
    this.tokens = [];
    this.index = 0;
    this.wpm = DEFAULT_WPM;
    this._timer = null;
    this._due = 0;
  }

  get count() { return this.tokens.length; }
  get currentToken() { return this.tokens[this.index] ?? null; }
  get isPlaying() { return this._timer !== null; }
  get atEnd() { return this.index >= this.tokens.length - 1; }

  progress() {
    return this.tokens.length ? this.index / this.tokens.length : 0;
  }

  load(tokens, index = 0) {
    this.pause();
    this.tokens = tokens;
    this.index = this._clamp(index);
    this._emit("word");
  }

  setWpm(wpm) {
    this.wpm = Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm)));
  }

  play() {
    if (!this.tokens.length || this.isPlaying) return;
    if (this.atEnd) this.seek(0);
    this._schedule();
    this._emit("playing");
  }

  pause() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
      this._emit("playing");
    }
  }

  toggle() { this.isPlaying ? this.pause() : this.play(); }

  seek(index) {
    if (!this.tokens.length) return;
    this.index = this._clamp(index);
    this._emit("word");
    if (this.isPlaying) this._schedule();
  }

  skip(delta) { this.seek(this.index + delta); }

  _clamp(index) {
    if (!this.tokens.length) return 0;
    return Math.max(0, Math.min(Math.round(index), this.tokens.length - 1));
  }

  _schedule() {
    const token = this.currentToken;
    if (!token) return;
    if (this._timer !== null) clearTimeout(this._timer);
    this._due = performance.now() + delayFor(token, this.wpm);
    this._tick();
  }

  _tick() {
    const remaining = this._due - performance.now();
    if (remaining > 4) {
      // Re-check rather than trusting one long timeout to be accurate.
      this._timer = setTimeout(() => this._tick(), remaining);
      return;
    }
    this._advance();
  }

  _advance() {
    if (this.index >= this.tokens.length - 1) {
      this._timer = null;
      this._emit("playing");
      this._emit("finished");
      return;
    }
    this.index += 1;
    this._emit("word");
    this._schedule();
  }

  _emit(name) { this.dispatchEvent(new CustomEvent(name)); }
}
