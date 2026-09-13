import { useCallback, useEffect, useState } from 'react';

/** The three theme choices: an explicit override, or follow the OS. */
export type ThemeChoice = 'light' | 'dark' | 'system';

/** localStorage key — must match the inline no-FOUC script in index.html. */
const STORAGE_KEY = 'brushlog.theme';

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private mode / storage disabled */
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Resolve a choice to the concrete theme that's actually applied. */
function resolve(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

/** Toggle the `.dark` class on <html> — the single switch every token reacts to. */
function apply(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolve(choice) === 'dark');
}

/**
 * Theme state for light / dark / system, persisted to localStorage and reflected on <html>.
 * Hydrates from the same key the index.html inline script uses, so React agrees with the
 * pre-paint class (no flash). While on `system`, live-updates when the OS theme changes.
 */
export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);

  // Apply on mount and whenever the choice changes.
  useEffect(() => {
    apply(choice);
  }, [choice]);

  // Follow OS changes only while on `system`.
  useEffect(() => {
    if (choice !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
    apply(next);
  }, []);

  return { choice, setChoice, resolved: resolve(choice) };
}
