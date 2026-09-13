// Small presentation helpers shared by components.

import { MODE_LABELS } from '../protocol/constants.ts';
import type { ModeName } from '../protocol/types.ts';

/** Seconds -> "m:ss". */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function modeLabel(mode: ModeName): string {
  return MODE_LABELS[mode] ?? 'Unknown';
}

/** "Today", "Yesterday", or a short date. */
export function relativeDay(d: Date, now: Date = new Date()): string {
  const day = 86_400_000;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / day);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
