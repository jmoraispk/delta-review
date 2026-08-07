import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist-extension/build',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      input: { hub: resolve(__dirname, 'hub.html') },
    },
  },
})
