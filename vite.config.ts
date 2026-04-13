import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react-window', 'recharts', 'exceljs', 'file-saver', 'jspdf', 'jspdf-autotable', 'dexie', 'dexie-react-hooks', 'clsx', 'zustand'],
  },
});
