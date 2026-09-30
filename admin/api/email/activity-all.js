import { authorize, getSupabase, logAudit, sendJson } from './_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed.' });

  try {
    const supabase = getSupabase();
    const { data: campaigns, error: campaignReadError } = await supabase.from('campaigns').select('id,status');
    if (campaignReadError) throw campaignReadError;

    const { error: eventsError } = await supabase.from('email_events').delete().not('created_at', 'is', null);
    if (eventsError) throw eventsError;
    for (const campaign of campaigns || []) {
      // Draft recipients are campaign definitions, not delivery activity; keep them launchable.
      if (campaign.status === 'draft') continue;
      const { error: recipientsError } = await supabase.from('campaign_recipients').delete().eq('campaign_id', campaign.id);
      if (recipientsError) throw recipientsError;
      const { error: updateError } = await supabase.from('campaigns').update({
        total_recipients: 0,
        queued_count: 0,
        sent_count: 0,
        failed_count: 0
      }).eq('id', campaign.id);
      if (updateError) throw updateError;
    }

    await logAudit(supabase, actor.email, 'email_activity_deleted_all', 'email_activity', null);
    return sendJson(res, 200, { success: true, message: 'All email activity deleted successfully.' });
  } catch (error) {
    console.error('All email activity deletion failed:', error.message);
    return sendJson(res, 500, { error: 'Failed to delete all email activity.' });
  }
}