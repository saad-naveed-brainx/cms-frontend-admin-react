import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Tailwind is only for the live preview's frame (src/preview/preview.css); the admin's own screens use
  // plain CSS. `@/` is where the copied website blocks live, so their imports work unchanged (D-030).
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/site-blocks', import.meta.url)) },
  },
  // PORT lets a devflow slot (or the browser tests) run on its own port. Default stays 5173.
  server: {
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
})
