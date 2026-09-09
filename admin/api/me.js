import { requireAuth, setSecurityHeaders } from './_auth.js';

export default function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = requireAuth(req, res);
  if (!payload) return; // 401 already sent

  return res.status(200).json({
    authenticated: true,
    user: { email: payload.email, role: payload.role }
  });
}
