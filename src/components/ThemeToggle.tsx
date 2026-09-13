import type { ReactElement } from 'react';
import type { ThemeChoice } from '../hooks/useTheme.ts';

/** Small inline icons so rendering is consistent across platforms (no emoji drift). */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-full w-full" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
function AutoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: () => ReactElement }> = [
  { value: 'light', label: 'Light theme', Icon: SunIcon },
  { value: 'system', label: 'System theme', Icon: AutoIcon },
  { value: 'dark', label: 'Dark theme', Icon: MoonIcon },
];

/**
 * Segmented light / system / dark control. Drives the shared useTheme choice; used compactly in
 * the ConnectBar header (`sm`) and full-size in Settings (`md`, 44px touch targets).
 */
export function ThemeToggle({
  choice,
  onChange,
  size = 'sm',
}: {
  choice: ThemeChoice;
  onChange: (next: ThemeChoice) => void;
  size?: 'sm' | 'md';
}) {
  const btn = size === 'md' ? 'h-11 w-11' : 'h-9 w-9';
  const icon = size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]';
  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => onChange(value)}
            className={`flex ${btn} items-center justify-center rounded-lg transition-colors ${
              active
                ? 'bg-surface text-accent-fg shadow-sm'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <span className={icon}>
              <Icon />
            </span>
          </button>
        );
      })}
    </div>
  );
}
