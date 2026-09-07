import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'threads',
  },
  resolve: {
    alias: {
      // RN's entry is Flow (`import typeof`); tests only need Platform.
      'react-native': path.join(root, 'vitest.react-native.ts'),
    },
  },
});
