import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtractionError, NoTextLayerError } from '../../src/parse/errors'
import type { BookRecord } from '../../src/storage/schema'
import type { ImportBookOptions } from '../../src/api/import-book'
import { LibraryScreen } from '../../src/ui/screens/LibraryScreen'

// The import itself (workers, MuPDF, Tesseract) is covered where it lives;
// this is about what the library screen does with how it turns out.
const importLocalFile = vi.fn<(file: File, options: ImportBookOptions) => Promise<BookRecord>>()
vi.mock('../../src/api/import-book', () => ({
  importLocalFile: (file: File, options: ImportBookOptions) => importLocalFile(file, options),
}))

const book = { id: 7, title: 'Imported' } as BookRecord

function renderLibrary() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LibraryScreen />} />
        <Route path="/reader/:bookId" element={<div data-testid="reader-screen">reader</div>} />
        <Route path="/settings" element={<div />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function addFile(name = 'book.pdf') {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')
  await userEvent.upload(input as HTMLInputElement, new File(['x'], name))
}

const fails = (error: Error) => () => Promise.reject(error)

beforeEach(() => {
  importLocalFile.mockReset()
})

describe('adding a book', () => {
  it('opens the book when the import works', async () => {
    importLocalFile.mockResolvedValue(book)
    renderLibrary()
    await addFile()
    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
    expect(importLocalFile.mock.calls[0]?.[1].ocr).toBeUndefined()
  })

  it('shows the reason when a file cannot be read', async () => {
    importLocalFile.mockImplementation(fails(new ExtractionError('This PDF is password protected.')))
    renderLibrary()
    await addFile()
    expect(await screen.findByText('This PDF is password protected.')).toBeInTheDocument()
  })

  it('does not leak the details of an unexpected failure', async () => {
    importLocalFile.mockImplementation(fails(new Error('worker exploded at 0xdeadbeef')))
    renderLibrary()
    await addFile()
    expect(await screen.findByText('Could not add that file.')).toBeInTheDocument()
    expect(screen.queryByText(/deadbeef/)).not.toBeInTheDocument()
  })
})

describe('a PDF with no text', () => {
  it('offers to recognise the text instead of just failing', async () => {
    importLocalFile.mockImplementation(fails(new NoTextLayerError()))
    renderLibrary()
    await addFile('scan.pdf')
    expect(await screen.findByRole('dialog', { name: 'Recognise text' })).toBeInTheDocument()
    expect(screen.getByText('scan.pdf')).toBeInTheDocument()
    expect(screen.queryByText(/no text layer/i)).not.toBeInTheDocument()
  })

  it('runs OCR in the chosen language when accepted, then opens the book', async () => {
    importLocalFile.mockImplementationOnce(fails(new NoTextLayerError())).mockResolvedValueOnce(book)
    renderLibrary()
    await addFile('scan.pdf')
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'tur')
    await userEvent.click(screen.getByRole('button', { name: 'Recognise text' }))

    expect(await screen.findByTestId('reader-screen')).toBeInTheDocument()
    expect(importLocalFile).toHaveBeenCalledTimes(2)
    expect(importLocalFile.mock.calls[1]?.[1].ocr).toEqual({ language: 'tur' })
  })

  it('defaults to English', async () => {
    importLocalFile.mockImplementationOnce(fails(new NoTextLayerError())).mockResolvedValueOnce(book)
    renderLibrary()
    await addFile('scan.pdf')
    await userEvent.click(await screen.findByRole('button', { name: 'Recognise text' }))
    await waitFor(() => expect(importLocalFile).toHaveBeenCalledTimes(2))
    expect(importLocalFile.mock.calls[1]?.[1].ocr).toEqual({ language: 'eng' })
  })

  it('drops the offer if another file is added while it is open', async () => {
    importLocalFile
      .mockImplementationOnce(fails(new NoTextLayerError()))
      .mockImplementationOnce(() => new Promise<BookRecord>(() => {})) // still importing
    renderLibrary()
    await addFile('scan.pdf')
    await screen.findByRole('dialog', { name: 'Recognise text' })
    await addFile('other.txt') // Ctrl+O or a drop still works behind the dialog
    await screen.findByRole('status') // the new import is running...
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // ...and the old offer is gone
    expect(importLocalFile).toHaveBeenCalledTimes(2)
  })

  it('leaves the file out when declined', async () => {
    importLocalFile.mockImplementation(fails(new NoTextLayerError()))
    renderLibrary()
    await addFile('scan.pdf')
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(importLocalFile).toHaveBeenCalledTimes(1)
  })

  it('does not offer OCR again if OCR itself finds nothing', async () => {
    importLocalFile
      .mockImplementationOnce(fails(new NoTextLayerError()))
      .mockImplementationOnce(fails(new ExtractionError('No text could be recognised in this PDF.')))
    renderLibrary()
    await addFile('scan.pdf')
    await userEvent.click(await screen.findByRole('button', { name: 'Recognise text' }))
    expect(await screen.findByText('No text could be recognised in this PDF.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('while an import is running', () => {
  /** An import that finishes when told to. */
  function pendingImport() {
    let finish: (value: BookRecord) => void = () => {}
    importLocalFile.mockImplementation(
      () => new Promise<BookRecord>((resolve) => (finish = resolve)),
    )
    return { finish: (value: BookRecord) => finish(value) }
  }

  it('does not start a second import, and shows Add book as unavailable', async () => {
    pendingImport()
    renderLibrary()
    await addFile('first.pdf')
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add book' })).toBeDisabled()

    await addFile('second.pdf')
    expect(importLocalFile).toHaveBeenCalledTimes(1)
  })

  it('lets Cancel still cancel the first import after a second file was refused', async () => {
    let firstSignal: AbortSignal | undefined
    importLocalFile.mockImplementation(
      (_file, { signal }) =>
        new Promise<BookRecord>((_, reject) => {
          firstSignal = signal
          signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))
        }),
    )
    renderLibrary()
    await addFile('first.pdf')
    await screen.findByRole('status')
    await addFile('second.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(firstSignal?.aborted).toBe(true)
  })

  it('cancels, and does not open the book, if the reader leaves the screen', async () => {
    let signal: AbortSignal | undefined
    const { finish } = (() => {
      let done: (value: BookRecord) => void = () => {}
      importLocalFile.mockImplementation((_file, options) => {
        signal = options.signal
        return new Promise<BookRecord>((resolve) => (done = resolve))
      })
      return { finish: (value: BookRecord) => done(value) }
    })()
    const { unmount } = renderLibrary()
    await addFile()
    await screen.findByRole('status')
    unmount()
    expect(signal?.aborted).toBe(true)
    finish(book) // even if it finished anyway, nothing should happen
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
})

describe('cancelling an import', () => {
  it('aborts the import and shows no error', async () => {
    importLocalFile.mockImplementation(
      (_file, { signal }) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Parsing cancelled', 'AbortError')),
          )
        }),
    )
    renderLibrary()
    await addFile()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByText(/Could not add/)).not.toBeInTheDocument()
  })
})
