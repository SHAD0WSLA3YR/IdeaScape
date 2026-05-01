import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'sonner@2.0.3': 'sonner',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
