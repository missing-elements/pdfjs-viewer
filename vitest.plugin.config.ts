import { defineConfig } from 'vitest/config'

// The plugin tests build a fixture app from the package's `dist` folder and open it in a browser
// they start themselves, so they run in Node, after the package is built. The element's own tests
// run in the browser (vite.config.ts).
export default defineConfig({
  test: {
    include: ['tests/plugin/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
})
