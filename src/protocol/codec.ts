// Oral-B BLE protocol — pure encode/decode functions.
//
// Dependency-free and side-effect-free so they can be lifted into any implementation
// and unit-tested in isolation. Every function takes/returns plain data — no Web
// Bluetooth objects. All multi-byte device fields are little-endian.

import {
  EPOCH_MS,
  DEVICE_STATE,
  BRUSHING_MODE,
  BRUSHING_MODE_IO,
  REFILL_STATE,
  REFILL_REMINDER_BYTES,
  HISTORY_RECORD_BYTES,
  HISTORY_RECORD_BYTES_IO,
} from './constants.ts';
import type {
  Session,
  DeviceStateInfo,
  PressureInfo,
  ButtonInfo,
  ModeInfo,
  DeviceInfo,
  BrushHead,
} from './types.ts';

/** @param deviceSeconds seconds since 2000-01-01T00:00:00Z */
export function dateFromDeviceTime(deviceSeconds: number): Date {
  return new Date(EPOCH_MS + deviceSeconds * 1000);
}

/** @returns seconds since 2000-01-01T00:00:00Z */
export function deviceTimeFromDate(date: Date): number {
  return Math.round((date.getTime() - EPOCH_MS) / 1000);
}

/** BRUSHING_TIME (2 bytes): minutes, seconds -> total seconds elapsed this session. */
export function decodeBrushingTime(view: DataView): number {
  assertLen(view, 2, 'BRUSHING_TIME');
  return view.getUint8(0) * 60 + view.getUint8(1);
}

/** DEVICE_STATE (2 bytes): state enum + flag bits. */
export function decodeDeviceState(view: DataView): DeviceStateInfo {
  assertLen(view, 2, 'DEVICE_STATE');
  const raw = view.getUint8(0);
  const flags = view.getUint8(1);
  return {
    state: DEVICE_STATE[raw] ?? 'unknown',
    stateCode: raw,
    transportMode: (flags & 0x01) === 0x01,
    deactivateTimer: (flags & 0x02) === 0x02,
  };
}

/**
 * PRESSURE_SENSOR. Two known shapes:
 *  - Older gen (1 byte): bit flags (0x80 = high, 0x40 = motor reduced).
 *  - iO series (10-byte high-rate stream): [0]=zone (1=ok, 2=too hard),
 *    [1..2]=sample counter, [3..4]=continuous force value, [5..8]=previous (counter,value),
 *    [9]=constant marker. Confirmed against a model-52 (protocol 7) iO capture.
 */
export function decodePressure(view: DataView): PressureInfo {
  if (view.byteLength === 1) {
    const b = view.getUint8(0);
    return {
      highPressure: (b & 0x80) === 0x80,
      motorSpeedReduced: (b & 0x40) === 0x40,
      raw: b,
    };
  }
  if (view.byteLength >= 5) {
    const zone = view.getUint8(0);
    const value = view.getUint16(3, true);
    return {
      highPressure: zone >= 2,
      motorSpeedReduced: false,
      raw: zone,
      zone,
      value,
    };
  }
  throw new RangeError(`PRESSURE_SENSOR: unexpected length ${view.byteLength}`);
}

/** BATTERY_LEVEL (1 byte): percent 0-100. */
export function decodeBattery(view: DataView): number {
  assertLen(view, 1, 'BATTERY_LEVEL');
  return view.getUint8(0);
}

/** BRUSHING_MODE (1 byte): current mode enum. */
export function decodeMode(view: DataView): ModeInfo {
  assertLen(view, 1, 'BRUSHING_MODE');
  const code = view.getUint8(0);
  return { code, name: BRUSHING_MODE[code] ?? 'unknown' };
}

/**
 * QUADRANT: current sector/quadrant index. 1 byte on older gen; iO sends 3 bytes
 * (observed `00 00 04` — byte 0 = current sector, byte 2 = sector count). We read byte 0.
 */
export function decodeQuadrant(view: DataView): number {
  if (view.byteLength < 1) throw new RangeError('QUADRANT: empty');
  return view.getUint8(0);
}

