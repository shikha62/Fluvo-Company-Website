import crypto from 'node:crypto';
import {
  EmailProvider,
  getProviderConfig,
  getSupabase,
  logAudit,
  classifySuppressionReason,
  readSettings,
  sanitizedProviderError,
  sendJson,
  sendRenderedEmail
} from './_automation.js';
import { normalizeEmail } from '../../email-automation/personalization.js';

function hasWorkerSecret(req) {
  const secret = process.env.EMAIL_WORKER_SECRET || process.env.CRON_SECRET;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || supplied.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!hasWorkerSecret(req)) return sendJson(res, 401, { error: 'Unauthorized worker request.' });
  const supabase = getSupabase();
  let providerClient;
  let providerVerified = false;
  let providerAccepted = false;
  let activeRecipient = null;
  let activeCampaignId = null;
  try {
    const settings = await readSettings(supabase);
    const { data: activeCampaigns, error: campaignsError } = await supabase.from('campaigns').select('id').in('status', ['queued', 'running']).limit(100);
    if (campaignsError) throw new Error('queue_unavailable');
    const activeCampaignIds = (activeCampaigns || []).map(campaign => campaign.id);
    if (!activeCampaignIds.length) return sendJson(res, 200, { processed: 0, message: 'No active campaigns.' });
    const { data: queued, error: queuedError } = await supabase.from('campaign_recipients').select('id').eq('status', 'queued').in('campaign_id', activeCampaignIds).limit(1);
    if (queuedError) throw new Error('queue_unavailable');
    if (!queued?.length) return sendJson(res, 200, { processed: 0, message: 'No queued recipients in active campaigns.' });
    const provider = getProviderConfig();
    if (!provider.configured) throw new Error('provider_unavailable');
    providerClient = new EmailProvider(provider);
    await providerClient.verifyConnection();
    providerVerified = true;

    const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await supabase.from('campaign_recipients').update({ status: 'failed', error_message: 'Delivery status is uncertain after an interrupted worker. Verify provider activity before retrying.', updated_at: new Date().toISOString() })
      .eq('status', 'sending').lt('updated_at', staleBefore);

    const { data: claimed, error: claimError } = await supabase.rpc('claim_email_automation_recipient', {
      p_hour_limit: settings.maxEmailsPerHour,
      p_day_limit: settings.maxEmailsPerDay,
      p_delay_seconds: settings.delaySeconds
    });
    if (claimError) throw new Error('queue_unavailable');
    const recipient = claimed?.[0];
    if (!recipient) {
      await finishEmptyCampaigns(supabase);
      const now = Date.now();
      const [{ count: hourlySent }, { count: dailySent }] = await Promise.all([
        supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(now - 3600000).toISOString()),
        supabase.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(now - 86400000).toISOString())
      ]);
      const message = (dailySent || 0) >= settings.maxEmailsPerDay
        ? 'Daily sending limit reached. Remaining emails have been retained in the queue.'
        : (hourlySent || 0) >= settings.maxEmailsPerHour
          ? 'Hourly sending limit reached. Remaining emails have been retained in the queue.'
          : 'No recipient is currently eligible; queued emails are retained.';
      return sendJson(res, 200, { processed: 0, message });
    }
    activeRecipient = recipient;
    activeCampaignId = recipient.campaign_id;

    const [{ data: campaign, error: campaignError }, { data: suppression, error: suppressionError }] = await Promise.all([
      supabase.from('campaigns').select('id,name,test_mode').eq('id', recipient.campaign_id).single(),
      supabase.from('suppression_list').select('id,reason').eq('email', normalizeEmail(recipient.recipient_email)).maybeSingle()
    ]);
    if (campaignError || suppressionError) throw new Error('database_unavailable');
    if (suppression) {
      const classification = classifySuppressionReason(suppression.reason);
      await supabase.from('campaign_recipients').update({ status: classification.status, attempts: 0, error_message: classification.reason, updated_at: new Date().toISOString() }).eq('id', recipient.id);
      await supabase.from('email_events').insert({
        campaign_recipient_id: recipient.id,
        event_type: classification.status,
        metadata: { reason: classification.reason }
      });
      await refreshCampaign(supabase, campaign.id);
      return sendJson(res, 200, { processed: 1, status: classification.status });
    }

    const result = await sendRenderedEmail({
      recipient: recipient.recipient_email,
      subject: recipient.personalized_subject,
      body: recipient.personalized_body,
      settings,
      provider: providerClient,
      isTest: false,
      campaignId: campaign.id,
      recipientId: recipient.id
    });
    providerAccepted = true;
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('campaign_recipients').update({
      status: 'sent', provider_message_id: result.messageId, sent_at: now, error_message: null, updated_at: now
    }).eq('id', recipient.id);
    if (updateError) throw new Error('database_unavailable');
    await supabase.from('email_events').insert({ campaign_recipient_id: recipient.id, event_type: 'sent', provider_event_id: result.messageId, metadata: {} });
    await logAudit(supabase, 'system', 'email_sent', 'campaign_recipient', recipient.id, { campaignId: campaign.id });
    await refreshCampaign(supabase, campaign.id);
    return sendJson(res, 200, { processed: 1, status: 'sent', campaignId: campaign.id });
  } catch (error) {
    const code = String(error?.code || '');
    const uncertainDelivery = activeRecipient && (providerAccepted || ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION'].includes(code));
    if (uncertainDelivery) {
      const message = 'Delivery outcome is uncertain. Verify provider activity before retrying to avoid duplicate mail.';
      await supabase.from('campaign_recipients').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', activeRecipient.id);
      await supabase.from('campaigns').update({ status: 'paused' }).in('status', ['queued', 'running']);
      await supabase.from('email_events').insert({ campaign_recipient_id: activeRecipient.id, event_type: 'delivery_uncertain', metadata: { errorCode: code || 'database_error' } });
      await logAudit(supabase, 'system', 'email_delivery_uncertain', 'campaign_recipient', activeRecipient.id, { errorCode: code || 'database_error' });
      await refreshCampaign(supabase, activeCampaignId);
      return sendJson(res, 503, { processed: 0, error: message });
    }
    const providerUnavailable = error.stage === 'authentication' || ['SMTP_AUTH_FAILED', 'SMTP_AUTH_COOLDOWN'].includes(code) || !providerVerified || !getProviderConfig().configured || ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ETLS'].includes(code);
    console.error('Email automation worker stopped:', providerUnavailable ? (code || 'provider_unavailable') : 'processing_error');
    if (providerUnavailable) {
      await supabase.from('campaigns').update({ status: 'paused' }).in('status', ['queued', 'running']);
      await supabase.from('campaign_recipients').update({ status: 'queued', error_message: sanitizedProviderError(error), updated_at: new Date().toISOString() }).eq('status', 'sending');
      const errorMessage = 'Email provider unavailable. Campaigns paused; queued emails are retained.';
      return sendJson(res, 503, { processed: 0, error: errorMessage });
    }
    if (activeRecipient) {
      const retry = activeRecipient.attempts < 3 && !(Number(error.responseCode) >= 500);
      const retryAt = new Date(Date.now() + Math.min(3600, 60 * (2 ** activeRecipient.attempts)) * 1000).toISOString();
      await supabase.from('campaign_recipients').update({
        status: retry ? 'queued' : 'failed',
        available_at: retryAt,
        error_message: sanitizedProviderError(error),
        updated_at: new Date().toISOString()
      }).eq('id', activeRecipient.id);
      await supabase.from('email_events').insert({
        campaign_recipient_id: activeRecipient.id,
        event_type: retry ? 'retry_scheduled' : 'failed',
        metadata: { attempt: activeRecipient.attempts, errorCode: code || 'provider_error' }
      });
      await logAudit(supabase, 'system', 'email_failed', 'campaign_recipient', activeRecipient.id, {
        attempt: activeRecipient.attempts, retryScheduled: retry
      });
      if (activeCampaignId) await refreshCampaign(supabase, activeCampaignId);
    }
    return sendJson(res, 503, { processed: 0, error: error.message === 'queue_unavailable' ? 'Email queue unavailable. Apply the migration and verify database access.' : 'Email processing stopped due to a database or delivery error.' });
  } finally {
    providerClient?.close();
  }
}

