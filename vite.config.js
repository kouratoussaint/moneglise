import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';

export default defineConfig({
  plugins: [react()],
  base: './',
  // Firebase activé uniquement si android/app/google-services.json existe
  define: { __FIREBASE__: JSON.stringify(existsSync('android/app/google-services.json')) },
  build: { chunkSizeWarningLimit: 1200 },
});
