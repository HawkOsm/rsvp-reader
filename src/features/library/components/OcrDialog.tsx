import { useState } from 'react'
import { OCR_LANGUAGES, type OcrLanguage } from '@/features/library/api/files'
import { Button } from '@/components/Button'
import { Dialog, DialogActions } from '@/components/Dialog'
import { CONTROL, Field } from '@/components/Field'

export interface OcrDialogProps {
  fileName: string
  onStart: (language: OcrLanguage) => void
  onCancel: () => void
}

/** Offered when a PDF has no text to read: a scan, or a photo of a page. */
export function OcrDialog({ fileName, onStart, onCancel }: OcrDialogProps) {
  const [language, setLanguage] = useState<OcrLanguage>('eng')
  return (
    <Dialog
      label="Recognise text"
      title={fileName}
      description="This PDF has no text to read — it looks like a scan. The app can recognise the text from the page images. It runs on this device, nothing is uploaded, and it takes a few seconds a page. Expect the odd mistake."
      onCancel={onCancel}
    >
      <div className="mb-4">
        <Field label="Language" inline>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
            className={CONTROL}
          >
            {OCR_LANGUAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <DialogActions>
        <Button onClick={() => onStart(language)} autoFocus variant="primary">
          Recognise text
        </Button>
        <Button onClick={onCancel} variant="link" className="px-3 py-1.5">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}
