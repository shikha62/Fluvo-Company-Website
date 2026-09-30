import {
  EmailProvider,
  getProviderConfig,
  logAudit,
  readSettings,
  classifySuppressionReason,
  sanitizedProviderError,
  sendRenderedEmail
} from './_automation.js';
import { isValidEmail, normalizeEmail } from '../../email-automation/personalization.js';

/**
 * Executes sending for a campaign's eligible recipients.
 * Enforces:
 * - Duplicate send protection (already 'sent' recipients are skipped)
 * - Suppression checks (suppressed recipients are updated with reason and skipped)
 * - State machine (pending/queued -> sending -> sent / failed)
 * - Attempt increment on every actual send attempt
 * - Non-blocking continuation (one failed recipient does not stop the campaign)
 * - Concurrency control & polite SMTP spacing
 * - Accurate database updates for both recipients and campaign
 */
export async function executeCampaign(supabase, campaignId, options = {}) {
  const actor = options.actor || 'admin';
  const delayMs = options.delayMs ?? 150;

  console.log(`[CAMPAIGN EXECUTE START] campaignId: ${campaignId}, actor: ${actor}`);

  // 1. Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignError) throw campaignError;
  if (!campaign) throw new Error('Campaign not found.');

  // 2. Load all recipients for the campaign
  const { data: allRecipients, error: recError } = await supabase
    .from('campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  if (recError) throw recError;
  if (!allRecipients || !allRecipients.length) {
    return { success: true, processed: 0, sent: 0, failed: 0, message: 'Campaign has no recipients.', campaign };
  }

  // 3. Separate already sent from eligible.
  // Include 'suppressed' so that if an admin removes a suppression record after
  // a draft was created, re-launching re-evaluates the live suppression_list
  // rather than leaving recipients permanently stuck in the suppressed state.
  const alreadySent = allRecipients.filter(r => r.status === 'sent');
  const eligible = allRecipients.filter(r => ['pending', 'queued', 'failed', 'suppressed'].includes(r.status));

  if (!eligible.length) {
    console.log(`[CAMPAIGN EXECUTE] All recipients already sent (${alreadySent.length}) — skipped.`);
    return {
      success: true,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: allRecipients.length,
      message: alreadySent.length === allRecipients.length
        ? 'All recipients already sent — skipped.'
        : 'No recipients are eligible to send.',
      campaign
    };
  }

  // 4. Check suppression list for all eligible emails
  const eligibleEmails = [...new Set(eligible.map(r => normalizeEmail(r.recipient_email)))];
  const { data: suppressedRows, error: suppError } = await supabase
    .from('suppression_list')
    .select('email, reason')
    .in('email', eligibleEmails);

  if (suppError) throw suppError;

  const suppressionMap = new Map((suppressedRows || []).map(row => [normalizeEmail(row.email), row.reason]));
  const adminSuppressedCount = eligible.filter(recipient => {
    const reason = suppressionMap.get(normalizeEmail(recipient.recipient_email));
    return reason && classifySuppressionReason(reason).status === 'suppressed';
  }).length;

  // Handle suppressed recipients
  const toSend = [];
  for (const recipient of eligible) {
    const emailLower = normalizeEmail(recipient.recipient_email);
    if (suppressionMap.has(emailLower)) {
      const suppression = classifySuppressionReason(suppressionMap.get(emailLower));
      console.log(`[CAMPAIGN RECIPIENT BLOCKED] ${recipient.recipient_email} - Reason: ${suppression.reason}`);
      await supabase
        .from('campaign_recipients')
        .update({
          status: suppression.status,
          attempts: 0,
          error_message: suppression.reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', recipient.id);

      await supabase.from('email_events').insert({
        campaign_recipient_id: recipient.id,
        event_type: suppression.status,
        metadata: { reason: suppression.reason }
      });
    } else if (!isValidEmail(recipient.recipient_email)) {
      console.log(`[CAMPAIGN RECIPIENT INVALID] ${recipient.recipient_email}`);
      await supabase
        .from('campaign_recipients')
        .update({
          status: 'invalid',
          error_message: 'Invalid recipient email syntax.',
          updated_at: new Date().toISOString()
        })
        .eq('id', recipient.id);
    } else {
      toSend.push(recipient);
    }
  }

  if (!toSend.length) {
    const refreshed = await updateCampaignTotals(supabase, campaignId);
    return {
      success: true,
      processed: 0,
      sent: 0,
      failed: 0,
      suppressed: adminSuppressedCount,
      message: 'No remaining recipients eligible to send.',
      campaign: refreshed
    };
  }

  // 5. Verify email provider configuration
  const settings = await readSettings(supabase);
  const providerConfig = options.provider ? null : getProviderConfig();
  let providerClient = options.provider || null;
  const providerConfigurationError = !options.provider && !providerConfig.configured
    ? providerConfig.error
    : null;

  // 6. Mark campaign running
  await supabase
    .from('campaigns')
    .update({
      status: 'running',
      started_at: campaign.started_at || new Date().toISOString()
    })
    .eq('id', campaignId);

  let sentCount = 0;
  let failedCount = 0;
  let claimedCount = 0;
  let persistenceFailedCount = 0;

  try {
    // 7. Controlled sequential processing with polite delay
    for (let i = 0; i < toSend.length; i++) {
      const recipient = toSend[i];

      // Check if campaign was paused mid-run
      const { data: currentCampaign } = await supabase
        .from('campaigns')
        .select('status')
        .eq('id', campaignId)
        .maybeSingle();

      if (currentCampaign?.status === 'paused') {
        console.log(`[CAMPAIGN PAUSED] Execution paused at recipient #${i + 1}`);
        break;
      }

      const nextAttempt = (recipient.attempts || 0) + 1;

      // Claim with compare-and-set so overlapping launches cannot send twice.
      const { data: claimedRecipient, error: claimError } = await supabase
        .from('campaign_recipients')
        .update({
          status: 'sending',
          attempts: nextAttempt,
          updated_at: new Date().toISOString()
        })
        .eq('id', recipient.id)
        .eq('status', recipient.status)
        .select('id')
        .maybeSingle();

      if (claimError) {
        console.error(`[CAMPAIGN CLAIM FAILED] recipientId: ${recipient.id}, code: ${String(claimError.code || 'DATABASE_ERROR')}`);
        continue;
      }
      if (!claimedRecipient) continue;
      claimedCount++;

      console.log(`[CAMPAIGN SENDING] (#${i + 1}/${toSend.length}) ${recipient.recipient_email} - Attempt ${nextAttempt}`);

      let smtpAccepted = false;
      try {
        if (!providerClient) {
          if (providerConfigurationError) throw providerConfigurationError;
          providerClient = new EmailProvider(providerConfig);
        }
        const sendResult = await sendRenderedEmail({
          recipient: recipient.recipient_email,
          subject: recipient.personalized_subject,
          body: recipient.personalized_body,
          settings,
          provider: providerClient,
          isTest: false,
          campaignId: campaign.id,
          recipientId: recipient.id
        });
        smtpAccepted = true;

        const now = new Date().toISOString();
        const { data: sentRecipient, error: sentUpdateError } = await supabase
          .from('campaign_recipients')
          .update({
            status: 'sent',
            provider_message_id: sendResult?.messageId || null,
            sent_at: now,
            error_message: null,
            updated_at: now
          })
          .eq('id', recipient.id)
          .eq('status', 'sending')
          .select('id')
          .maybeSingle();
        if (sentUpdateError || !sentRecipient) {
          const persistenceError = new Error('SMTP accepted the message, but campaign activity could not be saved. Do not retry until the record is reconciled.');
          persistenceError.code = 'EMAIL_ACTIVITY_PERSISTENCE_FAILED';
          persistenceError.databaseCode = sentUpdateError?.code;
          throw persistenceError;
        }

        const { error: eventError } = await supabase.from('email_events').insert({
          campaign_recipient_id: recipient.id,
          event_type: 'sent',
          provider_event_id: sendResult?.messageId || null,
          metadata: {}
        });
        if (eventError) console.warn(`Email sent; activity event insert failed: ${String(eventError.code || 'DATABASE_ERROR')}`);

        sentCount++;
        console.log(`[CAMPAIGN SENT] ${recipient.recipient_email} - messageId: ${sendResult?.messageId || 'unknown'}`);
      } catch (sendErr) {
        if (smtpAccepted) {
          persistenceFailedCount++;
          console.error(`[CAMPAIGN ACTIVITY PERSISTENCE FAILED] recipientId: ${recipient.id}, code: ${String(sendErr.databaseCode || sendErr.code || 'DATABASE_ERROR')}`);
          continue;
        }

        const safeError = sanitizedProviderError(sendErr);
        console.error(`[CAMPAIGN SEND FAILED] ${recipient.recipient_email}: ${safeError}`);

        const now = new Date().toISOString();
        await supabase
          .from('campaign_recipients')
          .update({
            status: 'failed',
            provider_message_id: null,
            sent_at: null,
            error_message: safeError,
            updated_at: now
          })
          .eq('id', recipient.id);

        await supabase.from('email_events').insert({
          campaign_recipient_id: recipient.id,
          event_type: 'failed',
          metadata: { attempt: nextAttempt, error: safeError }
        });

        failedCount++;
        // ONE FAILED RECIPIENT MUST NOT STOP THE ENTIRE CAMPAIGN: CONTINUE!
      }

      // Small polite delay between emails if not the last one
      if (i < toSend.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    providerClient?.close();
  }

  // 8. Update campaign totals and final status
  const updatedCampaign = await updateCampaignTotals(supabase, campaignId);

  await logAudit(supabase, actor, 'campaign_executed', 'campaign', campaignId, {
    sent: sentCount,
    failed: failedCount,
    suppressed: adminSuppressedCount,
    total: claimedCount
  });

  console.log(`[CAMPAIGN EXECUTE FINISHED] campaignId: ${campaignId}, sent: ${sentCount}, failed: ${failedCount}`);

  return {
    success: persistenceFailedCount === 0,
    processed: claimedCount,
    sent: sentCount,
    failed: failedCount,
    persistenceFailed: persistenceFailedCount,
    skipped: allRecipients.length - claimedCount,
    suppressed: suppressionMap.size,
    campaign: updatedCampaign
  };
}

async function updateCampaignTotals(supabase, campaignId) {
  const { data: rows } = await supabase
    .from('campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);

  const statuses = rows || [];
  const queued = statuses.filter(r => ['queued', 'sending', 'pending'].includes(r.status)).length;
  const sent = statuses.filter(r => r.status === 'sent').length;
  const failed = statuses.filter(r => r.status === 'failed').length;
  const isCompleted = queued === 0;

  const finalStatus = isCompleted
    ? (sent === 0 && failed > 0 ? 'failed' : 'completed')
    : 'running';

  const { data: updated } = await supabase
    .from('campaigns')
    .update({
      total_recipients: statuses.length,
      queued_count: queued,
      sent_count: sent,
      failed_count: failed,
      status: finalStatus,
      ...(isDoneCompleted(isCompleted) ? { completed_at: new Date().toISOString() } : {})
    })
    .eq('id', campaignId)
    .select('*')
    .single();

  return updated;
}

function isDoneCompleted(isCompleted) {
  return Boolean(isCompleted);
}
