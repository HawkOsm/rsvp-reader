import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// ---------------------------------------------------------------- layers
//
// Imports point one way, from the bottom up (see ARCHITECTURE.md):
//
//   core                          the RSVP engine and pure types; no I/O, no DOM
//   parse, pdf, ocr, storage      the "backend": parsers, MuPDF, Tesseract, IndexedDB
//   lib, components, stores       shared by every feature
//   features/<name>               one folder per task; only its api/ touches the backend
//   app                           routes, shell and app-wide hooks
//
// A feature never imports another feature; the app composes them. Any folder
// named api/ is a door to the backend; nothing else in the UI may open one.

const FEATURES = ['library', 'reader', 'settings']
const BACKEND = ['parse', 'pdf', 'ocr', 'storage']
const UI = ['app', 'features', 'stores', 'components', 'lib']

/** An import of one of `folders` under src/, by alias or relative path. */
const into = (folders) => `^(@/|(\\.{1,2}/)+)(${folders.join('|')})(/|$)`

const restrict = (...patterns) => ({
  'no-restricted-imports': [
    'error',
    { patterns: patterns.map(([regex, message]) => ({ regex, message })) },
  ],
})

const PARENT_RELATIVE = ['^\\.\\./', "Import from another folder with '@/', not '../'."]
const NO_UI = [into(UI), 'The backend and core must not import UI code.']
const NO_APP = [into(['app']), 'Only the app imports from src/app.']
const NO_FEATURES = [into(['features']), 'Shared code must not depend on a feature.']
const NO_BACKEND = [
  into(BACKEND),
  'UI code reaches parsing, PDF, OCR and storage only through an api/ folder.',
]
const otherFeatures = (name) => [
  `^@/features/(?!${name}/)`,
  'Features must not import each other; compose them in src/app.',
]

const layers = [
  {
    files: ['src/core/**'],
    rules: restrict([into(BACKEND), 'core has no I/O.'], NO_UI),
  },
  { files: BACKEND.map((dir) => `src/${dir}/**`), rules: restrict(NO_UI) },
  {
    files: ['src/lib/**', 'src/components/**', 'src/stores/**'],
    ignores: ['src/stores/api/**'],
    rules: restrict(PARENT_RELATIVE, NO_APP, NO_FEATURES, NO_BACKEND),
  },
  {
    files: ['src/stores/api/**'],
    rules: restrict(PARENT_RELATIVE, NO_APP, NO_FEATURES),
  },
  ...FEATURES.flatMap((name) => [
    {
      files: [`src/features/${name}/api/**`],
      rules: restrict(PARENT_RELATIVE, NO_APP, otherFeatures(name)),
    },
    {
      files: [`src/features/${name}/**`],
      ignores: [`src/features/${name}/api/**`],
      rules: restrict(PARENT_RELATIVE, NO_APP, NO_BACKEND, otherFeatures(name)),
    },
  ]),
  { files: ['src/app/**', 'src/main.tsx'], rules: restrict(PARENT_RELATIVE, NO_BACKEND) },
]

export default tseslint.config(
  globalIgnores([
    'dist',
    'src-tauri/target',
    'android',
    '.venv',
    '__pycache__',
    'docs',
    'share',
    'tools',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
    },
  },
  ...layers,
)
