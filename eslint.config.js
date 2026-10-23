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
    // The UI goes through src/services.ts and the task folders (library/,
    // importing/, reading/, settings/), never straight to storage or the
    // parsers. pdf.js's worker setup is the one exception: it's rendering,
    // not parsing.
    files: ['src/ui/**/*.{ts,tsx}', 'src/App.tsx', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)(storage|parse)(/(?!pdf/worker-src$).*)?$',
              message: 'Use a service from src/services.ts instead.',
            },
          ],
        },
      ],
    },
  },
)
