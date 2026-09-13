# Oral-B Toothbrush BLE Protocol

A practical, implementer-oriented description of how Oral-B electric toothbrushes expose
brushing data over Bluetooth Low Energy. Written to be enough to build your own client
without any Oral-B account or cloud service.

> **Status / scope.** The **iO** series (protocol V007) is confirmed on hardware, including a
> full stored-history sync (§8). Older generations — **Genius**, **SmartSeries**, **Smart** —
> are covered from public prior art. Everything here is from observed traffic and published
> community work; treat it as a field guide, not a vendor spec. Corrections welcome.

This repo's reference implementation lives in [`../src/protocol/`](../src/protocol/):
`constants.ts` (UUIDs/enums/opcodes), `codec.ts` (pure decoders), `oralb.ts` (Web Bluetooth client).

---

## 1. Two data surfaces

Oral-B brushes surface state two independent ways. Pick based on what you're building.

| | **A. Advertisement (passive)** | **B. GATT (active connection)** |
|---|---|---|
| Connection | None — just scan | Connect + subscribe |
| Data | Live state only, ~1 Hz while brushing | Live state **and** stored history |
| Used by | Home Assistant (`oralb-ble`) | Vendor app, `web-toothbrush`, this repo |
| Web Bluetooth | `watchAdvertisements()` (flaky/flagged) | Fully supported |
| History access | No | **Yes** (the DATA characteristic) |

If you want brushing **history / dental-health tracking**, you need surface **B**.

### 1A. Advertisement format (for reference)

Manufacturer-specific data, **company ID `0x00DC`** (Procter & Gamble). 9 or 11 bytes:

| Byte | Meaning |
|---|---|
| 0 | Protocol version |
| 1 | Model type |
| 3 | State (see `DEVICE_STATE`; `3` = running) |
| 4 | Pressure |
| 5 / 6 | Minutes / seconds elapsed |
| 7 | Mode |
| 8 | Sector |
| 9 | Sector timer *(11-byte only)* |
| 10 | Number of sectors *(11-byte only)* |

---

## 2. GATT overview (surface B)

All UUIDs share the base `a0f0ffXX-5047-4d53-8208-4f72616c2d42`, where the ASCII of the
suffix decodes as `PG` (`5047`) and `Oral-B` (`4f72616c2d42`) — a handy authenticity check.

Two primary services:

- **General** `a0f0ff00-…` — live session state, mostly `notify` + `read`.
- **Configuration** `a0f0ff20-…` — command-driven `read`/`write`, including history.

### 2.1 General service — `a0f0ff00-…`

| UUID suffix | Name | Access | Payload |
|---|---|---|---|
| `ff01` | Handle ID | read | opaque |
| `ff02` | Device type | read | 1 or 3 bytes: `modelId[, protocolVersion, firmwareVersion]` |
| `ff03` | User account ID | read | opaque |
| `ff04` | Device state | notify/read | 2 bytes: `state`, `flags` (see below) |
| `ff05` | Battery level | notify/read | 1 byte, percent 0–100 |
| `ff06` | Button state | notify/read | 2 or 4 bytes: `[power, mode]` (1 = pressed) |
| `ff07` | Brushing mode | notify/read | 1 byte enum |
| `ff08` | Brushing time | notify/read | 2 bytes: `minutes`, `seconds` → `min*60+sec` |
| `ff09` | Quadrant / sector | notify/read | 1 byte index |
| `ff0a` | Smiley | notify/read | 1 byte feedback score |
| `ff0b` | Pressure sensor | notify/read | 1 byte flags (see below) |
| `ff0c` | Cache | — | opaque |
| `ff0d` | Sensor data | — | opaque |

**Device state flags (`ff04` byte 1):** bit0 = transport mode, bit1 = deactivate timer.
**Pressure sensor (`ff0b`):** bit `0x80` = high pressure, bit `0x40` = motor speed reduced.

### 2.2 Configuration service — `a0f0ff20-…`

| UUID suffix | Name | Access | Notes |
|---|---|---|---|
| `ff21` | **Command** | write | 2-byte opcode that primes/triggers other reads/writes |
| `ff22` | RTC | read/write | 4-byte LE uint32 device time; prime with `GET_RTC` first |
| `ff23` | Timezone | read/write | |
| `ff24` | Brushing timer | read/write | timer/vibration config |
| `ff25` | Brushing modes | read/write | up to 8-byte mode list; prime write with `SET_MODES` |
| `ff26` | Quadrant times | read/write | |
| `ff27` | Tongue time | read/write | |
| `ff28` | Pressure config | read/write | |
| `ff29` | **Data** | read | brushing **history**, one 16-byte record per `GET_DATA` index |
| `ff2a` | Flight mode | read/write | |
| `ff2b` | Color | read/write | LED ring `{r,g,b,id}` |

