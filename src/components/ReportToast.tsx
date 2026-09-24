import { useEffect, useState } from 'react';
import type { ConnState } from '../hooks/useBrush.ts';
import type { DeviceInfo, DiscoveredService } from '../protocol/types.ts';
import { connectionProblemUrl, deviceReportUrl, isConfirmedModel } from '../lib/report.ts';

interface Props {
  state: ConnState;
  cancelled: boolean;
  error: string | null;
  device: DeviceInfo | null;
  discovery: DiscoveredService[] | null;
  /** Lift above the bottom-centre "session saved" toast while that's showing. */
  raised: boolean;
}

/** Asked once per install, whatever the model — a working brush shouldn't nag. */
const DONE_KEY = 'brushlog.reportDone';

function isDone(): boolean {
  try {
    // Older builds stored one key per model (brushlog.reportDone.<model>-<protocol>) — honour those.
    return Object.keys(localStorage).some((k) => k === DONE_KEY || k.startsWith(`${DONE_KEY}.`));
  } catch {
    return false;
  }
}

/**
 * A dismissible, non-blocking toast inviting a device report (see lib/report.ts):
 *  - a brush that isn't an iO connected → "how is it working?", once per install (dismiss or report);
 *  - the chooser was dismissed or any error (connect, wrong device, sync) → "trouble with your
 *    brush?", hidden on dismiss until the next cancel/error.
 * Both open a pre-filled GitHub issue form; the user reviews and submits it there.
 */
export function ReportToast({ state, cancelled, error, device, discovery, raised }: Props) {
  const [doneNow, setDoneNow] = useState(false);
  const [problemDismissed, setProblemDismissed] = useState(false);
  const problem = cancelled || state === 'error' || error !== null;

  // Re-arm once the problem clears, or when a different error replaces the dismissed one.
  useEffect(() => {
    setProblemDismissed(false);
  }, [problem, error]);

  // Wait for discovery so the report carries the GATT layout.
  const ask =
    state === 'connected' && device && discovery && !isConfirmedModel(device) && !doneNow && !isDone();

  if (ask) {
    const finish = () => {
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch { /* storage unavailable — it may ask again next time */ }
      setDoneNow(true);
    };
    return (
      <Toast raised={raised} onDismiss={finish}>
        <p>How is your brush working for you?</p>
        <a href={deviceReportUrl(device, discovery)} target="_blank" rel="noopener noreferrer" onClick={finish} className={ACTION}>
          Let us know
        </a>
      </Toast>
    );
  }

  if (problem && !problemDismissed) {
    return (
      <Toast raised={raised} onDismiss={() => setProblemDismissed(true)}>
        <p>Trouble with your brush?</p>
        <a
          href={connectionProblemUrl(error)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setProblemDismissed(true)}
          className={ACTION}
        >
          Let us know
        </a>
      </Toast>
    );
  }

  return null;
}

const ACTION = 'mt-2 inline-block rounded-lg bg-btn px-3 py-1.5 text-sm font-medium text-on-btn hover:bg-btn-hover';

function Toast({ children, raised, onDismiss }: { children: React.ReactNode; raised: boolean; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className={`fixed inset-x-4 z-20 ml-auto max-w-sm rounded-2xl border border-line bg-surface p-4 pr-10 text-sm text-fg-secondary shadow-lg transition-[bottom] ${raised ? 'bottom-20' : 'bottom-4'}`}
    >
      {children}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        title="Dismiss"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg"
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}
