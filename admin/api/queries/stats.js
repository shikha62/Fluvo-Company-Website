import { createClient } from '@supabase/supabase-js';
import { requireAuth, setSecurityHeaders } from '../_auth.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  const payload = requireAuth(req, res);
  if (!payload) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('queries')
      .select('status, starred, created_at');

    if (error) {
      console.error('Supabase stats error:', error.message);
      return res.status(500).json({ error: 'Database error.' });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const stats = {
      total: data.length,
      newToday: data.filter(q => q.created_at >= todayStart).length,
      byStatus: {
        new: data.filter(q => q.status === 'new').length,
        contacted: data.filter(q => q.status === 'contacted').length,
        inProgress: data.filter(q => q.status === 'in-progress').length,
        resolved: data.filter(q => q.status === 'resolved').length,
      },
      starred: data.filter(q => q.starred).length,
    };

    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error('Stats error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
