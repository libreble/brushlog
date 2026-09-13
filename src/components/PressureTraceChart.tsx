import { formatDuration } from '../lib/format.ts';
import type { PressureSample } from '../lib/session.ts';

/**
 * Live force-over-time trace for one session (only present on live/guided recordings). Regions the
 * brush flagged as too-hard are shaded rose; sector changes are marked with faint guides. Drawn in
 * a normalized 0–100 viewBox and stretched to fit, with non-scaling strokes so lines stay crisp —
 * same teal-accent idiom as TrendChart, adapted from bars to a continuous curve. Colors come from
 * the theme tokens (--accent/--danger/--fg), so it reads correctly in both light and dark.
 */
export function PressureTraceChart({ trace }: { trace: PressureSample[] }) {
  // Need at least two points to draw a line.
  if (trace.length < 2) return null;

  const tMax = Math.max(...trace.map((s) => s.t), 1);
  const fMax = Math.max(...trace.map((s) => s.f), 1);
  const x = (t: number) => (t / tMax) * 100;
  const y = (f: number) => 100 - Math.min(f / fMax, 1) * 100;

  const points = trace.map((s) => `${x(s.t).toFixed(2)},${y(s.f).toFixed(2)}`);
  const line = `M${points.join(' L')}`;
  const area = `M${x(trace[0].t).toFixed(2)},100 L${points.join(' L')} L${x(trace[trace.length - 1].t).toFixed(2)},100 Z`;

  // Merge consecutive too-hard samples into shaded bands (spanning to the next sample).
  const bands: Array<{ x0: number; x1: number }> = [];
  for (let i = 0; i < trace.length; i++) {
    if ((trace[i].zone ?? 0) >= 2) {
      const x0 = x(trace[i].t);
      const x1 = x(trace[Math.min(i + 1, trace.length - 1)].t);
      const last = bands[bands.length - 1];
      if (last && x0 - last.x1 < 0.01) last.x1 = Math.max(last.x1, x1);
      else bands.push({ x0, x1: Math.max(x1, x0 + 0.4) });
    }
  }

  // Sector boundaries — mark where the quadrant index changes (only if the brush reported sectors).
  const boundaries: number[] = [];
  const hasSectors = trace.some((s) => typeof s.sector === 'number');
  if (hasSectors) {
    for (let i = 1; i < trace.length; i++) {
      if (
        typeof trace[i].sector === 'number' &&
        typeof trace[i - 1].sector === 'number' &&
        trace[i].sector !== trace[i - 1].sector
      ) {
        boundaries.push(x(trace[i].t));
      }
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-fg">Pressure trace</h3>
        <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-accent/80" /> force
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-danger/40" /> too hard
          </span>
        </div>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Brushing force over time">
        <defs>
          {/* Theme-aware: --accent/--danger/--fg resolve per light|dark (see src/index.css). */}
          <linearGradient id="pressureTraceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Too-hard bands behind the curve. */}
        {bands.map((b, i) => (
          <rect key={i} x={b.x0} y={0} width={Math.max(0, b.x1 - b.x0)} height={100} fill="var(--color-danger)" fillOpacity={0.16} />
        ))}

        {/* Sector-change guides. */}
        {boundaries.map((bx, i) => (
          <line key={i} x1={bx} y1={0} x2={bx} y2={100} stroke="var(--color-fg)" strokeOpacity={0.12} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}

        <path d={area} fill="url(#pressureTraceFill)" />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span>0:00</span>
        <span>{formatDuration(Math.round(tMax))}</span>
      </div>
    </div>
  );
}
