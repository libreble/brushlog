// Oral-B BLE protocol — constants (single source of truth).
//
// Documented from observed traffic; see /docs/PROTOCOL.md for the full write-up.
// The 128-bit UUIDs share the base a0f0ffXX-5047-4d53-8208-4f72616c2d42 where
// 5047 = "PG" (Procter & Gamble) and 4f72616c2d42 = ASCII "Oral-B".
//
// Confirmed for older generations (Genius / SmartSeries / Smart). The iO series is
// unconfirmed — some characteristics may be absent or differ, which is why the client
// (oralb.ts) feature-detects every characteristic instead of assuming it exists.

import type { ModeName } from './types.ts';

/** GATT primary services. */
export const SERVICE = {
  GENERAL: 'a0f0ff00-5047-4d53-8208-4f72616c2d42',
  CONFIGURATION: 'a0f0ff20-5047-4d53-8208-4f72616c2d42',
} as const;

/** GATT characteristics, grouped by their service. */
export const CHAR = {
  // GENERAL service (a0f0ff00) — mostly notify/read, live session state.
  HANDLE_ID: 'a0f0ff01-5047-4d53-8208-4f72616c2d42',
  DEVICE_TYPE: 'a0f0ff02-5047-4d53-8208-4f72616c2d42',
  USER_ACCOUNT_ID: 'a0f0ff03-5047-4d53-8208-4f72616c2d42',
  DEVICE_STATE: 'a0f0ff04-5047-4d53-8208-4f72616c2d42',
  BATTERY_LEVEL: 'a0f0ff05-5047-4d53-8208-4f72616c2d42', // iO battery lives here (not ff2d)
  BUTTON_STATE: 'a0f0ff06-5047-4d53-8208-4f72616c2d42',
  BRUSHING_MODE: 'a0f0ff07-5047-4d53-8208-4f72616c2d42',
  BRUSHING_TIME: 'a0f0ff08-5047-4d53-8208-4f72616c2d42',
  QUADRANT: 'a0f0ff09-5047-4d53-8208-4f72616c2d42',
  SMILEY: 'a0f0ff0a-5047-4d53-8208-4f72616c2d42',
  PRESSURE_SENSOR: 'a0f0ff0b-5047-4d53-8208-4f72616c2d42',
  CACHE: 'a0f0ff0c-5047-4d53-8208-4f72616c2d42',
  SENSOR_DATA: 'a0f0ff0d-5047-4d53-8208-4f72616c2d42',
  // iO access-control gate: writing "MGS" here unlocks reads of DATA (ff29). Absent on older gen.
  ACCESS_CONTROL: 'a0f0ff10-5047-4d53-8208-4f72616c2d42',

  // CONFIGURATION service (a0f0ff20) — command-driven read/write.
  // NB: on iO, DATA (ff29) is under GENERAL (a0f0ff00), while COMMAND (ff21) stays here.
  COMMAND: 'a0f0ff21-5047-4d53-8208-4f72616c2d42',
  RTC: 'a0f0ff22-5047-4d53-8208-4f72616c2d42',
  TIMEZONE: 'a0f0ff23-5047-4d53-8208-4f72616c2d42',
  BRUSHING_TIMER: 'a0f0ff24-5047-4d53-8208-4f72616c2d42',
  BRUSHING_MODES: 'a0f0ff25-5047-4d53-8208-4f72616c2d42',
  QUADRANT_TIMES: 'a0f0ff26-5047-4d53-8208-4f72616c2d42',
  TONGUE_TIME: 'a0f0ff27-5047-4d53-8208-4f72616c2d42',
  PRESSURE: 'a0f0ff28-5047-4d53-8208-4f72616c2d42',
  DATA: 'a0f0ff29-5047-4d53-8208-4f72616c2d42', // brushing history
  FLIGHT_MODE: 'a0f0ff2a-5047-4d53-8208-4f72616c2d42',
  COLOR: 'a0f0ff2b-5047-4d53-8208-4f72616c2d42',
  // iO: brush-head wear countdown (RefillReminder). 9-byte read; device tracks the countdown.
  REFILL_REMINDER: 'a0f0ff2d-5047-4d53-8208-4f72616c2d42',
} as const;

