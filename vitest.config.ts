import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Two suites, one command, because they need genuinely different runtimes.
 *
 * `lib` is the pure functions — dates, the backup format — run in Node because
 * nothing in them wants a DOM. `ui` renders the screens into jsdom.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'lib',
          include: ['src/lib/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // The screens, rendered into jsdom.
        plugins: [react()],
        test: {
          name: 'ui',
          include: ['src/components/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          // Comfortably above the 4s these screens are allowed to settle in,
          // so a test that is genuinely stuck fails with Testing Library's
          // account of what it was waiting for rather than with a bare timeout.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
