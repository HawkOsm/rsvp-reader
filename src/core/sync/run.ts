// One sync run and the devices it saw, as the sync log keeps them. Here,
// below everything, so the sync engine that makes these and the screen that
// lists them share the types.

export type SyncOutcome = 'synced' | 'needs-reconnect' | 'offline' | 'drive-full' | 'error'

export interface SyncRun {
  /** When it started. */
  at: number
  ms: number
  outcome: SyncOutcome
  /** This device's changes sent. */
  sent: number
  /** Other devices' changes that were newer than what was here. */
  received: number
  /** Changes stamped more than a day ahead of this device's clock. */
  skewed: number
  error?: string
}

/** What a device says about itself in its `device-<id>.json`. */
export interface DeviceInfo {
  device: string
  /** A name for people, e.g. "Firefox on Android". Missing from files
   * written before devices had names. */
  name?: string
  lastSeen: number
}
