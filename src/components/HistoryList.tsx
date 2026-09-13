import { GOAL_DURATION_S } from '../protocol/constants.ts';
import { formatDuration, formatClock, relativeDay, modeLabel } from '../lib/format.ts';
import { SOURCE_META, sessionSource } from '../lib/session.ts';
import type { StoredSession } from '../lib/session.ts';

interface Props {
  sessions: StoredSession[];
  onSelect: (session: StoredSession) => void;
  /** Configured goal time (seconds); defaults to the built-in constant. */
  goalDurationS?: number;
}

export function HistoryList({ sessions, onSelect, goalDurationS = GOAL_DURATION_S }: Props) {
  // The device's session counter increments per brush, so the highest one ≈ lifetime brushes —
  // usually more than we store in detail (the brush only keeps the most recent ~250).
  const lifetime = sessions.reduce((m, s) => Math.max(m, s.sessionID ?? 0), 0);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center justify-between text-sm font-medium text-fg">
        <span>
          Sessions
          {lifetime > sessions.length && (
            <span className="ml-2 font-normal text-fg-subtle">~{lifetime} all-time</span>
          )}
        </span>
        {sessions.length > 0 && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-fg-secondary">
            {sessions.length} stored
          </span>
        )}
      </h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-fg-muted">No sessions yet.</p>
      ) : (
        <ul className="-mr-2 max-h-[28rem] divide-y divide-line overflow-y-auto pr-2">
          {sessions.map((s) => {
            const full = s.duration >= goalDurationS;
            const src = sessionSource(s);
            return (
              <li key={s.timestamp}>
                <button
                  type="button"
                  onClick={() => onSelect(s)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-fg">
                        {relativeDay(s.startTime)} · {formatClock(s.startTime)}
                      </span>
                      {/* Only tag the notable app-open recordings; passive syncs are the default. */}
                      {src !== 'passive' && (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${SOURCE_META[src].badge}`}>
                          {SOURCE_META[src].label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-fg-subtle">{modeLabel(s.mode)}</div>
                  </div>
                  {s.pressureWarnings > 0 && (
                    <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger-fg">
                      {s.pressureWarnings}× pressure
                    </span>
                  )}
                  <span className={`tabular-nums text-sm font-medium ${full ? 'text-ok-fg' : 'text-fg-secondary'}`}>
                    {formatDuration(s.duration)}
                  </span>
                  <span className="shrink-0 text-fg-faint" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
