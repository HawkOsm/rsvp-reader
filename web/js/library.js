// RSVP Reader - a local speed reader.
// Copyright (C) 2026 Osman Sahin Guler
// SPDX-License-Identifier: GPL-3.0-or-later

// The library, in IndexedDB.  Mirrors db.py's schema.
//
// One difference forced by the browser: a web page cannot reopen a file
// by path later, so the file's bytes are stored alongside its metadata.
// That keeps a book readable offline and across sessions, at the cost of
// holding a copy on the device.

const DB_NAME = "rsvp-reader";
const DB_VERSION = 1;

const BOOKS = "books";     // { id, title, kind, size, totalWords,
                           //   lastIndex, lastOpenedAt, addedAt }
const TOKENS = "tokens";   // { bookId, tokens: [...] }
const FILES = "files";     // { bookId, data: ArrayBuffer }

/** Write progress at most this often, matching the desktop cadence. */
export const SAVE_EVERY = 20;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOKS)) {
        db.createObjectStore(BOOKS, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(TOKENS)) {
        db.createObjectStore(TOKENS, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES, { keyPath: "bookId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run(storeNames, mode, work) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    result = work(tx);
    if (result && typeof result.then === "function") {
      result.then((value) => { result = value; });
    }
  }));
}

const asPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function listBooks() {
  const db = await open();
  const books = await asPromise(
    db.transaction(BOOKS).objectStore(BOOKS).getAll());
  books.sort((a, b) =>
    (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
  return books;
}

export async function getBook(id) {
  const db = await open();
  return asPromise(db.transaction(BOOKS).objectStore(BOOKS).get(id));
}

/** Add a picked file, keeping its bytes so it can be reopened offline. */
export async function addBook(file, title, kind) {
  const data = await file.arrayBuffer();
  const db = await open();
  const record = {
    title: title || file.name.replace(/\.[^.]+$/, ""),
    kind,
    size: file.size,
    totalWords: 0,
    lastIndex: 0,
    lastOpenedAt: null,
    addedAt: Date.now(),
  };
  const tx = db.transaction([BOOKS, FILES], "readwrite");
  const id = await asPromise(tx.objectStore(BOOKS).add(record));
  tx.objectStore(FILES).put({ bookId: id, data });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return { ...record, id };
}

export async function removeBook(id) {
  const db = await open();
  const tx = db.transaction([BOOKS, TOKENS, FILES], "readwrite");
  tx.objectStore(BOOKS).delete(id);
  tx.objectStore(TOKENS).delete(id);
  tx.objectStore(FILES).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(bookId) {
  const db = await open();
  const row = await asPromise(
    db.transaction(FILES).objectStore(FILES).get(bookId));
  return row ? row.data : null;
}

export async function saveTokens(bookId, tokens) {
  const db = await open();
  const tx = db.transaction([TOKENS, BOOKS], "readwrite");
  tx.objectStore(TOKENS).put({ bookId, tokens });
  const book = await asPromise(tx.objectStore(BOOKS).get(bookId));
  if (book) {
    book.totalWords = tokens.length;
    tx.objectStore(BOOKS).put(book);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadTokens(bookId) {
  const db = await open();
  const row = await asPromise(
    db.transaction(TOKENS).objectStore(TOKENS).get(bookId));
  return row ? row.tokens : null;
}

export async function updateProgress(bookId, index) {
  const db = await open();
  const tx = db.transaction(BOOKS, "readwrite");
  const store = tx.objectStore(BOOKS);
  const book = await asPromise(store.get(bookId));
  if (book) {
    book.lastIndex = Math.round(index);
    book.lastOpenedAt = Date.now();
    store.put(book);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetProgress(bookId) {
  const db = await open();
  const tx = db.transaction(BOOKS, "readwrite");
  const store = tx.objectStore(BOOKS);
  const book = await asPromise(store.get(bookId));
  if (book) { book.lastIndex = 0; store.put(book); }
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Roughly how much space the library is using, when the browser says. */
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const { usage: used, quota } = await navigator.storage.estimate();
  return { used, quota };
}
