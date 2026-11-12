/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

// Le sous-chemin correspond au nom du dépôt GitHub (GitHub Pages).
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    // onnxruntime-web sans WASM embarqué : le binaire est auto-hébergé (public/vendor) et servi
    // depuis la Cache API, au lieu d'être dupliqué dans les assets du build.
    conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
