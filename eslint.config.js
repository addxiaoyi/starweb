import globals from 'globals'

export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-duplicate-case': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-extra-semi': 'warn',
      'no-unreachable': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': ['warn', { destructuring: 'all' }],
      'no-throw-literal': 'error',
    },
  },
  {
    ignores: ['node_modules/**', 'data/**', 'uploads/**'],
  },
]
