import type { DateKey } from './date';

const DB_NAME = 'voice-calendar';
const DB_VERSION = 2;
const STORE = 'entries';
const META = 'meta';

export interface Entry {
  /** Primary key: the local day this recording belongs to. */
  date: DateKey;
  blob: Blob;
  mime: string;
  source: 'mic' | 'file';
  title: string;
  durationMs: number;
  createdAt: number;
}

let handle: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  handle ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'date' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('The journal store could not be opened.'));
  });
  return handle;
}

function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
  name: string = STORE,
): Promise<T> {
  return open().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(name, mode);
        const request = body(transaction.objectStore(name));
        request.onsuccess = () => resolve(request.result);
        transaction.onabort = transaction.onerror = () =>
          reject(transaction.error ?? new Error('The journal store rejected the change.'));
      }),
  );
}

export function getEntry(date: DateKey): Promise<Entry | undefined> {
  return run<Entry | undefined>('readonly', store => store.get(date));
}

export function putEntry(entry: Entry): Promise<unknown> {
  return run('readwrite', store => store.put(entry));
}

export function deleteEntry(date: DateKey): Promise<unknown> {
  return run('readwrite', store => store.delete(date));
}

/** Just the keys, so painting the month grid never has to load audio. */
export async function markedDates(): Promise<Set<DateKey>> {
  const keys = await run<IDBValidKey[]>('readonly', store => store.getAllKeys());
  return new Set(keys.map(String));
}

/** Every recording, oldest first. Only the backup has any reason to ask. */
export async function allEntries(): Promise<Entry[]> {
  const entries = await run<Entry[]>('readonly', store => store.getAll());
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Whether the owner has been told that this browser is the only place their
 * recordings exist.
 *
 * There is no copy anywhere else — no account, no server, nothing that could
 * hand them back. A browser clearing its storage therefore ends the journal,
 * and Safari does exactly that after seven days without a visit. That is not a
 * detail to leave somebody to discover, so it is said once, when the first
 * recording is made, and the answer is stored rather than held in state: it is
 * a thing a person has been told, not a thing a tab has said.
 */
export async function getStorageNoticeSeen(): Promise<boolean> {
  const stored = await run<boolean | undefined>('readonly', store => store.get('told'), META);
  return stored ?? false;
}

export function putStorageNoticeSeen(): Promise<unknown> {
  return run('readwrite', store => store.put(true, 'told'), META);
}
