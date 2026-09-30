import { authorize, getSupabase, logAudit, sendJson } from '../_automation.js';
import { normalizeEmail } from '../../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  const id = req.query.id;
  if (!id) return sendJson(res, 400, { error: 'Recipient id is required.' });

  const supabase = getSupabase();

  if (req.method === 'DELETE') {
    try {
      const { data: recipient, error: readError } = await supabase
        .from('campaign_recipients')
        .select('id, campaign_id, recipient_email, status')
        .eq('id', id)
        .maybeSingle();

      if (readError) throw readError;
      if (!recipient) return sendJson(res, 404, { error: 'Recipient activity record not found.' });
      if (recipient.status === 'sending') {
        return sendJson(res, 409, { error: 'This recipient is currently sending. Refresh activity after the campaign finishes.' });
      }

      const { data: deleted, error: deleteError } = await supabase
        .from('campaign_recipients')
        .delete()
        .eq('id', id)
        .eq('status', recipient.status)
        .select('id')
        .maybeSingle();

      if (deleteError) throw deleteError;
      if (!deleted) return sendJson(res, 409, { error: 'Recipient status changed during deletion. Refresh activity and try again.' });

      // Update parent campaign stats
      const { data: remaining } = await supabase
        .from('campaign_recipients')
        .select('status')
        .eq('campaign_id', recipient.campaign_id);

      const statuses = (remaining || []).map(r => r.status);
      const queued = statuses.filter(s => ['queued', 'sending', 'pending'].includes(s)).length;
      const sent = statuses.filter(s => s === 'sent').length;
      const failed = statuses.filter(s => s === 'failed').length;

      await supabase.from('campaigns').update({
        total_recipients: statuses.length,
        queued_count: queued,
        sent_count: sent,
        failed_count: failed
      }).eq('id', recipient.campaign_id);

      await logAudit(supabase, actor.email, 'recipient_activity_deleted', 'campaign_recipient', id, {
        email: recipient.recipient_email,
        campaignId: recipient.campaign_id
      });

      return sendJson(res, 200, { success: true, id, message: 'Activity record deleted.' });
    } catch (error) {
      console.error('Email recipient delete failed:', error.message);
      return sendJson(res, 500, { error: 'Failed to delete email activity record.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { data: recipient, error: readError } = await supabase.from('campaign_recipients').select('id,campaign_id,status,recipient_email,attempts').eq('id', id).maybeSingle();
      if (readError) throw readError;
      if (!recipient) return sendJson(res, 404, { error: 'Recipient not found.' });
      if (recipient.status !== 'failed') return sendJson(res, 409, { error: 'Only failed emails can be retried.' });
      const { data: suppression, error: suppressionError } = await supabase.from('suppression_list').select('id').eq('email', normalizeEmail(recipient.recipient_email)).maybeSingle();
      if (suppressionError) throw suppressionError;
      if (suppression) return sendJson(res, 409, { error: 'This recipient is suppressed and cannot be retried.' });
      const { error: updateError } = await supabase.from('campaign_recipients').update({ status: 'queued', attempts: 0, error_message: null, available_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', recipient.id);
      if (updateError) throw updateError;
      await supabase.from('campaigns').update({ status: 'queued', completed_at: null }).eq('id', recipient.campaign_id);
      await logAudit(supabase, actor.email, 'email_retry_queued', 'campaign_recipient', recipient.id);
      return sendJson(res, 200, { success: true, status: 'queued' });
    } catch (error) {
      console.error('Email retry failed:', error.message);
      return sendJson(res, 500, { error: 'The email could not be queued for retry.' });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed.' });
}
