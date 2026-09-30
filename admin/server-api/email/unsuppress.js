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
    const { error: deleteError } = await supabase
      .from('suppression_list')
      .delete()
      .eq('email', email)
      .eq('reason', 'administrator_suppression');
    if (deleteError) throw deleteError;

    const { data: updated, error: updateError } = await supabase
      .from('campaign_recipients')
      .update({ status: 'pending', attempts: 0, error_message: null, sent_at: null, provider_message_id: null, updated_at: new Date().toISOString() })
      .eq('recipient_email', email)
      .eq('status', 'suppressed')
      .eq('error_message', 'administrator_suppression')
      .select('id,campaign_id');
    if (updateError) throw updateError;

    for (const campaignId of [...new Set((updated || []).map(row => row.campaign_id))]) {
      const { data: rows, error: rowsError } = await supabase.from('campaign_recipients').select('status').eq('campaign_id', campaignId);
      if (rowsError) throw rowsError;
      const statuses = rows || [];
      const { error: campaignError } = await supabase.from('campaigns').update({
        total_recipients: statuses.length,
        queued_count: statuses.filter(row => ['pending', 'queued', 'sending'].includes(row.status)).length,
        sent_count: statuses.filter(row => row.status === 'sent').length,
        failed_count: statuses.filter(row => row.status === 'failed').length
      }).eq('id', campaignId);
      if (campaignError) throw campaignError;
    }

    await logAudit(supabase, actor.email, 'recipient_unsuppressed', 'suppression', email);
    return sendJson(res, 200, { success: true, email, restored: updated?.length || 0 });
  } catch (error) {
    console.error('Recipient unsuppression failed:', error.message);
    return sendJson(res, 500, { error: 'Recipient could not be removed from the suppression list.' });
  }
}