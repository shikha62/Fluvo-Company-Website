import { authorize, getSupabase, logAudit, sendJson } from './_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed.' });

  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(id => typeof id === 'string' && id))] : [];
  if (!ids.length) return sendJson(res, 400, { error: 'Select at least one activity record.' });
  if (ids.length > 200) return sendJson(res, 400, { error: 'Select no more than 200 records at a time.' });

  try {
    const supabase = getSupabase();
    const { data: rows, error: readError } = await supabase
      .from('campaign_recipients')
      .select('id,campaign_id,status')
      .in('id', ids);
    if (readError) throw readError;

    const deletable = (rows || []).filter(row => row.status !== 'sending');
    const skippedSending = (rows || []).length - deletable.length;
    if (!deletable.length) {
      return sendJson(res, 409, { error: 'Selected records are currently sending. Refresh activity after the campaign finishes.' });
    }

    const deletableIds = deletable.map(row => row.id);
    const { data: deleted, error: deleteError } = await supabase
      .from('campaign_recipients')
      .delete()
      .in('id', deletableIds)
      .select('id');
    if (deleteError) throw deleteError;

    const campaignIds = [...new Set(deletable.map(row => row.campaign_id))];
    for (const campaignId of campaignIds) {
      const { data: remaining, error: remainingError } = await supabase.from('campaign_recipients').select('status').eq('campaign_id', campaignId);
      if (remainingError) throw remainingError;
      const statuses = remaining || [];
      const { error: campaignError } = await supabase.from('campaigns').update({
        total_recipients: statuses.length,
        queued_count: statuses.filter(row => ['queued', 'sending', 'pending'].includes(row.status)).length,
        sent_count: statuses.filter(row => row.status === 'sent').length,
        failed_count: statuses.filter(row => row.status === 'failed').length
      }).eq('id', campaignId);
      if (campaignError) throw campaignError;
    }

    const deletedCount = deleted?.length || 0;
    await logAudit(supabase, actor.email, 'recipient_activity_deleted_bulk', 'campaign_recipient', null, { ids: deletableIds, count: deletedCount });

    const noun = deletedCount === 1 ? 'record' : 'records';
    return sendJson(res, 200, {
      success: true,
      deleted: deletedCount,
      skipped: skippedSending,
      message: skippedSending
        ? `${deletedCount} activity ${noun} deleted, ${skippedSending} skipped (currently sending).`
        : `${deletedCount} activity ${noun} deleted.`
    });
  } catch (error) {
    console.error('Bulk activity deletion failed:', error.message);
    return sendJson(res, 500, { error: 'Failed to delete selected email activity records.' });
  }
}
