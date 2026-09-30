import {
  authorize,
  getSupabase,
  loadActiveTemplate,
  logAudit,
  normalizeLead,
  readSettings,
  classifySuppressionReason,
  renderLead,
  sendJson,
  getUnsubscribeUrl
} from '../_automation.js';
import { isValidEmail, normalizeEmail } from '../../../email-automation/personalization.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;

  try {
    const supabase = getSupabase();
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return sendJson(res, 200, { campaigns: data || [] });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
    const { name, recipients, templateId, complianceConfirmed } = req.body || {};
    if (!String(name || '').trim() || String(name).trim().length > 120) return sendJson(res, 400, { error: 'Campaign name is required (maximum 120 characters).' });
    if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 100) return sendJson(res, 400, { error: 'Campaigns require between 1 and 100 recipients.' });

    const seenEmails = new Set();
    const uniqueRecipients = [];
    const invalid = [];
    for (const lead of recipients) {
      const email = normalizeEmail(lead?.email);
      if (!isValidEmail(email)) {
        invalid.push(String(lead?.email || ''));
      } else if (!seenEmails.has(email)) {
        seenEmails.add(email);
        uniqueRecipients.push({ ...lead, email });
      }
    }
    if (invalid.length) return sendJson(res, 400, { error: 'Fix invalid email addresses before creating the campaign.', invalid });
    if (!uniqueRecipients.length || uniqueRecipients.length > 100) return sendJson(res, 400, { error: 'Campaigns require between 1 and 100 valid recipients.' });

    const settings = await readSettings(supabase);
    const template = await loadActiveTemplate(supabase, templateId);
    const normalizedLeads = uniqueRecipients.map(lead => normalizeLead(lead, settings.companyMappings));
    const emails = normalizedLeads.map(lead => lead.email);
    const { data: suppressed, error: suppressionError } = await supabase.from('suppression_list').select('email, reason').in('email', emails);
    if (suppressionError) throw suppressionError;
    const suppressionMap = new Map((suppressed || []).map(row => [normalizeEmail(row.email), classifySuppressionReason(row.reason)]));

    const { data: leads, error: leadsError } = await supabase.from('leads').upsert(normalizedLeads.map(lead => ({
      email: lead.email,
      first_name: lead.firstName,
      company_name: lead.companyName,
      company_domain: lead.companyDomain,
      industry: lead.industry || null,
      website: lead.website || null,
      source: 'email_automation',
      updated_at: new Date().toISOString()
    })), { onConflict: 'email' }).select('*');
    if (leadsError) throw leadsError;

    const leadByEmail = new Map((leads || []).map(lead => [lead.email, lead]));
    const leadIds = (leads || []).map(lead => lead.id);
    const { data: previous, error: previousError } = await supabase.from('campaign_recipients')
      .select('lead_id,status').in('lead_id', leadIds).in('status', ['sent', 'bounced', 'queued', 'sending']);
    if (previousError) throw previousError;
    const contacted = new Set((previous || []).map(row => row.lead_id));

    const allowRecontact = req.body?.allowRecontact !== false;
    const renderedRows = normalizedLeads.map(lead => {
      const storedLead = leadByEmail.get(lead.email);
      const isSuppressed = suppressionMap.has(normalizeEmail(lead.email));
      const suppression = suppressionMap.get(normalizeEmail(lead.email));
      const status = isSuppressed
        ? suppression.status
        : (!allowRecontact && contacted.has(storedLead?.id))
          ? 'already_contacted'
          : 'pending';
      const rendered = renderLead(template, lead, settings, getUnsubscribeUrl(lead.email));
      const errorMessage = isSuppressed
        ? suppression.reason
        : (!rendered.valid ? `Personalization incomplete: ${rendered.unresolved.join(', ')}` : null);

      return {
        lead,
        status,
        rendered,
        row: {
          lead_id: storedLead?.id,
          recipient_email: lead.email,
          personalized_subject: rendered.subject,
          personalized_body: rendered.body,
          status,
          error_message: errorMessage
        }
      };
    });

    const incomplete = renderedRows.filter(item => !item.rendered.valid);
    if (incomplete.length) return sendJson(res, 400, {
      error: 'Personalization incomplete. Fix the template before creating this campaign.',
      recipients: incomplete.map(item => ({ email: item.lead.email, missing: item.rendered.unresolved }))
    });

    const { data: campaign, error: campaignError } = await supabase.from('campaigns').insert({
      name: String(name).trim(),
      template_id: template.id,
      sender_email: 'connect@fluvo.in',
      status: 'draft',
      test_mode: false,
      compliance_confirmed: Boolean(complianceConfirmed),
      total_recipients: normalizedLeads.length,
      queued_count: 0,
      created_by: actor.email || 'admin'
    }).select('*').single();
    if (campaignError) throw campaignError;

    const { error: recipientError } = await supabase.from('campaign_recipients').insert(renderedRows.map(item => ({
      ...item.row,
      campaign_id: campaign.id
    })));
    if (recipientError) {
      await supabase.from('campaigns').delete().eq('id', campaign.id);
      throw recipientError;
    }

    await logAudit(supabase, actor.email, 'campaign_created', 'campaign', campaign.id, { recipients: normalizedLeads.length });
    return sendJson(res, 201, {
      campaign,
      recipients: renderedRows.map(({ lead, status, rendered }) => ({
        email: lead.email, firstName: lead.firstName, companyName: lead.companyName,
        companyDomain: lead.companyDomain, status, subject: rendered.subject, body: rendered.body
      }))
    });
  } catch (error) {
    console.error('Email campaign creation failed:', error.message);
    return sendJson(res, 500, { error: error.message.includes('not configured') || error.message.includes('migration') ? error.message : 'Campaign could not be created. Check the database configuration and migration.' });
  }
}