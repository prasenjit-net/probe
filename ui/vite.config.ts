import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward all /api calls to the Rust backend during development.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules/')) return

          // Markdown renderer + its large dependency tree — lazy-loaded only by ReportDetail
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/remark') ||
            id.includes('node_modules/rehype') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/hast') ||
            id.includes('node_modules/vfile') ||
            id.includes('node_modules/bail') ||
            id.includes('node_modules/trough') ||
            id.includes('node_modules/extend') ||
            id.includes('node_modules/decode-named-character-reference') ||
            id.includes('node_modules/character-entities')
          ) {
            return 'vendor-markdown'
          }

          // Icons + small utilities — consolidate dozens of tiny lucide icon files
          if (
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/uuid') ||
            id.includes('node_modules/axios')
          ) {
            return 'vendor-ui'
          }

          // Everything else (react, react-dom, react-router, scheduler, etc.)
          // kept in one chunk to avoid circular inter-package dependencies
          return 'vendor'
        },
      },
    },
  },
})
