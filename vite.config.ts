/// <reference types="vitest" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// En production, l'app est servie par GitHub Pages sous /portefeuille-global/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/portefeuille-global/' : '/',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Portefeuille Global',
        short_name: 'Portefeuille',
        description: 'Gestion du Portefeuille Global selon le guide de gestion',
        lang: 'fr',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#1f4e79',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone.svg', sizes: 'any', type: 'image/svg+xml' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,json}'] }
    })
  ],
  test: { include: ['tests/**/*.test.ts'] }
}));
