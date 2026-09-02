import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolves the `@/*` alias straight from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
