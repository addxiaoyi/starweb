import eslint from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'data/**', 'uidl/**'] },
  eslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]
