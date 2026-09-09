import { defineConfig } from 'vite';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function adminDevApiPlugin() {
  return {
    name: 'admin-dev-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // 1. Auth: Login
        if (url.pathname === '/api/auth/login' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { email, password } = JSON.parse(body || '{}');
              if (
                email === 'connect@fluvo.in' &&
                (password === 'Vv@5661850' || password === '1234')
              ) {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Set-Cookie', 'fluvo_admin_session=authenticated_dev_token; Path=/; HttpOnly; SameSite=Lax');
                res.end(JSON.stringify({
                  success: true,
                  user: { email: 'connect@fluvo.in', role: 'executive_owner' }
                }));
              } else {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Invalid executive credentials' }));
              }
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Malformed request' }));
            }
          });
          return;
        }

        // 2. Auth: Me (both /api/me and /api/auth/me)
        if ((url.pathname === '/api/auth/me' || url.pathname === '/api/me') && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            authenticated: true,
            user: { email: 'connect@fluvo.in', role: 'executive_owner' }
          }));
          return;
        }

        // 3. Auth: Logout
        if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
          res.setHeader('Set-Cookie', 'fluvo_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // 4. Queries: GET /api/queries
        if (url.pathname === '/api/queries' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { data, error } = await supabase
              .from('queries')
              .select('*')
              .order('created_at', { ascending: false });

            if (error) throw error;

            const normalized = (data || []).map(row => ({
              id: row.id?.toString(),
              type: row.type || 'schedule',
              fullName: row.full_name || row.fullName || 'Prospective Client',
              workEmail: row.work_email || row.workEmail || '',
              company: row.company || '',
              phone: row.phone || '',
              adSpend: row.ad_spend || row.adSpend || '—',
              preferredDate: row.preferred_date || row.preferredDate || '',
              preferredTime: row.preferred_time || row.preferredTime || '',
              message: row.message || '',
              status: row.status || 'new',
              starred: Boolean(row.starred),
              notes: row.notes || '',
              createdAt: row.created_at || row.createdAt || new Date().toISOString()
            }));

            res.end(JSON.stringify({ success: true, data: normalized, total: normalized.length }));
          } catch (err) {
            console.error('Failed to fetch queries from Supabase in dev server:', err);
            // Fallback to local queries.json if any
            const jsonPath = path.resolve(import.meta.dirname, 'data/queries.json');
            let fallback = [];
            if (fs.existsSync(jsonPath)) {
              try { fallback = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')); } catch (e) {}
            }
            res.end(JSON.stringify({ success: true, data: fallback, total: fallback.length }));
          }
          return;
        }

        // 5. Queries: PATCH or DELETE /api/queries/:id
        const idMatch = url.pathname.match(/^\/api\/queries\/([^/]+)$/);
        if (idMatch) {
          const id = idMatch[1];
          if (req.method === 'DELETE') {
            res.setHeader('Content-Type', 'application/json');
            try {
              await supabase.from('queries').delete().eq('id', id);
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Failed to delete query' }));
            }
            return;
          }

          if (req.method === 'PATCH') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              res.setHeader('Content-Type', 'application/json');
              try {
                const patchData = JSON.parse(body || '{}');
                const updatePayload = {};
                if (patchData.status !== undefined) updatePayload.status = patchData.status;
                if (patchData.starred !== undefined) updatePayload.starred = patchData.starred;
                if (patchData.notes !== undefined) updatePayload.notes = patchData.notes;

                const { data, error } = await supabase
                  .from('queries')
                  .update(updatePayload)
                  .eq('id', id)
                  .select();

                if (error) throw error;
                res.end(JSON.stringify({ success: true, data: data?.[0] }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to update query' }));
              }
            });
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true
  },
  plugins: [adminDevApiPlugin()],
  optimizeDeps: {
    exclude: ['jsonwebtoken', 'bcryptjs']
  },
  build: {
    rollupOptions: {
      external: ['jsonwebtoken', 'bcryptjs']
    }
  }
});
