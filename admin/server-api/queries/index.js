import { createClient } from '@supabase/supabase-js';
import { requireAuth, setSecurityHeaders } from '../_auth.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';
  if (!url) throw new Error('SUPABASE_URL env var not configured');
  return createClient(url, key);
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  const payload = requireAuth(req, res);
  if (!payload) return; // 401 already sent

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    const { search, status, type, sort = 'created_at', order = 'desc' } = req.query;

    let query = supabase.from('queries').select('*');

    // Apply search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      query = query.or(`full_name.ilike.%${q}%,work_email.ilike.%${q}%,company.ilike.%${q}%,message.ilike.%${q}%`);
    }

    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('type', type);

    const ascending = order === 'asc';
    query = query.order(sort, { ascending });

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error.message);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    // Normalize field names
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
      createdAt: row.created_at || row.createdAt || new Date().toISOString(),
      updatedAt: row.updated_at || row.updatedAt || null,
    }));

    return res.status(200).json({ success: true, data: normalized, total: normalized.length });
  } catch (err) {
    console.error('Query list error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
