/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: 'dashboard',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
      exclude: ['**/dist/**', '**/node_modules/**'],
      css: false,
    },
  })
);
