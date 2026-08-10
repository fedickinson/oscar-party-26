import { defineConfig } from 'vitest/config'

/**
 * Deliberately separate from vite.config.ts.
 *
 * Everything under test is a pure function — src/lib and the proxy guards — so
 * the suite wants a bare node environment, not React, Tailwind and the dev
 * proxy. Keeping the configs apart means a test run cannot be broken by a
 * plugin it never needed.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
