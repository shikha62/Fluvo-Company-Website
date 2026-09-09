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
  if (!payload) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Query ID is required.' });

  if (req.method === 'DELETE') {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('queries').delete().eq('id', id);
      if (error) {
        return res.status(500).json({ error: 'Database error deleting query.' });
      }
      return res.status(200).json({ success: true, message: 'Query deleted successfully.' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error.' });
    }
  }

  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { status, starred, notes } = req.body || {};
  const allowed = ['new', 'contacted', 'in-progress', 'resolved'];
  const updatePayload = {};
  if (status !== undefined) {
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status value.' });
    updatePayload.status = status;
  }
  if (starred !== undefined) updatePayload.starred = Boolean(starred);
  if (notes !== undefined) updatePayload.notes = String(notes).slice(0, 2000);
  updatePayload.updated_at = new Date().toISOString();
  if (Object.keys(updatePayload).length === 1) return res.status(400).json({ error: 'No valid fields to update.' });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('queries').update(updatePayload).eq('id', id).select().single();
    if (error) {
      if (error.code === 'PGRST116') return res.status(404).json({ error: 'Query not found.' });
      return res.status(500).json({ error: 'Database error.' });
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}