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

const doneKey = (d: DeviceInfo) => `brushlog.reportDone.${d.modelId}-${d.protocolVersion ?? 'x'}`;

function isDone(d: DeviceInfo): boolean {
  try {
    return localStorage.getItem(doneKey(d)) !== null;
  } catch {
    return false;
  }
}

/**
 * A dismissible, non-blocking toast inviting a device report (see lib/report.ts):
 *  - a brush that isn't an iO connected → "does it work?", once per model (dismiss or report);
 *  - the chooser was dismissed or connecting failed → "not in the list, or won't connect?",
 *    hidden on dismiss until the next cancel/failure.
 * Both open a pre-filled GitHub issue form; the user reviews and submits it there.
 */
export function ReportToast({ state, cancelled, error, device, discovery, raised }: Props) {
  const [doneNow, setDoneNow] = useState(false);
  const [problemDismissed, setProblemDismissed] = useState(false);
  const problem = cancelled || state === 'error';

  useEffect(() => {
    if (!problem) setProblemDismissed(false);
  }, [problem]);

  // Wait for discovery so the report carries the GATT layout.
  const ask =
    state === 'connected' && device && discovery && !isConfirmedModel(device) && !doneNow && !isDone(device);

  if (ask) {
    const finish = () => {
      try {
        localStorage.setItem(doneKey(device), '1');
      } catch { /* storage unavailable — it may ask again next time */ }
      setDoneNow(true);
    };
    return (
      <Toast raised={raised} onDismiss={finish}>
        <p>Brushlog is only confirmed on the Oral-B iO so far. Does your brush work?</p>
        <a href={deviceReportUrl(device, discovery)} target="_blank" rel="noopener noreferrer" onClick={finish} className={ACTION}>
          Tell us how it went
        </a>
      </Toast>
    );
  }

  if (problem && !problemDismissed && state !== 'connected') {
    return (
      <Toast raised={raised} onDismiss={() => setProblemDismissed(true)}>
        <p>Brush not in the list, or won't connect?</p>
        <a
          href={connectionProblemUrl(error)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setProblemDismissed(true)}
          className={ACTION}
        >
          Tell us which one
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
