import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import nextPlugin from 'eslint-config-next';

const compat = new FlatCompat({
  baseConfig: js.configs.recommended,
  resolvePluginsRelativeTo: __dirname,
});

export default [
  js.configs.recommended,
  ...compat.config(nextPlugin),
  {
    rules: {
      // Add any custom rules here
    },
  },
];
