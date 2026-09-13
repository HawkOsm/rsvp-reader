// RSVP Reader - a local speed reader.
// Copyright (C) 2026 Osman Sahin Guler
// SPDX-License-Identifier: GPL-3.0-or-later

import * as lib from "./library.js";
import { tokenizeText, tokenizePdf } from "./text.js";
import { RsvpEngine, orpIndex, DEFAULT_WPM } from "./rsvp.js";

const PDFJS_VERSION = "4.6.82";
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

// Where the ORP letter is pinned, as a fraction of canvas width - the
// same 0.42 the desktop app uses.
const FOCUS_X_RATIO = 0.42;

const $ = (id) => document.getElementById(id);
const engine = new RsvpEngine();

let book = null;          // the open book record
let unsaved = 0;
let pdfDoc = null;        // pdf.js document, for the page view
let pageView = false;
let wakeLock = null;
let pdfjsLib = null;

// ------------------------------------------------------------ helpers

function toast(message, ms = 2200) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function showView(name) {
  for (const view of document.querySelectorAll(".view")) {
    view.classList.toggle("active", view.id === name);
  }
}

function ask(title, body, actions) {
  return new Promise((resolve) => {
    $("modal-title").textContent = title;
    $("modal-body").innerHTML = body;
    const host = $("modal-actions");
    host.innerHTML = "";
    for (const [label, value, primary] of actions) {
      const button = document.createElement("button");
      button.textContent = label;
      if (primary) button.className = "primary";
      button.onclick = () => { $("modal").hidden = true; resolve(value); };
      host.append(button);
    }
    $("modal").hidden = false;
  });
}

const nf = new Intl.NumberFormat();

