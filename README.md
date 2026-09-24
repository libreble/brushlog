# Brushlog

**Open the app: <https://libreble.github.io/brushlog/>** — installable, works offline. Needs Chrome on
Android or Chrome/Edge on desktop (Web Bluetooth). No account, no cloud.

Part of [libreble](https://libreble.github.io) — your devices, set free.

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

## Self-host

The hosted app above is the easiest way. If you'd rather run your own copy, it's a static site —
nothing to configure, no backend, no database.

**Docker** — a prebuilt image (linux/amd64 + arm64) is published to the GitHub Container Registry:

```bash
docker run -d --name brushlog -p 8080:8080 --restart unless-stopped ghcr.io/libreble/brushlog
# → http://localhost:8080/
```

```yaml
# compose.yaml
services:
  brushlog:
    image: ghcr.io/libreble/brushlog:latest
    ports: ["8080:8080"]
    restart: unless-stopped
```

The image serves the app at `/`. To serve it under a subpath behind your own proxy, build it
yourself: `docker build --build-arg BASE_PATH=/brushlog/ -t brushlog .`

**Build and host it yourself** — any static web server works:

```bash
npm ci
BASE_PATH=/ npm run build      # → dist/
# upload dist/ to nginx, Caddy, Netlify, Cloudflare Pages, a bucket, …
```

Set `BASE_PATH` to the path you serve from (it defaults to `/brushlog/`, the GitHub Pages path).
Two things your server should do: send unknown paths to `index.html` (client-side routes), and
serve `index.html` and `sw.js` with `Cache-Control: no-cache` so updates reach installed copies.
[`docker/nginx.conf.template`](docker/nginx.conf.template) is a working nginx example.

> **HTTPS is required.** Web Bluetooth only works in a secure context. `http://localhost` counts,
> so the app works on the machine running it — but `http://192.168.x.x:8080` from your phone
> will load and then refuse to connect. For phones, put it behind TLS: a reverse proxy with a
> real certificate (Caddy does this automatically for a domain), or `tailscale serve`.

Self-hosted copies keep their `<link rel="canonical">` pointing at libreble.github.io, so
search engines don't treat them as duplicates.

## Browser support

Web Bluetooth works in **Chrome/Edge on desktop and Android**. **iOS Safari is not supported**
— on iPhone/iPad use a Web Bluetooth-capable browser (e.g. Bluefy) or a native wrapper.

## Compatibility

Confirmed on hardware with an Oral-B **iO** (protocol V007): live data, on-device history sync,
brush-head wear. Older **Genius / SmartSeries / Smart** lines are covered from public prior art
but not tested here. The client feature-detects every characteristic, so an unknown model
connects and exposes whatever it supports — the in-app Diagnostics panel shows what that is.

Have a brush other than an iO? When it connects, Brushlog asks how it went and opens a
pre-filled [device report](https://github.com/libreble/brushlog/issues/new?template=device-report.yml)
— model identifiers and Bluetooth layout, no brushing data. If your brush isn't in the list or
won't connect, dismissing the chooser offers a
[connection-problem report](https://github.com/libreble/brushlog/issues/new?template=connection-problem.yml).
Nothing is sent from the app; you review and submit the issue on GitHub.

## Privacy

No network calls, no analytics, no accounts. Your data lives in this browser only; export it to
JSON or delete all of it anytime from the **Your data** panel.

## Support

The app is free and stays that way. If you'd like to support the work anyway: a coffee on
[Ko-fi](https://ko-fi.com/mannes), or — honestly more useful — hardware. A device on the desk is
how it gets an app; if you have one you'd like liberated, say so in a
[device request](https://github.com/libreble/libreble.github.io/issues/new?template=device-request.yml).

---

*Unofficial and not affiliated with Oral-B / Procter & Gamble. Built from public
reverse-engineering for interoperability and personal-data ownership.*
