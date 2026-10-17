import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/store/**', 'src/hooks/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Prevent real Firebase SDK from initializing during tests
      'firebase/app': path.resolve(__dirname, './src/__mocks__/firebase/app.ts'),
      'firebase/auth': path.resolve(__dirname, './src/__mocks__/firebase/auth.ts'),
      'firebase/firestore': path.resolve(__dirname, './src/__mocks__/firebase/firestore.ts'),
      'firebase/storage': path.resolve(__dirname, './src/__mocks__/firebase/storage.ts'),
    },
  },
});