/**
 * 2-byte opcodes written to CHAR.COMMAND to drive command-based reads/writes.
 * Some reads require priming COMMAND first, then reading the target characteristic.
 *
 * ⚠️ This app is read-only by design. Never add the device's ERASE_SESSION_DATA
 * (Configure.Setting subcode 0x06) or DEBUG_COMMAND (0xf0) opcodes here — they wipe stored
 * history / trigger debug behavior on the brush.
 */
export const OPCODE = {
  PING: [0x0a, 0x00],
  GET_RTC: [0x01, 0x00],
  SET_RTC: [0x37, 0x26],
  /** GET_DATA is followed by a record index byte: [0x02, index]. */
  GET_DATA: 0x02,
  SET_MODES: [0x37, 0x29],
  /**
   * EXTEND_CONNECTION (Setting 0x31), param 0x1e = 30s. A keep-alive: an idle iO powers down
   * and drops BLE mid-sync, truncating history. The vendor app sends this periodically; we
   * do the same so a resting brush stays connected through a full sweep.
   */
  EXTEND_CONNECTION: [0x31, 0x1e],
} as const;

/**
 * The iO AccessControl characteristic (ff10) takes a fixed unlock string, ASCII "MGS"
 * (no nonce/crypto — an enable toggle, not real security). The vendor app writes it at
 * connect for protocol V007. Whether device firmware actually gates DATA (ff29) reads on it
 * is UNCONFIRMED — but writing it is harmless and matches observed traffic, so we do it
 * best-effort.
 * The deciding experiment is a wire A/B: read ff29 with vs. without this write. Older gen has
 * no ff10 and ignores this.
 */
export const ACCESS_CONTROL_KEY = [0x4d, 0x47, 0x53] as const;

/** Device epoch: milliseconds for 2000-01-01T00:00:00Z. Device times are seconds since this. */
export const EPOCH_MS = 946684800000;

/**
 * History parameters. iO (V007) stores up to 250 sessions in a ring buffer; older gen far
 * fewer. We scan slots [0, HISTORY_MAX_RECORDS) but stop at the first empty slot, so this is
 * an upper bound, not a fixed count. Records are 16 bytes on older gen, 21 bytes on iO.
 */
export const HISTORY_MAX_RECORDS = 250;
export const HISTORY_RECORD_BYTES = 16;
export const HISTORY_RECORD_BYTES_IO = 21;
/**
 * Stop the slot sweep only after this many *consecutive* empty slots, not the first one — so an
 * isolated empty/legacy slot (e.g. a deleted session) can't truncate the read, while a solid run
 * still marks the end of the used region. Cheap insurance against ring-addressing surprises.
 */
export const HISTORY_EMPTY_RUN_STOP = 16;
/** Retries per slot for transient "GATT operation failed" read errors. */
export const HISTORY_SLOT_RETRIES = 3;
/** Give up the sweep only after this many *consecutive* slot failures (connection looks dead);
 *  a good read resets the counter, so an intermittently-flaky-but-alive link still completes. */
export const HISTORY_MAX_SLOT_FAILURES = 8;
/** Re-send the EXTEND_CONNECTION keep-alive if this many ms have passed, so an idle brush that
 *  would otherwise power down mid-sweep stays connected. Kept under the 30s the brush grants. */
export const HISTORY_KEEPALIVE_MS = 15_000;

/** DEVICE_STATE enum (byte 0). */
export const DEVICE_STATE: Record<number, string> = {
  0x00: 'unknown',
  0x01: 'initializing',
  0x02: 'idle',
  0x03: 'running',
  0x04: 'charging',
  0x05: 'setup',
  0x06: 'flight-menu',
  0x07: 'change-forbidden',
  0x08: 'pre-run',
  0x09: 'off', // observed on iO at end of session
  0x71: 'final-test',
  0x72: 'pcb-test',
  0x73: 'sleep',
  0x74: 'transport',
  0x75: 'calibration-test',
};

