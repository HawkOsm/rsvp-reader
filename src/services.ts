import { ImportService, workerParser, type BookParser } from './importing'
import { LibraryService } from './library'
import { ReadingService } from './reading'
import { SettingsService } from './settings'
import { DexieRepository } from './storage/repository'
import { getDb, type RsvpDatabase } from './storage/schema'

// The one place the app's services are wired to their storage and parser
// (Facade + Factory). The UI asks for a service here and never touches
// src/storage/ or src/parse/ itself — eslint.config.js holds it to that.

export interface Services {
  library: LibraryService
  importing: ImportService
  reading: ReadingService
  settings: SettingsService
}

export interface ServiceDeps {
  db?: RsvpDatabase
  parser?: BookParser
}

/** Build a set of services. Tests pass their own database and the inline
 * parser; the app uses getServices(). */
export function createServices(deps: ServiceDeps = {}): Services {
  const repo = new DexieRepository(deps.db ?? getDb())
  return {
    library: new LibraryService(repo),
    importing: new ImportService(repo, deps.parser ?? workerParser),
    reading: new ReadingService(repo),
    settings: new SettingsService(repo),
  }
}

let instance: Services | null = null

/** The app's services, created on first use. */
export function getServices(): Services {
  instance ??= createServices()
  return instance
}
