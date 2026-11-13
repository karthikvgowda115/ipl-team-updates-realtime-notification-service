import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off', // the server logs to stdout on purpose (no secrets are logged)
    },
  },
  {
    // Express global type augmentation (`declare global { namespace Express … }`) needs a namespace.
    files: ['src/types/express.d.ts'],
    rules: { '@typescript-eslint/no-namespace': 'off' },
  },
);
