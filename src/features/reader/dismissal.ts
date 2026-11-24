// A tap outside an open popover (the display panel, the phone's reader menu)
// closes it, and must do nothing else: not turn the page, not hide the
// controls. The popover notes the touch that closed it here, and the page's
// own touch handling leaves that touch alone.

let closedBy: Event | null = null

/** Called by a popover, in the capture phase, for the press that closes it. */
export function noteDismissal(press: Event): void {
  closedBy = press
}

/** Whether this press was the one that closed a popover. */
export function wasDismissal(press: Event): boolean {
  return closedBy === press
}
