import type { Entry } from './db';
import { isDateKey, type DateKey } from './date';

/**
 * One file holding a whole journal.
 *
 * With no online copy there is nothing else standing between somebody and a
 * browser that clears its storage, so this is the only way back. It is
 * deliberately a plain, self-describing text file rather than an archive: no
 * dependency to read it, no format that needs this app to open, and audio that
 * can be pulled out with a few lines of anything if this app ever stops
 * existing. A journal you can only recover with the software that wrote it is
 * not much of a backup.
 *
 * **One JSON object per line**, not one JSON document. The first line is the
 * header; every line after it is a day. That shape is the whole reason this
 * file can be written and read on a phone: a year of daily recordings is a
 * couple of hundred megabytes once base64 has added its third, and neither
 * side ever holds more than one clip.
 *
 * The single-document version of this was written incrementally and then read
 * with `JSON.parse(await file.text())`, which is the thing the writer was
 * careful to avoid, happening on the way back in — and worse there, because a
 * restore is what somebody runs when the file is the only copy they have left.
 */
export const BACKUP_FORMAT = 'voice-calendar-backup';
export const BACKUP_VERSION = 2;

/** What one day looks like in the file: the entry, with its audio as base64. */
interface BackupDay {
  date: DateKey;
  mime: string;
  source: 'mic' | 'file';
  title: string;
  durationMs: number;
  createdAt: number;
  audio: string;
}

function toBase64(bytes: Uint8Array): string {
  // Chunked rather than one spread, because `String.fromCharCode(...bytes)` on
  // a clip of any size is enough arguments to overflow the call stack.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Builds the file, one day at a time.
 *
 * Assembled as an array of parts handed to `Blob` rather than as one joined
 * string: holding the whole journal as a single JavaScript string is the step
 * most likely to fail on a phone. Each part is one clip, which is as small as
 * this can be broken without inventing a format.
 */
export async function buildBackup(entries: Entry[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const parts: BlobPart[] = [
    JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, savedAt: new Date().toISOString() }) + '\n',
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    onProgress?.(i, entries.length);
    const day: BackupDay = {
      date: entry.date,
      mime: entry.mime,
      source: entry.source,
      title: entry.title,
      durationMs: entry.durationMs,
      createdAt: entry.createdAt,
      audio: toBase64(new Uint8Array(await entry.blob.arrayBuffer())),
    };
    parts.push(JSON.stringify(day) + '\n');
  }

  return new Blob(parts, { type: 'application/x-ndjson' });
}

/** A file that is not this app's backup, said in words rather than a crash. */
export class NotABackup extends Error {}

/** Turns one line into an entry, or `null` if it cannot be trusted. */
function readDay(line: string): Entry | null {
  let raw: BackupDay;
  try {
    raw = JSON.parse(line) as BackupDay;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.date !== 'string' || !isDateKey(raw.date)) return null;
  if (typeof raw.audio !== 'string' || !raw.audio) return null;

  let bytes: Uint8Array;
  try {
    bytes = fromBase64(raw.audio);
  } catch {
    return null;
  }
  if (!bytes.byteLength) return null;

  const mime = typeof raw.mime === 'string' && raw.mime ? raw.mime : 'audio/webm';
  return {
    date: raw.date,
    blob: new Blob([bytes as unknown as BlobPart], { type: mime }),
    mime,
    source: raw.source === 'file' ? 'file' : 'mic',
    title: typeof raw.title === 'string' && raw.title ? raw.title : 'Voice note',
    durationMs: Number.isFinite(raw.durationMs) && raw.durationMs > 0 ? raw.durationMs : 0,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/**
 * Reads a backup back, one day at a time.
 *
 * The days are handed to `keep` as they arrive rather than returned as an
 * array, so nothing here ever holds the journal: the caller writes each day and
 * lets it go, and the high-water mark is a single clip whatever the file
 * weighs. Returning `Entry[]` would have put every decoded recording in memory
 * at once, which is the same failure the streaming parse was added to avoid.
 *
 * Every field is checked rather than trusted. This file has been sitting in
 * somebody's downloads for a year and may have been edited, truncated by a
 * failed copy, or picked from the wrong folder — and the failure that matters
 * is the quiet one, where a malformed day lands in the journal as an entry that
 * cannot play and cannot be explained. A line that does not survive checking is
 * skipped and counted; the days around it are still restored. A truncated file
 * therefore gives back everything written before the cut, which the whole-
 * document version could not do: one bad byte anywhere failed all of it.
 */
export async function readBackup(
  file: Blob,
  keep: (entry: Entry) => Promise<void>,
): Promise<{ read: number; skipped: number }> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let header: { format?: unknown; version?: unknown } | null = null;
  let read = 0;
  let skipped = 0;

  const line = async (text: string) => {
    if (!text.trim()) return;
    if (!header) {
      try {
        header = JSON.parse(text) as { format?: unknown; version?: unknown };
      } catch {
        throw new NotABackup('That file is not a calendar backup.');
      }
      if (header?.format !== BACKUP_FORMAT) throw new NotABackup('That file is not a calendar backup.');
      if (header.version !== BACKUP_VERSION) {
        throw new NotABackup('That backup was written by a different version of this calendar.');
      }
      return;
    }
    const entry = readDay(text);
    if (!entry) {
      skipped++;
      return;
    }
    await keep(entry);
    read++;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const at = buffer.indexOf('\n');
        if (at < 0) break;
        const text = buffer.slice(0, at);
        // Dropped before the await, so a line's memory is not held across it.
        buffer = buffer.slice(at + 1);
        await line(text);
      }
    }
    // A file that does not end in a newline still has a last day in it.
    buffer += decoder.decode();
    await line(buffer);
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (!header) throw new NotABackup('That file is not a calendar backup.');
  if (!read) throw new NotABackup('That backup has no recordings in it.');
  return { read, skipped };
}