function relativeTime(stamp) {
  if (!stamp) return "never opened";
  const seconds = Math.max(0, (Date.now() - stamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(stamp).toLocaleDateString();
}

// -------------------------------------------------------------- pdf.js

async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(`${PDFJS_BASE}/pdf.min.mjs`);
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

// ------------------------------------------------------------ library

async function refreshLibrary() {
  const books = await lib.listBooks();
  const list = $("book-list");
  list.innerHTML = "";
  $("empty").hidden = books.length > 0;

  for (const b of books) {
    const percent = b.totalWords
      ? Math.min(100, Math.round((b.lastIndex / b.totalWords) * 100)) : 0;
    const row = document.createElement("div");
    row.className = "book";
    row.innerHTML = `
      <span class="kind">${b.kind === "pdf" ? "PDF" : "TXT"}</span>
      <span class="meta">
        <span class="name"></span>
        <span class="sub"></span>
      </span>
      <span class="ring">${b.lastIndex ? percent + "%" : ""}</span>
      <button class="del flat" aria-label="Remove">×</button>`;
    row.querySelector(".name").textContent = b.title;
    row.querySelector(".sub").textContent = b.totalWords
      ? `${nf.format(b.totalWords)} words · ${relativeTime(b.lastOpenedAt)}`
      : `not opened yet · ${(b.size / 1024 / 1024).toFixed(1)} MB`;
    row.querySelector(".ring").style.color =
      percent > 0 ? "var(--accent)" : "";
    row.onclick = (event) => {
      if (event.target.closest(".del")) return;
      openBook(b.id);
    };
    row.querySelector(".del").onclick = async () => {
      if (await ask("Remove this book?",
          `<b>${b.title}</b> and your place in it will be deleted from this
           device. The original file is not touched.`,
          [["Cancel", false], ["Remove", true, true]])) {
        await lib.removeBook(b.id);
        refreshLibrary();
        toast("Removed");
      }
    };
    list.append(row);
  }

  const used = await lib.usage();
  $("usage").textContent = used
    ? `${(used.used / 1024 / 1024).toFixed(0)} MB stored on this device` : "";
}

async function addFiles(files) {
  let added = null;
  for (const file of files) {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    added = await lib.addBook(file, null, isPdf ? "pdf" : "txt");
  }
  await refreshLibrary();
  if (files.length === 1 && added) openBook(added.id);
  else if (files.length) toast(`Added ${files.length} files`);
}

// ------------------------------------------------------------- opening

async function tokensFor(b) {
  const cached = await lib.loadTokens(b.id);
  if (cached) return cached;

  const data = await lib.getFile(b.id);
  if (!data) { toast("The file's data is missing"); return null; }

  let tokens;
  if (b.kind === "pdf") {
    toast("Reading the PDF…", 60000);
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
    tokens = await tokenizePdf(doc, (page, total) =>
      toast(`Reading page ${page} of ${total}…`, 60000));
  } else {
    tokens = tokenizeText(new TextDecoder().decode(data));
  }
  $("toast").hidden = true;

  if (!tokens.length) { toast("No readable text found"); return null; }
  await lib.saveTokens(b.id, tokens);
  return tokens;
}

async function openBook(id) {
  book = await lib.getBook(id);
  if (!book) return;

  const tokens = await tokensFor(book);
  if (!tokens) return;
  book = await lib.getBook(id);          // totalWords may have changed

  let start = 0;
  if (book.lastIndex > 0 && book.lastIndex < book.totalWords - 1) {
    const percent = (book.lastIndex / book.totalWords) * 100;
    const choice = await ask("Resume?",
      `You were at word <b>${nf.format(book.lastIndex)}</b> of
       ${nf.format(book.totalWords)} (${percent.toFixed(0)}%).`,
      [["Start over", "restart"], ["Resume", "resume", true]]);
    if (choice === "resume") start = book.lastIndex;
  }

  pdfDoc = null;
  $("page-btn").hidden = book.kind !== "pdf";
  setPageView(false);
  $("title").textContent = book.title;
  engine.load(tokens, start);
  unsaved = 0;
  showView("reader");
  $("hint-overlay").hidden = false;
  resizeCanvas();
}

async function closeBook() {
  engine.pause();
  await flush();
  book = null;
  pdfDoc = null;
  releaseWakeLock();
}

async function flush() {
  if (!book) return;
  await lib.updateProgress(book.id, engine.index);
  unsaved = 0;
}

// ------------------------------------------------------- word drawing

const canvas = $("word-canvas");
const ctx = canvas.getContext("2d");

function fontStack(px) {
  return `500 ${px}px Inter, "Noto Sans", "Segoe UI", Roboto, system-ui, sans-serif`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWord();
}

/**
 * Draw the current word with its ORP letter on a fixed pixel.
 *
 * Identical in spirit to RsvpDisplay.paintEvent: measure the characters
 * before the focus letter, and shift the whole word left by that much
 * plus half the letter, so the letter never moves between words.
 */
function drawWord() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  if (!width || !height) return;

  ctx.clearRect(0, 0, width, height);
  const styles = getComputedStyle(document.documentElement);
  const colText = styles.getPropertyValue("--text").trim();
  const colAccent = styles.getPropertyValue("--accent").trim();
  const colGuide = styles.getPropertyValue("--guide").trim();

  const focusX = width * FOCUS_X_RATIO;
  const centreY = height / 2;
  const token = engine.currentToken;

  // Guide ticks above and below the focus point.
  const base = Math.min(width * 0.13, height * 0.22, 56);
  ctx.strokeStyle = colGuide;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(focusX, centreY - base * 0.95);
  ctx.lineTo(focusX, centreY - base * 0.6);
  ctx.moveTo(focusX, centreY + base * 0.6);
  ctx.lineTo(focusX, centreY + base * 0.95);
  ctx.stroke();

  if (!token) return;
  const word = token.text;
  const orp = orpIndex(word);

  // Shrink oversized words, checking each side of the focus point
  // separately because the word is pinned, not centred.
  let size = base;
  for (let pass = 0; pass < 3; pass += 1) {
    ctx.font = fontStack(size);
    const half = ctx.measureText(word[orp]).width / 2;
    const needLeft = ctx.measureText(word.slice(0, orp)).width + half;
    const needRight = half + ctx.measureText(word.slice(orp + 1)).width;
    const scale = Math.min(1,
      (focusX - 10) / Math.max(needLeft, 0.01),
      (width - focusX - 10) / Math.max(needRight, 0.01));
    if (scale >= 0.999) break;
    size = Math.max(12, size * scale);
  }

  ctx.font = fontStack(size);
  ctx.textBaseline = "middle";
  const prefix = word.slice(0, orp);
  const letter = word[orp];
  const suffix = word.slice(orp + 1);

  let x = focusX - ctx.measureText(prefix).width
          - ctx.measureText(letter).width / 2;
  ctx.fillStyle = colText;
  ctx.fillText(prefix, x, centreY);
  x += ctx.measureText(prefix).width;
  ctx.fillStyle = colAccent;
  ctx.fillText(letter, x, centreY);
  x += ctx.measureText(letter).width;
  ctx.fillStyle = colText;
  ctx.fillText(suffix, x, centreY);
}

// --------------------------------------------------------- page view

const pageCanvas = $("page-canvas");

async function setPageView(on) {
  pageView = on && book?.kind === "pdf";
  $("page-stage").hidden = !pageView;
  $("stage").hidden = pageView;
  $("page-btn").textContent = pageView ? "Word" : "Page";
  if (pageView) await renderPage();
  else resizeCanvas();
}

async function renderPage() {
  const token = engine.currentToken;
  if (!token || token.page < 0) return;
  if (!pdfDoc) {
    const data = await lib.getFile(book.id);
    const pdfjs = await loadPdfjs();
    pdfDoc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  }
  const page = await pdfDoc.getPage(token.page + 1);
  const stage = $("page-stage");
  const target = stage.clientWidth - 20;
  const base = page.getViewport({ scale: 1 });
  const scale = target / base.width;
  const viewport = page.getViewport({ scale });

  const dpr = window.devicePixelRatio || 1;
  pageCanvas.width = Math.round(viewport.width * dpr);
  pageCanvas.height = Math.round(viewport.height * dpr);
  pageCanvas.style.width = `${viewport.width}px`;
  pageCanvas.style.height = `${viewport.height}px`;
  const pctx = pageCanvas.getContext("2d");
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  await page.render({ canvasContext: pctx, viewport }).promise;

  if (token.bbox) {
    const [x0, y0, x1, y1] = token.bbox;
    pctx.fillStyle = "rgba(255,90,95,.32)";
    pctx.fillRect(x0 * scale, y0 * scale,
                  (x1 - x0) * scale, (y1 - y0) * scale);
    pctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent").trim();
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(x0 * scale, y1 * scale);
    pctx.lineTo(x1 * scale, y1 * scale);
    pctx.stroke();
    // Keep the highlighted line in view.
    stage.scrollTop = Math.max(0, y0 * scale - stage.clientHeight / 2);
  }
}

// ------------------------------------------------------- screen wake

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch { /* denied or unsupported; reading still works */ }
}

