// Oral-B BLE client — the only module that touches Web Bluetooth.
//
// Design goals:
//  - Every characteristic is feature-detected (getCharacteristic -> null on failure) so an
//    unknown model (e.g. iO series) degrades gracefully instead of throwing on connect.
//  - Decoding lives entirely in codec.ts; this file only does transport + orchestration.
//  - Small typed event emitter ('live', 'disconnected') so the UI can subscribe without
//    coupling to Web Bluetooth internals.

import {
  SERVICE,
  CHAR,
  OPCODE,
  ACCESS_CONTROL_KEY,
  DISCOVERY_SERVICES,
  HISTORY_MAX_RECORDS,
  HISTORY_EMPTY_RUN_STOP,
  HISTORY_SLOT_RETRIES,
  HISTORY_MAX_SLOT_FAILURES,
  HISTORY_KEEPALIVE_MS,
} from './constants.ts';
import {
  decodeDeviceState,
  decodeBrushingTime,
  decodeMode,
  decodeQuadrant,
  decodePressure,
  decodeButton,
  decodeBattery,
  decodeSmiley,
  decodeDeviceType,
  decodeRtc,
  decodeHistoryRecord,
  decodeRefillReminder,
  encodeCommand,
} from './codec.ts';
import type {
  Session,
  LiveState,
  DeviceInfo,
  BrushHead,
  DiscoveredService,
  DiscoveredCharacteristic,
  RawFrame,
} from './types.ts';

type BrushEventMap = {
  live: LiveState;
  raw: RawFrame;
  disconnected: void;
};

const KNOWN_UUIDS = new Set<string>([...Object.values(SERVICE), ...Object.values(CHAR)]);

