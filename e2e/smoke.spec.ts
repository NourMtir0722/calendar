import { readFile } from 'node:fs/promises';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Noise a real browser makes that says nothing about this app: a favicon that
 * is not cached yet, a devtools notice. Anything else counts, because the
 * point of running here is to catch what only a browser can say — a Content
 * Security Policy refusing a script, a canvas tainting, a codec missing.
 */
const IGNORED = [/favicon/i, /Download the React DevTools/i];

function watchConsole(page: Page): string[] {
  const complaints: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!IGNORED.some(pattern => pattern.test(text))) complaints.push(text);
  });
  page.on('pageerror', error => complaints.push(String(error)));
  return complaints;
}

/** Records a take of roughly `ms`, through the browser's fake microphone. */
async function record(page: Page, ms: number) {
  await page.getByRole('button', { name: /^Record a voice note/ }).click();
  await expect(page.getByRole('button', { name: 'Stop and save the recording' })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Stop and save the recording' }).click();
}

test('the page loads, lays out, and says nothing to the console', async ({ page }) => {
  const complaints = watchConsole(page);
  await page.goto('/');

  await expect(page.locator('.calendar-scene')).toBeVisible();
  // The plate is a real image decoded by a real browser here; jsdom returns 0
  // for naturalWidth and takes the fallback branch every time.
  await expect(page.locator('.plate-image')).toHaveJSProperty('complete', true);
  expect(await page.locator('.plate-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The sheet is sized to fit. Nothing may scroll sideways, which is a
  // statement about CSS and so untestable anywhere but here.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  expect(complaints).toEqual([]);
});

/**
 * The whole audio path, for the first time: a real MediaRecorder encoding a
 * real stream, a real AudioContext decoding it back, and a real IndexedDB
 * holding it in between. Every one of those is a stub under jsdom.
 */
test('a take is recorded, decoded, and kept on the device', async ({ page }) => {
  const complaints = watchConsole(page);
  await page.goto('/');

  await record(page, 1200);

  // A duration on the rail means the clip decoded: it is read off the decoded
  // buffer, not off the wall clock.
  await expect(page.getByText(/VOICE · \d+:\d\d/)).toBeVisible({ timeout: 30_000 });
  // And it is the only copy there is, which the app now says out loud.
  await expect(page.getByText('KEPT IN THIS BROWSER')).toBeVisible();

  expect(complaints).toEqual([]);
});

/**
 * The backup, under the real Content-Security-Policy.
 *
 * `default-src 'self'` does not name `blob:`, and the file is handed over as a
 * blob URL on an anchor, so whether this works at all is a question about a
 * policy header rather than about the code — which makes it exactly the kind of
 * thing that passes every unit test and fails for everybody. jsdom has no
 * downloads and no CSP, so nothing below this suite can answer it. It matters
 * more than it looks: with no copy on any server, this file is the only way
 * back from a browser that has cleared its storage.
 */
test('the journal can be saved as a file, which the policy has to allow', async ({ page }) => {
  const complaints = watchConsole(page);
  await page.goto('/');
  await record(page, 1200);
  await expect(page.getByText(/VOICE · \d+:\d\d/)).toBeVisible({ timeout: 30_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Save a backup file/i }).click();
  const saved = await download;

  expect(saved.suggestedFilename()).toMatch(/^voice-calendar-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await saved.path();
  // One object per line: the header, then a day. Read off disk rather than out
  // of the page, so this is the file somebody would actually still have.
  const lines = (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line));
  expect(lines[0]).toMatchObject({ format: 'voice-calendar-backup', version: 2 });
  expect(lines).toHaveLength(2);
  // The audio really is in the file: a backup that only names the recordings
  // would be worth nothing on the device that has lost them.
  expect((lines[1] as { audio: string }).audio.length).toBeGreaterThan(0);

  expect(complaints).toEqual([]);
});
