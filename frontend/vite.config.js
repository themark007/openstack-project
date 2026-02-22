import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      // All /api/* requests → backend on :3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // SSH WebSocket → backend on :3001
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
