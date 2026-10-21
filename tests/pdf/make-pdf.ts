/** A one-page PDF built by hand, for tests that need a page the fixtures
 * are not: rotated, an odd-sized or offset box, a given size. Text is
 * Helvetica, placed with its baseline-left at `at` in PDF user space. */
export interface PageSpec {
  mediaBox?: [number, number, number, number]
  cropBox?: [number, number, number, number]
  rotate?: 0 | 90 | 180 | 270
  text?: string
  at?: [number, number]
  fontSize?: number
}

export function makePdf({
  mediaBox = [0, 0, 612, 792],
  cropBox,
  rotate = 0,
  text = 'Hello world',
  at = [72, 700],
  fontSize = 12,
}: PageSpec = {}): Uint8Array {
  const stream = `BT /F1 ${fontSize} Tf ${at[0]} ${at[1]} Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox.join(' ')}]` +
      (cropBox ? ` /CropBox [${cropBox.join(' ')}]` : '') +
      (rotate ? ` /Rotate ${rotate}` : '') +
      ' /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(body)
}
