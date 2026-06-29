import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        swDest: 'dist/sw.js',
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      devOptions: {
        enabled: false,
      },
      manifest: {
        id: '/',
        name: 'Shuttley',
        short_name: 'Shuttley',
        description: 'Track badminton matches, manage your club, communicate with teammates and quantify your game.',
        theme_color: '#256575',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'portrait',
        scope: '/',
        start_url: '/?source=pwa',
        lang: 'en',
        dir: 'ltr',
        categories: ['sports', 'utilities'],
        prefer_related_applications: false,
        iarc_rating_id: 'e84b072d-71b3-4d3e-86ae-31a8ce4e53b7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'Record Match',
            short_name: 'Record',
            description: 'Record a new match',
            url: '/?shortcut=record',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Club Chat',
            short_name: 'Chat',
            description: 'Open club chat',
            url: '/?shortcut=chat',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }]
          }
        ],
        screenshots: [
          {
            src: 'screenshot-mobile.png',
            sizes: '390x844',
            type: 'image/jpeg',
            form_factor: 'narrow',
            label: 'Shuttley dashboard on mobile'
          },
          {
            src: 'screenshot-desktop.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Shuttley on desktop'
          }
        ]
      }
    })
  ]
})