function toHex(view: DataView): string {
  return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function propList(p: BluetoothCharacteristicProperties): string[] {
  const out: string[] = [];
  if (p.read) out.push('read');
  if (p.write) out.push('write');
  if (p.writeWithoutResponse) out.push('writeWithoutResponse');
  if (p.notify) out.push('notify');
  if (p.indicate) out.push('indicate');
  if (p.authenticatedSignedWrites) out.push('authSignedWrites');
  return out;
}

type Listener<T> = (payload: T) => void;

interface LiveSubscription {
  service: string;
  uuid: string;
  apply: (view: DataView, state: LiveState) => void;
}

// Which notify characteristics feed the live view, and how each updates LiveState.
const LIVE_SUBSCRIPTIONS: LiveSubscription[] = [
  { service: SERVICE.GENERAL, uuid: CHAR.DEVICE_STATE, apply: (v, s) => { s.device = decodeDeviceState(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.BRUSHING_TIME, apply: (v, s) => { s.time = decodeBrushingTime(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.BRUSHING_MODE, apply: (v, s) => { s.mode = decodeMode(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.QUADRANT, apply: (v, s) => { s.sector = decodeQuadrant(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.PRESSURE_SENSOR, apply: (v, s) => { s.pressure = decodePressure(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.BUTTON_STATE, apply: (v, s) => { s.button = decodeButton(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.BATTERY_LEVEL, apply: (v, s) => { s.battery = decodeBattery(v); } },
  { service: SERVICE.GENERAL, uuid: CHAR.SMILEY, apply: (v, s) => { s.smiley = decodeSmiley(v); } },
];

/** The picked/remembered device doesn't speak the Oral-B protocol (e.g. some other BLE gadget). */
export class NotABrushError extends Error {
  constructor(deviceName?: string) {
    super(`${deviceName ? `"${deviceName}"` : 'That device'} doesn't look like an Oral-B brush.`);
    this.name = 'NotABrushError';
  }
}

export class OralBBrush {
  readonly device: BluetoothDevice;
  private server: BluetoothRemoteGATTServer | null = null;
  private services = new Map<string, BluetoothRemoteGATTService>();
  private characteristics = new Map<string, BluetoothRemoteGATTCharacteristic | null>();
  private listeners: { [K in keyof BrushEventMap]: Set<Listener<BrushEventMap[K]>> } = {
    live: new Set(),
    raw: new Set(),
    disconnected: new Set(),
  };
  private liveState: LiveState = { updatedAt: 0 };
  private onDisconnectBound = () => this.handleDisconnect();

  constructor(device: BluetoothDevice) {
    this.device = device;
  }

  /** True when the current browser exposes the Web Bluetooth API. */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  /** Prompt the user to pick a brush. Must be called from a user gesture. */
  static async request(): Promise<OralBBrush> {
    if (!OralBBrush.isSupported()) {
      throw new Error('Web Bluetooth is not available in this browser.');
    }
    // acceptAllDevices + optionalServices is the most robust across models, since not all
    // Oral-B brushes advertise their service UUID. Swap to `filters` for a tidier chooser.
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      // Broad allowlist so we can enumerate unknown (iO) services after connecting.
      optionalServices: DISCOVERY_SERVICES,
    });
    return new OralBBrush(device);
  }

  /**
   * Devices this origin was previously granted access to, for silent reconnect (no chooser,
   * no user gesture). Requires `navigator.bluetooth.getDevices()` (Chrome desktop/Android with
   * the persistent-permissions backend); returns [] where unsupported so callers degrade to the
   * manual chooser flow.
   */
  static async knownDevices(): Promise<BluetoothDevice[]> {
    if (!OralBBrush.isSupported() || typeof navigator.bluetooth.getDevices !== 'function') {
      return [];
    }
    try {
      return await navigator.bluetooth.getDevices();
    } catch {
      return [];
    }
  }

  /** Wrap an already-known device (e.g. from knownDevices()) for reconnection. */
  static fromDevice(device: BluetoothDevice): OralBBrush {
    return new OralBBrush(device);
  }

  /** Origin-scoped stable id for this device (for remembering which brush to reconnect to). */
  get id(): string {
    return this.device.id;
  }

  isConnected(): boolean {
    return !!this.server?.connected;
  }

  async connect(): Promise<void> {
    if (!this.device.gatt) throw new Error('Selected device has no GATT server.');
    // Idempotent: avoid stacking listeners if connect() is retried on the same instance.
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnectBound);
    this.device.addEventListener('gattserverdisconnected', this.onDisconnectBound);
    this.server = await this.device.gatt.connect();
  }

  disconnect(): void {
    this.device.gatt?.disconnect();
  }

  /**
   * Disconnect and revoke this origin's permission for the device, so getDevices() no longer
   * returns it and silent reconnect can't pick it up. Falls back to a plain disconnect where
   * forget() is unavailable (Chrome < 101).
   */
  async forget(): Promise<void> {
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnectBound);
    this.device.gatt?.disconnect();
    if (typeof this.device.forget === 'function') {
      try {
        await this.device.forget();
      } catch { /* already revoked */ }
    }
  }

  /**
   * Confirm the connected device really is an Oral-B brush: it must expose the Oral-B GENERAL
   * service and answer a DEVICE_TYPE read with a well-formed 1- or 3-byte value. Read-only, and
   * present on every generation. Throws NotABrushError otherwise.
   */
  async verify(): Promise<DeviceInfo> {
    const typeChar = await this.getCharacteristic(SERVICE.GENERAL, CHAR.DEVICE_TYPE);
    if (!typeChar) throw new NotABrushError(this.device.name);
    try {
      return decodeDeviceType(await typeChar.readValue());
    } catch {
      throw new NotABrushError(this.device.name);
    }
  }

  /** Detach device-level listeners for a brush we're abandoning (e.g. a failed reconnect). */
  dispose(): void {
    this.device.removeEventListener('gattserverdisconnected', this.onDisconnectBound);
    this.device.gatt?.disconnect();
  }

  // --- events -------------------------------------------------------------

  on<K extends keyof BrushEventMap>(event: K, cb: Listener<BrushEventMap[K]>): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit<K extends keyof BrushEventMap>(event: K, payload: BrushEventMap[K]): void {
    for (const cb of this.listeners[event]) cb(payload);
  }

  private handleDisconnect(): void {
    this.server = null;
    this.services.clear();
    this.characteristics.clear();
    this.emit('disconnected', undefined);
  }

  // --- reads --------------------------------------------------------------

  /** Read static device info (model / firmware) plus a battery snapshot. */
  async readDeviceInfo(): Promise<DeviceInfo> {
    let info: DeviceInfo = { modelId: -1 };
    const typeChar = await this.getCharacteristic(SERVICE.GENERAL, CHAR.DEVICE_TYPE);
    if (typeChar) {
      try {
        info = decodeDeviceType(await typeChar.readValue());
      } catch { /* leave defaults */ }
    }
    const batteryChar = await this.getCharacteristic(SERVICE.GENERAL, CHAR.BATTERY_LEVEL);
    if (batteryChar) {
      try {
        info.battery = decodeBattery(await batteryChar.readValue());
      } catch { /* no battery */ }
    }
    if (this.device.name) info.name = this.device.name;
    info.deviceId = this.device.id;
    return info;
  }

  /**
   * Read brush-head wear status (iO RefillReminder, ff2d). Best-effort — returns null on older
   * gen or if the read fails. Call after syncHistory so the access-control unlock is in effect.
   */
  async readBrushHead(): Promise<BrushHead | null> {
    const char = await this.getCharacteristicIn(CHAR.REFILL_REMINDER, [
      SERVICE.CONFIGURATION,
      SERVICE.GENERAL,
    ]);
    if (!char) return null;
    try {
      return decodeRefillReminder(await char.readValue());
    } catch {
      return null;
    }
  }

  /** Read the device real-time clock (primes COMMAND first). */
  async getRtc(): Promise<Date | null> {
    const rtcChar = await this.getCharacteristic(SERVICE.CONFIGURATION, CHAR.RTC);
    if (!rtcChar) return null;
    await this.writeCommand([...OPCODE.GET_RTC]);
    return decodeRtc(await rtcChar.readValue());
  }

  // --- discovery (for reverse-engineering unknown models) -----------------

  /**
   * Walk every accessible primary service and its characteristics, recording UUIDs,
   * properties, and (where readable) a hex snapshot. This is the key tool for learning
   * what an unknown iO brush actually exposes. Only services declared in DISCOVERY_SERVICES
   * are visible — anything else is hidden by Web Bluetooth.
   */
  async discover(): Promise<DiscoveredService[]> {
    if (!this.server) throw new Error('Not connected.');
    const services = await this.server.getPrimaryServices();
    const out: DiscoveredService[] = [];
    for (const service of services) {
      const chars: DiscoveredCharacteristic[] = [];
      let characteristics: BluetoothRemoteGATTCharacteristic[] = [];
      try {
        characteristics = await service.getCharacteristics();
      } catch { /* service present but characteristics unreadable */ }
      for (const c of characteristics) {
        const entry: DiscoveredCharacteristic = { uuid: c.uuid, properties: propList(c.properties) };
        if (c.properties.read) {
          try {
            entry.valueHex = toHex(await c.readValue());
          } catch (e) {
            entry.readError = e instanceof Error ? e.message : String(e);
          }
        }
        chars.push(entry);
      }
      out.push({ uuid: service.uuid, known: KNOWN_UUIDS.has(service.uuid), characteristics: chars });
    }
    return out;
  }

  // --- live session -------------------------------------------------------

  /** Subscribe to all available live characteristics. Emits 'live' on every update. */
  async startLive(): Promise<void> {
    for (const sub of LIVE_SUBSCRIPTIONS) {
      const char = await this.getCharacteristic(sub.service, sub.uuid);
      if (!char) continue;
      try {
        // Seed the current value so the UI isn't blank until the first notification.
        try { sub.apply(await char.readValue(), this.liveState); } catch { /* not readable */ }
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          // Surface the raw frame first — useful even if decoding fails on an unknown model.
          this.emit('raw', { uuid: sub.uuid, hex: toHex(value), at: Date.now() });
          try {
            sub.apply(value, this.liveState);
            this.liveState.updatedAt = Date.now();
            this.emit('live', { ...this.liveState });
          } catch { /* ignore a single malformed frame */ }
        });
      } catch { /* characteristic present but unusable — skip it */ }
    }
    this.liveState.updatedAt = Date.now();
    this.emit('live', { ...this.liveState });
  }

  getLiveState(): LiveState {
    return { ...this.liveState };
  }

  // --- history ------------------------------------------------------------

  /**
   * Read stored brushing sessions.
   *
   * We first write the iO AccessControl unlock ("MGS"), best-effort — the vendor app does
   * this at connect for V007; whether firmware requires it before DATA reads is unconfirmed,
   * but it's harmless (no-op on older gen). Then for each slot we prime COMMAND with
   * [GET_DATA, i] and read DATA, which dispatches on length (16 B older gen, 21 B iO). We scan
   * numerically and stop at the first empty slot: a partially-filled ring has its empties
   * contiguously at the end, and a fully wrapped ring has none — either way numeric order
   * retrieves every stored record, which we then de-dup by sessionId and sort newest-first.
   * Reads are non-destructive (no erase is ever issued during sync), so re-syncing is safe.
   *
   * @param onProgress called after each slot with the running count of sessions found, so the
   *   UI can show a live "reading… N sessions" indicator during the ~250-slot sweep.
   * @param opts.sinceTimestamp incremental sync: stop once a record older than this is reached.
   *   Records come newest-first, so this reads only sessions newer than what we already have.
   */
  async syncHistory(
    onProgress?: (recordsFound: number) => void,
    opts?: { sinceTimestamp?: number },
  ): Promise<Session[]> {
    await this.unlockHistory();

    // DATA lives under CONFIGURATION on older gen, but under GENERAL on iO — search both.
    const dataChar = await this.getCharacteristicIn(CHAR.DATA, [SERVICE.CONFIGURATION, SERVICE.GENERAL]);
    if (!dataChar) {
      throw new Error('This brush does not expose a history characteristic.');
    }

    const sessions: Session[] = [];
    const seen = new Set<number>();
    let emptyRun = 0;
    let failures = 0;
    let consecutiveFailures = 0;
    let lastSlot = -1;
    await this.keepAlive(); // keep an idle brush awake from the very first read
    let lastKeepAlive = Date.now();
    for (let i = 0; i < HISTORY_MAX_RECORDS; i++) {
      if (Date.now() - lastKeepAlive > HISTORY_KEEPALIVE_MS) {
        await this.keepAlive();
        lastKeepAlive = Date.now();
      }
      let session: Session | null;
      try {
        session = await this.readHistorySlot(dataChar, i);
      } catch (e) {
        // A transient "GATT operation failed" would otherwise truncate the whole history. The
        // slot was already retried; skip it and keep the tail rather than losing it — unless
        // nothing has synced yet (surface the error) or the link looks dead (many in a row).
        failures++;
        consecutiveFailures++;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[brushlog] history slot #${i} failed after retries (${failures} total): ${msg}`);
        if (sessions.length === 0) throw e;
        if (consecutiveFailures >= HISTORY_MAX_SLOT_FAILURES) break;
        continue;
      }
      consecutiveFailures = 0;
      if (!session) {
        // End the sweep only after a solid run of empties (see HISTORY_EMPTY_RUN_STOP).
        if (++emptyRun >= HISTORY_EMPTY_RUN_STOP) break;
        continue;
      }
      // Incremental: records are newest-first, so once we reach one at/older than our newest
      // stored session, everything below is already synced — stop early. (Uses timestamp, which
      // is monotonic and survives a sessionId renumber after an erase; the boundary session is
      // re-read so an in-progress session gets refreshed.)
      if (opts?.sinceTimestamp !== undefined && session.timestamp < opts.sinceTimestamp) break;
      emptyRun = 0;
      lastSlot = i;
      const key = session.sessionID ?? session.timestamp;
      if (!seen.has(key)) {
        seen.add(key);
        sessions.push(session);
        onProgress?.(sessions.length);
      }
    }
    console.info(
      `[brushlog] syncHistory: ${sessions.length} records; last non-empty slot #${lastSlot}` +
        (failures ? `; ${failures} slot read(s) failed` : ''),
    );
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions;
  }

  /** Tell an idle brush to stay connected (~30s) so it doesn't power down mid-sweep. */
  private async keepAlive(): Promise<void> {
    try {
      await this.writeCommand([...OPCODE.EXTEND_CONNECTION]);
    } catch {
      /* best effort — absent/unsupported on older gen */
    }
  }

  /** Prime COMMAND + read one history slot, retrying transient GATT read failures. */
  private async readHistorySlot(
    dataChar: BluetoothRemoteGATTCharacteristic,
    i: number,
  ): Promise<Session | null> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < HISTORY_SLOT_RETRIES; attempt++) {
      try {
        await this.writeCommand([OPCODE.GET_DATA, i]);
        const view = await dataChar.readValue();
        if (i === 0 && attempt === 0) {
          // Diagnostics: a 21-byte all-zero frame here means the iO unlock didn't take.
          console.info(`[brushlog] history slot 0: ${view.byteLength}B ${toHex(view)}`);
        }
        return decodeHistoryRecord(view);
      } catch (e) {
        lastErr = e;
        if (attempt < HISTORY_SLOT_RETRIES - 1) await delay(80 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  /**
   * iO unlock: write the AccessControl UNLOCK_CODE ("MGS") to ff10, mirroring the official
   * app's connect-time behavior for V007. Best-effort — older gen has no such characteristic,
   * and firmware gating of DATA reads on this write is unconfirmed (see ACCESS_CONTROL_KEY).
   */
  private async unlockHistory(): Promise<void> {
    const ac = await this.getCharacteristic(SERVICE.GENERAL, CHAR.ACCESS_CONTROL);
    if (!ac) return;
    try {
      const payload = encodeCommand([...ACCESS_CONTROL_KEY]);
      if ('writeValueWithResponse' in ac) {
        await ac.writeValueWithResponse(payload);
      } else {
        await (ac as BluetoothRemoteGATTCharacteristic).writeValue(payload);
      }
    } catch {
      /* best effort: absent or write-protected on this model */
    }
  }

  // --- internals ----------------------------------------------------------

  private async writeCommand(bytes: number[]): Promise<void> {
    const commandChar = await this.getCharacteristic(SERVICE.CONFIGURATION, CHAR.COMMAND);
    if (!commandChar) throw new Error('This brush does not expose the command characteristic.');
    const payload = encodeCommand(bytes);
    if ('writeValueWithResponse' in commandChar) {
      await commandChar.writeValueWithResponse(payload);
    } else {
      await (commandChar as BluetoothRemoteGATTCharacteristic).writeValue(payload);
    }
  }

  private async getService(uuid: string): Promise<BluetoothRemoteGATTService | null> {
    if (this.services.has(uuid)) return this.services.get(uuid)!;
    if (!this.server) throw new Error('Not connected.');
    try {
      const service = await this.server.getPrimaryService(uuid);
      this.services.set(uuid, service);
      return service;
    } catch {
      return null;
    }
  }

  /** Find a characteristic that may live under any of several services (model-dependent). */
  private async getCharacteristicIn(
    charUuid: string,
    serviceUuids: string[],
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    for (const serviceUuid of serviceUuids) {
      const char = await this.getCharacteristic(serviceUuid, charUuid);
      if (char) return char;
    }
    return null;
  }

  private async getCharacteristic(
    serviceUuid: string,
    charUuid: string,
  ): Promise<BluetoothRemoteGATTCharacteristic | null> {
    const cacheKey = `${serviceUuid}|${charUuid}`;
    if (this.characteristics.has(cacheKey)) return this.characteristics.get(cacheKey)!;
    const service = await this.getService(serviceUuid);
    let result: BluetoothRemoteGATTCharacteristic | null = null;
    if (service) {
      try {
        result = await service.getCharacteristic(charUuid);
      } catch {
        result = null;
      }
    }
    this.characteristics.set(cacheKey, result);
    return result;
  }
}
