import { useEffect, useState } from 'react'
import { OCR_LANGUAGES, type OcrLanguage } from '../../api'
import { Button } from './Button'

export interface OcrDialogProps {
  fileName: string
  onStart: (language: OcrLanguage) => void
  onCancel: () => void
}

/** Offered when a PDF has no text to read: a scan, or a photo of a page. */
export function OcrDialog({ fileName, onStart, onCancel }: OcrDialogProps) {
  const [language, setLanguage] = useState<OcrLanguage>('eng')
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recognise text"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-96 max-w-[90vw] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-5 text-[var(--color-text)]">
        <p className="mb-1 font-medium">{fileName}</p>
        <p className="mb-4 text-sm text-[var(--color-text-dim)]">
          This PDF has no text to read — it looks like a scan. The app can recognise the text from
          the page images. It runs on this device, nothing is uploaded, and it takes a few seconds
          a page. Expect the odd mistake.
        </p>
        <label className="mb-4 flex items-center justify-between gap-3 text-sm">
          Language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1"
          >
            {OCR_LANGUAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-2">
          <Button onClick={() => onStart(language)} autoFocus variant="primary">
            Recognise text
          </Button>
          <Button onClick={onCancel} variant="link" className="px-3 py-1.5">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
