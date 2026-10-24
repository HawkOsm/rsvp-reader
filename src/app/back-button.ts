/** What the system back button does, in order: close the page panel, then
 * leave the reader (or any other screen) for the library, then leave the app. */
export type BackAction = 'close-panel' | 'to-library' | 'exit'

export function backAction(pathname: string, panelOpen: boolean): BackAction {
  if (pathname.startsWith('/reader/') && panelOpen) return 'close-panel'
  if (pathname === '/') return 'exit'
  return 'to-library'
}
