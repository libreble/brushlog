import { GOAL_DURATION_S } from '../protocol/constants.ts';
import { formatDuration } from '../lib/format.ts';
import type { DayStat } from '../lib/health.ts';

interface Props {
  days: DayStat[];
  /** Configured goal time (seconds); defaults to the built-in constant. */
  goalDurationS?: number;
  /** Configured brushes-per-day target; the reference scale is goal × this. */
  brushesPerDay?: number;
}

/** Last-14-days total brushing time per day. Reference = brushes/day × goal time. */
export function TrendChart({ days, goalDurationS = GOAL_DURATION_S, brushesPerDay = 2 }: Props) {
  const reference = goalDurationS * brushesPerDay;
  const max = Math.max(reference, ...days.map((d) => d.totalDuration), 1);

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-fg">Last 14 days</h2>
        <span className="text-xs text-fg-subtle">daily brushing time</span>
      </div>
      <div className="flex h-28 items-stretch gap-1.5">
        {days.map((d) => {
          const pct = Math.max((d.totalDuration / max) * 100, d.totalDuration > 0 ? 6 : 2);
          const dayNum = d.date.slice(8);
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1" title={`${d.date}: ${formatDuration(d.totalDuration)}`}>
              <div className="flex w-full min-h-0 flex-1 items-end">
                <div
                  className={`w-full rounded-t ${d.brushed ? 'bg-accent/80' : 'bg-surface-2'}`}
                  style={{ height: `${pct}%` }}
                />
              </div>
              <span className="text-[9px] leading-none text-fg-subtle">{dayNum}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