---

## 3. The command pattern

Several reads/writes are two-step: **write a 2-byte opcode to `Command` (`ff21`)**, then
read/write the target characteristic. Known opcodes:

| Opcode | Bytes | Purpose |
|---|---|---|
| `PING` | `0A 00` | keep-alive |
| `GET_RTC` | `01 00` | prime before reading `RTC` |
| `SET_RTC` | `37 26` | prime before writing `RTC` |
| `GET_DATA` | `02 <index>` | select history record `<index>` before reading `Data` |
| `SET_MODES` | `37 29` | prime before writing `Brushing modes` |

Use *write-with-response* on `Command` when available for reliable ordering.

---

## 4. Time encoding

Device timestamps are **`uint32` seconds since `2000-01-01T00:00:00Z`** (epoch =
`946684800000` ms). Convert:

```
date_ms = 946684800000 + device_seconds * 1000
```

Applies to `RTC` and to the session `timestamp` field below.

---

## 5. History records (the important part)

Read sessions by looping the index from `0` upward:

```
for index in 0..29:
    write Command  = [0x02, index]      # GET_DATA
    record         = read Data          # 16 bytes, little-endian
    if record.timestamp == 0: stop      # empty slot → no more records
```

The device retains up to ~30 recent sessions. Each 16-byte record (all little-endian):

| Bytes | Field | Meaning |
|---|---|---|
| 0–3 | `timestamp` | uint32 device time; `0` ⇒ empty slot |
| 4–5 | `duration` | uint16 seconds |
| 6 | `eventCount` | uint8 |
| 7 | `mode` | uint8 brushing-mode enum |
| 8–9 | `timeUnderPressure` | uint16 seconds |
| 10 | `pressureWarnings` | uint8 count |
| 11 | `finalBatteryState` | uint8 percent |
| 12–15 | *overloaded* | see below |

**Bytes 12–15 are overloaded.** Read as `uint32 lastSegment`:

- If `lastSegment > 0x01000000`, it's a **last-full-charge** timestamp (same epoch).
- Otherwise it packs session metadata across two `uint16`s `a = [12..13]`, `b = [14..15]`:
  - `totalTargetTime = a & 0x1FFF` (seconds)
  - `sector          = a >> 13` (0–7)
  - `sessionID       = b & 0x1FFF`
  - `userID          = b >> 13`

See [`codec.ts › decodeSession`](../src/protocol/codec.ts) for the exact implementation.

---

## 6. Enums

### Device state (`ff04` byte 0)

`0x00` unknown · `0x01` initializing · `0x02` idle · `0x03` running · `0x04` charging ·
`0x05` setup · `0x06` flight-menu · `0x07` change-forbidden · `0x08` pre-run ·
`0x71` final-test · `0x72` pcb-test · `0x73` sleep · `0x74` transport · `0x75` calibration-test

### Brushing mode — Smart / Genius / SmartSeries (`ff07`, and 16-byte record byte 7)

`0x00` off · `0x01` daily-clean · `0x02` sensitive · `0x03` massage (gum care) ·
`0x04` whitening · `0x05` deep-clean · `0x06` tongue-cleaning · `0x07` turbo · `0xFF` unknown

### Brushing mode — iO (21-byte record byte `[19]`)

Different table from older gen (note `0x00` is **daily-clean** here, not "off"). Confirmed
against captured sessions; `BRUSHING_MODE_IO` in `constants.ts`:

`0x00` daily-clean · `0x01` sensitive · `0x02` massage (gum care) · `0x03` whitening ·
`0x04` intense · `0x05` super-sensitive · `0x06` tongue-cleaning · `0x07` off ·
`0x08` settings · `0x0b` smart-adapt · `0x0c` gentle-white

---

## 7. Client / Web Bluetooth notes

- **Request:** `navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices:
  [general, configuration] })`. `acceptAllDevices` is the most robust across models since not
  all brushes advertise their service UUID; switch to `filters` for a tidier chooser.
- **Feature-detect everything.** `getPrimaryService` / `getCharacteristic` can reject on a
  given model — catch and treat as "absent" rather than failing the whole connection. This is
  what makes the same client work on an unknown iO brush (it just exposes fewer features).
- **Notifications:** `startNotifications()` then listen for `characteristicvaluechanged`;
  `event.target.value` is a `DataView`.
- **Secure context + gesture:** Web Bluetooth requires HTTPS or `http://localhost`, and the
  `requestDevice` call must originate from a user gesture (a click).
- **Platform reality:** Chrome/Edge on desktop and Android are supported. **iOS Safari has no
  Web Bluetooth** — an installed PWA can't reach the brush there (workarounds: Bluefy/WebBLE
  browsers, or a native wrapper).