async function refreshCampaign(supabase, campaignId) {
  const { data: rows } = await supabase.from('campaign_recipients').select('status').eq('campaign_id', campaignId);
  const statuses = rows || [];
  const queued = statuses.filter(row => row.status === 'queued' || row.status === 'sending').length;
  const sent = statuses.filter(row => row.status === 'sent').length;
  const failed = statuses.filter(row => row.status === 'failed').length;
  const completed = queued === 0;
  const finalStatus = sent === 0 && failed > 0 ? 'failed' : 'completed';
  await supabase.from('campaigns').update({
    queued_count: queued,
    sent_count: sent,
    failed_count: failed,
    ...(completed ? { status: finalStatus, completed_at: new Date().toISOString() } : {})
  }).eq('id', campaignId).in('status', ['queued', 'running']);
}

async function finishEmptyCampaigns(supabase) {
  const { data: campaigns, error: campaignError } = await supabase.from('campaigns').select('id').in('status', ['queued', 'running']);
  if (campaignError) return;
  for (const campaign of campaigns || []) {
    const { data: rows, error } = await supabase.from('campaign_recipients').select('status').eq('campaign_id', campaign.id);
    if (error) continue;
    const statuses = rows || [];
    if (statuses.some(row => ['queued', 'sending', 'pending'].includes(row.status))) continue;
    const sent = statuses.filter(row => row.status === 'sent').length;
    const failed = statuses.filter(row => row.status === 'failed').length;
    await supabase.from('campaigns').update({
      status: sent === 0 && failed > 0 ? 'failed' : 'completed',
      sent_count: sent,
      failed_count: failed,
      queued_count: 0,
      completed_at: new Date().toISOString()
    }).eq('id', campaign.id).in('status', ['queued', 'running']);
  }
}