/** SMILEY (1 byte): the "how did you do" feedback score the brush surfaces. */
export function decodeSmiley(view: DataView): number {
  assertLen(view, 1, 'SMILEY');
  return view.getUint8(0);
}

/** BUTTON_STATE (2 or 4 bytes): which physical buttons are pressed. */
export function decodeButton(view: DataView): ButtonInfo {
  if (view.byteLength !== 2 && view.byteLength !== 4) {
    throw new RangeError(`BUTTON_STATE: expected 2 or 4 bytes, got ${view.byteLength}`);
  }
  return {
    powerButton: view.getUint8(0) === 1,
    modeButton: view.getUint8(1) === 1,
  };
}

/** DEVICE_TYPE (1 or 3 bytes): model id, optionally protocol + firmware version. */
export function decodeDeviceType(view: DataView): DeviceInfo {
  if (view.byteLength !== 1 && view.byteLength !== 3) {
    throw new RangeError(`DEVICE_TYPE: expected 1 or 3 bytes, got ${view.byteLength}`);
  }
  const info: DeviceInfo = { modelId: view.getUint8(0) };
  if (view.byteLength === 3) {
    info.protocolVersion = view.getUint8(1);
    info.firmwareVersion = view.getUint8(2);
  }
  return info;
}

/** RTC (4 bytes, little-endian): device real-time clock. */
export function decodeRtc(view: DataView): Date {
  assertLen(view, 4, 'RTC');
  return dateFromDeviceTime(view.getUint32(0, true));
}

/**
 * RefillReminder / brush-head wear (ff2d, iO). 9 bytes LE — validated against a captured read
 * `00 5a 00 3b 54 00 00 00 00` (state On, 90 days left, ~21563 s brushing left):
 *  [0] state · [1:2] daysLeft · [3:4] brushingSecondsLeft · [5:6] daysSinceReminder ·
 *  [7:8] secondsSinceReminder. The handle decrements the countdown, so we just read it.
 */
export function decodeRefillReminder(view: DataView): BrushHead {
  if (view.byteLength < REFILL_REMINDER_BYTES) {
    throw new RangeError(`RefillReminder: expected ${REFILL_REMINDER_BYTES}+ bytes, got ${view.byteLength}`);
  }
  const stateCode = view.getUint8(0);
  return {
    stateCode,
    state: REFILL_STATE[stateCode] ?? 'stage',
    daysLeft: view.getUint16(1, true),
    brushingSecondsLeft: view.getUint16(3, true),
    daysSinceReminder: view.getUint16(5, true),
    secondsSinceReminder: view.getUint16(7, true),
  };
}

/**
 * DATA (16 bytes, little-endian): one historical brushing session record.
 * Returns null for an empty slot (timestamp === 0), signalling "no more records".
 */
export function decodeSession(view: DataView): Session | null {
  assertLen(view, HISTORY_RECORD_BYTES, 'DATA');
  const timestamp = view.getUint32(0, true);
  if (timestamp === 0) return null;

  const modeCode = view.getUint8(7);
  const session: Session = {
    timestamp,
    startTime: dateFromDeviceTime(timestamp),
    duration: view.getUint16(4, true), // seconds
    eventCount: view.getUint8(6),
    modeCode,
    mode: BRUSHING_MODE[modeCode] ?? 'unknown',
    timeUnderPressure: view.getUint16(8, true), // seconds
    pressureWarnings: view.getUint8(10),
    finalBatteryState: view.getUint8(11),
  };

  // The last 4 bytes are overloaded: either a "last full charge" timestamp,
  // or packed session metadata. A plausible timestamp (> ~2001) disambiguates.
  const lastSegment = view.getUint32(12, true);
  if (lastSegment > 0x01000000) {
    session.lastFullCharge = dateFromDeviceTime(lastSegment);
  } else {
    const a = view.getUint16(12, true);
    const b = view.getUint16(14, true);
    session.totalTargetTime = a & 0x1fff; // 13 bits
    session.sector = a >> 13; // top 3 bits
    session.sessionID = b & 0x1fff;
    session.userID = b >> 13;
  }
  return session;
}

