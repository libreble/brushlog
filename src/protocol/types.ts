// Oral-B BLE protocol — shared types. Framework-agnostic; safe to lift into any project.

/** A completed brushing session decoded from the DATA history characteristic. */
export interface Session {
  /** Device time (seconds since 2000-01-01Z). Stable per session — used as the storage key. */
  timestamp: number;
  /** Session start as a JS Date. */
  startTime: Date;
  /** Session length in seconds. */
  duration: number;
  /** Internal event counter. */
  eventCount: number;
  /** Raw brushing-mode byte. */
  modeCode: number;
  /** Resolved mode name (e.g. "daily-clean"). */
  mode: ModeName;
  /** Seconds spent pressing too hard. */
  timeUnderPressure: number;
  /** Count of over-pressure warnings. */
  pressureWarnings: number;
  /** Battery % at session end. */
  finalBatteryState: number;
  /** Present when the record encodes a charge time instead of packed metadata. */
  lastFullCharge?: Date;
  /** Configured target time (seconds), when present. */
  totalTargetTime?: number;
  /** Sector metadata (0-7), when present. */
  sector?: number;
  /** Device-assigned session id, when present. */
  sessionID?: number;
  /** Device-assigned user id, when present. */
  userID?: number;

  // --- iO (V007) rich metrics; all optional, absent on older gen. ---
  /** Seconds spent in the high-pressure zone (iO). Mirrors timeUnderPressure. */
  highPressureTime?: number;
  /** Seconds spent in the low-pressure zone (iO). */
  lowPressureTime?: number;
  /** Average brushing force in Newtons (iO). */
  avgPressure?: number;
  /** Peak brushing force in Newtons (iO). */
  maxPressure?: number;
  /** Count of high-pressure events (iO). */
  highPressureEvents?: number;
  /** Count of low-pressure events (iO). */
  lowPressureEvents?: number;
  /** Count of motor on/off events (iO). */
  onEvents?: number;
  /** Number of configured sectors for this session (iO). */
  sectorCount?: number;

  /**
   * Which physical brush this session came from (the Web Bluetooth origin-scoped device id).
   * App-level, stamped at persist time — enables multiple devices in one app later. Undefined
   * on legacy rows until the next sync backfills them (key is still `timestamp` for now; a
   * composite `[deviceId, timestamp]` key is the migration step when real multi-device lands).
   *
   * NB for future "who brushed" attribution: `userID` above already distinguishes household
   * members on a shared iO base (the device tags each session with a user slot) — so a person
   * is (deviceId, userID). See docs/HANDOFF.md backlog.
   */
  deviceId?: string;

  /** App-level marker (not from the device): this is generated demo data, purge-on-real-sync. */
  sample?: boolean;
}

export interface DeviceStateInfo {
  state: string;
  stateCode: number;
  transportMode: boolean;
  deactivateTimer: boolean;
}

export type RefillState = 'on' | 'reset' | 'snooze' | 'interval' | 'off' | 'stage' | 'unknown';

/** Brush-head replacement status, read from the iO's RefillReminder characteristic (ff2d). */
export interface BrushHead {
  /** Raw reminder-state byte. */
  stateCode: number;
  state: RefillState;
  /** Days until replacement is recommended (device-tracked countdown). */
  daysLeft: number;
  /** Brushing time (seconds) left before replacement. */
  brushingSecondsLeft: number;
  /** Days elapsed since the reminder fired (0 until due). */
  daysSinceReminder: number;
  /** Brushing seconds elapsed since the reminder fired. */
  secondsSinceReminder: number;
}

export interface PressureInfo {
  highPressure: boolean;
  motorSpeedReduced: boolean;
  raw: number;
  /** iO only: continuous force reading (uint16). Absent on older 1-byte pressure. */
  value?: number;
  /** iO only: device-reported pressure zone (0/1 = ok, 2 = too hard). */
  zone?: number;
}

export interface ButtonInfo {
  powerButton: boolean;
  modeButton: boolean;
}

export interface ModeInfo {
  code: number;
  name: ModeName;
}

export interface DeviceInfo {
  modelId: number;
  protocolVersion?: number;
  firmwareVersion?: number;
  battery?: number;
  name?: string;
  /** Web Bluetooth origin-scoped device id — stable per browser, used to attribute sessions. */
  deviceId?: string;
}

/**
 * Live brush state merged from notify characteristics during an active connection.
 * Any field may be undefined if its characteristic is absent on this model.
 */
export interface LiveState {
  device?: DeviceStateInfo;
  /** Elapsed seconds this session. */
  time?: number;
  mode?: ModeInfo;
  /** Current sector/quadrant index. */
  sector?: number;
  pressure?: PressureInfo;
  button?: ButtonInfo;
  battery?: number;
  smiley?: number;
  /** Wall-clock ms of the last update (client side). */
  updatedAt: number;
}

/** One characteristic found during a GATT discovery walk. */
export interface DiscoveredCharacteristic {
  uuid: string;
  /** e.g. ['read','notify']. */
  properties: string[];
  /** Hex of the read value, if the characteristic was readable. */
  valueHex?: string;
  /** Error message if a read was attempted and failed. */
  readError?: string;
}

/** One service (and its characteristics) found during discovery. */
export interface DiscoveredService {
  uuid: string;
  /** True if this matches a UUID we already understand. */
  known: boolean;
  characteristics: DiscoveredCharacteristic[];
}

/** A raw notification frame, surfaced for reverse-engineering. */
export interface RawFrame {
  uuid: string;
  hex: string;
  at: number;
}

export type ModeName =
  | 'off'
  | 'daily-clean'
  | 'sensitive'
  | 'massage'
  | 'whitening'
  | 'deep-clean'
  | 'tongue-cleaning'
  | 'turbo'
  // iO-specific modes:
  | 'intense'
  | 'super-sensitive'
  | 'smart-adapt'
  | 'gentle-white'
  | 'settings'
  | 'unknown';
