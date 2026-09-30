import { authorize, getSupabase, logAudit, sendJson } from '../_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  try {
    const supabase = getSupabase();
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('email_templates').select('id,name,subject,body,is_active,created_at,updated_at').order('created_at');
      if (error) throw error;
      return sendJson(res, 200, { templates: data || [] });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    const { name, subject, body } = req.body || {};
    if (!String(name || '').trim() || !String(subject || '').trim() || !String(body || '').trim()) return sendJson(res, 400, { error: 'Template name, subject, and body are required.' });
    if (String(subject).length > 500 || String(body).length > 30000) return sendJson(res, 400, { error: 'Template exceeds the supported length.' });
    const { data, error } = await supabase.from('email_templates').insert({ name: String(name).trim(), subject, body, is_active: true }).select('*').single();
    if (error) throw error;
    await logAudit(supabase, actor.email, 'template_created', 'email_template', data.id, { name: data.name });
    return sendJson(res, 201, { template: data });
  } catch (error) {
    console.error('Email template request failed:', error.message);
    return sendJson(res, 500, { error: 'Template could not be saved. Apply the email automation migration and check for duplicate names.' });
  }
}