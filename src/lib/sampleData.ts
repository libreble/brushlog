// Generates realistic-looking sessions so the dental-health UI can be built and demoed
// before we can test against a real iO brush. Clearly labelled as sample data in the UI.

import { deviceTimeFromDate } from '../protocol/codec.ts';
import { BRUSHING_MODE } from '../protocol/constants.ts';
import type { Session } from '../protocol/types.ts';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Build ~2 sessions/day over `days` days with believable duration/pressure variance. */
export function generateSampleSessions(days = 30, now: Date = new Date()): Session[] {
  const sessions: Session[] = [];
  for (let d = 0; d < days; d++) {
    const dayBase = new Date(now.getTime() - d * 86_400_000);
    // Most days two brushes; occasionally miss the evening one.
    const perDay = Math.random() < 0.15 ? 1 : 2;
    for (let i = 0; i < perDay; i++) {
      const start = new Date(dayBase);
      if (i === 0) start.setHours(7, Math.floor(rand(0, 40)), 0, 0); // morning
      else start.setHours(22, Math.floor(rand(0, 40)), 0, 0); // evening

      const duration = Math.round(rand(95, 135));
      const pressureWarnings = Math.random() < 0.3 ? Math.floor(rand(1, 4)) : 0;
      const timeUnderPressure = pressureWarnings > 0 ? Math.round(rand(3, 15)) : 0;
      const timestamp = deviceTimeFromDate(start);

      sessions.push({
        timestamp,
        startTime: start,
        duration,
        eventCount: Math.round(rand(20, 60)),
        modeCode: 0x01,
        mode: BRUSHING_MODE[0x01],
        timeUnderPressure,
        pressureWarnings,
        finalBatteryState: Math.round(rand(40, 100)),
        totalTargetTime: 120,
        sector: 4,
        sessionID: sessions.length + 1,
        userID: 1,
        sample: true,
      });
    }
  }
  return sessions;
}
