import { DOMParser } from 'linkedom/worker'

// EPUBs are parsed in parse.worker.ts, and dedicated workers have no
// DOMParser. linkedom is a small DOM written in plain JS, so it runs the same
// in the worker, in the unit tests and on the main thread. `linkedom/worker`
// is its pre-bundled build; the plain one pulls in CommonJS that the worker
// bundle can't import. linkedom is lenient: it has no namespaces (see opf.ts)
// and never reports a parse error.

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html') as unknown as Document
}

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document
}
