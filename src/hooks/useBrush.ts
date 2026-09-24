import { useCallback, useEffect, useRef, useState } from 'react';
import { OralBBrush, NotABrushError } from '../protocol/oralb.ts';
import type { Session, DeviceInfo, BrushHead, LiveState, DiscoveredService, RawFrame } from '../protocol/types.ts';

export type ConnState = 'unsupported' | 'insecure' | 'idle' | 'connecting' | 'connected' | 'error';

interface UseBrushOptions {
  /** Called with freshly synced sessions + device info + brush-head status so the caller can persist them. */
  onSync: (sessions: Session[], info: DeviceInfo, head?: BrushHead) => Promise<void> | void;
  /** Newest stored session timestamp — automatic syncs read only what's newer than this. */
  lastSyncedTimestamp?: number;
}

/** localStorage key remembering which paired device to silently reconnect to. */
const LAST_DEVICE_KEY = 'brushlog.lastDeviceId';
/** How often the background reconnect poll fires while idle (ms). "1 Hz" per the ask. */
const RECONNECT_POLL_MS = 1000;
/** Give up a single silent connect attempt after this so an out-of-range brush can't hang it. */
const RECONNECT_ATTEMPT_TIMEOUT_MS = 4000;

function forgetLastDevice(): void {
  try {
    localStorage.removeItem(LAST_DEVICE_KEY);
  } catch { /* ignore */ }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export function useBrush({ onSync, lastSyncedTimestamp }: UseBrushOptions) {
  const initial: ConnState =
    typeof navigator !== 'undefined' && !OralBBrush.isSupported()
      ? 'unsupported'
      : typeof window !== 'undefined' && !window.isSecureContext
        ? 'insecure'
        : 'idle';

  const [state, setState] = useState<ConnState>(initial);
  const [live, setLive] = useState<LiveState | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The last manual connect ended with the chooser dismissed — offer a connection-problem report. */
  const [cancelled, setCancelled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [discovery, setDiscovery] = useState<DiscoveredService[] | null>(null);
  const [rawLog, setRawLog] = useState<RawFrame[]>([]);
  const brushRef = useRef<OralBBrush | null>(null);
  const unsubRef = useRef<Array<() => void>>([]);
  // Reconnect coordination (refs so the interval always sees fresh values).
  const stateRef = useRef<ConnState>(initial);
  const reconnectingRef = useRef(false);
  const pausedRef = useRef(false); // set on manual disconnect; cleared on manual connect
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const lastTsRef = useRef(lastSyncedTimestamp);
  lastTsRef.current = lastSyncedTimestamp;
  stateRef.current = state;

  const cleanup = useCallback(() => {
    unsubRef.current.forEach((u) => u());
    unsubRef.current = [];
  }, []);

  const runSync = useCallback(async (incremental: boolean) => {
    const brush = brushRef.current;
    if (!brush) return;
    setSyncing(true);
    setSyncProgress(0);
    setError(null);
    try {
      const info = await brush.readDeviceInfo();
      setDevice(info);
      // Automatic syncs read only what's newer than our newest stored session; the manual
      // "Sync history" button does a full sweep (incremental=false) to backfill any gaps.
      const since = incremental ? lastTsRef.current : undefined;
      const sessions = await brush.syncHistory((n) => setSyncProgress(n), { sinceTimestamp: since });
      console.info(`[brushlog] syncHistory (${incremental ? 'incremental' : 'full'}): ${sessions.length} sessions`);
      // After the sweep the access-control unlock is in effect — read brush-head wear now.
      const head = await brush.readBrushHead();
      await onSyncRef.current(sessions, info, head ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, []);

  /** Manual full re-sync (the "Sync history" button). */
  const sync = useCallback(() => runSync(false), [runSync]);

  /** Wire listeners + kick off discovery, live, and an initial sync for a connected brush. */
  const activate = useCallback(
    (brush: OralBBrush) => {
      brushRef.current = brush;
      try {
        localStorage.setItem(LAST_DEVICE_KEY, brush.id);
      } catch { /* private mode / storage disabled — non-fatal */ }
      unsubRef.current.push(
        brush.on('live', (s) => setLive(s)),
        brush.on('raw', (f) => setRawLog((prev) => [...prev.slice(-59), f])),
        brush.on('disconnected', () => {
          setState('idle');
          setLive(null);
          cleanup();
        }),
      );
      setState('connected');
      // Android's BLE stack rejects *concurrent* GATT operations ("GATT operation failed /
      // unknown" — not seen on desktop/BlueZ). So run connect-time work sequentially, and start
      // the continuous notification firehose (live) LAST so it can't collide with the finite
      // sync/discover reads.
      void (async () => {
        await runSync(true); // incremental; handles its own errors internally
        try {
          const d = await brush.discover();
          setDiscovery(d);
          console.info('[brushlog] GATT discovery', d);
        } catch { /* discovery is diagnostics-only */ }
        try {
          await brush.startLive();
        } catch { /* live view is optional */ }
      })();
    },
    [cleanup, runSync],
  );

  const connect = useCallback(async () => {
    if (state === 'unsupported' || state === 'insecure') return;
    pausedRef.current = false; // a manual connect re-enables auto-reconnect
    setError(null);
    setCancelled(false);
    setState('connecting');
    setRawLog([]);
    try {
      const brush = await OralBBrush.request();
      await brush.connect();
      try {
        await brush.verify();
      } catch (e) {
        // Wrong device picked: drop the permission so auto-reconnect never comes back to it.
        await brush.forget();
        throw e;
      }
      activate(brush);
    } catch (e) {
      // User cancelling the chooser throws — treat that as a soft return to idle.
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        setState('idle');
        setCancelled(true);
      } else {
        setError(msg);
        setState('error');
      }
    }
  }, [state, activate]);

  /**
   * Silent reconnect to a previously-paired device (no chooser, no gesture). Best-effort: does
   * nothing if unsupported, already connecting/connected, paused by a manual disconnect, or no
   * device is in range. Bounded by a timeout so an out-of-range brush can't wedge the poll.
   */
  const tryReconnect = useCallback(async () => {
    if (reconnectingRef.current || pausedRef.current) return;
    if (stateRef.current !== 'idle') return;
    let savedId: string | null = null;
    try {
      savedId = localStorage.getItem(LAST_DEVICE_KEY);
    } catch { /* ignore */ }
    if (!savedId) return;
    // Only the brush we last verified — never "whatever else this origin was granted".
    const target = (await OralBBrush.knownDevices()).find((d) => d.id === savedId);
    if (!target) return;

    reconnectingRef.current = true;
    const brush = OralBBrush.fromDevice(target);
    try {
      await withTimeout(brush.connect(), RECONNECT_ATTEMPT_TIMEOUT_MS);
      try {
        await withTimeout(brush.verify(), RECONNECT_ATTEMPT_TIMEOUT_MS);
      } catch (e) {
        if (e instanceof NotABrushError) {
          // Remembered from before this check existed — forget it for good.
          forgetLastDevice();
          await brush.forget();
          return;
        }
        throw e;
      }
      // Re-check we didn't connect/disconnect elsewhere while awaiting.
      if (stateRef.current === 'idle' && !pausedRef.current) {
        activate(brush);
      } else {
        brush.dispose();
      }
    } catch {
      brush.dispose(); // abort a half-open/hung attempt so the next tick can retry cleanly
    } finally {
      reconnectingRef.current = false;
    }
  }, [activate]);

  /** Disconnect = forget: revoke the permission so the brush isn't silently reconnected. */
  const disconnect = useCallback(() => {
    pausedRef.current = true; // belt and braces where forget() is unsupported
    forgetLastDevice();
    void brushRef.current?.forget();
    brushRef.current = null;
    cleanup();
    setState('idle');
    setLive(null);
  }, [cleanup]);

  // Background auto-reconnect: attempt once on mount, then poll at ~1 Hz while idle.
  useEffect(() => {
    if (initial !== 'idle') return; // unsupported / insecure: nothing to poll
    void tryReconnect();
    const timer = window.setInterval(() => void tryReconnect(), RECONNECT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [initial, tryReconnect]);

  useEffect(() => cleanup, [cleanup]);

  return { state, live, device, error, cancelled, syncing, syncProgress, discovery, rawLog, connect, disconnect, sync };
}
