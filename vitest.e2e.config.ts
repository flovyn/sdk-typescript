import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@flovyn/sdk/testing': path.resolve(__dirname, 'packages/sdk/src/testing/index.ts'),
      '@flovyn/sdk': path.resolve(__dirname, 'packages/sdk/src/index.ts'),
      '@flovyn/native': path.resolve(__dirname, 'packages/native/src/index.ts'),
    },
  },
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    // E2E tests use real containers, so they're slower
    testTimeout: 60000,
    hookTimeout: 120000,
    // Run tests sequentially since they share containers
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Global setup/teardown for test harness (runs once, not per file)
    globalSetup: ['./tests/e2e/globalSetup.ts'],
    // Globals for describe, it, expect
    globals: true,
  },
});
