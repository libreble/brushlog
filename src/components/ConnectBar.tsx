import type { ConnState } from '../hooks/useBrush.ts';
import type { DeviceInfo } from '../protocol/types.ts';
import type { ThemeChoice } from '../hooks/useTheme.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

interface Props {
  state: ConnState;
  device: DeviceInfo | null;
  error: string | null;
  syncing: boolean;
  syncProgress: number;
  lastSync?: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  themeChoice: ThemeChoice;
  onThemeChange: (next: ThemeChoice) => void;
  /** Opens the Settings sheet (goal time, brushes/day, theme). */
  onOpenSettings: () => void;
}

/** Ring size — used only to render the sync progress bar as a rough fraction. */
const HISTORY_SLOTS = 250;

const STATUS: Record<ConnState, { label: string; dot: string }> = {
  unsupported: { label: 'Web Bluetooth unavailable', dot: 'bg-danger' },
  insecure: { label: 'Needs HTTPS / localhost', dot: 'bg-danger' },
  idle: { label: 'Not connected', dot: 'bg-fg-faint' },
  connecting: { label: 'Connecting…', dot: 'bg-warn animate-pulse' },
  connected: { label: 'Connected', dot: 'bg-ok' },
  error: { label: 'Connection error', dot: 'bg-danger' },
};

export function ConnectBar(props: Props) {
  const { state, device, error, syncing, syncProgress, lastSync } = props;
  const status = STATUS[state];
  const blocked = state === 'unsupported' || state === 'insecure';

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-accent-fg">Brushlog</span>
          <span className="hidden text-xs text-fg-muted sm:inline">local dental health</span>
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
          <span className="text-fg-secondary">
            {status.label}
            {state === 'connected' && device?.name ? ` · ${device.name}` : ''}
          </span>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ThemeToggle choice={props.themeChoice} onChange={props.onThemeChange} />
          <button
            type="button"
            onClick={props.onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-fg-secondary hover:bg-surface-hover hover:text-fg"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
          {state === 'connected' ? (
            <>
              <button
                onClick={props.onSync}
                disabled={syncing}
                title="Re-read all stored sessions from the brush"
                className="rounded-lg bg-btn px-3 py-1.5 text-sm font-medium text-on-btn hover:bg-btn-hover disabled:opacity-50"
              >
                {syncing ? `Syncing… ${syncProgress}` : 'Sync history'}
              </button>
              <button
                onClick={props.onDisconnect}
                title="Disconnect and forget this brush — connecting again shows the chooser"
                className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-hover"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={props.onConnect}
              disabled={blocked || state === 'connecting'}
              className="rounded-lg bg-btn px-3 py-1.5 text-sm font-medium text-on-btn hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'connecting' ? 'Connecting…' : 'Connect brush'}
            </button>
          )}
        </div>
      </div>

      {(error || blocked) && (
        <div className="border-t border-line bg-danger/10 px-4 py-2 text-center text-xs text-danger-fg">
          {blocked
            ? state === 'unsupported'
              ? 'This browser has no Web Bluetooth. Use Chrome/Edge on desktop or Android (iOS Safari is not supported).'
              : 'Web Bluetooth needs a secure context — run over HTTPS or http://localhost.'
            : error}
        </div>
      )}

      {syncing && (
        <div className="h-0.5 w-full bg-surface">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${Math.min(100, Math.round((syncProgress / HISTORY_SLOTS) * 100))}%` }}
          />
        </div>
      )}

      {lastSync && state !== 'connected' && (
        <div className="px-4 pb-2 text-center text-[11px] text-fg-subtle">
          Last synced {new Date(lastSync).toLocaleString()}
        </div>
      )}
    </header>
  );
}
