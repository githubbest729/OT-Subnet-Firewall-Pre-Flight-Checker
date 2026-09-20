import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`                 -> installable PWA with a Service Worker (deploy this)
// `vite build --mode preview`  -> one self-contained HTML file, no Service Worker
export default defineConfig(({ mode }) => {
  const preview = mode === 'preview';
  return {
    build: preview ? { outDir: 'dist-preview' } : undefined,
    plugins: [
      react(),
      tailwindcss(),
      preview
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
            manifest: {
              name: 'OT Subnet and Firewall Pre-Flight Checker',
              short_name: 'OT Pre-Flight',
              description: 'Offline subnet, port and IEC 62443 zone checks before connecting cables.',
              theme_color: '#14181c',
              background_color: '#dde2e6',
              display: 'standalone',
              orientation: 'any',
              start_url: '/',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
              navigateFallback: '/index.html',
              cleanupOutdatedCaches: true,
            },
          }),
    ],
  };
});
