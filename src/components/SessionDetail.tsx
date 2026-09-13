import { useEffect } from 'react';
import { GOAL_DURATION_S } from '../protocol/constants.ts';
import { formatDuration, formatClock, relativeDay, modeLabel } from '../lib/format.ts';
import { SOURCE_META, sessionSource } from '../lib/session.ts';
import type { StoredSession } from '../lib/session.ts';
import { interpretSmiley } from '../lib/smiley.ts';
import { PressureTraceChart } from './PressureTraceChart.tsx';
import { SmileyFace } from './SmileyFace.tsx';

/** Seconds → "m:ss" for longer spans, "Ns" for short ones (pressure timers are usually seconds). */
function formatSeconds(s: number): string {
  return s >= 60 ? formatDuration(s) : `${Math.round(s)}s`;
}

/** A labelled value tile. `hint` renders below in a muted tone. */
function Field({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone ?? 'text-fg'}`}>{value}</div>
      {hint && <div className="text-[11px] text-fg-subtle">{hint}</div>}
    </div>
  );
}

/**
 * Full decoded view of a single session, shown as a modal/bottom-sheet from the history list.
 * Surfaces everything we decode — timing, mode, sectors, battery, and the iO pressure summary —
 * plus the live force trace when this was an app-open (live/guided) recording. Fields that are
 * absent (older-gen or live sessions won't have all of them) are simply hidden.
 */
export function SessionDetail({
  session,
  onClose,
  goalDurationS = GOAL_DURATION_S,
}: {
  session: StoredSession;
  onClose: () => void;
  /** Configured goal time (seconds); defaults to the built-in constant. */
  goalDurationS?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const s = session;
  const src = sessionSource(s);
  const meta = SOURCE_META[src];
  const full = s.duration >= goalDurationS;
  const progress = Math.min(s.duration / goalDurationS, 1);
  const sectors = s.sectorCount ?? s.sector;
  // Coaching score, only on live/guided recordings that captured it (scale unconfirmed — raw shown).
  const smiley = typeof s.smileyAvg === 'number' ? interpretSmiley(s.smileyAvg) : null;

  // The iO history record carries a rich pressure summary; live sessions carry only the basics.
  const timeTooHard = s.highPressureTime ?? s.timeUnderPressure;
  const hasPressureSummary =
    s.avgPressure != null ||
    s.maxPressure != null ||
    s.highPressureEvents != null ||
    s.lowPressureEvents != null ||
    s.onEvents != null ||
    s.pressureWarnings > 0 ||
    timeTooHard > 0;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-fg">
                {relativeDay(s.startTime)} · {formatClock(s.startTime)}
              </h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${meta.badge}`}>{meta.label}</span>
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">
              {s.startTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg border border-line-strong px-2.5 py-1 text-sm text-fg-secondary hover:bg-surface-hover"
          >
            ✕
          </button>
        </div>

        {/* Duration hero vs the 2-minute goal. */}
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className={`text-3xl font-semibold tabular-nums ${full ? 'text-ok' : 'text-fg'}`}>
              {formatDuration(s.duration)}
            </span>
            <span className="text-xs text-fg-muted">
              {full ? `full ${formatDuration(goalDurationS)} goal ✓` : `of ${formatDuration(goalDurationS)} goal`}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full ${full ? 'bg-ok' : 'bg-accent'}`}
              style={{ width: `${Math.max(progress * 100, 3)}%` }}
            />
          </div>
        </div>

        {/* Overview grid. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Mode" value={modeLabel(s.mode)} />
          {sectors != null && sectors > 0 && <Field label="Sectors" value={String(sectors)} />}
          {s.finalBatteryState > 0 && <Field label="Battery at end" value={`${s.finalBatteryState}%`} />}
          {s.sessionID != null && <Field label="Session #" value={String(s.sessionID)} />}
          {s.totalTargetTime != null && s.totalTargetTime > 0 && (
            <Field label="Configured goal" value={formatDuration(s.totalTargetTime)} />
          )}
        </div>

        {/* Coaching score — only live/guided recordings capture the iO's smiley stream. */}
        {smiley && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <SmileyFace reading={smiley} size={44} />
            <div className="min-w-0">
              <div className={`text-base font-semibold ${smiley.toneClass}`}>Coaching: {smiley.label}</div>
              <div className="text-xs text-fg-muted">
                Avg {s.smileyAvg}
                {typeof s.smileyFinal === 'number' ? ` · final ${s.smileyFinal}` : ''}
                {' '}(raw device score)
              </div>
            </div>
          </div>
        )}

        {/* Pressure summary (mostly iO; live sessions show what they computed). */}
        {hasPressureSummary && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-fg">Pressure</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {s.avgPressure != null && <Field label="Avg force" value={`${s.avgPressure.toFixed(1)} N`} />}
              {s.maxPressure != null && (
                <Field label="Peak force" value={`${s.maxPressure.toFixed(1)} N`} tone={s.maxPressure >= 3 ? 'text-danger-fg' : undefined} />
              )}
              {timeTooHard > 0 && (
                <Field label="Time too hard" value={formatSeconds(timeTooHard)} tone="text-danger-fg" />
              )}
              {s.lowPressureTime != null && s.lowPressureTime > 0 && (
                <Field label="Time too soft" value={formatSeconds(s.lowPressureTime)} />
              )}
              {(s.highPressureEvents ?? s.pressureWarnings) > 0 && (
                <Field
                  label="Over-pressure"
                  value={`${s.highPressureEvents ?? s.pressureWarnings}×`}
                  tone="text-danger-fg"
                />
              )}
              {s.lowPressureEvents != null && s.lowPressureEvents > 0 && (
                <Field label="Under-pressure" value={`${s.lowPressureEvents}×`} />
              )}
              {s.onEvents != null && s.onEvents > 0 && <Field label="On/off events" value={String(s.onEvents)} />}
            </div>
          </div>
        )}

        {/* Live force trace — only app-open (live/guided) sessions carry one. */}
        {s.trace && s.trace.length >= 2 && (
          <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <PressureTraceChart trace={s.trace} />
          </div>
        )}

        {/* TODO(guided): once the guided flow lands, render its end-of-session survey
            (floss / gum bleed / pain — see GuidedSurvey in lib/session.ts) and, later, a
            coverage map from the live ff0e stream here. */}

        {src === 'passive' && (
          <p className="mt-4 text-[11px] text-fg-subtle">
            Synced from the brush's on-device history — no live force trace was captured for this session.
          </p>
        )}
      </div>
    </div>
  );
}
