import { setSecurityHeaders } from '../_auth.js';

export default function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear the session cookie by setting Max-Age=0
  res.setHeader('Set-Cookie', 'fluvo_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure');
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}
