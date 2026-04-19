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
        target: 'http://localhost:7654',
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
          // ── Vendor: markdown renderer (large, only used in ReportDetail) ──
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

          // ── Vendor: icons + small utilities ─────────────────────────────
          if (
            id.includes('node_modules/lucide-react') ||
            id.includes('node_modules/uuid') ||
            id.includes('node_modules/axios')
          ) {
            return 'vendor-ui'
          }

          // ── Vendor: everything else (react, react-dom, router, …) ───────
          if (id.includes('node_modules/')) {
            return 'vendor'
          }

          // ── App: heavy designer/detail pages (large, infrequently visited) ──
          if (
            id.includes('/pages/requests/RequestDesigner') ||
            id.includes('/pages/plans/TestPlanDesigner') ||
            id.includes('/pages/specs/GeneratePreview') ||
            id.includes('/pages/reports/ReportDetail')
          ) {
            return 'pages-heavy'
          }

          // ── App: all remaining pages + shared components ─────────────────
          if (id.includes('/src/')) {
            return 'pages-light'
          }
        },
      },
    },
  },
})
