import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Brushlog is a fully local PWA: no backend, no analytics, no cloud.
// The service worker precaches the app shell so it runs offline once installed.

// Served from the /brushlog/ subpath on GitHub Pages (https://libreble.github.io/brushlog/).
// Self-hosters override it: `BASE_PATH=/ npm run build` (the Docker image does this).
const base = `/${(process.env.BASE_PATH ?? '/brushlog/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-maskable.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
      manifest: {
        name: 'Brushlog — Local Dental Health',
        short_name: 'Brushlog',
        description:
          'Track your brushing sessions and dental health from your Oral-B toothbrush. Everything stays on your device.',
        theme_color: '#0f766e',
        background_color: '#0b1120',
        display: 'standalone',
        orientation: 'portrait',
        id: base,
        start_url: base,
        scope: base,
        // PNG icons (raster) for launchers that don't render SVG app icons; SVG kept as scalable
        // `any`. Generated from the SVGs (see public/icon*.png). Maskable variants full-bleed the
        // teal background so Android's adaptive-icon safe-zone crops cleanly.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: {
        // Let us test install/offline behaviour during `npm run dev`.
        enabled: true,
      },
    }),
  ],
});
