import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules', '.wrangler', 'coverage'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __BUILD_TIME__: 'readonly',
      },
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
