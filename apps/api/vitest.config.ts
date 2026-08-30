import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', include: ['test/**/*.test.ts'],
    fileParallelism: process.env.RUN_MONGODB_TESTS !== '1',
    coverage: { provider: 'v8', reporter: ['text', 'json-summary'], exclude: ['dist/**', 'test/**'] },
  },
});
