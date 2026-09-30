import { authorize, getSupabase, logAudit, sendJson } from './_automation.js';
import { isValidEmail, normalizeEmail } from '../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
  try {
    const supabase = getSupabase();
    const reason = 'administrator_suppression';
    const { error } = await supabase.from('suppression_list').upsert({ email, reason }, { onConflict: 'email' });
    if (error) throw error;
    const { data: updated, error: updateError } = await supabase.from('campaign_recipients').update({
      status: 'suppressed', error_message: 'Recipient suppressed by administrator.', updated_at: new Date().toISOString()
    }).eq('recipient_email', email).in('status', ['pending', 'queued']).select('id');
    if (updateError) throw updateError;
    if (updated?.length) await supabase.from('email_events').insert(updated.map(row => ({ campaign_recipient_id: row.id, event_type: 'suppressed', metadata: {} })));
    await logAudit(supabase, actor.email, 'recipient_suppressed', 'suppression', email, { reason });
    return sendJson(res, 200, { success: true, email });
  } catch (error) {
    console.error('Recipient suppression failed:', error.message);
    return sendJson(res, 500, { error: 'Recipient could not be added to suppression list.' });
  }
}