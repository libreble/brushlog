import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAllSessions,
  getDeviceInfo,
  getLastSync,
  getBrushHead,
  putSessions,
  deleteSampleSessions,
  clearAllData,
  importJSON,
  setDeviceInfo as persistDeviceInfo,
  setBrushHead as persistBrushHead,
} from '../lib/db.ts';
import { computeHealth } from '../lib/health.ts';
import type { HealthGoals } from '../lib/health.ts';
import { generateSampleSessions } from '../lib/sampleData.ts';
import type { StoredSession } from '../lib/session.ts';
import type { DeviceInfo, BrushHead } from '../protocol/types.ts';

/** `goals` threads the user's configured goal time / brushes-per-day into the health calc. */
export function useSessions(goals: HealthGoals = {}) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [deviceInfo, setDeviceInfoState] = useState<DeviceInfo | undefined>(undefined);
  const [brushHead, setBrushHeadState] = useState<BrushHead | undefined>(undefined);
  const [lastSync, setLastSync] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [s, d, l, h] = await Promise.all([
      getAllSessions(),
      getDeviceInfo(),
      getLastSync(),
      getBrushHead(),
    ]);
    setSessions(s);
    setDeviceInfoState(d);
    setLastSync(l);
    setBrushHeadState(h);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addSessions = useCallback(
    async (incoming: StoredSession[], info?: DeviceInfo, head?: BrushHead): Promise<number> => {
      // Attribute each session to the brush it came from (for future multi-device support), and
      // tag its source: passively-synced history has none set → `passive`; the live recorder
      // already stamps `live`/`guided`, which we preserve.
      const deviceId = info?.deviceId;
      const stamped: StoredSession[] = incoming.map((s) => ({
        ...s,
        ...(deviceId ? { deviceId } : {}),
        source: s.source ?? 'passive',
      }));
      const added = await putSessions(stamped);
      // Real device/live data has arrived — drop any generated demo data so it can't skew stats.
      if (incoming.length > 0) await deleteSampleSessions();
      if (info) await persistDeviceInfo(info);
      if (head) await persistBrushHead(head);
      await reload();
      return added;
    },
    [reload],
  );

  const loadSample = useCallback(async () => {
    await putSessions(generateSampleSessions());
    await reload();
  }, [reload]);

  const importData = useCallback(
    async (json: string): Promise<number> => {
      const added = await importJSON(json);
      await reload();
      return added;
    },
    [reload],
  );

  const clear = useCallback(async () => {
    await clearAllData();
    await reload();
  }, [reload]);

  const health = useMemo(
    () => computeHealth(sessions, new Date(), goals),
    [sessions, goals.goalDurationS, goals.brushesPerDay],
  );

  return { sessions, health, deviceInfo, brushHead, lastSync, loading, addSessions, loadSample, importData, clear, reload };
}
