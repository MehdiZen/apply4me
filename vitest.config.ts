import { defineConfig } from 'vitest/config';

// Config séparée de vite.config.ts : le plugin d'extension n'a rien à faire
// dans les tests de logique.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
