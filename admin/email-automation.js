import Papa from 'papaparse';
import './email-automation.css';
import { DEFAULT_TEMPLATE, isValidEmail, normalizeEmail, parseLeadEmail, renderTemplate } from './email-automation/personalization.js';

const VARIABLES = [
  'first_name', 'company_name', 'company_domain', 'industry_category', 'specific_observation',
  'growth_area', 'specific_opportunity', 'opportunity_1', 'opportunity_2', 'opportunity_3',
  'sender_name', 'sender_designation', 'unsubscribe_url'
];

export function initEmailAutomation() {
  const root = document.getElementById('tab-email-automation');
  if (!root || root.dataset.initialized) return;
  root.dataset.initialized = 'true';

  const state = {
    leads: [], template: { ...DEFAULT_TEMPLATE }, templateId: null, templates: [], settings: null,
    currentCampaign: null, currentRecipient: null, validated: false, refreshTimer: null, queueMessage: '',
    activityEntries: [], selectedActivityIds: new Set()
  };
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const statusLabel = status => String(status || 'pending').replaceAll('_', ' ');

  function notice(message, type = 'info') {
    const target = byId('eaNotice');
    target.textContent = message;
    target.className = `ea-notice ${type}`;
    target.hidden = false;
    window.clearTimeout(notice.timer);
    notice.timer = window.setTimeout(() => { target.hidden = true; }, 6000);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `Request failed (${response.status}).`);
      error.stage = data.stage;
      error.code = data.code;
      throw error;
    }
    return data;
  }

  function composeLeads() {
    const prior = new Map(state.leads.map(lead => [lead.email, lead]));
    const rawValues = byId('eaLeadInput').value.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
    const seen = new Set();
    state.leads = rawValues.map(value => {
      const email = normalizeEmail(value);
      const old = prior.get(email) || {};
      const parsed = parseLeadEmail(email, old, { companyMappings: state.settings?.companyMappings });
      const duplicate = parsed.valid && seen.has(email);
      if (parsed.valid) seen.add(email);
      return { ...old, ...parsed, status: !parsed.valid ? 'invalid' : duplicate ? 'duplicate' : 'ready' };
    });
    state.validated = false;
    renderLeads();
    renderPreview();
  }

  function renderLeads() {
    const count = state.leads.length;
    byId('eaRecipientCount').textContent = `Recipients: ${count} / 100`;
    byId('eaLeadRows').innerHTML = count ? state.leads.map((lead, index) => `
      <tr class="${lead.valid ? '' : 'ea-invalid-row'}">
        <td>${index + 1}</td><td class="ea-email-cell">${escapeHtml(lead.email)}</td>
        <td>${escapeHtml(lead.firstName || 'there')}</td><td>${escapeHtml(lead.companyName || '—')}</td>
        <td>${escapeHtml(lead.companyDomain || '—')}</td>
        <td><span class="ea-status ${escapeHtml(lead.status)}">${escapeHtml(statusLabel(lead.status))}</span></td>
        <td><button type="button" class="ea-link-button" data-edit-lead="${index}">Edit</button><button type="button" class="ea-link-button" data-preview-lead="${index}" aria-label="Preview email">Preview</button></td>
      </tr>`).join('') : '<tr><td colspan="7" class="ea-empty">Add recipients to begin.</td></tr>';
    const invalid = state.leads.some(lead => !lead.valid || lead.status === 'duplicate');
    byId('eaCreateDraft').disabled = !state.validated || count < 1 || count > 100 || invalid;

    // Update setup badges (Problem 13)
    const validCount = state.leads.filter(l => l.valid && ['ready', 'pending', 'queued', 'failed'].includes(l.status)).length;
    const suppressedCount = state.leads.filter(l => l.status === 'suppressed').length;
    const badgeTotal = byId('eaBadgeTotal');
    const badgeReady = byId('eaBadgeReady');
    const badgeSuppressed = byId('eaBadgeSuppressed');
    if (badgeTotal) badgeTotal.textContent = `${count} recipient${count === 1 ? '' : 's'}`;
    if (badgeReady) badgeReady.textContent = `${validCount} valid`;
    if (badgeSuppressed) badgeSuppressed.textContent = `${suppressedCount} suppressed`;
  }

  function sampleLead() {
    return state.currentRecipient || state.leads.find(lead => lead.valid) || parseLeadEmail('shikha@example.com', { first_name: 'Shikha', company_name: 'Example Corp', industry: 'SaaS' });
  }

  function preview(template = state.template, lead = sampleLead()) {
    const rendered = renderTemplate(template, lead, {
      unsubscribeUrl: 'https://admin.fluvo.in/api/email/unsubscribe?token=preview',
      fallbacks: state.settings?.fallbacks,
      senderName: 'Fluvo'
    });
    return rendered;
  }

  function renderPreview() {
    const rendered = preview({ subject: byId('eaTemplateSubject').value, body: byId('eaTemplateBody').value });
    byId('eaTemplatePreview').textContent = `${rendered.subject}\n\n${rendered.body}`;
    byId('eaTemplatePreview').classList.toggle('ea-preview-error', !rendered.valid);
  }

  async function validateLeads() {
    composeLeads();
    if (!state.leads.length) return notice('Add at least one email address.', 'error');
    if (state.leads.length > 100) return notice('A campaign can contain no more than 100 recipients.', 'error');
    try {
      const data = await request('/api/email/leads/validate', {
        method: 'POST', body: JSON.stringify({
          leads: state.leads,
          allowRecontact: byId('eaAllowRecontact')?.checked ?? true
        })
      });
      state.leads = data.recipients || [];
      state.validated = true;
      renderLeads();
      const counts = data.counts || countStatuses(state.leads);
      const noun = state.leads.length === 1 ? 'recipient' : 'recipients';
      notice(`Validated ${state.leads.length} ${noun}: ${counts.ready} ready, ${counts.invalid} invalid, ${counts.duplicate} duplicate, ${counts.suppressed} suppressed, ${counts.already_contacted} already contacted.`, counts.invalid || counts.duplicate ? 'error' : 'success');
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  function countStatuses(rows) {
    const counts = { ready: 0, invalid: 0, duplicate: 0, suppressed: 0, already_contacted: 0, pending: 0, queued: 0, sending: 0, sent: 0, failed: 0 };
    for (const row of rows) if (Object.hasOwn(counts, row.status)) counts[row.status]++;
    return counts;
  }

  function parseCsv(file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: header => header.trim().toLowerCase(),
      complete: result => {
        if (result.errors.length) return notice('CSV parsing failed. Check the file format and try again.', 'error');
        const columns = result.meta.fields || [];
        if (!columns.includes('email')) return notice('CSV must include an email column.', 'error');
        const rows = result.data.map(row => ({
          email: row.email,
          first_name: row.first_name || '',
          company_name: row.company_name || '',
          industry: row.industry || '',
          website: row.website || ''
        })).filter(row => row.email);
        if (!rows.length || rows.length > 100) return notice('CSV must contain between 1 and 100 recipients.', 'error');
        state.leads = rows.map(row => ({ ...parseLeadEmail(row.email, row, { companyMappings: state.settings?.companyMappings }), source: 'csv', status: 'ready' }));
        byId('eaLeadInput').value = rows.map(row => row.email).join('\n');
        state.validated = false;
        renderLeads();
        request('/api/email/leads/import', { method: 'POST', body: JSON.stringify({ leads: rows }) })
          .then(data => notice(`Imported ${data.imported} leads.`, 'success'))
          .catch(error => notice(error.message, 'error'))
          .finally(validateLeads);
      },
      error: () => notice('CSV could not be read.', 'error')
    });
  }

  async function loadTemplates() {
    try {
      const data = await request('/api/email/templates');
      state.templates = data.templates || [];
      const active = state.templates.find(item => item.is_active) || state.templates[0];
      if (active) {
        state.template = { name: active.name, subject: active.subject, body: active.body };
        state.templateId = active.id;
      }
    } catch {
      state.template = { ...DEFAULT_TEMPLATE };
    }
    byId('eaTemplateName').value = state.template.name;
    byId('eaTemplateSubject').value = state.template.subject;
    byId('eaTemplateBody').value = state.template.body;
    renderPreview();
  }

  async function saveTemplate() {
    const template = { name: byId('eaTemplateName').value.trim(), subject: byId('eaTemplateSubject').value, body: byId('eaTemplateBody').value };
    try {
      const path = state.templateId ? `/api/email/templates/${encodeURIComponent(state.templateId)}` : '/api/email/templates';
      const data = await request(path, { method: state.templateId ? 'PUT' : 'POST', body: JSON.stringify(template) });
      state.templateId = data.template.id;
      state.template = template;
      notice('Template saved.', 'success');
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  async function createDraft() {
    if (!state.validated) return notice('Validate recipients before creating a draft.', 'error');
    if (!byId('eaComplianceConfirm').checked) return notice('Confirm responsible business outreach before creating the campaign.', 'error');
    if (!preview({ subject: byId('eaTemplateSubject').value, body: byId('eaTemplateBody').value }).valid) return notice('Resolve all template variables before creating a campaign.', 'error');
    const button = byId('eaCreateDraft');
    button.disabled = true;
    try {
      const data = await request('/api/email/campaigns', {
        method: 'POST', body: JSON.stringify({
          name: byId('eaCampaignName').value.trim(), recipients: state.leads,
          templateId: state.templateId, complianceConfirmed: true,
          allowRecontact: byId('eaAllowRecontact')?.checked ?? true
        })
      });
      state.currentCampaign = data.campaign;
      showCampaignReview(state.currentCampaign, data.recipients || []);
      notice('Draft created. No email has been sent.', 'success');
      loadActivity();
    } catch (error) {
      notice(error.message, 'error');
      button.disabled = false;
    }
  }

  function showCampaignReview(campaign, recipients = []) {
    state.currentCampaign = campaign;
    byId('eaReviewPanel').hidden = false;
    const counts = countStatuses(recipients);
    const total = recipients.length || campaign.total_recipients || 0;
    const queued = campaign.queued_count || counts.queued || 0;
    const sent = campaign.sent_count || counts.sent || 0;
    const failed = campaign.failed_count || counts.failed || 0;
    const ready = counts.ready + counts.pending + counts.queued + counts.failed;
    const cards = [
      ['Campaign', campaign.name], ['Recipients', total], ['Sender', 'connect@fluvo.in'],
      ['Template', state.template.name], ['Ready to send', ready], ['Suppressed', counts.suppressed || 0],
      ['Duplicate', counts.duplicate || 0], ['Already contacted', counts.already_contacted || 0],
      ['Queued', queued], ['Sent', sent], ['Failed', failed], ['Status', campaign.status]
    ];
    byId('eaReviewSummary').innerHTML = cards.map(([label, value]) => `<div class="ea-summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    // Render message preview (Problem 14)
    const previewContent = byId('eaReviewPreviewContent');
    if (previewContent) {
      const firstRec = recipients.find(r => r.personalized_subject || r.personalized_body);
      if (firstRec) {
        previewContent.textContent = `Subject: ${firstRec.personalized_subject || '—'}\n\n${firstRec.personalized_body || ''}`;
      } else {
        const p = preview();
        previewContent.textContent = `Subject: ${p.subject}\n\n${p.body}`;
      }
    }

    const isFinished = ['completed', 'failed'].includes(campaign.status);
    const isRunning = campaign.status === 'running' || campaign.status === 'queued';
    const launchBtn = byId('eaLaunchCampaign');
    launchBtn.hidden = isRunning;
    launchBtn.disabled = ready === 0 && !isFinished;
    launchBtn.textContent = isFinished ? 'Re-launch Campaign' : 'Launch Campaign';

    byId('eaReviewTest').hidden = false;
    byId('eaReviewStatus').textContent = isRunning
      ? 'Campaign running. Delivering emails...'
      : isFinished
        ? `Campaign completed: ${sent} sent, ${failed} failed.`
        : 'Draft created. No email is sent until you launch.';
    renderProgress(campaign, recipients);
  }

  function renderProgress(campaign, recipients = []) {
    const panel = byId('eaProgressPanel');
    const launched = ['queued', 'running', 'paused', 'completed', 'failed'].includes(campaign.status);
    panel.hidden = !launched;
    if (!launched) return;
    const total = Number(campaign.total_recipients || recipients.length || 0);
    const sent = Number(campaign.sent_count || recipients.filter(row => row.status === 'sent').length || 0);
    const failed = Number(campaign.failed_count || recipients.filter(row => row.status === 'failed').length || 0);
    const pending = recipients.filter(row => ['pending', 'queued', 'sending'].includes(row.status)).length;
    const suppressed = recipients.filter(row => ['suppressed', 'unsubscribed', 'already_contacted', 'duplicate'].includes(row.status)).length;
    const sending = recipients.find(row => row.status === 'sending')?.recipient_email || '—';
    const percent = total ? Math.min(100, Math.round((total - pending) / total * 100)) : 0;
    panel.innerHTML = `<strong>${escapeHtml(campaign.name)}</strong> · ${total - pending} / ${total}<div class="ea-progress-track"><span style="width:${percent}%"></span></div>Sent ${sent} · Failed ${failed} · Pending ${pending} · Suppressed ${suppressed} · Current recipient ${escapeHtml(sending)} · Status ${escapeHtml(campaign.status)}${state.queueMessage ? `<p class="ea-help">${escapeHtml(state.queueMessage)}</p>` : ''}<div class="ea-review-actions"><button type="button" class="btn-action" data-campaign-action="pause" ${campaign.status === 'paused' ? 'hidden' : ''}>Pause</button><button type="button" class="btn-action" data-campaign-action="resume" ${campaign.status !== 'paused' ? 'hidden' : ''}>Resume</button></div>`;
  }

  async function launchCampaign() {
    if (!state.currentCampaign) return;
    if (!window.confirm(`Launch “${state.currentCampaign.name}”? Eligible recipients will receive campaign emails now.`)) return;
    try {
      const latest = await request(`/api/email/campaigns/${encodeURIComponent(state.currentCampaign.id)}`);
      state.currentCampaign = latest.campaign;
      showCampaignReview(latest.campaign, latest.recipients);
      const eligible = latest.recipients.filter(row => ['pending', 'queued', 'failed'].includes(row.status));
      if (!eligible.length) {
        notice('This campaign has no eligible recipients to send.', 'error');
        return;
      }
    } catch (error) {
      notice(error.message, 'error');
      return;
    }
    const btn = byId('eaLaunchCampaign');
    if (btn?.disabled) return;
    const previousLabel = btn?.textContent || 'Launch Campaign';
    if (btn) btn.disabled = true;
    if (btn) btn.textContent = 'Launching...';
    notice('Launching campaign and sending emails...', 'info');
    try {
      const data = await request(`/api/email/campaigns/${encodeURIComponent(state.currentCampaign.id)}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'launch' })
      });
      state.currentCampaign = data.campaign;
      showCampaignReview(state.currentCampaign);
      if (data.message === 'Already sent — skipped') {
        notice('Campaign already sent — skipped duplicate sending.', 'info');
      } else {
        notice(`Campaign launched: ${data.sent ?? 0} sent, ${data.failed ?? 0} failed, ${data.skipped ?? 0} skipped.`, data.failed > 0 && data.sent === 0 ? 'error' : 'success');
      }
      await refreshCurrentCampaign();
      await loadActivity();
    } catch (error) {
      notice(error.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (btn.textContent === 'Launching...') btn.textContent = previousLabel;
      }
    }
  }

  async function refreshCurrentCampaign() {
    if (!state.currentCampaign) return;
    try {
      const data = await request(`/api/email/campaigns/${encodeURIComponent(state.currentCampaign.id)}`);
      state.currentCampaign = data.campaign;
      state.queueMessage = data.queueMessage || '';
      showCampaignReview(data.campaign, data.recipients);
      if (!['queued', 'running'].includes(data.campaign.status)) window.clearInterval(state.refreshTimer);
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  async function campaignAction(action) {
    if (!state.currentCampaign) return;
    try {
      const data = await request(`/api/email/campaigns/${encodeURIComponent(state.currentCampaign.id)}`, { method: 'POST', body: JSON.stringify({ action }) });
      state.currentCampaign = data.campaign;
      await refreshCurrentCampaign();
      loadActivity();
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  async function openCampaign(id) {
    try {
      const data = await request(`/api/email/campaigns/${encodeURIComponent(id)}`);
      state.queueMessage = data.queueMessage || '';
      byId('eaHistoryView').hidden = true;
      byId('eaWorkspaceView').hidden = false;
      showCampaignReview(data.campaign, data.recipients);
      byId('eaReviewPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  async function loadHistory() {
    byId('eaHistoryRows').innerHTML = '<tr><td colspan="6" class="ea-empty">Loading campaign history…</td></tr>';
    try {
      const data = await request('/api/email/campaigns');
      byId('eaHistoryRows').innerHTML = data.campaigns.length ? data.campaigns.map(campaign => `<tr><td><button class="ea-link-button" data-open-campaign="${escapeHtml(campaign.id)}">${escapeHtml(campaign.name)}</button></td><td>${campaign.total_recipients}</td><td>${campaign.sent_count}</td><td>${campaign.failed_count}</td><td>${escapeHtml(formatDate(campaign.created_at))}</td><td><span class="ea-status ${escapeHtml(campaign.status)}">${escapeHtml(statusLabel(campaign.status))}</span></td></tr>`).join('') : '<tr><td colspan="6" class="ea-empty">No campaigns yet.</td></tr>';
    } catch (error) {
      byId('eaHistoryRows').innerHTML = `<tr><td colspan="6" class="ea-empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  async function loadActivity() {
    try {
      const data = await request('/api/email/campaigns');
      const campaigns = data.campaigns || [];
      const details = await Promise.all(campaigns.slice(0, 10).map(campaign => request(`/api/email/campaigns/${encodeURIComponent(campaign.id)}`).catch(() => null)));
      const entries = details.filter(Boolean).flatMap(detail => detail.recipients.map(row => ({
        ...row,
        campaignName: detail.campaign.name
      }))).slice(0, 100);

      state.activityMap = new Map(entries.map(row => [row.id, row]));
      state.activityEntries = entries;
      const liveIds = new Set(entries.map(row => row.id));
      for (const id of [...state.selectedActivityIds]) if (!liveIds.has(id)) state.selectedActivityIds.delete(id);

      renderActivityTable();
    } catch (error) {
      state.activityEntries = [];
      state.selectedActivityIds.clear();
      byId('eaActivityRows').innerHTML = `<tr><td colspan="9" class="ea-empty">${escapeHtml(error.message)}</td></tr>`;
      updateActivityToolbarState();
    }
  }

  function renderActivityTable() {
    const entries = state.activityEntries;
    byId('eaActivityRows').innerHTML = entries.length ? entries.map(row => {
      const checked = state.selectedActivityIds.has(row.id) ? 'checked' : '';
      return `<tr>
        <td><input type="checkbox" class="ea-row-select" data-row-select="${escapeHtml(row.id)}" ${checked}></td>
        <td class="ea-email-cell">${escapeHtml(row.recipient_email)}</td>
        <td>${escapeHtml(row.company_name || row.companyDomain || '—')}</td>
        <td>${escapeHtml(row.campaignName || '—')}</td>
        <td><span class="ea-status ${escapeHtml(row.status)}">${escapeHtml(statusLabel(row.status))}</span></td>
        <td>${row.attempts ?? 0}</td>
        <td>${escapeHtml(formatDate(row.sent_at))}</td>
        <td>${escapeHtml(row.error_message || (row.status === 'suppressed' ? 'Recipient is on the suppression list.' : '—'))}</td>
        <td>
          <div class="ea-action-buttons">
            <button class="ea-link-button" data-view-recipient="${escapeHtml(row.id)}">View</button>
            <button class="ea-link-button" data-copy-email="${escapeHtml(row.recipient_email)}">Copy</button>
            ${row.status === 'suppressed' && row.error_message === 'administrator_suppression'
              ? `<button class="ea-link-button" data-unsuppress-email="${escapeHtml(row.recipient_email)}">Unsuppress</button>`
              : `<button class="ea-link-button" data-suppress-email="${escapeHtml(row.recipient_email)}">Suppress</button>`}
            <button class="ea-link-button danger" data-delete-recipient="${escapeHtml(row.id)}" data-delete-email="${escapeHtml(row.recipient_email)}">Delete</button>
            ${row.status === 'failed' ? `<button class="ea-link-button" data-retry-recipient="${escapeHtml(row.id)}">Retry</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="ea-empty">No campaign activity yet.</td></tr>';
    updateActivityToolbarState();
  }

  function updateActivityToolbarState() {
    const total = state.activityEntries.length;
    const selectedCount = state.selectedActivityIds.size;
    const selectAll = byId('eaActivitySelectAll');
    if (selectAll) {
      selectAll.disabled = total === 0;
      selectAll.checked = total > 0 && selectedCount === total;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < total;
    }
    byId('eaBulkUnsuppress').disabled = selectedCount === 0;
    byId('eaBulkDeleteSelected').disabled = selectedCount === 0;
  }

  function openViewModal(record) {
    byId('eaViewRecipient').textContent = record.recipient_email || '—';
    byId('eaViewFirstName').textContent = record.first_name || record.firstName || 'there';
    byId('eaViewCompany').textContent = record.company_name || record.companyDomain || '—';
    byId('eaViewCampaign').textContent = record.campaignName || '—';
    byId('eaViewStatus').innerHTML = `<span class="ea-status ${escapeHtml(record.status)}">${escapeHtml(statusLabel(record.status))}</span>`;
    byId('eaViewAttempts').textContent = record.attempts ?? 0;
    byId('eaViewCreatedAt').textContent = formatDate(record.created_at);
    byId('eaViewSentAt').innerHTML = record.sent_at ? formatDate(record.sent_at) : '<span style="color:var(--text-muted)">Not sent yet</span>';
    byId('eaViewUpdatedAt').textContent = formatDate(record.updated_at);
    byId('eaViewMessageId').textContent = record.provider_message_id || '—';
    byId('eaViewError').textContent = record.error_message || (record.status === 'failed' ? 'Delivery rejected by provider.' : 'None');
    byId('eaViewSubject').textContent = record.personalized_subject || '—';
    byId('eaViewBody').textContent = record.personalized_body || 'Not rendered yet.';
    byId('eaViewDialog').showModal();
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function editLead(index) {
    const lead = state.leads[index];
    if (!lead) return;
    state.currentRecipient = lead;
    byId('eaEditEmail').textContent = lead.email;
    byId('eaEditFirstName').value = lead.firstName || '';
    byId('eaEditCompany').value = lead.companyName || '';
    byId('eaEditIndustry').value = lead.industry || '';
    byId('eaEditWebsite').value = lead.website || '';
    byId('eaEditOpportunity1').value = lead.opportunity1 || '';
    byId('eaEditOpportunity2').value = lead.opportunity2 || '';
    byId('eaEditOpportunity3').value = lead.opportunity3 || '';
    byId('eaLeadDialog').showModal();
    byId('eaLeadForm').onsubmit = event => {
      event.preventDefault();
      Object.assign(lead, {
        firstName: byId('eaEditFirstName').value.trim() || 'there',
        companyName: byId('eaEditCompany').value.trim(),
        industry: byId('eaEditIndustry').value.trim(),
        website: byId('eaEditWebsite').value.trim(),
        opportunity1: byId('eaEditOpportunity1').value.trim(),
        opportunity2: byId('eaEditOpportunity2').value.trim(),
        opportunity3: byId('eaEditOpportunity3').value.trim(),
        status: lead.valid ? 'ready' : 'invalid'
      });
      state.validated = false;
      byId('eaLeadDialog').close();
      renderLeads(); renderPreview();
    };
  }

  function openTestDialog() {
    byId('eaTestAddress').value = state.settings?.testEmailRecipient || '';
    byId('eaTestRoutingNote').textContent = state.settings?.testEmailRecipient
      ? `Test email will be sent to ${state.settings.testEmailRecipient} (or you can enter a different address above).`
      : 'Test email will only be sent to the address entered above.';
    byId('eaTestDialog').showModal();
  }

  async function sendTest(event) {
    event.preventDefault();
    const target = event.submitter;
    target.disabled = true;
    try {
      const data = await request('/api/email/test', {
        method: 'POST',
        body: JSON.stringify({
          recipient: byId('eaTestAddress').value,
          template: { name: byId('eaTemplateName').value, subject: byId('eaTemplateSubject').value, body: byId('eaTemplateBody').value },
          lead: state.currentRecipient || state.leads.find(lead => lead.valid) || { email: 'preview@example.com', first_name: 'there' }
        })
      });
      byId('eaTestDialog').close();
      notice(`Test email sent to ${data.recipient}.`, 'success');
    } catch (error) {
      notice(error.message, 'error');
    } finally {
      target.disabled = false;
    }
  }

  async function loadSettings() {
    try {
      const data = await request('/api/email/settings');
      state.settings = data.settings;
      byId('eaTestMode').checked = data.settings.testMode;
      byId('eaTestMode').disabled = data.forcedTestMode;
      byId('eaTestRecipient').value = data.settings.testEmailRecipient;
      byId('eaLimitHour').value = data.settings.maxEmailsPerHour;
      byId('eaLimitDay').value = data.settings.maxEmailsPerDay;
      byId('eaDelaySeconds').value = data.settings.delaySeconds;
      byId('eaFallbacks').value = JSON.stringify(data.settings.fallbacks, null, 2);
      byId('eaCompanyMappings').value = JSON.stringify(data.settings.companyMappings, null, 2);
      const status = byId('eaProviderStatus');
      if (data.provider?.configured) {
        status.textContent = 'SMTP Configuration: Environment Managed';
        status.className = 'ea-provider-status connected';
      } else {
        status.textContent = `Configuration Error: ${data.provider?.message || 'SMTP_PASSWORD is required.'}`;
        status.className = 'ea-provider-status disconnected';
      }
      byId('eaTestModeBanner').hidden = !data.settings.testMode;

      if (byId('eaSmtpProvider')) byId('eaSmtpProvider').textContent = 'Environment Managed';
      if (byId('eaSmtpHost') && data.provider?.host) byId('eaSmtpHost').textContent = data.provider.host;
      if (byId('eaSmtpPort') && data.provider?.port) byId('eaSmtpPort').textContent = String(data.provider.port);
      if (byId('eaSmtpSecurity') && data.provider?.secure !== undefined) {
        byId('eaSmtpSecurity').textContent = data.provider.secure ? 'SSL' : 'STARTTLS';
      }
      if (byId('eaSmtpUser') && data.provider?.senderEmail) byId('eaSmtpUser').textContent = data.provider.senderEmail;
    } catch (error) {
      byId('eaProviderStatus').textContent = error.message;
      byId('eaProviderStatus').className = 'ea-provider-status disconnected';
      const systemStatus = document.getElementById('systemStatusText');
      const systemStatusIndicator = systemStatus?.closest('.system-status-indicator');
      if (systemStatus) systemStatus.textContent = 'Email Automation Setup Needed';
      systemStatusIndicator?.classList.add('warning');
    }
  }

  async function saveSettings() {
    try {
      const fallbacks = JSON.parse(byId('eaFallbacks').value || '{}');
      const companyMappings = JSON.parse(byId('eaCompanyMappings').value || '{}');
      if (!fallbacks || Array.isArray(fallbacks) || typeof fallbacks !== 'object' || !companyMappings || Array.isArray(companyMappings) || typeof companyMappings !== 'object') throw new Error('Fallbacks and company mappings must be JSON objects.');
      const data = await request('/api/email/settings', {
        method: 'PUT', body: JSON.stringify({
          testMode: byId('eaTestMode').checked,
          testEmailRecipient: byId('eaTestRecipient').value.trim(),
          maxEmailsPerHour: Number(byId('eaLimitHour').value),
          maxEmailsPerDay: Number(byId('eaLimitDay').value),
          delaySeconds: Number(byId('eaDelaySeconds').value),
          fallbacks,
          companyMappings
        })
      });
      state.settings = data.settings;
      byId('eaTestModeBanner').hidden = !data.settings.testMode;
      notice('Email automation settings saved.', 'success');
    } catch (error) {
      notice(error.message, 'error');
    }
  }

  async function testConnection() {
    const status = byId('eaProviderStatus');
    status.textContent = 'Testing provider connection…';
    try {
      const data = await request('/api/email/test-connection', { method: 'POST', body: '{}' });
      status.textContent = data.message || 'SMTP connection verified successfully';
      status.className = 'ea-provider-status connected';
      notice(data.message || 'SMTP connection verified successfully', 'success');
    } catch (error) {
      const labels = {
        configuration: 'Configuration Error',
        dns: 'DNS Error',
        connection: 'Connection Failed',
        tls: 'TLS Error',
        authentication: 'Authentication Failed',
        rate_limiting: 'Rate Limited',
        provider_rejection: 'Provider Rejected',
        unknown: 'Verification Failed'
      };
      status.textContent = `${labels[error.stage] || 'Verification Failed'}: ${error.message}`;
      status.className = 'ea-provider-status disconnected';
      notice(error.message, 'error');
    }
  }

  function showHistory(push = true) {
    byId('eaWorkspaceView').hidden = true;
    byId('eaHistoryView').hidden = false;
    if (push) history.pushState({ emailAutomation: true }, '', '/email-automation/history');
    loadHistory();
  }

  function showWorkspace(push = true) {
    byId('eaHistoryView').hidden = true;
    byId('eaWorkspaceView').hidden = false;
    if (push) history.pushState({ emailAutomation: true }, '', '/email-automation');
  }

  function resetCampaign() {
    state.leads = [];
    state.currentCampaign = null;
    state.currentRecipient = null;
    state.validated = false;
    byId('eaLeadInput').value = '';
    byId('eaCampaignName').value = '';
    byId('eaComplianceConfirm').checked = false;
    byId('eaReviewPanel').hidden = true;
    renderLeads();
    showWorkspace();
  }

  function variableButtons() {
    byId('eaVariableButtons').innerHTML = VARIABLES.map(name => `<button type="button" class="ea-variable-button" data-variable="${name}">{{${name}}}</button>`).join('');
  }

  byId('eaLeadInput').addEventListener('input', composeLeads);
  byId('eaValidateButton').addEventListener('click', validateLeads);
  byId('eaImportButton').addEventListener('click', () => byId('eaCsvInput').click());
  byId('eaCsvInput').addEventListener('change', event => { if (event.target.files?.[0]) parseCsv(event.target.files[0]); event.target.value = ''; });
  byId('eaLeadRows').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-lead]');
    const previewLead = event.target.closest('[data-preview-lead]');
    if (edit) editLead(Number(edit.dataset.editLead));
    if (previewLead) { state.currentRecipient = state.leads[Number(previewLead.dataset.previewLead)]; renderPreview(); }
  });
  byId('eaTemplateSubject').addEventListener('input', renderPreview);
  byId('eaTemplateBody').addEventListener('input', renderPreview);
  byId('eaTemplateName').addEventListener('input', () => { state.template.name = byId('eaTemplateName').value; });
  byId('eaSaveTemplate').addEventListener('click', saveTemplate);
  byId('eaCreateDraft').addEventListener('click', createDraft);
  byId('eaLaunchCampaign').addEventListener('click', launchCampaign);
  byId('eaBackToEditor').addEventListener('click', () => { byId('eaReviewPanel').hidden = true; });
  byId('eaReviewTest').addEventListener('click', openTestDialog);
  byId('eaTestButton').addEventListener('click', openTestDialog);
  byId('eaTestForm').addEventListener('submit', sendTest);
  byId('eaHistoryButton').addEventListener('click', () => showHistory());
  byId('eaHistoryBack').addEventListener('click', () => showWorkspace());
  byId('eaNewCampaign').addEventListener('click', resetCampaign);
  byId('eaRefreshActivity').addEventListener('click', loadActivity);
  byId('eaDeleteAllActivity').addEventListener('click', () => byId('eaDeleteAllDialog').showModal());
  byId('eaActivitySelectAll').addEventListener('change', () => {
    if (byId('eaActivitySelectAll').checked) state.activityEntries.forEach(row => state.selectedActivityIds.add(row.id));
    else state.selectedActivityIds.clear();
    renderActivityTable();
  });
  byId('eaBulkUnsuppress').addEventListener('click', async () => {
    const ids = [...state.selectedActivityIds];
    if (!ids.length) return;
    if (!window.confirm(`Remove ${ids.length} selected recipient${ids.length === 1 ? '' : 's'} from administrative suppression?`)) return;
    const button = byId('eaBulkUnsuppress');
    button.disabled = true;
    try {
      const data = await request('/api/email/activity/unsuppress', { method: 'POST', body: JSON.stringify({ ids }) });
      notice(data.message, data.unsuppressed > 0 ? 'success' : 'info');
      state.selectedActivityIds.clear();
      await loadActivity();
      if (state.currentCampaign) await refreshCurrentCampaign();
    } catch (error) {
      notice(error.message, 'error');
      updateActivityToolbarState();
    }
  });
  byId('eaBulkDeleteSelected').addEventListener('click', () => {
    const count = state.selectedActivityIds.size;
    if (!count) return;
    byId('eaDeleteSelectedSubtitle').textContent = `You are about to delete ${count} email activity record${count === 1 ? '' : 's'}. This action cannot be undone.`;
    byId('eaDeleteSelectedDialog').showModal();
  });
  byId('eaSaveSettings').addEventListener('click', saveSettings);
  byId('eaTestConnection').addEventListener('click', testConnection);
  byId('eaHistoryRows').addEventListener('click', event => {
    const button = event.target.closest('[data-open-campaign]');
    if (button) openCampaign(button.dataset.openCampaign);
  });
  byId('eaProgressPanel').addEventListener('click', event => {
    const button = event.target.closest('[data-campaign-action]');
    if (button) campaignAction(button.dataset.campaignAction);
  });
  byId('eaActivityRows').addEventListener('change', event => {
    const checkbox = event.target.closest('[data-row-select]');
    if (!checkbox) return;
    if (checkbox.checked) state.selectedActivityIds.add(checkbox.dataset.rowSelect);
    else state.selectedActivityIds.delete(checkbox.dataset.rowSelect);
    updateActivityToolbarState();
  });
  byId('eaActivityRows').addEventListener('click', async event => {
    const copy = event.target.closest('[data-copy-email]');
    const retry = event.target.closest('[data-retry-recipient]');
    const suppress = event.target.closest('[data-suppress-email]');
    const unsuppress = event.target.closest('[data-unsuppress-email]');
    const view = event.target.closest('[data-view-recipient]');
    const del = event.target.closest('[data-delete-recipient]');

    try {
      if (view) {
        const record = state.activityMap?.get(view.dataset.viewRecipient);
        if (record) {
          openViewModal(record);
        } else {
          notice('Activity record details unavailable.', 'error');
        }
      }
      if (del) {
        state.pendingDeleteId = del.dataset.deleteRecipient;
        byId('eaDeleteEmail').textContent = del.dataset.deleteEmail || 'this recipient';
        byId('eaDeleteDialog').showModal();
      }
      if (copy) {
        await navigator.clipboard.writeText(copy.dataset.copyEmail);
        const originalText = copy.textContent;
        copy.textContent = 'Copied!';
        setTimeout(() => { copy.textContent = originalText; }, 2000);
        notice('Email address copied.', 'success');
      }
      if (retry) {
        await request(`/api/email/recipients/${encodeURIComponent(retry.dataset.retryRecipient)}`, { method: 'POST', body: '{}' });
        notice('Failed email queued for retry.', 'success');
        loadActivity();
      }
      if (suppress) {
        if (!window.confirm(`Suppress ${suppress.dataset.suppressEmail} from future outreach?`)) return;
        await request('/api/email/suppress', { method: 'POST', body: JSON.stringify({ email: suppress.dataset.suppressEmail, reason: 'Recipient suppressed by administrator.' }) });
        notice('Recipient added to the suppression list.', 'success');
        loadActivity();
        if (state.currentCampaign) refreshCurrentCampaign();
      }
      if (unsuppress) {
        if (!window.confirm(`Remove ${unsuppress.dataset.unsuppressEmail} from administrative suppression?`)) return;
        await request('/api/email/unsuppress', { method: 'POST', body: JSON.stringify({ email: unsuppress.dataset.unsuppressEmail }) });
        notice('Recipient removed from the suppression list.', 'success');
        loadActivity();
        if (state.currentCampaign) refreshCurrentCampaign();
      }
    } catch (error) { notice(error.message, 'error'); }
  });

  byId('eaConfirmDelete').addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;
    try {
      await request(`/api/email/recipients/${encodeURIComponent(state.pendingDeleteId)}`, { method: 'DELETE' });
      byId('eaDeleteDialog').close();
      notice('Email activity record deleted.', 'success');
      loadActivity();
      if (state.currentCampaign) refreshCurrentCampaign();
    } catch (error) {
      notice(error.message, 'error');
    } finally {
      state.pendingDeleteId = null;
    }
  });

  byId('eaConfirmDeleteAll').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await request('/api/email/activity/all', { method: 'DELETE' });
      byId('eaDeleteAllDialog').close();
      notice('All email activity deleted successfully.', 'success');
      await loadActivity();
      if (state.currentCampaign) await refreshCurrentCampaign();
    } catch (error) {
      notice('Unable to delete email activity. Please try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  byId('eaConfirmDeleteSelected').addEventListener('click', async event => {
    const ids = [...state.selectedActivityIds];
    if (!ids.length) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const data = await request('/api/email/activity/selected', { method: 'DELETE', body: JSON.stringify({ ids }) });
      byId('eaDeleteSelectedDialog').close();
      notice(data.message, 'success');
      state.selectedActivityIds.clear();
      await loadActivity();
      if (state.currentCampaign) await refreshCurrentCampaign();
    } catch (error) {
      notice(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => byId(button.dataset.dialogClose).close()));
  byId('eaLeadDialog').addEventListener('click', event => { if (event.target === byId('eaLeadDialog')) byId('eaLeadDialog').close(); });
  byId('eaTestDialog').addEventListener('click', event => { if (event.target === byId('eaTestDialog')) byId('eaTestDialog').close(); });
  byId('eaViewDialog').addEventListener('click', event => { if (event.target === byId('eaViewDialog')) byId('eaViewDialog').close(); });
  byId('eaDeleteDialog').addEventListener('click', event => { if (event.target === byId('eaDeleteDialog')) byId('eaDeleteDialog').close(); });
  byId('eaDeleteAllDialog').addEventListener('click', event => { if (event.target === byId('eaDeleteAllDialog')) byId('eaDeleteAllDialog').close(); });
  byId('eaDeleteSelectedDialog').addEventListener('click', event => { if (event.target === byId('eaDeleteSelectedDialog')) byId('eaDeleteSelectedDialog').close(); });
  byId('eaVariableButtons').addEventListener('click', event => {
    const button = event.target.closest('[data-variable]');
    if (!button) return;
    const textarea = byId('eaTemplateBody');
    const insertion = `{{${button.dataset.variable}}}`;
    textarea.setRangeText(insertion, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.focus(); renderPreview();
  });
  window.addEventListener('popstate', () => {
    if (!location.pathname.startsWith('/email-automation')) {
      if (document.querySelector('[data-tab="email-automation"]')?.classList.contains('active')) {
        document.querySelector('[data-tab="overview"]')?.click();
      }
      return;
    }
    if (!document.querySelector('[data-tab="email-automation"]')?.classList.contains('active')) {
      document.querySelector('[data-tab="email-automation"]')?.click();
    }
    showWorkspace(false);
    if (location.pathname.endsWith('/history')) showHistory(false);
  });

  variableButtons();
  renderLeads();
  loadTemplates();
  loadSettings();
  loadActivity();
  window.setInterval(() => {
    if (state.currentCampaign && ['queued', 'running'].includes(state.currentCampaign.status)) refreshCurrentCampaign();
  }, 12000);

  if (location.pathname.startsWith('/email-automation')) {
    document.querySelector('[data-tab="email-automation"]')?.click();
    history.replaceState({ emailAutomation: true }, '', location.pathname);
    if (location.pathname.endsWith('/history')) showHistory(false);
  }
}