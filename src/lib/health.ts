// Derives dental-health metrics from stored sessions. Pure functions over Session[].
// This is where "raw brushing records" become "how are my habits?".

import { GOAL_DURATION_S } from '../protocol/constants.ts';
import type { Session, ModeName } from '../protocol/types.ts';

/** A session shorter than this is treated as noise (bumped button, quick rinse). */
const MIN_REAL_SESSION_S = 20;
/** A day "counts" toward a streak if it has a session at least this long. */
const STREAK_MIN_S = 60;

export interface DayStat {
  date: string; // YYYY-MM-DD (local)
  sessions: number;
  totalDuration: number; // seconds
  brushed: boolean;
  pressureWarnings: number;
}

export interface WindowStat {
  avgDuration: number; // seconds, mean over sessions in window
  sessionsPerDay: number;
  avgPressureWarnings: number; // per session
  goalRate: number; // fraction of sessions reaching the full 2 min
}

export interface Insight {
  level: 'good' | 'warn' | 'info';
  text: string;
}

export interface HealthSummary {
  totalSessions: number;
  totalTime: number; // seconds
  today: { sessions: number; totalDuration: number; goalMet: boolean };
  streakDays: number;
  week: WindowStat;
  month: WindowStat;
  last14Days: DayStat[];
  modeCounts: Partial<Record<ModeName, number>>;
  insights: Insight[];
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

/** App-level goal config threaded through the health calc (falls back to the built-in defaults). */
export interface HealthGoals {
  goalDurationS?: number;
  brushesPerDay?: number;
}

function windowStat(sessions: Session[], days: number, now: Date, goalDurationS: number): WindowStat {
  const cutoff = addDays(now, -days).getTime();
  const inWindow = sessions.filter((s) => s.startTime.getTime() >= cutoff);
  if (inWindow.length === 0) {
    return { avgDuration: 0, sessionsPerDay: 0, avgPressureWarnings: 0, goalRate: 0 };
  }
  const totalDuration = inWindow.reduce((a, s) => a + s.duration, 0);
  const totalWarnings = inWindow.reduce((a, s) => a + s.pressureWarnings, 0);
  const metGoal = inWindow.filter((s) => s.duration >= goalDurationS).length;
  return {
    avgDuration: totalDuration / inWindow.length,
    sessionsPerDay: inWindow.length / days,
    avgPressureWarnings: totalWarnings / inWindow.length,
    goalRate: metGoal / inWindow.length,
  };
}

export function computeHealth(
  allSessions: Session[],
  now: Date = new Date(),
  goals: HealthGoals = {},
): HealthSummary {
  const goalDurationS = goals.goalDurationS ?? GOAL_DURATION_S;
  const brushesPerDay = goals.brushesPerDay ?? 2;
  const sessions = allSessions
    .filter((s) => s.duration >= MIN_REAL_SESSION_S)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Bucket by local day.
  const byDay = new Map<string, DayStat>();
  for (const s of sessions) {
    const key = localDayKey(s.startTime);
    const day = byDay.get(key) ?? { date: key, sessions: 0, totalDuration: 0, brushed: false, pressureWarnings: 0 };
    day.sessions += 1;
    day.totalDuration += s.duration;
    day.pressureWarnings += s.pressureWarnings;
    if (s.duration >= STREAK_MIN_S) day.brushed = true;
    byDay.set(key, day);
  }

  // Last 14 days, oldest -> newest, filling gaps with empty days.
  const last14Days: DayStat[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = localDayKey(addDays(now, -i));
    last14Days.push(byDay.get(key) ?? { date: key, sessions: 0, totalDuration: 0, brushed: false, pressureWarnings: 0 });
  }

  // Streak: consecutive brushed days ending today (with a grace day for "not yet today").
  const brushedDays = new Set(Array.from(byDay.values()).filter((d) => d.brushed).map((d) => d.date));
  let streakDays = 0;
  const todayKey = localDayKey(now);
  let cursor = brushedDays.has(todayKey) ? 0 : 1; // grace: allow starting from yesterday
  // If neither today nor yesterday, streak is 0.
  if (cursor === 1 && !brushedDays.has(localDayKey(addDays(now, -1)))) {
    streakDays = 0;
  } else {
    for (;;) {
      const key = localDayKey(addDays(now, -cursor));
      if (brushedDays.has(key)) {
        streakDays += 1;
        cursor += 1;
      } else {
        break;
      }
    }
  }

  const todayStat = byDay.get(todayKey);
  const today = {
    sessions: todayStat?.sessions ?? 0,
    totalDuration: todayStat?.totalDuration ?? 0,
    goalMet: (todayStat?.totalDuration ?? 0) >= goalDurationS && (todayStat?.sessions ?? 0) >= brushesPerDay,
  };

  const modeCounts: Partial<Record<ModeName, number>> = {};
  for (const s of sessions) modeCounts[s.mode] = (modeCounts[s.mode] ?? 0) + 1;

  const week = windowStat(sessions, 7, now, goalDurationS);
  const month = windowStat(sessions, 30, now, goalDurationS);

  return {
    totalSessions: sessions.length,
    totalTime: sessions.reduce((a, s) => a + s.duration, 0),
    today,
    streakDays,
    week,
    month,
    last14Days,
    modeCounts,
    insights: buildInsights({ sessions, streakDays, week, now, goalDurationS, brushesPerDay }),
  };
}

function buildInsights(ctx: {
  sessions: Session[];
  streakDays: number;
  week: WindowStat;
  now: Date;
  goalDurationS: number;
  brushesPerDay: number;
}): Insight[] {
  const out: Insight[] = [];
  const { sessions, streakDays, week, now, goalDurationS, brushesPerDay } = ctx;
  const goalLabel = goalDurationS % 60 === 0 ? `${goalDurationS / 60}-minute` : `${goalDurationS}s`;

  if (sessions.length === 0) {
    out.push({ level: 'info', text: 'No sessions yet. Connect your brush and sync, or load sample data to explore.' });
    return out;
  }

  if (streakDays >= 3) {
    out.push({ level: 'good', text: `🔥 ${streakDays}-day brushing streak — keep it going.` });
  }

  if (week.avgDuration > 0 && week.avgDuration < goalDurationS) {
    const short = Math.round(goalDurationS - week.avgDuration);
    out.push({ level: 'warn', text: `You're averaging ${short}s under your ${goalLabel} goal this week. Try lingering a little longer.` });
  } else if (week.avgDuration >= goalDurationS) {
    out.push({ level: 'good', text: `Averaging your full ${goalLabel} goal this week — textbook.` });
  }

  if (week.sessionsPerDay > 0 && week.sessionsPerDay < brushesPerDay) {
    out.push({ level: 'warn', text: `About ${week.sessionsPerDay.toFixed(1)} brushes/day lately — your target is ${brushesPerDay}×.` });
  }

  if (week.avgPressureWarnings >= 2) {
    out.push({ level: 'warn', text: `~${week.avgPressureWarnings.toFixed(1)} over-pressure nudges per brush — ease off to protect your gums.` });
  } else if (week.avgPressureWarnings < 0.5 && week.avgDuration >= goalDurationS) {
    out.push({ level: 'good', text: 'Gentle pressure and full duration — great technique.' });
  }

  const lastSession = sessions[sessions.length - 1];
  const daysSince = (now.getTime() - lastSession.startTime.getTime()) / 86_400_000;
  if (daysSince >= 2) {
    out.push({ level: 'info', text: 'No sessions synced in a couple of days — connect your brush to catch up.' });
  }

  return out.slice(0, 4);
}
