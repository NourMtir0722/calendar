import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from './db';

/**
 * Each test gets an empty database and a fresh copy of the module.
 *
 * `db.ts` holds its connection in a module-level promise, opened once and
 * reused, so handing it a new IndexedDB without also resetting the module
 * would leave it talking to the old one. Both have to be replaced together.
 */
let db: typeof import('./db');

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.resetModules();
  db = await import('./db');
});

function entry(date: string, text = 'audio'): Entry {
  return {
    date,
    blob: new Blob([text], { type: 'audio/webm' }),
    mime: 'audio/webm',
    source: 'mic',
    title: 'Voice note',
    durationMs: 1234,
    createdAt: Date.now(),
  };
}

describe('the days themselves', () => {
  it('stores a day and reads back its audio unchanged', async () => {
    await db.putEntry(entry('2026-09-08', 'the recording'));
    const found = await db.getEntry('2026-09-08');
    expect(found?.title).toBe('Voice note');
    expect(await found!.blob.text()).toBe('the recording');
  });

  it('is keyed by the day, so re-recording replaces rather than accumulates', async () => {
    await db.putEntry(entry('2026-09-09', 'first take'));
    await db.putEntry(entry('2026-09-09', 'second take'));
    expect(await (await db.getEntry('2026-09-09'))!.blob.text()).toBe('second take');
    expect([...(await db.markedDates())].filter(date => date === '2026-09-09')).toHaveLength(1);
  });

  it('answers for a day that was never recorded', async () => {
    expect(await db.getEntry('1999-01-01')).toBeUndefined();
  });

  it('lists the marked days without loading a single clip', async () => {
    await db.putEntry(entry('2026-10-01'));
    await db.putEntry(entry('2026-10-02'));
    const marked = await db.markedDates();
    expect(marked.has('2026-10-01')).toBe(true);
    expect(marked.has('2026-10-02')).toBe(true);
    expect([...marked].every(date => typeof date === 'string')).toBe(true);
  });

  it('removes a day', async () => {
    await db.putEntry(entry('2026-11-11'));
    await db.deleteEntry('2026-11-11');
    expect(await db.getEntry('2026-11-11')).toBeUndefined();
    expect((await db.markedDates()).has('2026-11-11')).toBe(false);
  });
});

describe('being told this browser is the only copy', () => {
  it('has not been said yet on a new calendar', async () => {
    expect(await db.getStorageNoticeSeen()).toBe(false);
  });

  it('is remembered, so it is said once rather than once a load', async () => {
    await db.putStorageNoticeSeen();
    expect(await db.getStorageNoticeSeen()).toBe(true);
  });
});

describe('reading the whole journal out', () => {
  it('hands back every day, oldest first, which is the order a backup wants', async () => {
    await db.putEntry(entry('2026-09-08'));
    await db.putEntry(entry('2026-09-02'));
    await db.putEntry(entry('2026-09-05'));
    expect((await db.allEntries()).map(found => found.date)).toEqual(['2026-09-02', '2026-09-05', '2026-09-08']);
  });

  it('is empty rather than absent on a calendar with nothing in it', async () => {
    expect(await db.allEntries()).toEqual([]);
  });
});
