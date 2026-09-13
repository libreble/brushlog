import { useEffect } from 'react';
import { formatDuration } from '../lib/format.ts';
import { GOAL_MIN_S, GOAL_MAX_S, PER_DAY_MIN, PER_DAY_MAX } from '../hooks/useSettings.ts';
import type { Settings } from '../hooks/useSettings.ts';
import type { ThemeChoice } from '../hooks/useTheme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

const GOAL_STEP_S = 15;

interface Props {
  settings: Settings;
  onGoalChange: (seconds: number) => void;
  onPerDayChange: (n: number) => void;
  themeChoice: ThemeChoice;
  onThemeChange: (next: ThemeChoice) => void;
  onClose: () => void;
}

/** A −/value/+ stepper with 44px touch targets. */
function Stepper({
  value,
  display,
  onDec,
  onInc,
  decDisabled,
  incDisabled,
  decLabel,
  incLabel,
}: {
  value: string;
  display?: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
  decLabel: string;
  incLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={decLabel}
        onClick={onDec}
        disabled={decDisabled}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong text-xl text-fg hover:bg-surface-hover disabled:opacity-40"
      >
        −
      </button>
      <div className="min-w-[4.5rem] text-center">
        <div className="text-lg font-semibold tabular-nums text-fg">{value}</div>
        {display && <div className="text-[11px] text-fg-subtle">{display}</div>}
      </div>
      <button
        type="button"
        aria-label={incLabel}
        onClick={onInc}
        disabled={incDisabled}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong text-xl text-fg hover:bg-surface-hover disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

/**
 * Settings bottom-sheet (modal on desktop): configure the goal time, the brushes/day target, and
 * the theme. Mobile-first — full-width sheet, 44px touch targets, one-handed. Values persist via
 * useSettings; the configured goal is threaded through the health calc + goal rings.
 */
export function SettingsSheet({ settings, onGoalChange, onPerDayChange, themeChoice, onThemeChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { goalDurationS, brushesPerDay } = settings;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line-strong text-sm text-fg-secondary hover:bg-surface-hover"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5">
          {/* Goal time */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">Goal time</div>
              <div className="text-xs text-fg-muted">Target length of each brush.</div>
            </div>
            <Stepper
              value={formatDuration(goalDurationS)}
              display="per brush"
              onDec={() => onGoalChange(goalDurationS - GOAL_STEP_S)}
              onInc={() => onGoalChange(goalDurationS + GOAL_STEP_S)}
              decDisabled={goalDurationS <= GOAL_MIN_S}
              incDisabled={goalDurationS >= GOAL_MAX_S}
              decLabel="Decrease goal time"
              incLabel="Increase goal time"
            />
          </div>

          {/* Brushes per day */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">Brushes per day</div>
              <div className="text-xs text-fg-muted">Daily target (dentists suggest 2).</div>
            </div>
            <Stepper
              value={String(brushesPerDay)}
              display="per day"
              onDec={() => onPerDayChange(brushesPerDay - 1)}
              onInc={() => onPerDayChange(brushesPerDay + 1)}
              decDisabled={brushesPerDay <= PER_DAY_MIN}
              incDisabled={brushesPerDay >= PER_DAY_MAX}
              decLabel="Decrease brushes per day"
              incLabel="Increase brushes per day"
            />
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg">Theme</div>
              <div className="text-xs text-fg-muted">Light, dark, or follow your device.</div>
            </div>
            <ThemeToggle choice={themeChoice} onChange={onThemeChange} size="md" />
          </div>
        </div>

        <p className="mt-5 text-[11px] text-fg-subtle">
          Settings are stored only on this device.
        </p>
      </div>
    </div>
  );
}
