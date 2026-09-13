// RSVP Reader - SPDX-License-Identifier: GPL-3.0-or-later
// Offline support: cache the app shell on install, and cache pdf.js the
// first time it is fetched so PDFs keep working with no network.

const CACHE = "rsvp-reader-v3";
const SHELL = [
  ".", "index.html", "css/style.css",
  "js/app.js", "js/rsvp.js", "js/text.js", "js/library.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // pdf.js comes from a CDN: serve from cache first, then fill the cache.
  if (request.url.includes("cdnjs.cloudflare.com")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })));
    return;
  }

  // App shell: cache first, since it only changes when the worker does.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).catch(() =>
      caches.match("index.html"))));
});
