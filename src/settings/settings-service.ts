import type { SettingsRepository } from '../storage/repository'

/** User preferences, as a key/value store the UI fills from its defaults. */
export class SettingsService {
  private readonly repo: SettingsRepository

  constructor(repo: SettingsRepository) {
    this.repo = repo
  }

  /** Every key in `defaults`, with the saved value where there is one. */
  async load<T extends object>(defaults: T): Promise<T> {
    const keys = Object.keys(defaults) as (keyof T & string)[]
    const values = await Promise.all(keys.map((k) => this.repo.getSetting(k, defaults[k])))
    return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as T
  }

  save(key: string, value: unknown): Promise<void> {
    return this.repo.setSetting(key, value)
  }
}
