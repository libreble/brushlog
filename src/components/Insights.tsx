import type { Insight } from '../lib/health.ts';

const STYLE: Record<Insight['level'], string> = {
  good: 'border-ok/30 bg-ok/10 text-ok-fg',
  warn: 'border-warn/30 bg-warn/10 text-warn-fg',
  info: 'border-info/30 bg-info/10 text-info-fg',
};

export function Insights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section className="space-y-2">
      {insights.map((ins, i) => (
        <div key={i} className={`rounded-xl border px-4 py-2.5 text-sm ${STYLE[ins.level]}`}>
          {ins.text}
        </div>
      ))}
    </section>
  );
}
