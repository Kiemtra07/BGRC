import { defineConfig } from 'vite'
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
})
