import { FRESH_HEAD_DAYS } from '../protocol/constants.ts';
import type { BrushHead } from '../protocol/types.ts';

/** Brush-head replacement status, read from the iO's on-device wear countdown (ff2d). */
export function BrushHeadCard({ head }: { head: BrushHead }) {
  // Tracking disabled on the brush — show a muted note rather than a misleading "0 days".
  if (head.state === 'off') {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-fg">Brush head</h2>
        <p className="text-sm text-fg-muted">Replacement tracking is off on the brush.</p>
      </section>
    );
  }

  const daysLeft = head.daysLeft;
  const overdue = daysLeft <= 0;
  const wornPct = Math.max(0, Math.min(100, Math.round((1 - daysLeft / FRESH_HEAD_DAYS) * 100)));
  const replaceBy = new Date(Date.now() + Math.max(0, daysLeft) * 86_400_000);

  const tone = overdue || daysLeft <= 14 ? 'rose' : daysLeft <= 30 ? 'amber' : 'emerald';
  const barColor = { rose: 'bg-danger', amber: 'bg-warn', emerald: 'bg-ok' }[tone];
  const textColor = { rose: 'text-danger', amber: 'text-warn', emerald: 'text-ok' }[tone];

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-fg">Brush head</h2>
        <span className="text-xs text-fg-muted">
          {overdue ? 'replace now' : `replace by ${replaceBy.toLocaleDateString()}`}
        </span>
      </div>

      <div className={`text-2xl font-semibold tabular-nums ${textColor}`}>
        {overdue ? 'Replace now' : `${daysLeft} days left`}
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${barColor} transition-[width]`} style={{ width: `${wornPct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-fg-subtle">
        <span>{wornPct}% worn</span>
        {head.brushingSecondsLeft > 0 && !overdue && (
          <span>{Math.round(head.brushingSecondsLeft / 60)} min brushing left</span>
        )}
      </div>
    </section>
  );
}
