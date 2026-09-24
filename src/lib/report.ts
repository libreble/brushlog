// Device reports: pre-filled GitHub issue forms (.github/ISSUE_TEMPLATE/) the user reviews and
// submits themselves. Nothing is sent from the app — it only opens a URL. The summary carries
// model identifiers and the GATT layout, never brushing data, characteristic values or raw
// frames (we ask for a Diagnostics report in the thread if we need one).

import type { DeviceInfo, DiscoveredService } from '../protocol/types.ts';

const ISSUES = 'https://github.com/libreble/brushlog/issues/new';

/** The iO (protocol V007) is the one line confirmed on hardware; everything else is prior art. */
export function isConfirmedModel(device: DeviceInfo | null): boolean {
  return device?.protocolVersion === 7;
}

function browser(): string {
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
}

function issueUrl(template: string, title: string, fields: Record<string, string>): string {
  return `${ISSUES}?${new URLSearchParams({ template, title, ...fields })}`;
}

export function connectedSummary(device: DeviceInfo | null, discovery: DiscoveredService[] | null): string {
  const lines = [
    'app: Brushlog',
    `browser: ${browser()}`,
    `advertised name: ${device?.name ?? 'unknown'}`,
    `model id: ${device?.modelId ?? '?'} · protocol: ${device?.protocolVersion ?? '?'} · firmware: ${device?.firmwareVersion ?? '?'}`,
  ];
  if (discovery) {
    lines.push('services:');
    for (const s of discovery) {
      lines.push(`  ${s.uuid}${s.known ? ' [known]' : ''}`);
      for (const c of s.characteristics) lines.push(`    ${c.uuid} [${c.properties.join(',')}]`);
    }
  }
  return lines.join('\n');
}

/** Issue form for a brush that connected: does it work? */
export function deviceReportUrl(device: DeviceInfo | null, discovery: DiscoveredService[] | null): string {
  return issueUrl('device-report.yml', `Device report: ${device?.name ?? 'my brush'}`, {
    connection: connectedSummary(device, discovery),
  });
}

/** Issue form for a brush that isn't in the chooser or won't connect. */
export function connectionProblemUrl(error: string | null): string {
  const lines = ['app: Brushlog', `browser: ${browser()}`];
  if (error) lines.push(`error: ${error}`);
  return issueUrl('connection-problem.yml', 'Connection problem: ', { environment: lines.join('\n') });
}
