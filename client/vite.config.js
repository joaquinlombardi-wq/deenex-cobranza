import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // El logo va dentro del CSS: la versión publicada es un solo archivo.
  build: { assetsInlineLimit: 32 * 1024 },
  server: { proxy: { '/api': 'http://127.0.0.1:4000' } },
});
