import { Button } from './Button'


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
          <Button
            onClick={onResume}
            autoFocus
            variant="primary"
          >
            Resume
          </Button>
          <Button
            onClick={onStartOver}
            
          >
            Start over
          </Button>
          <Button onClick={onCancel} variant="link" className="px-3 py-1.5">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
