import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setSecurityHeaders } from '../_auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminEmail || !adminPasswordHash || !jwtSecret) {
    console.error('Admin auth env vars not configured');
    return res.status(500).json({ error: 'Server configuration error. Contact administrator.' });
  }

  // Check email
  if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
    // Use the same error message for email/password to prevent user enumeration
    return res.status(401).json({ error: 'Invalid credentials. Please check your email and password.' });
  }

  // Check password against bcrypt hash or secure hash
  let passwordValid = false;
  try {
    if (adminPasswordHash.startsWith('$2a$') || adminPasswordHash.startsWith('$2b$') || adminPasswordHash.startsWith('$2y$')) {
      passwordValid = await bcrypt.compare(password, adminPasswordHash);
    } else {
      passwordValid = (password === adminPasswordHash);
    }
  } catch (err) {
    console.error('Password comparison error:', err.message);
    return res.status(500).json({ error: 'Authentication error. Please try again.' });
  }

  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials. Please check your email and password.' });
  }

  // Create JWT
  const token = jwt.sign(
    { email: adminEmail, role: 'admin' },
    jwtSecret,
    { expiresIn: '8h', issuer: 'fluvo-admin' }
  );

  // Set HttpOnly, Secure, SameSite=Strict cookie
  const isProd = process.env.NODE_ENV === 'production';
  const cookieParts = [
    `fluvo_admin_session=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${8 * 60 * 60}`,
  ];
  if (isProd) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return res.status(200).json({ success: true, message: 'Authenticated successfully.' });
}
