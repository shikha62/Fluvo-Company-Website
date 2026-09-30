import { authorize, getSupabase, logAudit, sendJson } from './_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });

  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(id => typeof id === 'string' && id))] : [];
  if (!ids.length) return sendJson(res, 400, { error: 'Select at least one activity record.' });
  if (ids.length > 200) return sendJson(res, 400, { error: 'Select no more than 200 records at a time.' });

  try {
    const supabase = getSupabase();
    const { data: rows, error: readError } = await supabase
      .from('campaign_recipients')
      .select('id,campaign_id,recipient_email,status,error_message')
      .in('id', ids);
    if (readError) throw readError;

    const suppressedRows = (rows || []).filter(row => row.status === 'suppressed' && row.error_message === 'administrator_suppression');
    if (!suppressedRows.length) {
      return sendJson(res, 200, { success: true, unsuppressed: 0, skipped: (rows || []).length, message: 'No selected emails are currently suppressed.' });
    }

    const emails = [...new Set(suppressedRows.map(row => row.recipient_email))];
    const recipientIds = suppressedRows.map(row => row.id);

    const { error: deleteError } = await supabase
      .from('suppression_list')
      .delete()
      .in('email', emails)
      .eq('reason', 'administrator_suppression');
    if (deleteError) throw deleteError;

    const { error: updateError } = await supabase
      .from('campaign_recipients')
      .update({ status: 'pending', attempts: 0, error_message: null, sent_at: null, provider_message_id: null, updated_at: new Date().toISOString() })
      .in('id', recipientIds);
    if (updateError) throw updateError;

    const campaignIds = [...new Set(suppressedRows.map(row => row.campaign_id))];
    for (const campaignId of campaignIds) {
      const { data: campaignRows, error: rowsError } = await supabase.from('campaign_recipients').select('status').eq('campaign_id', campaignId);
      if (rowsError) throw rowsError;
      const statuses = campaignRows || [];
      const { error: campaignError } = await supabase.from('campaigns').update({
        total_recipients: statuses.length,
        queued_count: statuses.filter(row => ['pending', 'queued', 'sending'].includes(row.status)).length,
        sent_count: statuses.filter(row => row.status === 'sent').length,
        failed_count: statuses.filter(row => row.status === 'failed').length
      }).eq('id', campaignId);
      if (campaignError) throw campaignError;
    }

    await logAudit(supabase, actor.email, 'recipient_unsuppressed_bulk', 'suppression', null, { emails, count: recipientIds.length });

    const skipped = ids.length - recipientIds.length;
    const noun = recipientIds.length === 1 ? 'email' : 'emails';
    return sendJson(res, 200, {
      success: true,
      unsuppressed: recipientIds.length,
      skipped,
      message: skipped
        ? `${recipientIds.length} ${noun} unsuppressed, ${skipped} skipped (not suppressed).`
        : `${recipientIds.length} ${noun} unsuppressed successfully.`
    });
  } catch (error) {
    console.error('Bulk recipient unsuppression failed:', error.message);
    return sendJson(res, 500, { error: 'Unable to unsuppress selected emails.' });
  }
}
