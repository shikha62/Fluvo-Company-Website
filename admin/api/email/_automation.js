import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SmtpService, classifySmtpError, loadSmtpConfig } from '@fluvo/email-provider';
import { requireAuth, setSecurityHeaders } from '../_auth.js';
import { DEFAULT_FALLBACKS, DEFAULT_TEMPLATE, isValidEmail, normalizeEmail, parseLeadEmail, renderTemplate } from '../../email-automation/personalization.js';

export { classifySmtpError };
export const SENDER_EMAIL = 'connect@fluvo.in';
export const EmailProvider = SmtpService;
export const getProviderConfig = loadSmtpConfig;

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key || /your-|placeholder|\.\.\./i.test(key)) {
    throw new Error('Email Automation needs a valid server-only SUPABASE_SERVICE_ROLE_KEY in admin/.env.local. No usable service key is configured.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function databaseSetupMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  if (message.includes('invalid api key') || message.includes('invalid jwt') || message.includes('api key')) {
    return 'Supabase rejected the API key. Set a valid SUPABASE_SERVICE_ROLE_KEY in admin/.env.local.';
  }
  if (code === 'PGRST205' || code === '42P01' || message.includes('does not exist') || message.includes('schema cache') || message.includes('automation tables are missing')) {
    return 'Email automation tables are missing. Apply admin/migrations/20260927_email_automation.sql in the Supabase SQL Editor.';
  }
  if (message.includes('supabase_service_role_key')) return error.message;
  return '';
}

export function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

export function authorize(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const origin = req.headers.origin;
    const host = req.headers.host;
    try {
      if (origin && host && new URL(origin).host !== host) {
        sendJson(res, 403, { error: 'Request origin is not allowed.' });
        return null;
      }
    } catch {
      sendJson(res, 403, { error: 'Request origin is not allowed.' });
      return null;
    }
  }
  const payload = requireAuth(req, res);
  if (!payload) return null;
  if (!['admin', 'executive_owner'].includes(payload.role)) {
    sendJson(res, 403, { error: 'Administrator access is required.' });
    return null;
  }
  return payload;
}

