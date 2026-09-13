import { useRef, useState } from 'react';
import { exportJSON } from '../lib/db.ts';

interface Props {
  hasData: boolean;
  onLoadSample: () => void;
  onImport: (json: string) => Promise<number>;
  onClear: () => void;
}

export function DataControls({ hasData, onLoadSample, onImport, onClear }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    const json = await exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brushlog-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file
    if (!file) return;
    setImportMsg(null);
    try {
      const added = await onImport(await file.text());
      setImportMsg(`Imported ${added} new session${added === 1 ? '' : 's'}.`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-1 text-sm font-medium text-fg">Your data</h2>
      <p className="mb-3 text-xs text-fg-muted">
        Everything is stored only on this device (IndexedDB). Nothing is sent anywhere.
      </p>
      <div className="flex flex-wrap gap-2">
        {/* Sample data is only for the empty/demo state — hide it once real sessions exist. */}
        {!hasData && (
          <button
            onClick={onLoadSample}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-hover"
          >
            Load sample data
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={!hasData}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-hover disabled:opacity-40"
        >
          Export JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImport}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-hover"
        >
          Import JSON
        </button>
        {confirming ? (
          <span className="flex items-center gap-2">
            <button
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
              className="rounded-lg bg-danger-btn px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Confirm delete
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-fg-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={!hasData}
            className="rounded-lg border border-danger/30 px-3 py-1.5 text-sm text-danger-fg hover:bg-danger/10 disabled:opacity-40"
          >
            Delete all
          </button>
        )}
      </div>
      {importMsg && <p className="mt-3 text-xs text-fg-muted">{importMsg}</p>}
    </section>
  );
}