---

## 8. iO series — observed (model 52, protocol 7, fw 30)

Captured live from an iO brush (advertised name `GXxxxxxx`, `DEVICE_TYPE` = `34 07 1e`).
The iO reuses the same `a0f0ff` service/UUID family but differs in several ways.

The history format and sync sequence below were validated byte-for-byte against a capture
of a real 250-record sync between the vendor app and an iO brush.

### Confirmed identical

- **RTC** (`ff22`), same LE-uint32 seconds-since-2000 epoch (`39 7a dc 31` → mid-2026).
- **Device type** (`ff02`): `[modelId, protocolVersion, firmwareVersion]`.
- **Device state** (`ff04`): 2 bytes; adds `0x09` (observed at session end — "off"/finished).
- **Brushing time** (`ff08`): `min, sec` → seconds. **Button** (`ff06`): 4 bytes, `[power, mode]`.

### Different on iO

| Char | Older gen | iO |
|---|---|---|
| `ff29` DATA (history) | under **Configuration** `ff20`, 16-byte | under **General** `ff00`, read-only, **21-byte** record (decoded below), gated by `ff10` |
| `ff21` COMMAND | under Configuration | still under **Configuration** `ff20` (so history is a cross-service read: prime `ff21`, read `ff29`) |
| `ff0b` Pressure | 1-byte flags | **10-byte high-rate stream** (decoded below) |
| `ff05` | 1-byte battery | 18-byte read live; labelled battery in prior art (unconfirmed vs the 18-byte frame) |
| `ff09` Quadrant | 1 byte | **3 bytes** (`00 00 04` → byte0 sector, byte2 sector count) |

### New characteristics (iO)

- `ff10` **AccessControl** [read/write] — payload ASCII `"MGS"` (`4d 47 53`), V007+.
  A fixed unauthenticated string (enable toggle, not real security). The vendor app writes it
  at connect; whether firmware gates `ff29` on it is unconfirmed (see §8 history flow).
- `ff0e` **[indicate]** — live **coverage** stream (`2 + n*8` bytes; each 8-byte record =
  uint16 + 6 bytes per mouth zone, in a 6-zone or 16-zone dentition layout). A dashboard
  snapshot is also readable via `ff29` after priming `ff21` with `0x30`. This is the data
  source for a coverage-map feature; exact zone-id byte offsets not yet fully traced.
- `ff2d` **RefillReminder** (brush-head wear), 9 bytes LE (V007) — `[0]` state (0=On, 1=Reset,
  2=Snooze, 0xFE=Interval, 0xFF=Off, else Stage), `[1:2]` **daysLeft**, `[3:4]` brushingSecondsLeft,
  `[5:6]` daysSinceReminder, `[7:8]` secondsSinceReminder. Resolves the old "`5a`=90" guess:
  `0x5a`=90 = daysLeft on a fresh head (not battery). The countdown is **device-tracked**
  (handle decrements it), so the app reads it rather than computing wear itself.
- `ff25` Brushing modes slots observed as `00 01 05 03 07 07 07 07` (the iO mode config).
- `ff26` **QUADRANT_TIMERS** (per-sector timing config).

**Note on brush-head identity:** the iO does **not** expose brush-head type/serial/swap over BLE.
Head *type* is a user-picked catalog entry in the vendor app, and replacement is a manual reset
of the `ff2d` counter. The device only identifies the **handle** model, not the head.

### `ff0b` pressure stream (decoded)

10-byte notification, emitted at high rate while running:

```
 01 80 52 87 03  58 52 87 03  37
[0] [1..2] [3..4] [5..6][7..8] [9]
zone counter value  prev(counter,value) marker(0x37)
```

- byte 0 = **zone**: `01` = pressure OK, `02` = too hard.
- bytes 3–4 = **continuous force** (uint16 LE); observed ramp `~900 → ~7000` with zone
  flipping to `02` around ~2500. bytes 5–8 repeat the previous sample (sliding pair).

Implemented in [`codec.ts › decodePressure`](../src/protocol/codec.ts).

### History on iO — DECODED ✅

The iO stores sessions in a **ring buffer of ~250 slots** (session IDs contiguous, so exactly
the most recent ~250 sessions — older ones are overwritten, not retrievable). Reading it:

1. **Unlock (best-effort)** — write the AccessControl string `"MGS"` (`4d 47 53`) to
   `ff10`. ⚠️ *Unconfirmed whether firmware requires this:* the vendor app writes `"MGS"` at
   connect for V007 regardless of whether it goes on to read history. Without this write
   `ff29` has been observed reading as zeros, so it is the leading suspect — but only a wire
   A/B (read `ff29` with vs. without the write) proves it. Older gen has no `ff10`.
