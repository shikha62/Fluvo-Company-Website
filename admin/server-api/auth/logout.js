import { setSecurityHeaders } from '../_auth.js';

export default function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the session cookie by setting Max-Age=0
  const isSecure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `fluvo_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${isSecure ? '; Secure' : ''}`);
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}
