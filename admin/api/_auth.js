import jwt from 'jsonwebtoken';

/**
 * Parses a cookie string and returns the value for a given name.
 */
export function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Verifies the admin session JWT from the request cookie.
 * Returns the decoded payload or throws if invalid/missing.
 */
export function verifyAdminSession(req) {
  const token = parseCookie(req.headers.cookie, 'fluvo_admin_session');
  if (!token) throw new Error('No session token');
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return jwt.verify(token, secret);
}

/**
 * Middleware helper: returns null if authorized, otherwise sends 401 and returns false.
 */
export function requireAuth(req, res) {
  try {
    const payload = verifyAdminSession(req);
    return payload;
  } catch {
    res.status(401).json({ error: 'Unauthorized. Please log in.' });
    return null;
  }
}

/**
 * Adds security headers to all admin API responses.
 */
export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}
