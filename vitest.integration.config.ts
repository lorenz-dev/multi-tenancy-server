import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config({ path: '.env.test', override: true });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/tests/integration/**/*.test.ts',
      'src/tests/api/**/*.test.ts',
      'src/tests/security/**/*.test.ts',
      'src/tests/permissions/**/*.test.ts',
      'src/tests/jobs/**/*.test.ts',
      'src/tests/cache/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.config.ts',
        '**/*.test.ts',
        'src/tests/**',
      ],
    },
  },
});
