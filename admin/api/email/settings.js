import { authorize, databaseSetupMessage, getProviderConfig, getSupabase, logAudit, readSettings, sendJson } from './_automation.js';
import { classifySmtpError } from '@fluvo/email-provider';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  try {
    const supabase = getSupabase();
    if (req.method === 'GET') {
      const settings = await readSettings(supabase);
      const provider = getProviderConfig();
      return sendJson(res, 200, {
        settings,
        provider: {
          configured: provider.configured,
          provider: provider.provider || 'godaddy',
          host: provider.host || 'smtpout.secureserver.net',
          port: provider.port || 465,
          secure: provider.secure ?? true,
          senderEmail: provider.user || 'connect@fluvo.in',
          status: provider.configured ? 'environment_managed' : 'configuration_error',
          ...(provider.configured
            ? { stage: 'configuration', code: 'SMTP_CONFIGURED', message: 'Environment Managed' }
            : classifySmtpError(provider.error))
        },
        forcedTestMode: process.env.EMAIL_TEST_MODE === 'true'
      });
    }
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed.' });
    const input = req.body || {};
    const maxEmailsPerHour = Number(input.maxEmailsPerHour);
    const maxEmailsPerDay = Number(input.maxEmailsPerDay);
    const delaySeconds = Number(input.delaySeconds);
    if (!Number.isInteger(maxEmailsPerHour) || maxEmailsPerHour < 1 || maxEmailsPerHour > 500 ||
        !Number.isInteger(maxEmailsPerDay) || maxEmailsPerDay < 1 || maxEmailsPerDay > 5000 ||
        !Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 86400) {
      return sendJson(res, 400, { error: 'Limits are out of range. Use 1–500/hour, 1–5000/day, and 0–86400 seconds delay.' });
    }
    const fallbacks = input.fallbacks && typeof input.fallbacks === 'object' ? input.fallbacks : {};
    const companyMappings = input.companyMappings && typeof input.companyMappings === 'object' ? input.companyMappings : {};
    const { data, error } = await supabase.from('email_automation_settings').upsert({
      id: 'default',
      test_mode: process.env.EMAIL_TEST_MODE === 'true' ? true : Boolean(input.testMode),
      test_email_recipient: input.testEmailRecipient || null,
      max_emails_per_hour: maxEmailsPerHour,
      max_emails_per_day: maxEmailsPerDay,
      delay_seconds: delaySeconds,
      fallbacks,
      company_mappings: companyMappings,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' }).select('*').single();
    if (error) throw error;
    await logAudit(supabase, actor.email, 'email_settings_updated', 'email_settings', 'default', {
      testMode: data.test_mode, maxEmailsPerHour, maxEmailsPerDay, delaySeconds
    });
    return sendJson(res, 200, { settings: await readSettings(supabase), forcedTestMode: process.env.EMAIL_TEST_MODE === 'true' });
  } catch (error) {
    console.error('Email automation settings failed:', error.message);
    const setupMessage = databaseSetupMessage(error);
    return sendJson(res, 500, { error: setupMessage || 'Email settings could not be loaded or saved. Check the server logs and Supabase configuration.' });
  }
}