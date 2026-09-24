import { useState } from 'react';
import { useSessions } from './hooks/useSessions.ts';
import { useBrush } from './hooks/useBrush.ts';
import { useLiveRecorder } from './hooks/useLiveRecorder.ts';
import { useTheme } from './hooks/useTheme.ts';
import { useSettings } from './hooks/useSettings.ts';
import { formatDuration } from './lib/format.ts';
import type { StoredSession } from './lib/session.ts';
import { ConnectBar } from './components/ConnectBar.tsx';
import { LiveSession } from './components/LiveSession.tsx';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.tsx';
import { ReportToast } from './components/ReportToast.tsx';
import { StatGrid } from './components/StatGrid.tsx';
import { TrendChart } from './components/TrendChart.tsx';
import { Insights } from './components/Insights.tsx';
import { BrushHeadCard } from './components/BrushHeadCard.tsx';
import { HistoryList } from './components/HistoryList.tsx';
import { SessionDetail } from './components/SessionDetail.tsx';
import { SettingsSheet } from './components/SettingsSheet.tsx';
import { DataControls } from './components/DataControls.tsx';

export default function App() {
  const { choice: themeChoice, setChoice: setThemeChoice } = useTheme();
  const { settings, setGoalDurationS, setBrushesPerDay } = useSettings();
  const { goalDurationS, brushesPerDay } = settings;

  const { sessions, health, brushHead, lastSync, loading, addSessions, loadSample, importData, clear } = useSessions({
    goalDurationS,
    brushesPerDay,
  });
  const brush = useBrush({
    onSync: async (synced, info, head) => {
      await addSessions(synced, info, head);
    },
    // Sessions are sorted newest-first, so [0] is our high-water mark for incremental syncs.
    lastSyncedTimestamp: sessions[0]?.timestamp,
  });

  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<StoredSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Record sessions live as you brush (works even when on-device history can't be read). Tagged
  // 'live'; captures a downsampled pressure trace. TODO(guided): a guided flow would drive this
  // recorder with source 'guided' and attach an end-of-session survey before persisting.
  // The returned `liveTrace` is the in-progress force curve, drawn live in LiveSession.
  const liveTrace = useLiveRecorder(brush.live, (session) => {
    void addSessions([session], brush.device ?? undefined);
    setSavedToast(`Session saved · ${formatDuration(session.duration)}`);
    window.setTimeout(() => setSavedToast(null), 4000);
  });

  const hasData = sessions.length > 0;

  return (
    <div className="min-h-full bg-bg text-fg">
      <ConnectBar
        state={brush.state}
        device={brush.device}
        error={brush.error}
        syncing={brush.syncing}
        syncProgress={brush.syncProgress}
        lastSync={lastSync}
        onConnect={brush.connect}
        onDisconnect={brush.disconnect}
        onSync={brush.sync}
        themeChoice={themeChoice}
        onThemeChange={setThemeChoice}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {brush.state === 'connected' && (
          <LiveSession live={brush.live} trace={liveTrace} goalDurationS={goalDurationS} />
        )}
        {brush.state === 'connected' && (
          <DiagnosticsPanel discovery={brush.discovery} rawLog={brush.rawLog} device={brush.device} />
        )}

        {loading ? (
          <LoadingState />
        ) : !hasData ? (
          <EmptyState onLoadSample={loadSample} canConnect={brush.state === 'idle'} onConnect={brush.connect} />
        ) : (
          <>
            <StatGrid health={health} goalDurationS={goalDurationS} brushesPerDay={brushesPerDay} />
            {brushHead && <BrushHeadCard head={brushHead} />}
            <Insights insights={health.insights} />
            <TrendChart days={health.last14Days} goalDurationS={goalDurationS} brushesPerDay={brushesPerDay} />
            <HistoryList sessions={sessions} onSelect={setSelected} goalDurationS={goalDurationS} />
            <DataControls hasData={hasData} onLoadSample={loadSample} onImport={importData} onClear={clear} />
          </>
        )}

        <footer className="pt-2 text-center text-[11px] text-fg-subtle">
          Brushlog · self-owned · offline-first · your data never leaves this device
        </footer>
      </main>

      {savedToast && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
          <div className="rounded-full border border-ok/30 bg-ok/15 px-4 py-2 text-sm text-ok-fg shadow-lg backdrop-blur">
            {savedToast}
          </div>
        </div>
      )}

      <ReportToast
        state={brush.state}
        cancelled={brush.cancelled}
        error={brush.error}
        device={brush.device}
        discovery={brush.discovery}
        raised={savedToast !== null}
      />

      {selected && (
        <SessionDetail session={selected} onClose={() => setSelected(null)} goalDurationS={goalDurationS} />
      )}

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          onGoalChange={setGoalDurationS}
          onPerDayChange={setBrushesPerDay}
          themeChoice={themeChoice}
          onThemeChange={setThemeChoice}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}

function EmptyState({
  onLoadSample,
  canConnect,
  onConnect,
}: {
  onLoadSample: () => void;
  canConnect: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-2xl">
        🦷
      </div>
      <h1 className="text-lg font-semibold">Track your brushing, locally</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
        Connect your Oral-B brush over Bluetooth to import sessions and see your dental-health trends —
        everything stays on this device. No account, no cloud.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {canConnect && (
          <button
            onClick={onConnect}
            className="rounded-lg bg-btn px-4 py-2 text-sm font-medium text-on-btn hover:bg-btn-hover"
          >
            Connect brush
          </button>
        )}
        <button
          onClick={onLoadSample}
          className="rounded-lg border border-line-strong px-4 py-2 text-sm text-fg hover:bg-surface-hover"
        >
          Load sample data
        </button>
      </div>
    </div>
  );
}
