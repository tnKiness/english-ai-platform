import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'var/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  // P1: allow `const { dropped, ...rest } = row` to strip storage-only columns from DTOs.
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', setInterval: 'readonly' } } },
);
