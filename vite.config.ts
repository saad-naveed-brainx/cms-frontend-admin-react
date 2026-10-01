import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // PORT lets a devflow slot (or the browser tests) run on its own port. Default stays 5173.
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
