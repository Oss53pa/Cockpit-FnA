import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Upload des source maps vers Sentry — ACTIF UNIQUEMENT si SENTRY_AUTH_TOKEN
// est défini (build CI / Vercel). En dev local ou build sans token : no-op,
// aucune source map générée ni envoyée.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryEnabled = !!sentryAuthToken;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Le plugin Sentry doit venir APRÈS les autres plugins.
    ...(sentryEnabled
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          authToken: sentryAuthToken,
          // Région EU (cf. DSN *.ingest.de.sentry.io). Surchargeable via SENTRY_URL.
          url: process.env.SENTRY_URL || 'https://de.sentry.io',
          telemetry: false,
          sourcemaps: {
            // Supprime les .map de dist/ après upload → non exposées aux utilisateurs.
            filesToDeleteAfterUpload: ['./dist/**/*.map'],
          },
        })]
      : []),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react-window', 'recharts', 'exceljs', 'file-saver', 'jspdf', 'jspdf-autotable', 'dexie', 'dexie-react-hooks', 'clsx', 'zustand'],
  },
  build: {
    // Source maps « hidden » uniquement quand l'upload Sentry est actif :
    // générées pour l'upload mais SANS commentaire sourceMappingURL (non servies).
    sourcemap: sentryEnabled ? 'hidden' : false,
    // echarts/exceljs/xlsx/jspdf/pptxgenjs sont des libs lourdes séparées en vendor chunks ;
    // ces chunks ne sont téléchargés que si les pages qui les utilisent sont ouvertes.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-recharts': ['recharts'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-nivo': ['@nivo/core', '@nivo/bar', '@nivo/line', '@nivo/pie', '@nivo/radar', '@nivo/sankey'],
          'vendor-tremor': ['@tremor/react'],
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
