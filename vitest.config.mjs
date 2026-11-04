import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.js'],
    // Test files share one SQLite file (.vitest.sqlite), so run them one by one
    fileParallelism: false,
    // app.js loads .env via dotenv, which never overrides existing vars:
    // keep tests away from the real Telegram chat and GitHub workflow
    env: {
      API_TOKEN: 'test-token',
      CHAT_ID: 'test-chat-id',
      GITHUB_DISPATCH_TOKEN: '',
      GITHUB_REPO: '',
    },
    coverage: {
      reporter: ['text', 'lcov', 'clover'],
    },
  },
});

