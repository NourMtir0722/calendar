import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, BACKUP_VERSION, buildBackup, NotABackup, readBackup } from './backup';
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

/** Collects what a restore hands over, the way the screen would write it. */
async function restore(file: Blob) {
  const kept: Entry[] = [];
  const tally = await readBackup(file, async e => {
    kept.push(e);
  });
  return { kept, ...tally };
}

const header = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION });

describe('the backup file', () => {
  /**
   * The whole point of the file. With no online copy this is the only thing
   * standing between somebody and a browser that has cleared its storage, so
   * what comes back has to be what went in, bytes included.
   */
  it('brings every day back exactly as it went in', async () => {
    const { kept } = await restore(
      await buildBackup([
        entry('2026-09-02', 'first morning'),
        entry('2026-09-08', 'second morning', { source: 'file', title: 'quiet-morning', durationMs: 91_000 }),
      ]),
    );

    expect(kept.map(found => found.date)).toEqual(['2026-09-02', '2026-09-08']);
    expect(await kept[0].blob.text()).toBe('first morning');
    expect(await kept[1].blob.text()).toBe('second morning');
    expect(kept[1].source).toBe('file');
    expect(kept[1].title).toBe('quiet-morning');
    expect(kept[1].durationMs).toBe(91_000);
  });

  it('survives bytes that are not text, which is what real audio is', async () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 256;
    const { kept } = await restore(
      await buildBackup([{ ...entry('2026-09-02', ''), blob: new Blob([bytes], { type: 'audio/webm' }) }]),
    );
    expect(new Uint8Array(await kept[0].blob.arrayBuffer())).toEqual(bytes);
  });

  /**
   * One object per line is what lets both halves work a clip at a time. A
   * single JSON document has to be built whole and parsed whole, and a year of
   * recordings is a couple of hundred megabytes.
   */
  it('is one JSON object per line: a header, then a day each', async () => {
    const file = await buildBackup([entry('2026-09-02', 'a'), entry('2026-09-03', 'b')]);
    const lines = (await file.text()).split('\n').filter(Boolean);

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toMatchObject({ format: BACKUP_FORMAT, version: 2 });
    expect(JSON.parse(lines[1]).date).toBe('2026-09-02');
    expect(JSON.parse(lines[2]).date).toBe('2026-09-03');
  });

  /**
   * The reason the days are handed over rather than returned. Returning an
   * array would put every decoded recording in memory at once, which is the
   * failure the line format exists to avoid.
   */
  it('hands each day over as it is read, rather than collecting them', async () => {
    const file = await buildBackup([entry('2026-09-01', 'a'), entry('2026-09-02', 'b'), entry('2026-09-03', 'c')]);
    const seen: string[] = [];
    await readBackup(file, async e => {
      // Every earlier day has already been dealt with by the time this runs,
      // so the caller is free to write it and let it go.
      seen.push(e.date);
    });
    expect(seen).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('reports its progress, since a year of audio is not instant', async () => {
    const seen: number[] = [];
    await buildBackup([entry('2026-09-01', 'a'), entry('2026-09-02', 'b')], done => seen.push(done));
    expect(seen).toEqual([0, 1]);
  });

  it('reads a file that does not end in a newline', async () => {
    const body = `${header}\n${JSON.stringify({ date: '2026-09-02', audio: btoa('no trailing newline') })}`;
    const { kept } = await restore(new Blob([body]));
    expect(await kept[0].blob.text()).toBe('no trailing newline');
  });

  it('reads a file whose days do not land on chunk boundaries', async () => {
    // A clip large enough that the stream delivers it in several reads, which
    // is the case the line buffer exists for.
    const big = new Uint8Array(300_000).fill(7);
    const { kept } = await restore(
      await buildBackup([{ ...entry('2026-09-02', ''), blob: new Blob([big], { type: 'audio/webm' }) }]),
    );
    expect(new Uint8Array(await kept[0].blob.arrayBuffer())).toEqual(big);
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
    await expect(restore(new Blob([body]))).rejects.toThrow(NotABackup);
    await expect(restore(new Blob([body]))).rejects.toThrow(message);
  };

  it('says so rather than throwing a parser error', async () => {
    await refuse('this is not json at all', /not a calendar backup/i);
    await refuse('{"format":"something-else"}\n', /not a calendar backup/i);
    await refuse('', /not a calendar backup/i);
  });

  it('refuses a version it does not know how to read', async () => {
    await refuse(JSON.stringify({ format: BACKUP_FORMAT, version: 99 }) + '\n', /different version/i);
  });

  it('refuses one with nothing in it, rather than reporting a silent success', async () => {
    await refuse(header + '\n', /no recordings/i);
  });

  it('steps over a day it cannot trust and keeps the ones it can', async () => {
    const body = [
      header,
      JSON.stringify({ date: '2026-09-02', audio: btoa('kept') }),
      JSON.stringify({ date: 'not-a-date', audio: btoa('x') }),
      // 31 February is well-formed and not a day, which is the case a regexp
      // on its own lets through.
      JSON.stringify({ date: '2026-02-31', audio: btoa('x') }),
      JSON.stringify({ date: '2026-09-03', audio: '' }),
      JSON.stringify({ date: '2026-09-04' }),
      'null',
      '{ not json',
      JSON.stringify({ date: '2026-09-05', audio: btoa('also kept') }),
    ].join('\n');

    const { kept, read, skipped } = await restore(new Blob([body]));
    expect(kept.map(f => f.date)).toEqual(['2026-09-02', '2026-09-05']);
    expect(read).toBe(2);
    expect(skipped).toBe(6);
  });

  /**
   * The property the whole-document format could not have: one bad byte
   * anywhere failed the entire file, including every day written before it.
   * A half-copied backup is exactly the file somebody restores from.
   */
  it('gives back everything written before a truncation', async () => {
    const whole = await (await buildBackup([
      entry('2026-09-01', 'one'),
      entry('2026-09-02', 'two'),
      entry('2026-09-03', 'three'),
    ])).text();
    const cut = whole.slice(0, whole.lastIndexOf('\n', whole.length - 2) + 40);

    const { kept, skipped } = await restore(new Blob([cut]));
    expect(kept.map(f => f.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(skipped).toBe(1);
  });

  it('fills in a day that is merely missing its edges, rather than dropping it', async () => {
    const body = `${header}\n${JSON.stringify({ date: '2026-09-02', audio: btoa('still audio') })}\n`;
    const { kept } = await restore(new Blob([body]));
    expect(await kept[0].blob.text()).toBe('still audio');
    expect(kept[0].mime).toBe('audio/webm');
    expect(kept[0].title).toBe('Voice note');
    expect(kept[0].source).toBe('mic');
    expect(kept[0].durationMs).toBe(0);
  });
});
