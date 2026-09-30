import { defineConfig, loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'node:url';

const adminRoot = fs.existsSync(path.resolve(process.cwd(), 'server-api'))
  ? process.cwd()
  : path.resolve(process.cwd(), 'admin');
const envRoot = path.resolve(adminRoot, '..');
const workspaceEnv = loadEnv('development', envRoot, '');
const adminEnv = loadEnv('development', adminRoot, '');
for (const [key, value] of Object.entries({ ...workspaceEnv, ...adminEnv })) {
  if (Object.hasOwn(adminEnv, key) || process.env[key] === undefined) process.env[key] = value;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY && !/your-|placeholder|\.\.\./i.test(process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_ANON_KEY || '';
let supabase;

function getDevSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL and a server-side Supabase key are required.');
  if (!supabase) supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabase;
}

function resolveApiHandler(pathname) {
  const staticRoutes = new Map([
    ['/api/auth/login', './server-api/auth/login.js'],
    ['/api/auth/logout', './server-api/auth/logout.js'],
    ['/api/auth/me', './server-api/me.js'],
    ['/api/me', './server-api/me.js'],
    ['/api/email', './server-api/email/index.js'],
    ['/api/email/campaigns', './server-api/email/campaigns/index.js'],
    ['/api/email/leads/validate', './server-api/email/leads/validate.js'],
    ['/api/email/leads/import', './server-api/email/leads/import.js'],
    ['/api/email/templates', './server-api/email/templates/index.js'],
    ['/api/email/settings', './server-api/email/settings.js'],
    ['/api/email/test-connection', './server-api/email/test-connection.js'],
    ['/api/email/test', './server-api/email/test.js'],
    ['/api/email/worker', './server-api/email/worker.js'],
    ['/api/email/unsubscribe', './server-api/email/unsubscribe.js'],
    ['/api/email/suppress', './server-api/email/suppress.js'],
    ['/api/email/unsuppress', './server-api/email/unsuppress.js'],
    ['/api/email/activity/all', './server-api/email/activity-all.js'],
    ['/api/email/activity-all', './server-api/email/activity-all.js'],
    ['/api/email/activity/unsuppress', './server-api/email/activity-unsuppress.js'],
    ['/api/email/activity-unsuppress', './server-api/email/activity-unsuppress.js'],
    ['/api/email/activity/selected', './server-api/email/activity-selected.js'],
    ['/api/email/activity-selected', './server-api/email/activity-selected.js']
  ]);
  if (staticRoutes.has(pathname)) return { modulePath: staticRoutes.get(pathname), params: {} };
  for (const [pattern, modulePath, paramName] of [
    [/^\/api\/email\/campaigns\/([^/]+)$/, './server-api/email/campaigns/[id].js', 'id'],
    [/^\/api\/email\/templates\/([^/]+)$/, './server-api/email/templates/[id].js', 'id'],
    [/^\/api\/email\/recipients\/([^/]+)$/, './server-api/email/recipients/[id].js', 'id']
  ]) {
    const match = pathname.match(pattern);
    if (match) return { modulePath, params: { [paramName]: decodeURIComponent(match[1]) } };
  }
  if (pathname.startsWith('/api/email/')) return { modulePath: './server-api/email/index.js', params: {} };
  return null;
}

async function invokeApiHandler(handlerPath, req, res, url, params) {
  let rawBody = '';
  if (!['GET', 'HEAD'].includes(req.method)) {
    for await (const chunk of req) rawBody += chunk;
  }
  let body;
  if (rawBody) {
    body = String(req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
      ? Object.fromEntries(new URLSearchParams(rawBody))
      : JSON.parse(rawBody);
  }
  const handlerUrl = pathToFileURL(path.resolve(adminRoot, handlerPath)).href;
  const handler = (await import(`${handlerUrl}?t=${Date.now()}`)).default;
  const apiRequest = {
    method: req.method,
    headers: req.headers,
    query: { ...Object.fromEntries(url.searchParams), ...params },
    body
  };
  const apiResponse = {
    statusCode: 200,
    setHeader(name, value) { res.setHeader(name, value); return this; },
    status(code) { this.statusCode = code; res.statusCode = code; return this; },
    json(payload) {
      res.statusCode = this.statusCode;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      return this;
    },
    send(payload) { res.statusCode = this.statusCode; res.end(payload); return this; }
  };
  await handler(apiRequest, apiResponse);
  if (!res.writableEnded) res.end();
}

function adminDevApiPlugin() {
  return {
    name: 'admin-dev-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        const route = resolveApiHandler(url.pathname);
        if (route) {
          try {
            await invokeApiHandler(route.modulePath, req, res, url, route.params);
          } catch (error) {
            console.error('Admin API request failed:', error.message);
            if (!res.headersSent) res.statusCode = 500;
            if (!res.writableEnded) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Admin API request failed. Check local environment and database configuration.' }));
            }
          }
          return;
        }

        // Queries: GET /api/queries
        if (url.pathname === '/api/queries' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { data, error } = await getDevSupabase()
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
            const jsonPath = path.resolve(adminRoot, 'data/queries.json');
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
              await getDevSupabase().from('queries').delete().eq('id', id);
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

                const { data, error } = await getDevSupabase()
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
    exclude: ['jsonwebtoken', 'bcryptjs', 'imapflow', 'mailparser', 'nodemailer']
  },
  build: {
    rollupOptions: {
      external: ['jsonwebtoken', 'bcryptjs', 'imapflow', 'mailparser', 'nodemailer']
    }
  }
});
