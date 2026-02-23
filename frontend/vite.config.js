import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    allowedHosts: true,
    proxy: {
      // All /api/* requests → backend on :3001
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // SSH WebSocket → backend on :3001
      '/ws': {
        target: 'http://127.0.0.1:3001',  // use http:// target even for ws
	ws: true,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
        proxy.on('error', (err) => console.log('[ws proxy error]', err.message));
        proxy.on('proxyReqWs', (_req, _socket, _head) => console.log('[ws] upgrade request'));        },
      },
    },
  },
});
