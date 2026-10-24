import { Button } from '@/components/Button'
import { Dialog, DialogActions } from '@/components/Dialog'

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
    <Dialog
      label="Resume reading"
      title={title}
      description={`You're ${progressPercent.toFixed(0)}% through this book.`}
      onCancel={onCancel}
    >
      <DialogActions>
        <Button onClick={onResume} autoFocus variant="primary">
          Resume
        </Button>
        <Button onClick={onStartOver}>Start over</Button>
        <Button onClick={onCancel} variant="link" className="px-3 py-1.5">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  )
}