function releaseWakeLock() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

// ---------------------------------------------------------- readout

function refreshReadout() {
  const total = engine.count;
  const current = total ? engine.index + 1 : 0;
  const percent = total ? (current / total) * 100 : 0;
  let text = `${nf.format(current)} / ${nf.format(total)} · ${percent.toFixed(0)}%`;
  const token = engine.currentToken;
  if (token && token.page >= 0) text += ` · p${token.page + 1}`;
  $("counter").textContent = text;
  $("scrub-fill").style.width = `${engine.progress() * 100}%`;
}

// ------------------------------------------------------------ events

engine.addEventListener("word", () => {
  if (pageView) renderPage();
  else drawWord();
  refreshReadout();
  unsaved += 1;
  if (unsaved >= lib.SAVE_EVERY) flush();
});

engine.addEventListener("playing", () => {
  const playing = engine.isPlaying;
  $("play-btn").textContent = playing ? "Pause" : "Play";
  $("hint-overlay").hidden = playing || engine.index > 0;
  if (playing) requestWakeLock(); else { releaseWakeLock(); flush(); }
});

engine.addEventListener("finished", () => { flush(); toast("End of document"); });

$("add-btn").onclick = () => $("file-input").click();
$("file-input").onchange = (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length) addFiles(files);
};

