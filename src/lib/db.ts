// Local persistence. Everything lives in the browser's IndexedDB — no network, ever.

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { DeviceInfo, BrushHead } from '../protocol/types.ts';
import type { StoredSession } from './session.ts';
import { normalizeSource } from './session.ts';

interface BrushlogDB extends DBSchema {
  sessions: {
    key: number; // StoredSession.timestamp
    value: StoredSession;
    indexes: { 'by-start': Date; 'by-device': string };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'brushlog';
// v2: add the `by-device` index so sessions can be grouped per physical brush (multi-device).
// Key stays `timestamp`; a composite key is a later migration if/when multi-device is built.
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<BrushlogDB>> | null = null;

function getDB(): Promise<IDBPDatabase<BrushlogDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BrushlogDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'timestamp' });
          sessions.createIndex('by-start', 'startTime');
          db.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          // Existing rows have no deviceId (skipped by the index) until the next sync backfills.
          tx.objectStore('sessions').createIndex('by-device', 'deviceId');
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Insert sessions, de-duplicating by timestamp (re-syncing the same brush is idempotent).
 * Returns how many were newly added.
 */
export async function putSessions(sessions: StoredSession[]): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite');
  let added = 0;
  await Promise.all(
    sessions.map(async (s) => {
      const existing = await tx.store.get(s.timestamp);
      if (!existing) added++;
      await tx.store.put(s);
    }),
  );
  await tx.done;
  return added;
}

export async function getAllSessions(): Promise<StoredSession[]> {
  const db = await getDB();
  const all = await db.getAll('sessions');
  // Backfill `source` on legacy rows (see normalizeSource) so the whole app — and export — see it.
  return all.map(normalizeSource).sort((a, b) => b.timestamp - a.timestamp);
}

export async function countSessions(): Promise<number> {
  const db = await getDB();
  return db.count('sessions');
}

/** Remove any sessions tagged as generated sample/demo data. Returns how many were removed. */
export async function deleteSampleSessions(): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('sessions', 'readwrite');
  let removed = 0;
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.sample) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

export async function setDeviceInfo(info: DeviceInfo): Promise<void> {
  const db = await getDB();
  await db.put('meta', info, 'device');
  await db.put('meta', Date.now(), 'lastSync');
}

export async function getDeviceInfo(): Promise<DeviceInfo | undefined> {
  const db = await getDB();
  return (await db.get('meta', 'device')) as DeviceInfo | undefined;
}

export async function getLastSync(): Promise<number | undefined> {
  const db = await getDB();
  return (await db.get('meta', 'lastSync')) as number | undefined;
}

/** Persist the latest brush-head wear status (single current value, not history). */
export async function setBrushHead(head: BrushHead): Promise<void> {
  const db = await getDB();
  await db.put('meta', head, 'brushHead');
}

export async function getBrushHead(): Promise<BrushHead | undefined> {
  const db = await getDB();
  return (await db.get('meta', 'brushHead')) as BrushHead | undefined;
}

/** Wipe everything — the "it's your data, delete it whenever" button. */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([db.clear('sessions'), db.clear('meta')]);
}

/** Export everything as a JSON blob for the user to keep/move. */
export async function exportJSON(): Promise<string> {
  const [sessions, device, brushHead] = await Promise.all([
    getAllSessions(),
    getDeviceInfo(),
    getBrushHead(),
  ]);
  return JSON.stringify(
    { app: 'brushlog', version: 1, exportedAt: new Date().toISOString(), device, brushHead, sessions },
    null,
    2,
  );
}

/**
 * Import a Brushlog export back into the store. De-dups by timestamp (idempotent — importing
 * over existing data adds only what's missing), so it doubles as a "restore/merge". Returns how
 * many sessions were newly added. Throws on malformed input.
 */
export async function importJSON(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const data = parsed as { sessions?: unknown; brushHead?: BrushHead };
  if (!data || !Array.isArray(data.sessions)) {
    throw new Error('Not a Brushlog export (no "sessions" array).');
  }
  // Spread preserves app-level fields (source, trace, survey) so a Brushlog export round-trips.
  const sessions: StoredSession[] = (data.sessions as Array<Record<string, unknown>>)
    .filter((s) => s && typeof s.timestamp === 'number')
    .map((s) => ({
      ...(s as unknown as StoredSession),
      startTime: new Date(s.startTime as string),
      ...(s.lastFullCharge ? { lastFullCharge: new Date(s.lastFullCharge as string) } : {}),
    }));
  const added = await putSessions(sessions);
  if (data.brushHead) await setBrushHead(data.brushHead);
  return added;
}
