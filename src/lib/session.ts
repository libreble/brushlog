// App-level session layer.
//
// `protocol/types.ts` `Session` is the pure, device-derived record (framework-agnostic, reusable).
// This module wraps it with concepts that belong to the *app*, not the BLE protocol:
//   - `source`  — how we got this session (passively synced vs. recorded with the app open)
//   - `trace`   — the downsampled live pressure/force time-series we capture while brushing
//   - `survey`  — (future) the guided-session self-report; see the TODO below
// Keeping these here (not on `protocol` `Session`) preserves the protocol layer's purity — it
// only ever carries data the device actually reports. Everything below is added at persist time.

import type { Session } from '../protocol/types.ts';

/**
 * How a stored session was captured:
 *  - `passive` — downloaded from the brush's on-device history ring (the default; no app needed
 *    while brushing). Legacy rows with no `source` are treated as this.
 *  - `live`    — recorded by `useLiveRecorder` while the app was open and connected.
 *  - `guided`  — recorded during a guided coaching flow (quadrant timer + end-of-session survey).
 *    Not built yet — see the guided TODO below; the field + trace storage are the foundation.
 */
export type SessionSource = 'passive' | 'live' | 'guided';

/**
 * One sample of the live pressure/force stream, downsampled to ~2 Hz by `useLiveRecorder`.
 * Only present on `live`/`guided` sessions — a passively-synced record carries only the summary
 * counters the brush stores, never the per-instant curve. Kept intentionally small (short keys,
 * rounded values) so a 2-min brush (~240 points) stays tiny in IndexedDB and JSON export.
 */
export interface PressureSample {
  /** Seconds since session start (rounded to 0.1 s). */
  t: number;
  /** Continuous force reading (raw uint16 from `live.pressure.value`; iO high-rate stream). */
  f: number;
  /** Device-reported pressure zone at this instant (>= 2 = too hard), when known. */
  zone?: number;
  /** Current sector/quadrant index at this instant, for boundary marks on the graph. */
  sector?: number;
}

/**
 * The guided-session self-report. FOUNDATION ONLY — no UI writes this yet. When the guided
 * coaching flow lands (quadrant timer + coverage map), collect this at the end of the session and
 * attach it here; it round-trips through export/import for free (spread-preserved, see db.ts).
 * TODO(guided): wire an end-of-session survey (floss / gum bleed / pain) that fills this in, and a
 * `coverage` map decoded from the live `ff0e` DashboardDataStreamChunk (see docs/PROTOCOL.md §8).
 */
export interface GuidedSurvey {
  flossed?: boolean;
  gumsBled?: boolean;
  pain?: boolean;
  /** Free-text note the user optionally leaves. */
  note?: string;
}

/**
 * A session as it lives in the app's store: the pure device `Session` plus app-level annotations.
 * Every added field is optional so a plain protocol `Session` (straight off a sync) is a valid
 * `StoredSession` — `source` is then filled in at persist time (see `normalizeSource`).
 */
export interface StoredSession extends Session {
  source?: SessionSource;
  /** Live force curve — present only for `live`/`guided` sessions captured with the app open. */
  trace?: PressureSample[];
  /**
   * Coaching "smiley" score captured live from the iO (BLE char ff0a), app-level like `trace` —
   * only on `live`/`guided` recordings (a passive sync doesn't carry it). Raw device uint8;
   * interpret via `lib/smiley.ts` (scale unconfirmed — see there). Avg over the session + final.
   */
  smileyAvg?: number;
  smileyFinal?: number;
  /** TODO(guided): populated by the guided end-of-session survey; unused today. */
  survey?: GuidedSurvey;
}

/** Resolve a session's source, defaulting untagged/legacy rows to `passive`. */
export function sessionSource(s: StoredSession): SessionSource {
  return s.source ?? 'passive';
}

/**
 * Backfill `source` on read so legacy rows (stored before source tagging existed) surface as
 * `passive` everywhere downstream — the store keeps keying on `timestamp`, no schema change. This
 * is the "treat untagged as passive" migration, applied at the read boundary (and thus to export).
 */
export function normalizeSource(s: StoredSession): StoredSession {
  return s.source ? s : { ...s, source: 'passive' };
}

/** Display metadata for the source badge, shared by the history list + detail view. */
export const SOURCE_META: Record<SessionSource, { label: string; badge: string }> = {
  passive: { label: 'Synced', badge: 'bg-surface-2 text-fg-secondary' },
  live: { label: 'Live', badge: 'bg-accent/15 text-accent-fg' },
  guided: { label: 'Guided', badge: 'bg-violet/15 text-violet-fg' },
};
