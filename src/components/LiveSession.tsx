import { GOAL_DURATION_S } from '../protocol/constants.ts';
import { formatDuration, modeLabel } from '../lib/format.ts';
import type { LiveState } from '../protocol/types.ts';
import type { PressureSample } from '../lib/session.ts';
import { interpretSmiley } from '../lib/smiley.ts';
import { PressureTraceChart } from './PressureTraceChart.tsx';
import { SmileyFace } from './SmileyFace.tsx';

interface Props {
  live: LiveState | null;
  /** In-progress force curve for this session (from useLiveRecorder), drawn live while brushing. */
  trace?: PressureSample[];
  /** Configured goal time (seconds); defaults to the built-in constant. */
  goalDurationS?: number;
}

/** Big live readout shown while a brush is connected. Mirrors the on-brush experience. */
export function LiveSession({ live, trace, goalDurationS = GOAL_DURATION_S }: Props) {
  const time = live?.time ?? 0;
  const progress = Math.min(time / goalDurationS, 1);
  const highPressure = live?.pressure?.highPressure ?? false;
  const running = live?.device?.state === 'running';
  // Live coaching score (iO ff0a). Scale is unconfirmed — interpretSmiley degrades gracefully and
  // we always show the raw value so the owner can calibrate. Only rendered when the brush sends it.
  const smiley = typeof live?.smiley === 'number' ? interpretSmiley(live.smiley) : null;

  // Progress ring geometry.
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  return (
    <section
      className={`rounded-2xl border p-5 transition-colors ${
        highPressure ? 'border-danger/40 bg-danger/10' : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-line" />
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              className={highPressure ? 'text-danger' : 'text-accent'}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums">{formatDuration(time)}</span>
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">of {formatDuration(goalDurationS)}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${running ? 'bg-ok animate-pulse' : 'bg-fg-faint'}`} />
            <span className="text-sm text-fg-secondary">
              {running ? 'Brushing' : (live?.device?.state ?? 'connected')}
            </span>
            {typeof live?.battery === 'number' && (
              <span className="ml-auto text-xs text-fg-muted">🔋 {live.battery}%</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {live?.mode && (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg">{modeLabel(live.mode.name)}</span>
            )}
            {typeof live?.sector === 'number' && (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg">Sector {live.sector}</span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 ${
                highPressure ? 'bg-danger/20 text-danger-fg' : 'bg-ok/15 text-ok-fg'
              }`}
            >
              {highPressure ? 'Too much pressure' : 'Pressure OK'}
              {typeof live?.pressure?.value === 'number' ? ` · ${live.pressure.value}` : ''}
            </span>
          </div>

          {smiley && (
            <div className="flex items-center gap-3">
              <SmileyFace reading={smiley} size={48} />
              <div className="min-w-0 leading-tight">
                <div className={`text-base font-semibold ${smiley.toneClass}`}>{smiley.label}</div>
                <div className="text-xs text-fg-muted">Coaching score · {smiley.raw}</div>
              </div>
            </div>
          )}

          {!live && <p className="text-xs text-fg-muted">Waiting for the brush to start…</p>}
        </div>
      </div>

      {/* Live force curve — grows in real time as you brush (needs ≥2 samples to draw). */}
      {running && trace && trace.length >= 2 && (
        <div className="mt-4 border-t border-line pt-4">
          <PressureTraceChart trace={trace} />
        </div>
      )}
    </section>
  );
}