2. **Per slot** `i` in `[0, 250)` — write `[0x02, i]` (GET_DATA) to `ff21` (COMMAND,
   Configuration service), then **read `ff29`** (DATA, General service) → one 21-byte record.
   The vendor app performs this write-then-read unconditionally for every slot.
3. Stop at the first empty slot; de-dup by `sessionId`; sort newest-first. Empty/never-written
   slots read as all-zero or all-`0x44`.

**Implementation notes (learned on hardware):**
- **Idle-disconnect** — a resting iO powers down and drops BLE mid-sweep, truncating the sync.
  Send `EXTEND_CONNECTION` (`[0x31, 0x1e]`) at sweep start and every ~15 s to keep it awake.
- **Transient reads** — a stray "GATT operation failed" or a malformed frame shouldn't abort the
  whole sync: retry each slot, and skip an isolated bad/empty slot (stop only after a run of them).
- **Incremental sync** — records are newest-first, so to read only what's new, stop once a record's
  `startTime` is older than the newest already stored. Key on **timestamp**, not `sessionId` (a
  factory reset renumbers `sessionId` from 1 — timestamp is monotonic and survives it).
- **Records-by-default** — the brush logs sessions to the ring **autonomously in firmware**; no
  "enable recording" command exists in the observed handshake. A factory-fresh brush that never
  met the vendor app still accumulates history. Absolute timestamps depend on an app first
  setting the RTC (`ff22`); before that they'd
  be manufacture-relative, but intervals/counts still leak. We never write the RTC (read-only).
- **Lifetime count** — `sessionId` increments per brush, so the newest ≈ total brushes ever (more
  than the ~250 kept in detail).

The full vendor-app handshake also writes the clock to `ff22` and the mode table to `ff25`,
and does `0x26` (RTC) / `0x05,xx` (config) reads — but those run for older protocols too, so
they're **not** V007-specific and not required for a read-only sweep. After the loop it writes
`[0x03,0x00]` (`NOTIFICATION_CLEAR`, an ack/reset) and periodic `[0x31,0x1e]`
(`EXTEND_CONNECTION` = keep-alive, "stay connected 30 s"). **No erase is issued during sync**
— reads are non-destructive by design; the ring overwrites circularly. The only wipe,
`ERASE_SESSION_DATA`, exists solely as `DEBUG_COMMAND` wire `[0xf0, 0x06]`, referenced by no
sync/connect path. ⚠️ Never write it.

**21-byte record (V007), little-endian** — validated against 250 real records. Implemented in [`codec.ts › decodeSessionIO`](../src/protocol/codec.ts):

| Bytes | Field | Notes |
|---|---|---|
| `[0:4]` | `startTime` | u32 seconds since 2000-01-01Z |
| `[4:6]` | `sessionId` (low 13b) + `userId` (top 3b) | mask `& 0x1fff`; id `0` ⇒ empty slot |
| `[6:8]` | `configuredBrushingTime` s (low 13b) + `numberOfSectors` (top 3b) | e.g. `0x8078` → 120 s + 4 |
| `[8:10]` | `duration` | seconds |
| `[10:12]` | `highPressureTime` | units of 100 ms |
| `[12:14]` | `lowPressureTime` | units of 100 ms |
| `[14]` | `averagePressure` | units of 100 mN (`/10` → N) |
| `[15]` | `maximumPressure` | units of 100 mN; always ≥ `[14]` |
| `[16]` | `highPressureEventCount` | |
| `[17]` | `lowPressureEventCount` | |
| `[18]` | `onEventCount` | motor on/off events |
| `[19]` | `brushingMode` | **iO** table (§6); `0` = Daily Clean |
| `[20]` | `finalBatteryLevel` | percent 0–100 |

There is **no guided/offline flag in the record** — "guided" vs "offline" is an app-layer label
based on whether the record came from a live stream or from this ring-buffer sync. Records
synced this way are inherently the "offline" sessions; de-dup against any live-recorded ones by
`sessionId`.

The live recorder (`src/hooks/useLiveRecorder.ts`) remains for capturing rich per-tick data
while brushing with the app open, but passive ring-buffer sync is now the primary path.

## 9. Sources

- `Bluetooth-Devices/oralb-ble` — advertisement parser (Home Assistant).
- `fstanis/web-toothbrush` — Web Bluetooth GATT client; primary source for the UUID map,
  encodings, command opcodes, and the history record layout.
- Ruben Faelens, "Connecting to my toothbrush" — handle-level teardown of the SmartSeries
  history download (`Command`/`Data` seen as raw GATT handles `0x004e` / `0x0067`).
- Home Assistant Oral-B integration docs.
