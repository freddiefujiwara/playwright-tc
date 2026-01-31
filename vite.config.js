import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
    },
    globals: true, // Make Vitest APIs globally available
  },
  define: {
    'process.env': {},
  }
});