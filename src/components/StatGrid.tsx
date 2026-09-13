import { GOAL_DURATION_S } from '../protocol/constants.ts';
import { formatDuration } from '../lib/format.ts';
import type { HealthSummary } from '../lib/health.ts';

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-muted">{sub}</div>}
    </div>
  );
}

export function StatGrid({
  health,
  goalDurationS = GOAL_DURATION_S,
  brushesPerDay = 2,
}: {
  health: HealthSummary;
  goalDurationS?: number;
  brushesPerDay?: number;
}) {
  const { streakDays, today, week } = health;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Streak"
        value={`${streakDays}d`}
        sub={streakDays > 0 ? 'keep it up' : 'brush to start'}
      />
      <Stat
        label="Today"
        value={`${today.sessions}`}
        sub={today.goalMet ? 'goal met ✓' : `${today.sessions}/${brushesPerDay} · ${formatDuration(today.totalDuration)}`}
      />
      <Stat
        label="Avg time / brush"
        value={week.avgDuration ? formatDuration(week.avgDuration) : '—'}
        sub="last 7 days"
      />
      <Stat
        label="Brushes / day"
        value={week.sessionsPerDay ? week.sessionsPerDay.toFixed(1) : '—'}
        sub={`${Math.round(week.goalRate * 100)}% hit ${formatDuration(goalDurationS)}`}
      />
    </div>
  );
}
