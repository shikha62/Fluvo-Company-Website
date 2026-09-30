import { authorize, getSupabase, logAudit, readSettings, sendJson } from '../_automation.js';
import { executeCampaign } from '../campaign-runner.js';
import { companyDomainFromEmail, companyNameFromDomain } from '../../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  const id = req.query.id;
  if (!id) return sendJson(res, 400, { error: 'Campaign id is required.' });

  try {
    const supabase = getSupabase();
    if (req.method === 'GET') {
      const [{ data: campaign, error }, { data: recipientRows, error: recipientsError }] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', id).maybeSingle(),
        supabase.from('campaign_recipients').select('*').eq('campaign_id', id).order('created_at')
      ]);
      if (error || recipientsError) throw error || recipientsError;
      if (!campaign) return sendJson(res, 404, { error: 'Campaign not found.' });

      const leadIds = [...new Set((recipientRows || []).map(row => row.lead_id).filter(Boolean))];
      const { data: leads, error: leadsError } = leadIds.length
        ? await supabase.from('leads').select('id,company_name,first_name,company_domain').in('id', leadIds)
        : { data: [], error: null };
      if (leadsError) throw leadsError;

      const leadMap = new Map((leads || []).map(lead => [lead.id, lead]));
      const recipients = (recipientRows || []).map(row => {
        const lead = leadMap.get(row.lead_id) || {};
        const domain = lead.company_domain || companyDomainFromEmail(row.recipient_email);
        const companyName = lead.company_name || (domain ? companyNameFromDomain(domain) : '—');
        return {
          ...row,
          company_name: companyName,
          companyDomain: domain,
          first_name: lead.first_name || 'there'
        };
      });

      let queueMessage = '';
      if (['queued', 'running'].includes(campaign.status) && recipients.some(row => row.status === 'queued')) {
        const settings = await readSettings(supabase);
        const now = Date.now();
        const [{ count: hourlySent }, { count: dailySent }] = await Promise.all([
          supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(now - 3600000).toISOString()),
          supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(now - 86400000).toISOString())
        ]);
        if ((dailySent || 0) >= settings.maxEmailsPerDay) queueMessage = 'Daily sending limit reached. Remaining emails have been retained in the queue.';
        else if ((hourlySent || 0) >= settings.maxEmailsPerHour) queueMessage = 'Hourly sending limit reached. Remaining emails have been retained in the queue.';
      }
      return sendJson(res, 200, { campaign, recipients, queueMessage });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    const action = req.body?.action;
    const { data: campaign, error: readError } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!campaign) return sendJson(res, 404, { error: 'Campaign not found.' });

    if (action === 'launch') {
      const { count: recipientCount, error: recipientCountError } = await supabase
        .from('campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id);
      if (recipientCountError) throw recipientCountError;
      if (!recipientCount) return sendJson(res, 409, { error: 'This draft has no recipients. Add recipients and create a new draft before launching.' });

      // Duplicate send protection / idempotency
      if (campaign.status === 'completed') {
        const { data: unsent } = await supabase
          .from('campaign_recipients')
          .select('id')
          .eq('campaign_id', id)
          .in('status', ['pending', 'queued', 'failed']);
        if (!unsent?.length) {
          return sendJson(res, 200, {
            campaign,
            skipped: campaign.sent_count,
            message: 'Already sent — skipped'
          });
        }
      }

      if (!campaign.compliance_confirmed) {
        return sendJson(res, 400, { error: 'Confirm responsible business outreach before launch.' });
      }

      await logAudit(supabase, actor.email, 'campaign_launch_initiated', 'campaign', id);

      // Execute campaign email sending pipeline directly
      const result = await executeCampaign(supabase, id, { actor: actor.email });

      const response = {
        success: result.success !== false,
        campaign: result.campaign,
        processed: result.processed,
        sent: result.sent,
        failed: result.failed,
        persistenceFailed: result.persistenceFailed || 0,
        skipped: result.skipped ?? 0,
        suppressed: result.suppressed,
        message: result.persistenceFailed
          ? 'SMTP accepted a message, but its activity update failed. Do not retry until the record is reconciled.'
          : result.message || `Campaign finished: ${result.sent} sent, ${result.failed} failed.`
      };
      return sendJson(res, result.success === false ? 500 : 200, response);
    }

    if (action === 'pause' && ['queued', 'running'].includes(campaign.status)) {
      const { data, error } = await supabase.from('campaigns').update({ status: 'paused' }).eq('id', id).select('*').single();
      if (error) throw error;
      await logAudit(supabase, actor.email, 'campaign_paused', 'campaign', id);
      return sendJson(res, 200, { campaign: data });
    }

    if (action === 'resume' && ['paused', 'queued', 'running'].includes(campaign.status)) {
      await logAudit(supabase, actor.email, 'campaign_resumed', 'campaign', id);
      const result = await executeCampaign(supabase, id, { actor: actor.email });
      return sendJson(res, 200, { campaign: result.campaign, ...result });
    }

    if (action === 'cancel' && ['draft', 'queued', 'paused'].includes(campaign.status)) {
      await supabase.from('campaign_recipients').update({ status: 'failed', error_message: 'Campaign cancelled by administrator.' }).eq('campaign_id', id).eq('status', 'queued');
      const { data, error } = await supabase.from('campaigns').update({ status: 'cancelled' }).eq('id', id).select('*').single();
      if (error) throw error;
      await logAudit(supabase, actor.email, 'campaign_cancelled', 'campaign', id);
      return sendJson(res, 200, { campaign: data });
    }

    return sendJson(res, 409, { error: 'That action is not valid for the campaign’s current status.' });
  } catch (error) {
    console.error('Email campaign action failed:', error.message);
    return sendJson(res, 500, { error: error.message || 'Campaign action failed. Check the server logs.' });
  }
}