export function getAutomationSettings(data = {}) {
  const envTestMode = process.env.EMAIL_TEST_MODE;
  const isEnvExplicit = envTestMode === 'true' || envTestMode === 'false';
  const testMode = isEnvExplicit ? envTestMode === 'true' : Boolean(data.test_mode);
  return {
    testMode,
    testEmailRecipient: configuredValue(process.env.TEST_EMAIL_RECIPIENT) || configuredValue(data.test_email_recipient) || '',
    maxEmailsPerHour: positiveInt(process.env.EMAIL_RATE_LIMIT_PER_HOUR, data.max_emails_per_hour || 10),
    maxEmailsPerDay: positiveInt(process.env.EMAIL_RATE_LIMIT_PER_DAY, data.max_emails_per_day || 50),
    delaySeconds: nonnegativeInt(process.env.EMAIL_DELAY_SECONDS, data.delay_seconds ?? 60),
    fallbacks: { ...DEFAULT_FALLBACKS, ...(data.fallbacks || {}) },
    companyMappings: data.company_mappings || {}
  };
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createUnsubscribeToken(email) {
  const secret = getUnsubscribeSigningKey();
  if (!secret) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured.');
  const normalized = normalizeEmail(email);
  const encoded = Buffer.from(normalized).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyUnsubscribeToken(token) {
  const [encoded, signature, ...extra] = String(token || '').split('.');
  const secret = getUnsubscribeSigningKey();
  if (!encoded || !signature || extra.length || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  const email = normalizeEmail(Buffer.from(encoded, 'base64url').toString('utf8'));
  return isValidEmail(email) ? email : null;
}

function getUnsubscribeSigningKey() {
  const configuredSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (configuredSecret) return configuredSecret;
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) return null;
  return crypto.createHmac('sha256', jwtSecret).update('fluvo-email-unsubscribe-v1').digest();
}

export function getUnsubscribeUrl(email) {
  try {
    const baseUrl = process.env.ADMIN_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://admin.fluvo.in';
    return `${baseUrl.replace(/\/$/, '')}/api/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(email))}`;
  } catch {
    // Missing signing key — unsubscribe link unavailable; List-Unsubscribe header will be omitted
    return '';
  }
}

export function renderLead(template, lead, settings, unsubscribeUrl) {
  return renderTemplate(template, lead, {
    fallbacks: settings.fallbacks,
    unsubscribeUrl,
    senderName: process.env.EMAIL_FROM_NAME || 'Fluvo',
    senderDesignation: 'Technology-Driven Digital Growth & Performance Engineering'
  });
}

export async function logAudit(supabase, actor, action, entityType, entityId, metadata = {}) {
  const { error } = await supabase.from('audit_logs').insert({
    actor: actor || 'system', action, entity_type: entityType, entity_id: entityId || null, metadata
  });
  if (error) console.error('Email automation audit write failed:', error.message);
}

export function sanitizedProviderError(error) {
  return classifySmtpError(error).message;
}

export function classifySuppressionReason(reason) {
  const value = String(reason || '').trim().toLowerCase();
  if (value === 'administrator_suppression' || (value.includes('administrator') && value.includes('suppress'))) {
    return { status: 'suppressed', reason: 'administrator_suppression' };
  }
  if (value === 'recipient_unsubscribe' || value.includes('unsubscribe')) {
    return { status: 'unsubscribed', reason: 'unsubscribe' };
  }
  if (value === 'hard_bounce' || value.includes('bounce')) {
    return { status: 'bounced', reason: 'hard_bounce' };
  }
  return { status: 'failed', reason: String(reason || 'provider_suppression').slice(0, 120) };
}

export async function loadActiveTemplate(supabase, templateId) {
  let query = supabase.from('email_templates').select('id,name,subject,body,is_active');
  query = templateId ? query.eq('id', templateId) : query.eq('is_active', true).order('created_at', { ascending: true }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(databaseSetupMessage(error) || 'Could not load the email template.');
  return data || { ...DEFAULT_TEMPLATE, id: null, is_active: true };
}

export function normalizeLead(raw, companyMappings) {
  return parseLeadEmail(raw.email, {
    first_name: raw.first_name || raw.firstName,
    full_name: raw.full_name || raw.fullName,
    company_name: raw.company_name || raw.companyName,
    industry: raw.industry,
    website: raw.website,
    opportunity_1: raw.opportunity_1 || raw.opportunity1,
    opportunity_2: raw.opportunity_2 || raw.opportunity2,
    opportunity_3: raw.opportunity_3 || raw.opportunity3
  }, { companyMappings });
}

export async function readSettings(supabase) {
  const { data, error } = await supabase.from('email_automation_settings').select('*').eq('id', 'default').maybeSingle();
  if (error) throw new Error(databaseSetupMessage(error) || 'Could not load email automation settings.');
  return getAutomationSettings(data || {});
}

export async function sendRenderedEmail({
  recipient,
  subject,
  body,
  settings = {},
  provider = new EmailProvider(),
  isTest = false,
  campaignId = null,
  recipientId = null
}) {
  const isTestSend = Boolean(isTest);
  let to;
  if (isTestSend) {
    to = recipient || settings?.testEmailRecipient;
    if (!isValidEmail(to)) {
      throw new Error('Test send recipient is invalid or TEST_EMAIL_RECIPIENT is not configured.');
    }
  } else {
    to = recipient;
    if (!isValidEmail(to)) {
      throw new Error(`Campaign recipient email is invalid: ${recipient}`);
    }
  }

  const normalizedSubject = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  const emailSubject = isTestSend && !normalizedSubject.startsWith('[TEST]') ? `[TEST] ${normalizedSubject}` : normalizedSubject;

  // Ensure a valid unsubscribe URL is present in the body for campaign sends
  let finalBody = String(body || '').replace(/\r\n?/g, '\n');
  if (!isTestSend && isValidEmail(to)) {
    const existingUrl = extractUnsubscribeUrl(body);
    if (!existingUrl) {
      const unsubUrl = getUnsubscribeUrl(to);
      finalBody = finalBody + `\n\nTo unsubscribe from future emails: ${unsubUrl}`;
    }
  }

  const html = finalBody.split(/\n{2,}/).map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');

  const fromAddress = provider.config?.fromAddress || SENDER_EMAIL;
  const mode = isTestSend ? 'test' : 'production';

  console.log(`[EMAIL SEND]\ncampaignId: ${campaignId || 'none'}\nrecipientId: ${recipientId || 'none'}\nmode: ${mode}\nfrom: ${fromAddress}\nto: ${to}\nstatus: sending`);

  // Only add List-Unsubscribe header if we have a valid URL — empty <> causes 5xx rejections
  const unsubscribeUrl = extractUnsubscribeUrl(finalBody);
  const extraHeaders = unsubscribeUrl
    ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : {};

  try {
    const result = await provider.sendEmail({
      to,
      subject: emailSubject,
      text: finalBody,
      html,
      ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {})
    });

    console.log(`[EMAIL SEND]\ncampaignId: ${campaignId || 'none'}\nrecipientId: ${recipientId || 'none'}\nmode: ${mode}\nfrom: ${fromAddress}\nto: ${to}\nstatus: sent\nmessageId: ${result?.messageId || 'unknown'}`);

    return result;
  } catch (error) {
    const safeDiag = sanitizedProviderError(error);
    console.error(`[EMAIL SEND]\ncampaignId: ${campaignId || 'none'}\nrecipientId: ${recipientId || 'none'}\nmode: ${mode}\nfrom: ${fromAddress}\nto: ${to}\nstatus: failed\nerror: ${safeDiag}`);
    throw error;
  }
}

function extractUnsubscribeUrl(body) {
  return body.match(/Unsubscribe:\s*(https?:\/\/\S+)/i)?.[1] || '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function nonnegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function configuredValue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || /^<[^>]+>$/.test(normalized) || /^(your[-_ ]|placeholder\b)/i.test(normalized)) return '';
  return normalized;
}