/**
 * Brushing modes for Smart / Genius / SmartSeries. The iO series uses a different table
 * (see PROTOCOL.md); resolve model-specific names in the UI when the model is known.
 */
export const BRUSHING_MODE: Record<number, ModeName> = {
  0x00: 'off',
  0x01: 'daily-clean',
  0x02: 'sensitive',
  0x03: 'massage',
  0x04: 'whitening',
  0x05: 'deep-clean',
  0x06: 'tongue-cleaning',
  0x07: 'turbo',
  0xff: 'unknown',
};

/**
 * iO series brushing modes (protocol V007+). Different code table from older gen — confirmed
 * against a captured history sync. Note code 0x00 is
 * "daily-clean" here, whereas older gen uses 0x00 for "off"; resolve by record format.
 */
export const BRUSHING_MODE_IO: Record<number, ModeName> = {
  0x00: 'daily-clean',
  0x01: 'sensitive',
  0x02: 'massage', // Gum Care
  0x03: 'whitening',
  0x04: 'intense',
  0x05: 'super-sensitive',
  0x06: 'tongue-cleaning',
  0x07: 'off',
  0x08: 'settings',
  0x0b: 'smart-adapt',
  0x0c: 'gentle-white',
};

/** Human-friendly labels. */
export const MODE_LABELS: Record<ModeName, string> = {
  'off': 'Off',
  'daily-clean': 'Daily Clean',
  'sensitive': 'Sensitive',
  'massage': 'Gum Care',
  'whitening': 'Whitening',
  'deep-clean': 'Deep Clean',
  'tongue-cleaning': 'Tongue Clean',
  'turbo': 'Turbo',
  'intense': 'Intense',
  'super-sensitive': 'Super Sensitive',
  'smart-adapt': 'Smart',
  'gentle-white': 'Gentle White',
  'settings': 'Settings',
  'unknown': 'Unknown',
};

/** Dentist-standard brushing target used across the app. */
export const GOAL_DURATION_S = 120;

/** RefillReminder (ff2d) state byte → label. Anything else is a wear "stage" indicator. */
export const REFILL_STATE: Record<number, import('./types.ts').RefillState> = {
  0x00: 'on',
  0x01: 'reset',
  0x02: 'snooze',
  0xfe: 'interval',
  0xff: 'off',
};

/** Bytes in a V007 RefillReminder read. */
export const REFILL_REMINDER_BYTES = 9;

/** A new Oral-B head is rated for ~90 days — used as the wear-bar baseline. */
export const FRESH_HEAD_DAYS = 90;

/** Services we ask Web Bluetooth for access to. */
export const SUPPORTED_SERVICES: string[] = [SERVICE.GENERAL, SERVICE.CONFIGURATION];

/**
 * Services declared in `optionalServices` so we're *allowed* to enumerate them after
 * connecting. Web Bluetooth hides any service not on this allowlist, so for reverse-
 * engineering an unknown model (iO) we widen it: the known a0f0ff00/ff20 family, a few
 * plausible sibling bases, and standard GATT services an iO might also expose.
 *
 * NB: truly unknown iO service UUIDs still can't be seen until we learn them (from a BLE
 * sniff of another client) and add them here — that's a hard Web Bluetooth limit.
 */
export const DISCOVERY_SERVICES: string[] = [
  SERVICE.GENERAL,
  SERVICE.CONFIGURATION,
  // Plausible siblings in the same PG/Oral-B base — harmless if absent.
  'a0f0ff10-5047-4d53-8208-4f72616c2d42',
  'a0f0ff30-5047-4d53-8208-4f72616c2d42',
  'a0f0ff40-5047-4d53-8208-4f72616c2d42',
  'a0f0ff50-5047-4d53-8208-4f72616c2d42',
  // Standard services.
  'generic_access',
  'device_information',
  'battery_service',
];
