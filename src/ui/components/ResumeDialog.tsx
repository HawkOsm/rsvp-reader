export interface ResumeDialogProps {
  title: string
  progressPercent: number
  onResume: () => void
  onStartOver: () => void
  onCancel: () => void
}

export function ResumeDialog({
  title,
  progressPercent,
  onResume,
  onStartOver,
  onCancel,
}: ResumeDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resume reading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-80 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-5 text-[var(--color-text)]">
        <p className="mb-1 font-medium">{title}</p>
        <p className="mb-4 text-sm text-[var(--color-text-dim)]">
          You're {progressPercent.toFixed(0)}% through this book.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            autoFocus
            className="rounded bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-bg)]"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onStartOver}
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            Start over
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-[var(--color-text-dim)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
