import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement IndexedDB; fake-indexeddb polyfills the globals
// (indexedDB, IDBKeyRange, ...) that Dexie needs, so storage tests run
// without a real browser.
import 'fake-indexeddb/auto'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

// jsdom's Blob/File are missing `arrayBuffer()`/`text()` (only
// slice/size/type), and more importantly the environment's structuredClone
// (what fake-indexeddb uses internally to store a value) doesn't know how
// to clone jsdom's Blob at all — it silently comes back as an empty plain
// object. Real browsers, Tauri's webview and Capacitor's WebView have none
// of these gaps; this is purely a jsdom test-environment limitation, so
// swap in Node's own fully-featured, structuredClone-safe Blob/File.
globalThis.Blob = NodeBlob as unknown as typeof Blob
globalThis.File = NodeFile as unknown as typeof File
