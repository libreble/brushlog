# Brushlog

**Open the app: <https://libreble.github.io/brushlog/>** — installable, works offline. Needs Chrome on
Android or Chrome/Edge on desktop (Web Bluetooth). No account, no cloud.

Part of [libreble](https://libreble.github.io) — your devices, without their vendors.

A **self-owned, offline-first PWA** that tracks your brushing sessions and dental health by
talking to your Oral-B toothbrush directly over Bluetooth — **no Oral-B account, no cloud**.
Everything is stored locally in your browser (IndexedDB) and never leaves your device.

- **Live view** while you brush: timer, mode, sector, pressure, battery.
- **History import** from the brush's on-device session log.
- **Health metrics**: streaks, 2-minute-goal adherence, brushes/day, pressure habits, trends.
- **Installable + offline** via a service worker (add to home screen).

## How it works

Brushlog uses the [Web Bluetooth API](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API)
to connect to the brush's GATT services and read live state + stored sessions. The BLE protocol
is documented in [`docs/PROTOCOL.md`](docs/PROTOCOL.md), and the framework-agnostic reference
implementation is in [`src/protocol/`](src/protocol/) (reusable in any project).

```
src/
  protocol/     ← framework-agnostic BLE layer (constants, pure codecs, Web Bluetooth client)
  lib/          ← IndexedDB persistence, health metrics, formatting, sample data
  hooks/        ← React hooks (connection lifecycle, session store)
  components/   ← dashboard UI
docs/PROTOCOL.md ← the Oral-B BLE protocol, for other implementers
```

## Develop

```bash
npm install
npm run dev        # http://localhost:5173  (localhost is a secure context → Web Bluetooth works)
```

No brush handy? Click **Load sample data** to explore the dashboard with generated sessions.

```bash
npm run build      # production build + service worker (dist/)
npm run preview     # serve the built app
npm run typecheck   # tsc, no emit
```

## Browser support

Web Bluetooth works in **Chrome/Edge on desktop and Android**. **iOS Safari is not supported**
— on iPhone/iPad use a Web Bluetooth-capable browser (e.g. Bluefy) or a native wrapper.

## Compatibility

Confirmed on hardware with an Oral-B **iO** (protocol V007): live data, on-device history sync,
brush-head wear. Older **Genius / SmartSeries / Smart** lines are covered from public prior art
but not tested here. The client feature-detects every characteristic, so an unknown model
connects and exposes whatever it supports — the in-app Diagnostics panel shows what that is.

## Privacy

No network calls, no analytics, no accounts. Your data lives in this browser only; export it to
JSON or delete all of it anytime from the **Your data** panel.

---

*Unofficial and not affiliated with Oral-B / Procter & Gamble. Built from public
reverse-engineering for interoperability and personal-data ownership.*
