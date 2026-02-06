// import path from 'path';
// import { defineConfig, loadEnv } from 'vite';
// import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// export default defineConfig(({ mode }) => {
//     const env = loadEnv(mode, '.', '');
//     return {
//       server: {
//         port: 3000,
//         host: '0.0.0.0',
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests from /api to your screenshot service
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
