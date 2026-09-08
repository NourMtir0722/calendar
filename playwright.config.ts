import { defineConfig, devices } from '@playwright/test';

const PORT = 8788;
const HOST = `http://127.0.0.1:${PORT}`;

/**
 * The half of this app no test could reach until now.
 *
 * Everything under `src/**` runs in jsdom, which has no canvas, no audio and
 * no layout — so the plate, the recorder, the AudioContext and the entire CSS
 * arrangement were exercised by nothing. Three real bugs have already come out
 * of that band by reading rather than running, which is a poor way to find the
 * fourth.
 *
 * Served through `wrangler dev` rather than through Vite, deliberately. That is
 * the shipped arrangement, static assets carrying `public/_headers` — and the
 * headers are the thing most likely to break the app without breaking a unit
 * test. The backup download is exactly that: a blob URL under a policy whose
 * `default-src` does not name `blob:`.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: the tests share a browser profile and an origin, and this is a
  // smoke suite rather than a matrix.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: HOST,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      args: [
        // A synthetic microphone that emits a real tone, so a take genuinely
        // encodes, decodes and plays rather than being stubbed at both ends.
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Builds first: the deploy serves ./dist, so a stale build would test the
    // last change rather than this one.
    command: `npm run build && npx wrangler dev --port ${PORT}`,
    url: HOST,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
