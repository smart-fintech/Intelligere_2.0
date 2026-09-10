import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // shadcn/ui generates these files - we don't hand-edit them.
    // Each one exports a component PLUS its style variants
    // (e.g. `Button` and `buttonVariants`), which the react-refresh
    // rule normally complains about. That mixed export is intentional
    // here, so we turn the rule off for this folder only.
    files: ['src/Components/ui/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
      // These files always `import * as React` even when they never
      // reference it directly - that unused import is fine here.
      'no-unused-vars': ['error', { varsIgnorePattern: '^React$' }],
    },
  },
])
