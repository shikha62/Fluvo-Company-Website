import { authorize, getSupabase, logAudit, sendJson } from '../_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed.' });
  const { name, subject, body } = req.body || {};
  if (!String(name || '').trim() || !String(subject || '').trim() || !String(body || '').trim()) return sendJson(res, 400, { error: 'Template name, subject, and body are required.' });
  if (String(subject).length > 500 || String(body).length > 30000) return sendJson(res, 400, { error: 'Template exceeds the supported length.' });
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('email_templates').update({
      name: String(name).trim(), subject, body, updated_at: new Date().toISOString()
    }).eq('id', req.query.id).select('*').single();
    if (error) throw error;
    await logAudit(supabase, actor.email, 'template_updated', 'email_template', data.id, { name: data.name });
    return sendJson(res, 200, { template: data });
  } catch (error) {
    console.error('Email template update failed:', error.message);
    return sendJson(res, 500, { error: 'Template could not be updated.' });
  }
}