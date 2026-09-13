import { useCallback, useState } from 'react';
import { GOAL_DURATION_S } from '../protocol/constants.ts';

/** User-configurable goals. `GOAL_DURATION_S` stays the default goal time. */
export interface Settings {
  /** Target brushing time per session, in seconds. */
  goalDurationS: number;
  /** Target number of brushes per day. */
  brushesPerDay: number;
}

const DEFAULTS: Settings = { goalDurationS: GOAL_DURATION_S, brushesPerDay: 2 };

const KEYS = {
  goalDurationS: 'brushlog.goalDurationS',
  brushesPerDay: 'brushlog.brushesPerDay',
} as const;

/** Sane bounds so a typo can't break the progress rings / stats. */
export const GOAL_MIN_S = 30;
export const GOAL_MAX_S = 600;
export const PER_DAY_MIN = 1;
export const PER_DAY_MAX = 6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* private mode / storage disabled */
  }
  return fallback;
}

/**
 * Persisted app settings (localStorage). Kept separate from the device/protocol layer — these are
 * pure app preferences. The configured goal time is threaded through health + the goal rings so
 * changing it actually moves the targets; `GOAL_DURATION_S` remains the default.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => ({
    goalDurationS: clamp(readNumber(KEYS.goalDurationS, DEFAULTS.goalDurationS), GOAL_MIN_S, GOAL_MAX_S),
    brushesPerDay: clamp(readNumber(KEYS.brushesPerDay, DEFAULTS.brushesPerDay), PER_DAY_MIN, PER_DAY_MAX),
  }));

  const persist = useCallback((key: string, value: number) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* non-fatal */
    }
  }, []);

  const setGoalDurationS = useCallback(
    (seconds: number) => {
      const v = clamp(Math.round(seconds), GOAL_MIN_S, GOAL_MAX_S);
      setSettings((s) => ({ ...s, goalDurationS: v }));
      persist(KEYS.goalDurationS, v);
    },
    [persist],
  );

  const setBrushesPerDay = useCallback(
    (n: number) => {
      const v = clamp(Math.round(n), PER_DAY_MIN, PER_DAY_MAX);
      setSettings((s) => ({ ...s, brushesPerDay: v }));
      persist(KEYS.brushesPerDay, v);
    },
    [persist],
  );

  return { settings, setGoalDurationS, setBrushesPerDay };
}
