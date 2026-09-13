import { useMemo, useState } from 'react';
import type { DiscoveredService, RawFrame, DeviceInfo } from '../protocol/types.ts';

interface Props {
  discovery: DiscoveredService[] | null;
  rawLog: RawFrame[];
  device: DeviceInfo | null;
}

function buildReport(device: DeviceInfo | null, discovery: DiscoveredService[] | null, rawLog: RawFrame[]): string {
  const lines: string[] = ['# Brushlog GATT diagnostics'];
  lines.push(
    `device: name=${device?.name ?? '?'} model=${device?.modelId ?? '?'} ` +
      `proto=${device?.protocolVersion ?? '?'} fw=${device?.firmwareVersion ?? '?'} battery=${device?.battery ?? '?'}`,
  );
  lines.push('');
  lines.push('## services');
  for (const s of discovery ?? []) {
    lines.push(`- ${s.uuid}${s.known ? ' [known]' : ''}`);
    for (const c of s.characteristics) {
      const val = c.valueHex !== undefined ? ` = ${c.valueHex}` : c.readError ? ` (read error: ${c.readError})` : '';
      lines.push(`  - ${c.uuid} [${c.properties.join(',')}]${val}`);
    }
  }
  lines.push('');
  lines.push('## recent raw notification frames');
  for (const f of rawLog) lines.push(`  ${f.uuid}  ${f.hex}`);
  return lines.join('\n');
}

/** Reverse-engineering aid: what the connected brush actually exposes. */
export function DiagnosticsPanel({ discovery, rawLog, device }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => buildReport(device, discovery, rawLog), [device, discovery, rawLog]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked; user can still select the text */ }
  }

  const serviceCount = discovery?.length ?? 0;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-fg">
          Diagnostics
          <span className="ml-2 text-xs text-fg-subtle">
            {discovery ? `${serviceCount} service${serviceCount === 1 ? '' : 's'}` : 'discovering…'} ·{' '}
            {rawLog.length} live frames
          </span>
        </span>
        <span className="text-fg-muted">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="rounded-lg bg-btn px-3 py-1.5 text-xs font-medium text-on-btn hover:bg-btn-hover"
            >
              {copied ? 'Copied ✓' : 'Copy report'}
            </button>
            <span className="text-xs text-fg-subtle">Paste this back to capture your model's protocol.</span>
          </div>
          <pre className="max-h-80 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed text-fg-secondary">
            {report}
          </pre>
        </div>
      )}
    </section>
  );
}
