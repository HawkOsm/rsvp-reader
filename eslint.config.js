import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// ---------------------------------------------------------------- layers
//
// Imports point one way, from the bottom up:
//
//   core              the RSVP engine, no DOM
//   parse, storage    file parsers and IndexedDB
//   lib, components,  shared by every feature
//   stores
//   features/<name>   one folder per task; its api/ is the only part that
//                     touches storage or the parsers
//   app               routes and app-wide hooks
//
// A feature never imports another feature; the app composes them.

const FEATURES = ['library', 'reader', 'settings']

/** An import of one of `folders` under src/, by alias or relative path. */
const into = (folders) => `^(@/|(\\.{1,2}/)+)(${folders.join('|')})(/|$)`

const restrict = (...patterns) => ({
  'no-restricted-imports': [
    'error',
    { patterns: patterns.map(([regex, message]) => ({ regex, message })) },
  ],
})

const PARENT_RELATIVE = ['^\\.\\./', "Import from another folder with '@/', not '../'."]
const NO_UI = [
  into(['app', 'features', 'stores', 'components', 'lib']),
  'Lower layers must not import UI code.',
]
const NO_APP = [into(['app']), 'Only the app imports from src/app.']
const NO_FEATURES = [into(['features']), 'Shared code must not depend on a feature.']
// pdf.js's worker setup is rendering, not parsing, so the reader may load it.
const NO_DATA = [
  '^@/(storage|parse)(/(?!pdf/worker-src$).*)?$',
  "Go through the feature's api/ for storage and parsing.",
]
const otherFeatures = (name) => [
  `^@/features/(?!${name}/)`,
  'Features must not import each other; compose them in src/app.',
]

const layers = [
  {
    files: ['src/core/**'],
    rules: restrict([into(['parse', 'storage']), 'core has no I/O.'], NO_UI),
  },
  { files: ['src/parse/**', 'src/storage/**'], rules: restrict(NO_UI) },
  {
    files: ['src/lib/**', 'src/components/**', 'src/stores/**'],
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
      rules: restrict(PARENT_RELATIVE, NO_APP, NO_DATA, otherFeatures(name)),
    },
  ]),
  { files: ['src/app/**', 'src/main.tsx'], rules: restrict(PARENT_RELATIVE, NO_DATA) },
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
