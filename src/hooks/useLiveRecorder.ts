import { useEffect, useRef, useState } from 'react';
import { deviceTimeFromDate } from '../protocol/codec.ts';
import { BRUSHING_MODE } from '../protocol/constants.ts';
import type { LiveState } from '../protocol/types.ts';
import type { PressureSample, SessionSource, StoredSession } from '../lib/session.ts';

/** A session shorter than this (seconds) is discarded as noise. */
const MIN_RECORDED_S = 8;
/** Downsample the live pressure stream to this cadence — ~2 Hz (a 2-min brush ≈ 240 points). */
const SAMPLE_INTERVAL_MS = 500;
/** Hard cap on stored samples so a forgotten-running brush can't grow the trace unbounded (~10 min). */
const MAX_SAMPLES = 1200;

interface InProgress {
  startedAtMs: number;
  startDate: Date;
  mode: number;
  lastUpdateMs: number;
  prevZone: number;
  pressureWarnings: number;
  timeUnderPressureMs: number;
  sectors: Set<number>;
  battery: number;
  peakTime: number;
  /** Downsampled force/zone/sector time-series (app-level; not device history). */
  samples: PressureSample[];
  lastSampleMs: number;
  /** Running sum/count of the live coaching "smiley" score, plus the most recent value. */
  smileySum: number;
  smileyCount: number;
  smileyLast: number;
}

/**
 * Turns a stream of live brush state into stored sessions. Opens an in-progress session on the
 * first "running" frame; finalizes when the brush stops running or the connection drops.
 *
 * Duration is measured by wall clock (not the brush's BRUSHING_TIME characteristic, which
 * notifies only sparsely on iO), so short/quiet sessions still get recorded. This is what makes
 * Brushlog work on models whose on-device history format isn't decoded (e.g. iO).
 *
 * It also samples the live pressure/force stream (~2 Hz) into a downsampled `trace` on the
 * app-level `StoredSession`, which the detail view graphs. Passively-synced sessions have no such
 * trace (the brush only stores summary counters) — that's expected.
 *
 * @param source how to tag the produced session — `'live'` (default) for a plain app-open
 *   recording, or `'guided'` once the guided coaching flow drives this recorder.
 *   TODO(guided): a guided entry point passes `'guided'` here and attaches the end-of-session
 *   survey (see `GuidedSurvey` in lib/session.ts) to the completed session before persisting.
 *
 * @returns the in-progress force `trace` as React state, so the live view can draw the curve
 *   *while* brushing (not just retrospectively at finalize). It's a mirror of the same ref buffer
 *   the finalized session stores, updated at the ≤2 Hz sample cadence (so re-renders stay cheap),
 *   reset to `[]` at session start and after finalize.
 */
export function useLiveRecorder(
  live: LiveState | null,
  onComplete: (session: StoredSession) => void,
  source: SessionSource = 'live',
): PressureSample[] {
  const ref = useRef<InProgress | null>(null);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  // Mirror of the growing sample buffer, surfaced so LiveSession can graph it live.
  const [liveTrace, setLiveTrace] = useState<PressureSample[]>([]);

  useEffect(() => {
    const running = live?.device?.state === 'running';
    const now = Date.now();

    // Start on the first "running" frame.
    if (running && !ref.current) {
      ref.current = {
        startedAtMs: now,
        startDate: new Date(),
        mode: live?.mode?.code ?? 0,
        lastUpdateMs: now,
        prevZone: 1,
        pressureWarnings: 0,
        timeUnderPressureMs: 0,
        sectors: new Set<number>(),
        battery: live?.battery ?? 0,
        peakTime: live?.time ?? 0,
        samples: [],
        lastSampleMs: 0,
        smileySum: 0,
        smileyCount: 0,
        smileyLast: NaN,
      };
      setLiveTrace([]); // fresh curve for the new session
      console.info('[brushlog] recording started');
    }

    // Accumulate while running.
    if (running && ref.current && live) {
      const s = ref.current;
      if (live.mode?.code) s.mode = live.mode.code;
      if (typeof live.battery === 'number') s.battery = live.battery;
      if (typeof live.sector === 'number') s.sectors.add(live.sector);
      if (typeof live.time === 'number' && live.time > s.peakTime) s.peakTime = live.time;
      if (typeof live.smiley === 'number') {
        s.smileySum += live.smiley;
        s.smileyCount += 1;
        s.smileyLast = live.smiley;
      }

      const zone = live.pressure?.zone ?? (live.pressure?.highPressure ? 2 : 1);
      if (zone >= 2 && s.prevZone < 2) s.pressureWarnings += 1;
      if (zone >= 2) s.timeUnderPressureMs += Math.max(0, now - s.lastUpdateMs);
      s.prevZone = zone;
      s.lastUpdateMs = now;

      // Downsample the continuous force reading into the trace (~2 Hz). Only iO exposes the
      // uint16 `value`; on models without it the trace simply stays empty.
      const force = live.pressure?.value;
      if (typeof force === 'number' && now - s.lastSampleMs >= SAMPLE_INTERVAL_MS) {
        s.samples.push({
          t: Math.round(((now - s.startedAtMs) / 1000) * 10) / 10,
          f: force,
          ...(typeof live.pressure?.zone === 'number' ? { zone: live.pressure.zone } : {}),
          ...(typeof live.sector === 'number' ? { sector: live.sector } : {}),
        });
        if (s.samples.length > MAX_SAMPLES) s.samples.shift();
        s.lastSampleMs = now;
        // Publish a fresh array reference so the live graph re-renders (≤2 Hz — cheap).
        setLiveTrace(s.samples.slice());
      }
    }

    // Finalize when the brush stops running (state change) or the connection drops (live null).
    if (ref.current && (!running || live === null)) {
      const s = ref.current;
      ref.current = null;
      setLiveTrace([]); // clear the live curve; the finalized trace lives on the saved session
      const wallSeconds = Math.round((Date.now() - s.startedAtMs) / 1000);
      const duration = Math.max(wallSeconds, s.peakTime);
      if (duration >= MIN_RECORDED_S) {
        const session: StoredSession = {
          timestamp: deviceTimeFromDate(s.startDate),
          startTime: s.startDate,
          duration,
          eventCount: 0,
          modeCode: s.mode,
          mode: BRUSHING_MODE[s.mode] ?? 'unknown',
          timeUnderPressure: Math.round(s.timeUnderPressureMs / 1000),
          pressureWarnings: s.pressureWarnings,
          finalBatteryState: s.battery,
          sector: s.sectors.size,
          source: sourceRef.current,
          ...(s.samples.length > 0 ? { trace: s.samples } : {}),
          // Coaching score, when the brush streamed it (iO ff0a): store the session average + final.
          ...(s.smileyCount > 0
            ? { smileyAvg: Math.round(s.smileySum / s.smileyCount), smileyFinal: s.smileyLast }
            : {}),
        };
        console.info('[brushlog] session recorded', session);
        cbRef.current(session);
      } else {
        console.info(`[brushlog] session discarded (only ${duration}s, need ${MIN_RECORDED_S}s)`);
      }
    }
  }, [live]);

  return liveTrace;
}
