import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Note: unlike the standalone Lidl web demo, this template does NOT depend on
// @braze/web-sdk — all Braze access goes through the native iOS SDK via the
// bridge (src/braze/bridge.ts). That also removes the esbuild "Class extends
// value undefined" pre-bundling gotcha the Web SDK caused.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
})
