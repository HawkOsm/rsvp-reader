import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

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
  {
    // The UI talks to the rest of the app only through src/api: one typed,
    // in-process boundary (there is no server). It may not reach past it.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/storage', '**/storage/*', '**/parse', '**/parse/*', '**/pdf', '**/pdf/*', '**/ocr', '**/ocr/*'],
              message: 'The UI goes through src/api, not straight to storage, parsing, PDF or OCR.',
            },
          ],
        },
      ],
    },
  },
)