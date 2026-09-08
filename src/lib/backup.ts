import type { Entry } from './db';
import { isDateKey, type DateKey } from './date';

/**
 * One file holding a whole journal.
 *
 * With no online copy there is nothing else standing between somebody and a
 * browser that clears its storage, so this is the only way back. It is
 * deliberately a plain, self-describing JSON file rather than an archive: no
 * dependency to read it, no format that needs this app to open, and audio that
 * can be pulled out with a few lines of anything if this app ever stops
 * existing. A journal you can only recover with the software that wrote it is
 * not much of a backup.
 */
export const BACKUP_FORMAT = 'voice-calendar-backup';
export const BACKUP_VERSION = 1;

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
 * string. A year of daily recordings is a couple of hundred megabytes once
 * base64 has added its third, and holding that as a single JavaScript string
 * to hand to `Blob` is the one step likely to fail on a phone. The parts are
 * still one clip each, which is the size this can be broken into without
 * inventing a format.
 */
export async function buildBackup(entries: Entry[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const parts: BlobPart[] = [
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},`,
    `"savedAt":${JSON.stringify(new Date().toISOString())},"days":[`,
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
    parts.push((i ? ',' : '') + JSON.stringify(day));
  }

  parts.push(']}\n');
  return new Blob(parts, { type: 'application/json' });
}

/** A file that is not this app's backup, said in words rather than a crash. */
export class NotABackup extends Error {}

/**
 * Reads a backup back into entries.
 *
 * Every field is checked rather than trusted. This file has been sitting in
 * somebody's downloads for a year and may have been edited, truncated by a
 * failed copy, or picked from the wrong folder entirely — and the failure that
 * matters is the quiet one, where a malformed day lands in the journal as an
 * entry that cannot play and cannot be explained.
 */
export async function readBackup(file: Blob): Promise<Entry[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new NotABackup('That file is not a calendar backup.');
  }

  const root = parsed as { format?: unknown; version?: unknown; days?: unknown };
  if (root?.format !== BACKUP_FORMAT) throw new NotABackup('That file is not a calendar backup.');
  if (root.version !== BACKUP_VERSION) {
    throw new NotABackup('That backup was written by a different version of this calendar.');
  }
  if (!Array.isArray(root.days)) throw new NotABackup('That backup has no recordings in it.');

  const entries: Entry[] = [];
  for (const raw of root.days as BackupDay[]) {
    if (!raw || typeof raw !== 'object') continue;
    if (typeof raw.date !== 'string' || !isDateKey(raw.date)) continue;
    if (typeof raw.audio !== 'string' || !raw.audio) continue;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(raw.audio);
    } catch {
      continue;
    }
    if (!bytes.byteLength) continue;
    const mime = typeof raw.mime === 'string' && raw.mime ? raw.mime : 'audio/webm';
    entries.push({
      date: raw.date,
      blob: new Blob([bytes as unknown as BlobPart], { type: mime }),
      mime,
      source: raw.source === 'file' ? 'file' : 'mic',
      title: typeof raw.title === 'string' && raw.title ? raw.title : 'Voice note',
      durationMs: Number.isFinite(raw.durationMs) && raw.durationMs > 0 ? raw.durationMs : 0,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    });
  }

  if (!entries.length) throw new NotABackup('That backup has no recordings in it.');
  return entries;
}
