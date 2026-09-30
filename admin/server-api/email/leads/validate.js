import { authorize, classifySuppressionReason, databaseSetupMessage, getSupabase, normalizeLead, readSettings, sendJson } from '../_automation.js';
import { isValidEmail, normalizeEmail } from '../../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!Array.isArray(req.body?.leads) || req.body.leads.length > 100) return sendJson(res, 400, { error: 'Provide no more than 100 recipients.' });

  try {
    const supabase = getSupabase();
    const settings = await readSettings(supabase);
    const seen = new Set();
    const emails = req.body.leads.map(row => normalizeEmail(row?.email)).filter(isValidEmail);
    const unique = [...new Set(emails)];
    const [{ data: suppressed, error: suppressedError }, { data: leads, error: leadsError }] = await Promise.all([
      unique.length ? supabase.from('suppression_list').select('email,reason').in('email', unique) : Promise.resolve({ data: [], error: null }),
      unique.length ? supabase.from('leads').select('id,email').in('email', unique) : Promise.resolve({ data: [], error: null })
    ]);
    if (suppressedError || leadsError) throw suppressedError || leadsError;
    const suppressionMap = new Map((suppressed || []).map(row => [normalizeEmail(row.email), classifySuppressionReason(row.reason)]));
    const existingByEmail = new Map((leads || []).map(row => [normalizeEmail(row.email), row.id]));
    const existingIds = [...existingByEmail.values()];
    const { data: previous, error: previousError } = existingIds.length
      ? await supabase.from('campaign_recipients').select('lead_id,status').in('lead_id', existingIds).in('status', ['sent', 'bounced', 'queued', 'sending'])
      : { data: [], error: null };
    if (previousError) throw previousError;
    const contactedIds = new Set((previous || []).map(row => row.lead_id));

    const allowRecontact = req.body?.allowRecontact !== false;
    const rows = req.body.leads.map(raw => {
      const lead = normalizeLead(raw || {}, settings.companyMappings);
      const duplicate = lead.valid && seen.has(lead.email);
      if (lead.valid) seen.add(lead.email);
      const id = existingByEmail.get(lead.email);
      const suppression = suppressionMap.get(lead.email);
      let status = !lead.valid ? 'invalid' : duplicate ? 'duplicate' : suppression ? suppression.status : (!allowRecontact && id && contactedIds.has(id)) ? 'already_contacted' : 'ready';
      return { ...lead, status };
    });
    return sendJson(res, 200, { recipients: rows, total: rows.length, counts: summarizeRecipients(rows) });
  } catch (error) {
    console.error('Lead validation failed:', error.message);
    const setupMessage = databaseSetupMessage(error);
    return sendJson(res, 500, { error: setupMessage || 'Recipients could not be validated. Check the server logs and Supabase configuration.' });
  }
}

export function summarizeRecipients(rows) {
  const counts = { ready: 0, invalid: 0, duplicate: 0, suppressed: 0, already_contacted: 0 };
  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) counts[row.status]++;
  }
  return counts;
}