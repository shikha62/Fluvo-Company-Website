import authLogin from '../server-api/auth/login.js';
import authLogout from '../server-api/auth/logout.js';
import me from '../server-api/me.js';

function resolveRoute(pathname) {
  const routes = new Map([
    ['/api/auth/login', { handler: authLogin }],
    ['/api/auth/logout', { handler: authLogout }],
    ['/api/auth/me', { handler: me }],
    ['/api/me', { handler: me }],
    ['/api/email', { load: () => import('../server-api/email/index.js') }],
    ['/api/email/queries', { load: () => import('../server-api/queries/index.js') }],
    ['/api/email/campaigns', { load: () => import('../server-api/email/campaigns/index.js') }],
    ['/api/email/leads/validate', { load: () => import('../server-api/email/leads/validate.js') }],
    ['/api/email/leads/import', { load: () => import('../server-api/email/leads/import.js') }],
    ['/api/email/templates', { load: () => import('../server-api/email/templates/index.js') }],
    ['/api/email/settings', { load: () => import('../server-api/email/settings.js') }],
    ['/api/email/test-connection', { load: () => import('../server-api/email/test-connection.js') }],
    ['/api/email/test', { load: () => import('../server-api/email/test.js') }],
    ['/api/email/worker', { load: () => import('../server-api/email/worker.js') }],
    ['/api/email/unsubscribe', { load: () => import('../server-api/email/unsubscribe.js') }],
    ['/api/email/suppress', { load: () => import('../server-api/email/suppress.js') }],
    ['/api/email/unsuppress', { load: () => import('../server-api/email/unsuppress.js') }],
    ['/api/email/activity/all', { load: () => import('../server-api/email/activity-all.js') }],
    ['/api/email/activity-all', { load: () => import('../server-api/email/activity-all.js') }],
    ['/api/email/activity/unsuppress', { load: () => import('../server-api/email/activity-unsuppress.js') }],
    ['/api/email/activity-unsuppress', { load: () => import('../server-api/email/activity-unsuppress.js') }],
    ['/api/email/activity/selected', { load: () => import('../server-api/email/activity-selected.js') }],
    ['/api/email/activity-selected', { load: () => import('../server-api/email/activity-selected.js') }],
    ['/api/queries', { load: () => import('../server-api/queries/index.js') }],
    ['/api/queries/stats', { load: () => import('../server-api/queries/stats.js') }],
    ['/api/export/csv', { load: () => import('../server-api/export/csv.js') }]
  ]);
  if (routes.has(pathname)) return routes.get(pathname);

  for (const [pattern, load, paramName] of [
    [/^\/api\/email\/campaigns\/([^/]+)$/, () => import('../server-api/email/campaigns/[id].js'), 'id'],
    [/^\/api\/email\/templates\/([^/]+)$/, () => import('../server-api/email/templates/[id].js'), 'id'],
    [/^\/api\/email\/recipients\/([^/]+)$/, () => import('../server-api/email/recipients/[id].js'), 'id'],
    [/^\/api\/queries\/([^/]+)$/, () => import('../server-api/queries/[id].js'), 'id']
  ]) {
    const match = pathname.match(pattern);
    if (match) return { load, params: { [paramName]: decodeURIComponent(match[1]) } };
  }

  return null;
}

function normalizeRequestBody(body) {
  if (body === undefined || body === null || typeof body === 'object') return body;
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://vercel.local');
  const forwardedPath = req.query?.path ?? url.searchParams.get('path');
  const forwardedValue = Array.isArray(forwardedPath)
    ? forwardedPath.filter(Boolean).join('/')
    : String(forwardedPath || '');
  const normalizedForwardedPath = forwardedValue.replace(/^\/+|\/+$/g, '');
  const pathname = normalizedForwardedPath
    ? `/api/${normalizedForwardedPath}`
    : url.pathname;
  const route = resolveRoute(pathname);
  if (!route) return res.status(404).json({ error: 'API route not found.' });

  const routedReq = Object.create(req);
  routedReq.body = normalizeRequestBody(req.body ?? req.rawBody);
  routedReq.query = {
    ...(req.query || {}),
    ...Object.fromEntries(url.searchParams),
    ...(route.params || {})
  };
  const routeHandler = route.handler || (await route.load()).default;
  return routeHandler(routedReq, res);
}
