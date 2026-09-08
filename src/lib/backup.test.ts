import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, buildBackup, NotABackup, readBackup } from './backup';
import type { Entry } from './db';

function entry(date: string, bytes: string, over: Partial<Entry> = {}): Entry {
  return {
    date,
    blob: new Blob([bytes], { type: 'audio/webm' }),
    mime: 'audio/webm',
    source: 'mic',
    title: 'Voice note',
    durationMs: 4000,
    createdAt: 1_757_000_000_000,
    ...over,
  };
}

async function roundTrip(entries: Entry[]): Promise<Entry[]> {
  return readBackup(await buildBackup(entries));
}

describe('the backup file', () => {
  /**
   * The whole point of the file. With no online copy this is the only thing
   * standing between somebody and a browser that has cleared its storage, so
   * what comes back has to be what went in, bytes included.
   */
  it('brings every day back exactly as it went in', async () => {
    const restored = await roundTrip([
      entry('2026-09-02', 'first morning'),
      entry('2026-09-08', 'second morning', { source: 'file', title: 'quiet-morning', durationMs: 91_000 }),
    ]);

    expect(restored.map(found => found.date)).toEqual(['2026-09-02', '2026-09-08']);
    expect(await restored[0].blob.text()).toBe('first morning');
    expect(await restored[1].blob.text()).toBe('second morning');
    expect(restored[1].source).toBe('file');
    expect(restored[1].title).toBe('quiet-morning');
    expect(restored[1].durationMs).toBe(91_000);
  });

  it('survives bytes that are not text, which is what real audio is', async () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const restored = await roundTrip([
      { ...entry('2026-09-02', ''), blob: new Blob([bytes], { type: 'audio/webm' }) },
    ]);
    expect(new Uint8Array(await restored[0].blob.arrayBuffer())).toEqual(bytes);
  });

  it('is plain JSON that says what it is, so it can be read without this app', async () => {
    const file = await buildBackup([entry('2026-09-02', 'a morning')]);
    const parsed = JSON.parse(await file.text()) as { format: string; version: number; days: unknown[] };
    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.version).toBe(1);
    expect(parsed.days).toHaveLength(1);
  });

  it('reports its progress, since a year of audio is not instant', async () => {
    const seen: number[] = [];
    await buildBackup([entry('2026-09-01', 'a'), entry('2026-09-02', 'b')], done => seen.push(done));
    expect(seen).toEqual([0, 1]);
  });

  it('writes an empty journal without producing something unreadable', async () => {
    const file = await buildBackup([]);
    expect(JSON.parse(await file.text())).toMatchObject({ format: BACKUP_FORMAT, days: [] });
  });
});

/**
 * This file has been sitting in a downloads folder for a year. It may have been
 * edited, truncated by a failed copy, or picked from the wrong folder — and the
 * failure that matters is the quiet one, where a malformed day lands in the
 * journal as an entry that cannot play and cannot be explained.
 */
describe('a file that is not a backup', () => {
  const refuse = async (body: string, message: RegExp) => {
    await expect(readBackup(new Blob([body]))).rejects.toThrow(NotABackup);
    await expect(readBackup(new Blob([body]))).rejects.toThrow(message);
  };

  it('says so rather than throwing a parser error', async () => {
    await refuse('this is not json at all', /not a calendar backup/i);
    await refuse('{"format":"something-else","days":[]}', /not a calendar backup/i);
  });

  it('refuses a version it does not know how to read', async () => {
    await refuse(`{"format":"${BACKUP_FORMAT}","version":99,"days":[]}`, /different version/i);
  });

  it('refuses one with nothing in it, rather than reporting a silent success', async () => {
    await refuse(`{"format":"${BACKUP_FORMAT}","version":1,"days":[]}`, /no recordings/i);
    await refuse(`{"format":"${BACKUP_FORMAT}","version":1}`, /no recordings/i);
  });

  it('steps over a day it cannot trust and keeps the ones it can', async () => {
    const good = JSON.parse(await (await buildBackup([entry('2026-09-02', 'kept')])).text()) as {
      days: unknown[];
    };
    const doctored = {
      format: BACKUP_FORMAT,
      version: 1,
      days: [
        ...good.days,
        { date: 'not-a-date', audio: 'aGk=' },
        // 31 February is well-formed and not a day, which is the case a regexp
        // on its own lets through.
        { date: '2026-02-31', audio: 'aGk=' },
        { date: '2026-09-03', audio: '' },
        { date: '2026-09-04' },
        null,
      ],
    };
    const restored = await readBackup(new Blob([JSON.stringify(doctored)]));
    expect(restored.map(found => found.date)).toEqual(['2026-09-02']);
    expect(await restored[0].blob.text()).toBe('kept');
  });

  it('fills in a day that is merely missing its edges, rather than dropping it', async () => {
    const body = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      days: [{ date: '2026-09-02', audio: btoa('still audio') }],
    });
    const [restored] = await readBackup(new Blob([body]));
    expect(await restored.blob.text()).toBe('still audio');
    expect(restored.mime).toBe('audio/webm');
    expect(restored.title).toBe('Voice note');
    expect(restored.source).toBe('mic');
    expect(restored.durationMs).toBe(0);
  });
});
