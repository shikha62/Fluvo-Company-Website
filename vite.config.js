import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        staffLogin: resolve(__dirname, 'staff-login.html'),
        adminOps: resolve(__dirname, 'fluvo-ops-2026.html'),
        owner: resolve(__dirname, 'owner/index.html'),
        ownerHtml: resolve(__dirname, 'owner.html'),
      },
    },
  },
  plugins: [
    {
      name: 'owner-route-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/owner' || req.url === '/owner/') {
            req.url = '/owner/index.html';
          }
          next();
        });
      },
    },
  ],
});
