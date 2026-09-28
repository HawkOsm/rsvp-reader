const DC_NS = 'http://purl.org/dc/elements/1.1/'
const CONTAINER_NS = 'urn:oasis:names:tc:opendocument:xmlns:container'

function parseXml(xmlText: string): Document {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    throw new Error(`Malformed XML: ${parserError.textContent ?? 'unknown error'}`)
  }
  return doc
}

/** container.xml -> the OPF's own path inside the zip (e.g. "OEBPS/content.opf"). */
export function parseContainer(xmlText: string): string {
  const doc = parseXml(xmlText)
  const rootfile =
    doc.getElementsByTagNameNS(CONTAINER_NS, 'rootfile')[0] ??
    doc.getElementsByTagName('rootfile')[0]
  const path = rootfile?.getAttribute('full-path')
  if (!path) throw new Error('container.xml has no <rootfile full-path="...">')
  return path
}

export interface OpfResult {
  title: string
  author?: string
  /** Manifest hrefs in spine (reading) order, relative to the OPF's own
   * directory — not yet resolved to a zip path. */
  spineHrefs: string[]
}

/** content.opf -> title/author metadata and the spine's reading order,
 * resolved from itemref/idref through the manifest to each item's href. */
export function parseOpf(xmlText: string): OpfResult {
  const doc = parseXml(xmlText)

  const title = firstText(doc, DC_NS, 'title') ?? 'Untitled'
  const author = firstText(doc, DC_NS, 'creator')

  const manifest = new Map<string, string>()
  for (const item of Array.from(doc.getElementsByTagName('item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
  }

  const spineHrefs: string[] = []
  for (const itemref of Array.from(doc.getElementsByTagName('itemref'))) {
    if (itemref.getAttribute('linear') === 'no') continue
    const idref = itemref.getAttribute('idref')
    const href = idref ? manifest.get(idref) : undefined
    if (href) spineHrefs.push(href)
  }

  return { title, author: author || undefined, spineHrefs }
}

function firstText(doc: Document, ns: string, localName: string): string | undefined {
  const byNs = doc.getElementsByTagNameNS(ns, localName)[0]
  const el = byNs ?? doc.getElementsByTagName(`dc:${localName}`)[0]
  const text = el?.textContent?.trim()
  return text || undefined
}
