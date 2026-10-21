import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
    // Test files share one SQLite file (.vitest.sqlite), so run them one by one
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'lcov', 'clover'],
    },
  },
});

