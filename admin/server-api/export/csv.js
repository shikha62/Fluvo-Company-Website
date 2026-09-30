import { createClient } from '@supabase/supabase-js';
import { requireAuth, setSecurityHeaders } from '../_auth.js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
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
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase CSV error:', error.message);
      return res.status(500).json({ error: 'Database error.' });
    }

    const headers = ['ID', 'Type', 'Full Name', 'Work Email', 'Company', 'Phone', 'Ad Spend', 'Preferred Date', 'Preferred Time', 'Message', 'Status', 'Starred', 'Notes', 'Submitted At'];
    const rows = (data || []).map(row => [
      row.id,
      row.type || '',
      row.full_name || '',
      row.work_email || '',
      row.company || '',
      row.phone || '',
      row.ad_spend || '',
      row.preferred_date || '',
      row.preferred_time || '',
      row.message || '',
      row.status || '',
      row.starred ? 'Yes' : 'No',
      row.notes || '',
      row.created_at || '',
    ].map(escapeCSV).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const dateStr = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Fluvo_Queries_${dateStr}.csv"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('CSV export error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
