// Copies OCR's engine and language data from node_modules into public/ocr,
// so they are served (and shipped) at fixed URLs: Tesseract builds a file
// name from a language code, so the files cannot be hashed by the bundler.
// Runs before `dev` and `build`; public/ocr is not committed.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  [
    'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
    'tesseract-core-simd-lstm.wasm.js',
  ],
  [
    'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
    'lang/eng.traineddata.gz',
  ],
  [
    'node_modules/@tesseract.js-data/tur/4.0.0_best_int/tur.traineddata.gz',
    'lang/tur.traineddata.gz',
  ],
]

for (const [from, to] of files) {
  const target = join(root, 'public/ocr', to)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(root, from), target)
}
console.log(`Copied ${files.length} OCR files to public/ocr`)
