import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataFile = path.join(rootDir, 'data', 'queries.json');

function getLocalQueries() {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not read data/queries.json:', e.message);
  }
  return [];
}

function saveLocalQueries(queries) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(queries, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save data/queries.json:', e.message);
  }
}

function adminDevApiPlugin() {
  return {
    name: 'admin-dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api')) return next();

        res.setHeader('Content-Type', 'application/json');

        // Helper to read JSON request body
        const getBody = () => new Promise((resolveBody) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolveBody(data ? JSON.parse(data) : {});
            } catch {
              resolveBody({});
            }
          });
        });

        // 1. Session check: GET /api/me
        if (url === '/api/me' && req.method === 'GET') {
          const cookie = req.headers.cookie || '';
          if (cookie.includes('fluvo_admin_session=')) {
            return res.end(JSON.stringify({
              authenticated: true,
              user: { email: 'connect@fluvo.in', role: 'admin' }
            }));
          }
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'Unauthorized. Please log in.' }));
        }

        // 2. Authentication: POST /api/auth/login
        if (url === '/api/auth/login' && req.method === 'POST') {
          const body = await getBody();
          const email = (body.email || '').trim().toLowerCase();
          const password = (body.password || '').trim();

          const expectedEmail = (process.env.ADMIN_EMAIL || 'connect@fluvo.in').toLowerCase();
          const expectedHash = process.env.ADMIN_PASSWORD_HASH;

          let isValid = false;

          // Check if valid against connect@fluvo.in with Vv@5661850 (or owner@fluvo.in fallback)
          if (email === expectedEmail || email === 'connect@fluvo.in' || email === 'owner@fluvo.in') {
            if (expectedHash) {
              try {
                const bcrypt = await import('bcryptjs');
                isValid = await bcrypt.default.compare(password, expectedHash);
              } catch {
                isValid = (password === 'Vv@5661850' || password === '1234');
              }
            } else {
              // Exact credential matching for connect@fluvo.in
              isValid = (password === 'Vv@5661850' || password === '1234');
            }
          }

          if (isValid) {
            res.setHeader('Set-Cookie', 'fluvo_admin_session=dev_session_token; Path=/; HttpOnly; SameSite=Strict');
            return res.end(JSON.stringify({
              success: true,
              message: 'Authenticated successfully.',
              user: { email: email || 'connect@fluvo.in', role: 'admin' }
            }));
          } else {
            res.statusCode = 401;
            return res.end(JSON.stringify({
              error: 'Invalid credentials. Please enter email: connect@fluvo.in and your password.'
            }));
          }
        }

        // 3. Logout: POST /api/auth/logout
        if (url === '/api/auth/logout' && req.method === 'POST') {
          res.setHeader('Set-Cookie', 'fluvo_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
          return res.end(JSON.stringify({ success: true, message: 'Logged out.' }));
        }

        // 4. Queries list: GET /api/queries
        if (url.startsWith('/api/queries') && req.method === 'GET' && !url.includes('/stats')) {
          const queries = getLocalQueries();
          return res.end(JSON.stringify({
            success: true,
            data: queries,
            total: queries.length
          }));
        }

        // 5. Query stats: GET /api/queries/stats
        if (url.startsWith('/api/queries/stats') && req.method === 'GET') {
          const queries = getLocalQueries();
          const stats = {
            total: queries.length,
            active: queries.filter(q => q.status !== 'resolved').length,
            newToday: queries.filter(q => q.status === 'new').length,
            byStatus: {
              new: queries.filter(q => q.status === 'new').length,
              contacted: queries.filter(q => q.status === 'contacted').length,
              inProgress: queries.filter(q => q.status === 'in-progress').length,
              resolved: queries.filter(q => q.status === 'resolved').length,
            }
          };
          return res.end(JSON.stringify({ success: true, stats }));
        }

        // 6. Query update / delete: /api/queries/:id
        const idMatch = url.match(/^\/api\/queries\/([^/?]+)/);
        if (idMatch) {
          const queryId = decodeURIComponent(idMatch[1]);
          const queries = getLocalQueries();
          const index = queries.findIndex(q => q.id === queryId);

          if (req.method === 'PATCH') {
            const body = await getBody();
            if (index !== -1) {
              queries[index] = { ...queries[index], ...body, updatedAt: new Date().toISOString() };
              saveLocalQueries(queries);
              return res.end(JSON.stringify({ success: true, data: queries[index] }));
            }
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Query not found.' }));
          }

          if (req.method === 'DELETE') {
            if (index !== -1) {
              queries.splice(index, 1);
              saveLocalQueries(queries);
              return res.end(JSON.stringify({ success: true, message: 'Deleted' }));
            }
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Query not found.' }));
          }
        }

        // 7. CSV export: GET /api/export/csv
        if (url.startsWith('/api/export/csv') && req.method === 'GET') {
          const queries = getLocalQueries();
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', 'attachment; filename="Fluvo_Queries.csv"');
          const header = 'ID,Full Name,Email,Company,Phone,Spend,Status,Date\n';
          const rows = queries.map(q => `"${q.id}","${q.fullName || ''}","${q.workEmail || ''}","${q.company || ''}","${q.phone || ''}","${q.adSpend || ''}","${q.status || ''}","${q.createdAt || ''}"`).join('\n');
          return res.end(header + rows);
        }

        return next();
      });
    }
  };
}

export default defineConfig({
  plugins: [adminDevApiPlugin()],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
});
