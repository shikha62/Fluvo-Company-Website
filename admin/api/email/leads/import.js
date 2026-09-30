import { authorize, getSupabase, logAudit, normalizeLead, readSettings, sendJson } from '../_automation.js';
import { isValidEmail } from '../../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (!Array.isArray(req.body?.leads) || req.body.leads.length < 1 || req.body.leads.length > 100) return sendJson(res, 400, { error: 'Import between 1 and 100 leads.' });

  try {
    const supabase = getSupabase();
    const settings = await readSettings(supabase);
    const leads = req.body.leads.map(raw => normalizeLead(raw || {}, settings.companyMappings));
    const invalid = leads.filter(lead => !isValidEmail(lead.email));
    const seen = new Set();
    const duplicates = [];
    for (const lead of leads) {
      if (lead.valid && seen.has(lead.email)) duplicates.push(lead.email);
      if (lead.valid) seen.add(lead.email);
    }
    if (invalid.length || duplicates.length) return sendJson(res, 400, {
      error: 'Import contains invalid or duplicate email addresses.',
      invalid: invalid.map(lead => lead.email), duplicates
    });

    const { data, error } = await supabase.from('leads').upsert(leads.map(lead => ({
      email: lead.email,
      first_name: lead.firstName,
      company_name: lead.companyName,
      company_domain: lead.companyDomain,
      industry: lead.industry || null,
      website: lead.website || null,
      source: 'csv_import',
      updated_at: new Date().toISOString()
    })), { onConflict: 'email' }).select('id,email');
    if (error) throw error;
    await logAudit(supabase, actor.email, 'leads_imported', 'lead_import', null, { count: data?.length || 0 });
    return sendJson(res, 201, { imported: data?.length || 0 });
  } catch (error) {
    console.error('Lead import failed:', error.message);
    return sendJson(res, 500, { error: 'Leads could not be imported. Apply the email automation migration.' });
  }
}