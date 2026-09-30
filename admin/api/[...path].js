import authLogin from '../server-api/auth/login.js';
import authLogout from '../server-api/auth/logout.js';
import me from '../server-api/me.js';
import email from '../server-api/email/index.js';
import campaigns from '../server-api/email/campaigns/index.js';
import campaign from '../server-api/email/campaigns/[id].js';
import leadsValidate from '../server-api/email/leads/validate.js';
import leadsImport from '../server-api/email/leads/import.js';
import templates from '../server-api/email/templates/index.js';
import template from '../server-api/email/templates/[id].js';
import recipient from '../server-api/email/recipients/[id].js';
import settings from '../server-api/email/settings.js';
import testConnection from '../server-api/email/test-connection.js';
import testEmail from '../server-api/email/test.js';
import worker from '../server-api/email/worker.js';
import unsubscribe from '../server-api/email/unsubscribe.js';
import suppress from '../server-api/email/suppress.js';
import unsuppress from '../server-api/email/unsuppress.js';
import activityAll from '../server-api/email/activity-all.js';
import activitySelected from '../server-api/email/activity-selected.js';
import activityUnsuppress from '../server-api/email/activity-unsuppress.js';
import queryList from '../server-api/queries/index.js';
import queryDetail from '../server-api/queries/[id].js';
import queryStats from '../server-api/queries/stats.js';
import csvExport from '../server-api/export/csv.js';

function resolveRoute(pathname) {
  const routes = new Map([
    ['/api/auth/login', { handler: authLogin }],
    ['/api/auth/logout', { handler: authLogout }],
    ['/api/auth/me', { handler: me }],
    ['/api/me', { handler: me }],
    ['/api/email', { handler: email }],
    ['/api/email/campaigns', { handler: campaigns }],
    ['/api/email/leads/validate', { handler: leadsValidate }],
    ['/api/email/leads/import', { handler: leadsImport }],
    ['/api/email/templates', { handler: templates }],
    ['/api/email/settings', { handler: settings }],
    ['/api/email/test-connection', { handler: testConnection }],
    ['/api/email/test', { handler: testEmail }],
    ['/api/email/worker', { handler: worker }],
    ['/api/email/unsubscribe', { handler: unsubscribe }],
    ['/api/email/suppress', { handler: suppress }],
    ['/api/email/unsuppress', { handler: unsuppress }],
    ['/api/email/activity/all', { handler: activityAll }],
    ['/api/email/activity-all', { handler: activityAll }],
    ['/api/email/activity/unsuppress', { handler: activityUnsuppress }],
    ['/api/email/activity-unsuppress', { handler: activityUnsuppress }],
    ['/api/email/activity/selected', { handler: activitySelected }],
    ['/api/email/activity-selected', { handler: activitySelected }],
    ['/api/queries', { handler: queryList }],
    ['/api/queries/stats', { handler: queryStats }],
    ['/api/export/csv', { handler: csvExport }]
  ]);
  if (routes.has(pathname)) return routes.get(pathname);

  for (const [pattern, handler, paramName] of [
    [/^\/api\/email\/campaigns\/([^/]+)$/, campaign, 'id'],
    [/^\/api\/email\/templates\/([^/]+)$/, template, 'id'],
    [/^\/api\/email\/recipients\/([^/]+)$/, recipient, 'id'],
    [/^\/api\/queries\/([^/]+)$/, queryDetail, 'id']
  ]) {
    const match = pathname.match(pattern);
    if (match) return { handler, params: { [paramName]: decodeURIComponent(match[1]) } };
  }

  return null;
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://vercel.local');
  const forwardedPath = req.query?.path;
  const forwardedSegments = Array.isArray(forwardedPath) ? forwardedPath : [forwardedPath];
  const pathname = url.pathname === '/api' && forwardedPath
    ? `/api/${forwardedSegments.filter(Boolean).join('/').replace(/^\/+/, '')}`
    : url.pathname;
  const route = resolveRoute(pathname);
  if (!route) return res.status(404).json({ error: 'API route not found.' });

  const routedReq = Object.create(req);
  routedReq.query = {
    ...(req.query || {}),
    ...Object.fromEntries(url.searchParams),
    ...(route.params || {})
  };
  return route.handler(routedReq, res);
}