/** Marker for an all-0x44 never-written iO ring slot. */
const IO_EMPTY_SLOT = 0x44444444;

/**
 * DATA (21 bytes, little-endian): one iO (protocol V007) history record. Layout validated
 * byte-exact against a 250-record capture. Returns null for an empty/never-written slot.
 *
 *  [0:4]  u32  startTime (seconds since 2000-01-01Z)
 *  [4:6]  u16  sessionId (low 13 bits) + userId (top 3 bits)
 *  [6:8]  u16  configuredBrushingTime seconds (low 13 bits) + numberOfSectors (top 3 bits)
 *  [8:10] u16  duration seconds
 *  [10:12] u16 highPressureTime (units of 100 ms)
 *  [12:14] u16 lowPressureTime  (units of 100 ms)
 *  [14]   u8   averagePressure (units of 100 mN)
 *  [15]   u8   maximumPressure (units of 100 mN)
 *  [16]   u8   highPressureEventCount
 *  [17]   u8   lowPressureEventCount
 *  [18]   u8   onEventCount
 *  [19]   u8   brushingMode (iO table)
 *  [20]   u8   finalBatteryLevel (%)
 */
export function decodeSessionIO(view: DataView): Session | null {
  assertLen(view, HISTORY_RECORD_BYTES_IO, 'DATA(iO)');
  const timestamp = view.getUint32(0, true);
  if (timestamp === 0 || timestamp === IO_EMPTY_SLOT) return null;

  const idField = view.getUint16(4, true);
  const sessionID = idField & 0x1fff;
  if (sessionID === 0) return null; // empty slot

  const cfgField = view.getUint16(6, true);
  const highPressureTime = view.getUint16(10, true) / 10; // 100 ms -> s
  const lowPressureTime = view.getUint16(12, true) / 10;
  const highPressureEvents = view.getUint8(16);
  const onEvents = view.getUint8(18);
  const modeCode = view.getUint8(19);

  return {
    timestamp,
    startTime: dateFromDeviceTime(timestamp),
    duration: view.getUint16(8, true), // seconds
    eventCount: onEvents,
    modeCode,
    mode: BRUSHING_MODE_IO[modeCode] ?? 'unknown',
    timeUnderPressure: highPressureTime, // seconds in the high-pressure zone
    pressureWarnings: highPressureEvents,
    finalBatteryState: view.getUint8(20),
    sessionID,
    userID: idField >> 13,
    totalTargetTime: cfgField & 0x1fff, // configured timer, seconds
    sectorCount: cfgField >> 13,
    highPressureTime,
    lowPressureTime,
    avgPressure: view.getUint8(14) / 10, // 100 mN -> N
    maxPressure: view.getUint8(15) / 10,
    highPressureEvents,
    lowPressureEvents: view.getUint8(17),
    onEvents,
  };
}

/**
 * Decode one history record, dispatching on length: 16 bytes = older gen, 21 bytes = iO.
 * Returns null for an empty slot. Throws on an unknown length (a model we haven't reversed).
 */
export function decodeHistoryRecord(view: DataView): Session | null {
  switch (view.byteLength) {
    case HISTORY_RECORD_BYTES:
      return decodeSession(view);
    case HISTORY_RECORD_BYTES_IO:
      return decodeSessionIO(view);
    default:
      throw new RangeError(
        `Unsupported history record length: ${view.byteLength} bytes ` +
          `(known: ${HISTORY_RECORD_BYTES} older-gen, ${HISTORY_RECORD_BYTES_IO} iO).`,
      );
  }
}

/** Encode a COMMAND opcode (array of bytes) to a buffer for writeValue. */
export function encodeCommand(bytes: readonly number[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

function assertLen(view: DataView, len: number, name: string): void {
  if (view.byteLength !== len) {
    throw new RangeError(`${name}: expected ${len} bytes, got ${view.byteLength}`);
  }
}
