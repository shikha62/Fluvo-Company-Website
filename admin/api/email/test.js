import { authorize, EmailProvider, getProviderConfig, getSupabase, getUnsubscribeUrl, loadActiveTemplate, logAudit, normalizeLead, readSettings, renderLead, sendJson, sendRenderedEmail } from './_automation.js';
import { classifySmtpError } from '@fluvo/email-provider';
import { isValidEmail } from '../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  const input = req.body || {};
  if (!isValidEmail(input.recipient)) return sendJson(res, 400, { error: 'Enter a valid test recipient email.' });
  if (input.template && (String(input.template.subject || '').length > 500 || String(input.template.body || '').length > 30000)) return sendJson(res, 400, { error: 'Template exceeds the supported length.' });

  let provider;
  try {
    const supabase = getSupabase();
    const settings = await readSettings(supabase);
    const config = getProviderConfig();
    provider = new EmailProvider(config);
    await provider.verifyConnection();
    const template = input.template || await loadActiveTemplate(supabase, input.templateId);
    const lead = normalizeLead(input.lead || { email: 'preview@example.com', first_name: 'there' }, settings.companyMappings);
    const testRecipient = input.recipient || settings.testEmailRecipient;
    if (!isValidEmail(testRecipient)) return sendJson(res, 400, { error: 'Enter a valid test recipient email.' });
    const rendered = renderLead(template, lead, settings, getUnsubscribeUrl(testRecipient));
    if (!rendered.valid) return sendJson(res, 400, { error: 'Personalization incomplete.', missing: rendered.unresolved });
    const result = await sendRenderedEmail({
      recipient: testRecipient,
      subject: rendered.subject,
      body: rendered.body,
      settings,
      provider,
      isTest: true
    });
    await logAudit(supabase, actor.email, 'test_email_sent', 'email', result.messageId, { recipient: testRecipient });
    return sendJson(res, 200, { success: true, recipient: testRecipient, messageId: result.messageId });
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    console.warn(`Test email failed: ${diagnostic.stage} ${diagnostic.code}`);
    return sendJson(res, 502, { success: false, ...diagnostic });
  } finally {
    provider?.close();
  }
}