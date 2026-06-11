import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/calc/**/*.ts'],
      exclude: [
        'src/services/calc/**/*.test.ts',
        'src/services/calc/componentes.data.ts',
        'src/services/calc/**/*.types.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 95,
      },
      reporter: ['text', 'text-summary'],
    },
  },
});