$("back-btn").onclick = async () => {
  await closeBook();
  await refreshLibrary();
  showView("library");
};

$("play-btn").onclick = () => engine.toggle();
$("tap-play").onclick = () => engine.toggle();
$("tap-back").onclick = () => engine.skip(-1);
$("tap-fwd").onclick = () => engine.skip(1);
$("page-btn").onclick = () => setPageView(!pageView);

$("wpm").oninput = (e) => {
  engine.setWpm(+e.target.value);
  $("wpm-out").textContent = e.target.value;
};

// Scrubbing, with pointer events so touch and mouse behave the same.
const scrub = $("scrub");
let scrubbing = false;
const scrubTo = (clientX) => {
  const rect = scrub.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (engine.count) engine.seek(Math.round(fraction * (engine.count - 1)));
};
scrub.addEventListener("pointerdown", (e) => {
  scrubbing = true; scrub.setPointerCapture(e.pointerId); scrubTo(e.clientX);
});
scrub.addEventListener("pointermove", (e) => { if (scrubbing) scrubTo(e.clientX); });
scrub.addEventListener("pointerup", () => { scrubbing = false; });

// Keyboard, for when this runs on a desktop browser.
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("reader").classList.contains("active")) return;
  if (e.target.tagName === "INPUT") return;
  const step = e.shiftKey ? 10 : 1;
  const keys = {
    " ": () => engine.toggle(),
    ArrowLeft: () => engine.skip(-step),
    ArrowRight: () => engine.skip(step),
    ArrowUp: () => { $("wpm").value = engine.wpm + 25; $("wpm").oninput({ target: $("wpm") }); },
    ArrowDown: () => { $("wpm").value = engine.wpm - 25; $("wpm").oninput({ target: $("wpm") }); },
    Home: () => engine.seek(0),
    End: () => engine.seek(engine.count - 1),
    p: () => $("page-btn").hidden || setPageView(!pageView),
    Escape: () => $("back-btn").click(),
  };
  if (keys[e.key]) { keys[e.key](); e.preventDefault(); }
});

// Pause when the tab is hidden - a backgrounded timer would race ahead.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && engine.isPlaying) engine.pause();
});

window.addEventListener("resize", () => {
  if (pageView) renderPage(); else resizeCanvas();
});

$("about-btn").onclick = () => ask("RSVP Reader",
  `A local speed reader. Words are shown one at a time at a fixed point, with
   one letter highlighted so your eyes never move.
   <br><br>Everything stays on this device — nothing is uploaded.
   <br><br>Free software under the
   <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank"
      rel="noopener">GNU GPL v3</a> or later, with
   <b>absolutely no warranty</b>.
   <br><a href="https://github.com/HawkOsm/rsvp-reader" target="_blank"
      rel="noopener">github.com/HawkOsm/rsvp-reader</a>`,
  [["Close", null, true]]);

// ------------------------------------------------------------- start

engine.setWpm(DEFAULT_WPM);
refreshLibrary();
if ("serviceWorker" in navigator) {
  // Offline support is a bonus, not a requirement - the app works without
  // it. But say why it failed rather than swallowing the reason, since a
  // silent catch here hides exactly the kind of hosting mistake (no HTTPS,
  // wrong scope, stale worker) that breaks installability.
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.warn("Offline support unavailable:", error.message);
  });
}
addEventListener("beforeunload", () => { if (book) lib.updateProgress(book.id, engine.index); });
