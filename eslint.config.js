import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/archive/**', '.chrome-profile/**', 'apps/browser/src/simplepeer.min.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Migrated code: keep lint useful, not blocking, until Step 5 turns strict on.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-async-promise-executor': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'prefer-spread': 'off',
      'no-constant-condition': 'off',
    },
  },
  {
    // Legacy untyped JS in the app; Step 5 types or deletes it.
    files: ['apps/browser/src/**/*.js'],
    rules: { 'no-undef': 'off' },
  },
  {
    // The boundary that keeps @bolt/core runnable anywhere: no DOM, no UI.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'location', 'localStorage'],
      'no-restricted-imports': ['error', { paths: ['mithril'], patterns: ['**/components/**', '**/view/**', '@bolt/web-ble'] }],
      // core is written strict: what the migrated-code block above switched off is on here
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-async-promise-executor': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
);
