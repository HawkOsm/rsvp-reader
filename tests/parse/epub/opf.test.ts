import { describe, expect, it } from 'vitest'
import { parseContainer, parseOpf } from '../../../src/parse/epub/opf'

const CONTAINER_XML = `<?xml version="1.0"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

const OPF_XML = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <metadata>
    <dc:title>Test Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
  </metadata>
  <manifest>
    <item id="cover" href="cover.html" media-type="application/xhtml+xml"/>
    <item id="ch1" href="text/chapter1.html" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/chapter2.html" media-type="application/xhtml+xml"/>
    <item id="notlinear" href="ads.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="ch1"/>
    <itemref idref="notlinear" linear="no"/>
    <itemref idref="ch2"/>
  </spine>
</package>`

describe('parseContainer', () => {
  it('finds the rootfile path', () => {
    expect(parseContainer(CONTAINER_XML)).toBe('OEBPS/content.opf')
  })

  it('throws on XML with no rootfile', () => {
    expect(() =>
      parseContainer('<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"/>'),
    ).toThrow()
  })
})

describe('parseOpf', () => {
  it('extracts title and author', () => {
    const result = parseOpf(OPF_XML)
    expect(result.title).toBe('Test Book')
    expect(result.author).toBe('Jane Doe')
  })

  it('resolves the spine in reading order through the manifest, skipping linear="no"', () => {
    const result = parseOpf(OPF_XML)
    expect(result.spineHrefs).toEqual(['cover.html', 'text/chapter1.html', 'text/chapter2.html'])
  })

  it('falls back to "Untitled" with no dc:title, and undefined author with no dc:creator', () => {
    const minimal = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata></metadata>
  <manifest><item id="a" href="a.html" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="a"/></spine>
</package>`
    const result = parseOpf(minimal)
    expect(result.title).toBe('Untitled')
    expect(result.author).toBeUndefined()
  })
})
