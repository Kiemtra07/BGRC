import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/pdfjs-dist/')) return 'pdf-viewer-vendor'
          if (id.includes('/read-excel-file/')) return 'excel-viewer-vendor'
          if (id.includes('/recharts/')) return 'charts-vendor'
          if (id.includes('/lucide-react/')) return 'icons-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/') || id.includes('/react-is/')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  // The Windows fork pool intermittently exits after the suite completes, producing a false-red
  // CI result. One persistent fork keeps the isolation boundary while making the run deterministic.
  test: {
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
