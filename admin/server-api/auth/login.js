import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setSecurityHeaders } from '../_auth.js';

async function getRequestBody(req) {
  const body = req.body ?? req.rawBody;
  if (body) return parseBody(body);
  if (req.readable && !req.readableEnded) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length) return parseBody(Buffer.concat(chunks));
  }
  return {};
}

function parseBody(body) {
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  try {
    return JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : body);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = await getRequestBody(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (!adminEmail || !adminPasswordHash || !jwtSecret) {
    const missing = [
      !adminEmail && 'ADMIN_EMAIL',
      !adminPasswordHash && 'ADMIN_PASSWORD_HASH',
      !jwtSecret && 'JWT_SECRET'
    ].filter(Boolean);
    console.error('Admin auth configuration is incomplete:', {
      adminEmail: Boolean(adminEmail),
      adminPasswordHash: Boolean(adminPasswordHash),
      jwtSecret: Boolean(jwtSecret)
    });
    return res.status(500).json({ error: `Admin login is not configured. Set ${missing.join(' and ')} in the server environment.` });
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

  // Set an origin-scoped session cookie for both Vercel and local HTTPS deployments.
  const isSecure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
  const cookieParts = [
    `fluvo_admin_session=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${8 * 60 * 60}`,
  ];
  if (isSecure) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  return res.status(200).json({ success: true, message: 'Authenticated successfully.' });
}
