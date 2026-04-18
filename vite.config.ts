import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react-window', 'recharts', 'exceljs', 'file-saver', 'jspdf', 'jspdf-autotable', 'dexie', 'dexie-react-hooks', 'clsx', 'zustand'],
  },
  build: {
    // echarts/exceljs/xlsx/jspdf/pptxgenjs sont des libs lourdes séparées en vendor chunks ;
    // ces chunks ne sont téléchargés que si les pages qui les utilisent sont ouvertes.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-xlsx': ['xlsx'],
          'vendor-exceljs': ['exceljs'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-pptx': ['pptxgenjs'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-utils': ['zustand', 'clsx', 'papaparse', 'file-saver'],
        },
      },
    },
  },
});
