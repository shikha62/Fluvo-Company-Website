import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { SmtpService, classifySmtpError, loadMailConfig } from '@fluvo/email-provider';

const IMAP_AUTH_COOLDOWN_MS = 10 * 60 * 1000;
const IMAP_AUTH_FAILURES = globalThis[Symbol.for('@fluvo/admin/imap-auth-failures')] || new Map();
globalThis[Symbol.for('@fluvo/admin/imap-auth-failures')] = IMAP_AUTH_FAILURES;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Server-side Supabase credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false } });
}

// Mailbox secrets and provider endpoints must be configured in server environment variables.
export async function getEmailConfig() {
  const mailConfig = loadMailConfig();

  return {
    address: mailConfig.email,
    isConfigured: mailConfig.imap.configured,
    smtp: mailConfig.smtp,
    smtpConfigured: mailConfig.smtp.configured,
    missingConfiguration: mailConfig.missingConfiguration,
    imap: {
      host: mailConfig.imap.host,
      port: mailConfig.imap.port,
      secure: mailConfig.imap.secure,
      auth: { user: mailConfig.imap.user, pass: mailConfig.imap.password },
      logger: false,
      connectionTimeout: 10000,
      socketTimeout: 15000,
      greetingTimeout: 10000,
      tls: { rejectUnauthorized: true },
    },
    imapError: mailConfig.imap.error
  };
}

export async function checkMailboxConnections() {
  const config = await getEmailConfig();
  const result = {
    configured: config.smtpConfigured && config.isConfigured,
    email: config.address,
    smtpConfigured: config.smtpConfigured,
    imapConfigured: config.isConfigured,
    smtpConnection: config.smtpConfigured ? 'failed' : 'not_configured',
    imapConnection: config.isConfigured ? 'failed' : 'not_configured',
    missingConfiguration: config.missingConfiguration,
    smtpError: config.smtp?.error?.message || null,
    imapError: config.imapError?.message || null
  };

  if (config.smtpConfigured) {
    let provider;
    try {
      provider = new SmtpService(config.smtp);
      await provider.verifyConnection();
      result.smtpConnection = 'ok';
      result.smtpError = null;
    } catch (error) {
      const diagnostic = classifySmtpError(error);
      result.smtpError = diagnostic.stage === 'authentication'
        ? 'Mailbox authentication failed. Verify the mailbox password in the server environment.'
        : 'SMTP connection failed.';
      console.warn(`MAILBOX_STATUS SMTP failed: ${diagnostic.stage} ${diagnostic.code}`);
    } finally {
      provider?.close();
    }
  }

  if (config.isConfigured) {
    const cooldown = imapAuthCooldownMessage(config.imap);
    if (cooldown) {
      result.imapError = 'Mailbox authentication failed. Verify the mailbox password in the server environment.';
    } else {
      const client = createImapClient(config.imap);
      try {
        await client.connect();
        await client.logout();
        result.imapConnection = 'ok';
        result.imapError = null;
      } catch (error) {
        recordImapAuthFailure(config.imap, error);
        const code = String(error?.code || '').toUpperCase();
        result.imapError = error?.authenticationFailed || ['AUTHENTICATIONFAILED', 'EAUTH'].includes(code)
          ? 'Mailbox authentication failed. Verify the mailbox password in the server environment.'
          : 'IMAP connection failed.';
        console.warn(`MAILBOX_STATUS IMAP failed: ${code || 'IMAP_ERROR'}`);
      }
    }
  }

  return { success: result.smtpConnection === 'ok' && result.imapConnection === 'ok', ...result };
}

function imapAuthKey(config) {
  return createHash('sha256')
    .update(`${config.host}\0${config.port}\0${config.auth.user}\0${config.auth.pass}`)
    .digest('hex');
}

function imapAuthCooldownMessage(config) {
  const blockedUntil = IMAP_AUTH_FAILURES.get(imapAuthKey(config)) || 0;
  if (blockedUntil > Date.now()) {
    return 'IMAP authentication is paused after a previous rejection. Update EMAIL_IMAP_PASSWORD before retrying.';
  }
  if (blockedUntil) IMAP_AUTH_FAILURES.delete(imapAuthKey(config));
  return '';
}

function recordImapAuthFailure(config, error) {
  const code = String(error?.code || '').toUpperCase();
  if (error?.authenticationFailed || code === 'AUTHENTICATIONFAILED' || code === 'EAUTH') {
    IMAP_AUTH_FAILURES.set(imapAuthKey(config), Date.now() + IMAP_AUTH_COOLDOWN_MS);
  }
}

export async function saveEmailConfig() {
  return {
    success: false,
    error: 'Mailbox credentials cannot be entered or stored in the portal. Configure EMAIL_IMAP_* and SMTP_* server environment variables, then use Test Connection.'
  };
}

function createImapClient(config) {
  const client = new ImapFlow(config);
  client.on('error', error => {
    console.warn('IMAP client error:', String(error?.code || 'imap_error'));
  });
  return client;
}

// In-memory demo/fallback store for development or when credentials are not yet linked
let mockMailbox = [
  {
    uid: 101,
    messageId: '<meta_ads_lead_992@luminahealth.io>',
    from: { name: 'Eleanor Vance', address: 'eleanor@luminahealth.io' },
    to: [{ name: 'Fluvo Connect', address: 'connect@fluvo.in' }],
    subject: 'Follow-up: Q3 Growth Architecture & Meta CAC Reduction Sprint',
    snippet: 'Hi Fluvo Team, Following our consultation call yesterday, we would like to move forward with the 90-day growth sprint...',
    date: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    folder: 'INBOX',
    unread: true,
    starred: true,
    hasAttachments: true,
    attachments: [
      { filename: 'Lumina_Health_AdSpend_Audit.pdf', size: 1428000, contentType: 'application/pdf' }
    ],
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <p>Hi Team Fluvo,</p>
        <p>Following our technical discovery call yesterday, our leadership team reviewed your proposal for the <strong>90-Day Full-Funnel Growth Sprint</strong>.</p>
        <p>We are keen to implement the first-party server-side tracking (Meta CAPI + GTM Server container) to eliminate our signal loss on iOS 14.5+ devices, which has been driving up our blended CAC.</p>
        <p>Attached is our quarterly ad spend breakdown and historical GA4 event export for your team's preliminary audit.</p>
        <p>Can we schedule the technical kickoff for this Thursday at 2:00 PM EST?</p>
        <br>
        <p>Best regards,<br><strong>Eleanor Vance</strong><br>VP of Growth | Lumina Health</p>
      </div>
    `,
    text: 'Hi Team Fluvo,\n\nFollowing our consultation call yesterday, we would like to move forward with the 90-day growth sprint. Attached is our audit file.\n\nBest,\nEleanor Vance'
  },
  {
    uid: 102,
    messageId: '<noreply@instagram.com>',
    from: { name: 'Instagram Support', address: 'security@mail.instagram.com' },
    to: [{ name: 'Fluvo Brand', address: 'connect@fluvo.in' }],
    subject: "You're back on Instagram, fluvo_tech",
    snippet: 'Hi Fluvo Team, We reviewed your account verification documents. Your organization badge has been validated and confirmed.',
    date: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    folder: 'INBOX',
    unread: false,
    starred: true,
    hasAttachments: false,
    attachments: [],
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #222;">
        <h2>Instagram Enterprise Verification</h2>
        <p>Hi Fluvo Tech,</p>
        <p>Your business profile <strong>@fluvo_tech</strong> has completed identity verification for official branded content partnership tools.</p>
        <p>You can now manage Meta Business Manager portfolio integrations and access verified brand features.</p>
        <br>
        <p>Thanks,<br>The Instagram Team</p>
      </div>
    `,
    text: 'Hi Fluvo Tech,\n\nYour business profile has completed identity verification.\n\nThanks,\nThe Instagram Team'
  },
  {
    uid: 103,
    messageId: '<partner_inq_883@apexapparel.co>',
    from: { name: 'Marcus Sterling', address: 'm.sterling@apexapparel.co' },
    to: [{ name: 'Fluvo Connect', address: 'connect@fluvo.in' }],
    subject: 'Inquiry: Generative Engine Optimization (GEO) & AI Search Citation Strategy',
    snippet: 'Good morning, We noticed Fluvo specializing in Generative Engine Optimization (GEO). We want to ensure Apex Apparel is cited in ChatGPT and Perplexity...',
    date: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    folder: 'INBOX',
    unread: false,
    starred: false,
    hasAttachments: false,
    attachments: [],
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <p>Hello Fluvo Team,</p>
        <p>We saw your technical articles on Generative Engine Optimization (GEO) and entity graph schema construction.</p>
        <p>We are looking for a growth partner to optimize Apex Apparel’s organic search presence across modern AI engines (ChatGPT search, Perplexity, and Google AI Overviews).</p>
        <p>Please share your engagement model and case studies for enterprise ecommerce brands.</p>
        <br>
        <p>Cheers,<br><strong>Marcus Sterling</strong><br>Apex Apparel</p>
      </div>
    `,
    text: 'Hello Fluvo Team,\n\nWe saw your technical articles on GEO and want to discuss optimization for Apex Apparel.\n\nCheers,\nMarcus Sterling'
  },
  {
    uid: 104,
    messageId: '<outbox_fluvo_sent_01@fluvo.in>',
    from: { name: 'Fluvo Executive Team', address: 'connect@fluvo.in' },
    to: [{ name: 'David Thorne', address: 'dthorne@fintechflow.com' }],
    subject: 'Re: Technical Discovery & First-Party Attribution Proposal',
    snippet: 'Hi David, Thank you for scheduling our strategy session. Attached is the customized enterprise attribution roadmap...',
    date: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    folder: 'Sent',
    unread: false,
    starred: false,
    hasAttachments: true,
    attachments: [
      { filename: 'Fluvo_Attribution_Blueprint_FinTechFlow.pdf', size: 2150000, contentType: 'application/pdf' }
    ],
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <p>Hi David,</p>
        <p>Thank you for connecting with Fluvo. We have outlined the server-side conversion architecture tailored to FinTech Flow's compliance and data governance standards.</p>
        <p>Looking forward to our call on Thursday.</p>
        <br>
        <p>Best regards,<br><strong>Fluvo Executive Operations</strong><br>https://www.fluvo.in</p>
      </div>
    `,
    text: 'Hi David,\n\nThank you for connecting with Fluvo. Looking forward to our call on Thursday.\n\nBest,\nFluvo Team'
  }
];

// Helper: Normalize folder names
export function normalizeFolder(f) {
  if (!f) return 'INBOX';
  const u = f.toUpperCase();
  if (u === 'INBOX') return 'INBOX';
  if (u === 'SENT' || u === 'SENT MESSAGES') return 'Sent';
  if (u === 'DRAFTS') return 'Drafts';
  if (u === 'ARCHIVE' || u === 'ARCHIVES') return 'Archive';
  if (u === 'TRASH' || u === 'DELETED') return 'Trash';
  if (u === 'SPAM' || u === 'JUNK') return 'Spam';
  if (u === 'STARRED') return 'Starred';
  return f;
}

function mapStoredMailboxMessage(row, includeBody = false) {
  const from = row.from_data?.[0] || {};
  const message = {
    uid: Number(row.imap_uid),
    messageId: row.message_id || '',
    from: { name: from.name || from.address || 'Unknown', address: from.address || '' },
    to: row.to_data || [],
    cc: row.cc_data || [],
    subject: row.subject || '(No Subject)',
    snippet: row.snippet || '',
    date: row.received_at || row.synced_at,
    folder: normalizeFolder(row.folder),
    unread: Boolean(row.unread),
    starred: Boolean(row.starred),
    hasAttachments: Boolean(row.attachments?.length),
    attachments: row.attachments || []
  };
  if (includeBody) {
    message.text = row.text_body || '';
    message.html = row.html_body || '';
  }
  return message;
}

/**
 * Fetch inbound website call requests and inquiries from Supabase
 * and synthesize them into rich email messages for the Executive Mailbox.
 */
export async function getInboundLeadMessages() {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('queries')
      .select('*')
      .neq('type', 'system_config')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !Array.isArray(data)) return [];

    return data.map(row => {
      const id = row.id || 0;
      const uid = 800000 + Number(id);
      const name = row.full_name || row.fullName || 'Inbound Lead';
      const email = row.work_email || row.workEmail || 'connect@fluvo.in';
      const company = row.company || '';
      const phone = row.phone || '';
      const adSpend = row.ad_spend || row.adSpend || '—';
      const preferredDate = row.preferred_date || row.preferredDate || '—';
      const preferredTime = row.preferred_time || row.preferredTime || '';
      const dateStr = row.created_at || row.createdAt || new Date().toISOString();
      const isUnread = row.status === 'new';
      const isStarred = Boolean(row.starred);
      const subject = `⚡ [Strategy Call Request] ${name}${company ? ' (' + company + ')' : ''}`;
      const snippet = `📞 ${phone || 'No phone'} | 🏢 ${company || 'N/A'} | 📅 ${preferredDate} | ${row.message || 'Call requested'}`;

      return {
        uid,
        messageId: `<inbound_lead_${id}@fluvo.in>`,
        from: { name, address: email },
        to: [{ name: 'Fluvo Connect', address: 'connect@fluvo.in' }],
        subject,
        snippet: snippet.slice(0, 160),
        date: dateStr,
        folder: 'INBOX',
        unread: isUnread,
        starred: isStarred,
        hasAttachments: false,
        attachments: [],
        isLeadInquiry: true,
        leadId: id,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 620px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
            <div style="display: inline-block; padding: 4px 10px; background: #FFF4ED; color: #D86B2F; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
              ⚡ Inbound Strategy Call Request
            </div>
            <h2 style="margin: 0 0 16px 0; font-size: 19px; color: #0f172a; font-weight: 700;">
              ${name} requested a diagnostic strategy call
            </h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13.5px;">
              <tbody>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; width: 35%; font-weight: 500;">Full Name</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${name}</td></tr>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">Work Email</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #D86B2F;"><a href="mailto:${email}" style="color: #D86B2F; text-decoration: none;">${email}</a></td></tr>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">Phone Number</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${phone || '—'}</td></tr>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">Company</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${company || '—'}</td></tr>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">Budget / Ad Spend</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${adSpend}</td></tr>
                <tr><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 500;">Preferred Date</td><td style="padding: 9px 12px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">${preferredDate} ${preferredTime ? '(' + preferredTime + ')' : ''}</td></tr>
              </tbody>
            </table>
            ${row.message ? `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 16px;">
                <strong style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Primary Growth Objective / Bottleneck:</strong>
                <div style="font-size: 14px; color: #1e293b; white-space: pre-wrap;">${row.message}</div>
              </div>
            ` : ''}
            <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #94a3b8;">
              <span>Submitted via fluvo.in</span>
              <span>${new Date(dateStr).toLocaleString()}</span>
            </div>
          </div>
        `,
        text: `New Strategy Call Request from ${name}\nEmail: ${email}\nPhone: ${phone}\nCompany: ${company}\nDate: ${preferredDate}\nMessage: ${row.message || 'None'}`
      };
    });
  } catch (err) {
    console.warn('Failed to load inbound leads for email inbox:', err.message);
    return [];
  }
}

// ── IMAP Operations ──────────────────────────────────────────────────────────

export async function fetchFolders() {
  const config = await getEmailConfig();
  const leads = await getInboundLeadMessages();
  const leadUnread = leads.filter(l => l.unread).length;
  const leadTotal = leads.length;

  const imapCooldownMessage = config.isConfigured ? imapAuthCooldownMessage(config.imap) : '';
  if (config.isConfigured && !imapCooldownMessage) {
    const client = createImapClient(config.imap);
    try {
      await client.connect();
      const mailboxes = await client.list();
      const folderList = [];

      for (const m of mailboxes) {
        try {
          const status = await client.status(m.path, { messages: true, unseen: true });
          const isInbox = m.path.toUpperCase() === 'INBOX';
          folderList.push({
            name: m.name,
            path: m.path,
            total: (status.messages || 0) + (isInbox ? leadTotal : 0),
            unread: (status.unseen || 0) + (isInbox ? leadUnread : 0)
          });
        } catch {
          const isInbox = m.path.toUpperCase() === 'INBOX';
          folderList.push({
            name: m.name,
            path: m.path,
            total: isInbox ? leadTotal : 0,
            unread: isInbox ? leadUnread : 0
          });
        }
      }
      await client.logout();

      return {
        success: true,
        provider: 'Titan / GoDaddy IMAP',
        mailbox: config.address,
        folders: folderList,
        connection: { connected: true, configured: true, mailbox: config.address, error: null }
      };
    } catch (err) {
      recordImapAuthFailure(config.imap, err);
      const errMsg = err.authenticationFailed || String(err.code || '').toUpperCase() === 'AUTHENTICATIONFAILED'
        ? 'IMAP authentication was rejected. Verify third-party IMAP access and EMAIL_IMAP_PASSWORD.'
        : `IMAP connection failed (${String(err.code || 'IMAP_ERROR')}).`;
      console.warn('IMAP live connection notice:', String(err.code || 'IMAP_ERROR'));
      return {
        success: false,
        provider: 'Titan Email (Reconnecting)',
        mailbox: config.address,
        folders: [
          { name: 'Inbox', path: 'INBOX', total: leadTotal, unread: leadUnread },
          { name: 'Starred', path: 'Starred', total: leads.filter(l => l.starred).length, unread: 0 }
        ],
        connection: { connected: false, configured: true, mailbox: config.address, error: imapAuthCooldownMessage(config.imap) || errMsg }
      };
    }
  }

  return {
    success: false,
    provider: 'Titan / GoDaddy IMAP',
    mailbox: config.address,
    folders: [
      { name: 'Inbox', path: 'INBOX', total: leadTotal, unread: leadUnread },
      { name: 'Starred', path: 'Starred', total: leads.filter(l => l.starred).length, unread: 0 }
    ],
    connection: {
      connected: false,
      configured: config.isConfigured,
      mailbox: config.address,
      error: imapCooldownMessage || 'IMAP settings are not configured. Inbox sync is disabled; outbound SMTP is configured separately.'
    }
  };
}

export async function syncInbox() {
  const config = await getEmailConfig();
  if (!config.isConfigured) {
    const imapMissing = config.missingConfiguration.filter(name => name.startsWith('EMAIL_IMAP'));
    return {
      success: false,
      error: `IMAP configuration is incomplete. Missing: ${imapMissing.join(', ') || 'EMAIL_IMAP_PASSWORD or SMTP_PASSWORD'}.`
    };
  }

  let client;
  let lock;
  try {
    const supabase = getSupabase();
    client = createImapClient(config.imap);
    await client.connect();
    lock = await client.getMailboxLock('INBOX');

    const uids = await client.search({ all: true }, { uid: true });
    const latestUids = uids.sort((a, b) => b - a).slice(0, 200);
    const uidValidity = String(client.mailbox.uidValidity || '0');
    const records = [];

    if (latestUids.length) {
      for await (const message of client.fetch(latestUids, { uid: true, source: true, flags: true }, { uid: true })) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const text = parsed.text || '';
        const flags = new Set(message.flags || []);
        records.push({
          mailbox_email: config.address,
          folder: 'INBOX',
          uid_validity: uidValidity,
          imap_uid: message.uid,
          message_id: parsed.messageId || null,
          from_data: parsed.from?.value || [],
          to_data: parsed.to?.value || [],
          cc_data: parsed.cc?.value || [],
          subject: parsed.subject || '(No Subject)',
          received_at: parsed.date?.toISOString() || null,
          snippet: text.replace(/\s+/g, ' ').slice(0, 180),
          text_body: text,
          html_body: typeof parsed.html === 'string' ? parsed.html : null,
          attachments: (parsed.attachments || []).map(attachment => ({
            filename: attachment.filename || 'attachment',
            contentType: attachment.contentType || 'application/octet-stream',
            size: attachment.size || 0
          })),
          unread: !flags.has('\\Seen'),
          starred: flags.has('\\Flagged'),
          synced_at: new Date().toISOString()
        });
      }
    }

    if (records.length) {
      const { error } = await supabase.from('mailbox_messages').upsert(records, {
        onConflict: 'mailbox_email,folder,uid_validity,imap_uid'
      });
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return { success: false, error: 'Inbox storage is not initialized. Apply the mailbox messages migration.' };
        }
        throw error;
      }
    }

    return { success: true, synced: records.length, mailbox: config.address, folder: 'INBOX' };
  } catch (error) {
    recordImapAuthFailure(config.imap, error);
    const code = String(error?.code || '').toUpperCase();
    const authenticationFailed = error?.authenticationFailed || ['AUTHENTICATIONFAILED', 'EAUTH'].includes(code);
    console.warn(`IMAP_SYNC_FAILED ${code || 'IMAP_ERROR'}`);
    return {
      success: false,
      error: authenticationFailed
        ? 'Mailbox authentication failed. Verify the mailbox password in the server environment.'
        : 'IMAP inbox sync failed. Check the server-side mailbox and database configuration.'
    };
  } finally {
    lock?.release();
    if (client?.usable) {
      try { await client.logout(); } catch { /* Connection may already be closed. */ }
    }
  }
}

export async function fetchMessages({ folder = 'INBOX', page = 1, limit = 25, search = '' }) {
  const config = await getEmailConfig();
  const normFolder = normalizeFolder(folder);
  const leads = await getInboundLeadMessages();

  // Filter leads based on requested folder and search query
  let relevantLeads = [];
  if (normFolder === 'INBOX') {
    relevantLeads = [...leads];
  } else if (normFolder === 'Starred') {
    relevantLeads = leads.filter(l => l.starred);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    relevantLeads = relevantLeads.filter(l =>
      l.from.name.toLowerCase().includes(q) ||
      l.from.address.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q) ||
      l.snippet.toLowerCase().includes(q)
    );
  }

  let imapList = [];
  let imapSucceeded = false;
  const imapCooldownMessage = config.isConfigured ? imapAuthCooldownMessage(config.imap) : '';
  let connectionError = imapCooldownMessage || null;

  if (config.isConfigured && !imapCooldownMessage) {
    const client = createImapClient(config.imap);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(normFolder === 'Starred' ? 'INBOX' : normFolder);
      try {
        const searchQuery = normFolder === 'Starred' ? { flagged: true } : (search ? { or: [{ from: search }, { subject: search }] } : { all: true });
        const uids = await client.search(searchQuery, { uid: true });
        uids.sort((a, b) => b - a); // Newest first

        const offset = (page - 1) * limit;
        const pageUids = uids.slice(offset, offset + limit);

        if (pageUids.length > 0) {
          for await (const msg of client.fetch(pageUids, { envelope: true, flags: true, bodyStructure: true, uid: true })) {
            const flags = Array.from(msg.flags || []);
            const fromAddr = msg.envelope?.from?.[0] || {};
            imapList.push({
              uid: msg.uid,
              messageId: msg.envelope?.messageId || '',
              from: { name: fromAddr.name || fromAddr.address || 'Unknown', address: fromAddr.address || '' },
              to: (msg.envelope?.to || []).map(t => ({ name: t.name, address: t.address })),
              subject: msg.envelope?.subject || '(No Subject)',
              snippet: '',
              date: msg.envelope?.date?.toISOString() || new Date().toISOString(),
              folder: normFolder,
              unread: !flags.includes('\\Seen'),
              starred: flags.includes('\\Flagged'),
              hasAttachments: Boolean(msg.bodyStructure?.childNodes?.some(n => n.disposition === 'attachment'))
            });
          }
        }
        imapSucceeded = true;
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err) {
      recordImapAuthFailure(config.imap, err);
      connectionError = err.authenticationFailed || String(err.code || '').toUpperCase() === 'AUTHENTICATIONFAILED'
        ? 'IMAP authentication was rejected. Verify third-party IMAP access and EMAIL_IMAP_PASSWORD.'
        : `IMAP connection failed (${String(err.code || 'IMAP_ERROR')}).`;
      console.warn('IMAP fetch notice:', String(err.code || 'IMAP_ERROR'));
    }
  } else if (!config.isConfigured) {
    connectionError = 'Mailbox provider settings are missing. Configure server-side SMTP and IMAP environment variables.';
  }

  let storedMessages = [];
  if (!imapSucceeded) {
    try {
      const supabase = getSupabase();
      let query = supabase.from('mailbox_messages').select('*').eq('mailbox_email', config.address);
      if (normFolder === 'Starred') query = query.eq('folder', 'INBOX').eq('starred', true);
      else query = query.eq('folder', normFolder);
      const { data, error } = await query.order('received_at', { ascending: false }).limit(500);
      if (error) throw error;
      storedMessages = (data || []).map(row => mapStoredMailboxMessage(row));
    } catch (error) {
      console.warn(`Stored mailbox read failed: ${String(error?.code || 'MAILBOX_STORAGE_ERROR')}`);
    }
  }

  const combined = imapSucceeded ? [...relevantLeads, ...imapList] : [...relevantLeads, ...storedMessages];
  if (search && search.trim() && !imapSucceeded) {
    const query = search.trim().toLowerCase();
    const filtered = combined.filter(message =>
      message.from.name.toLowerCase().includes(query) ||
      message.from.address.toLowerCase().includes(query) ||
      message.subject.toLowerCase().includes(query) ||
      message.snippet.toLowerCase().includes(query)
    );
    combined.splice(0, combined.length, ...filtered);
  }

  // Sort newest first
  combined.sort((a, b) => new Date(b.date) - new Date(a.date));

  const offset = (page - 1) * limit;
  const paginated = combined.slice(offset, offset + limit);
  const unreadCount = combined.filter(m => m.unread).length;

  return {
    success: true,
    data: paginated,
    total: combined.length,
    page,
    limit,
    unreadCount,
    connection: {
      connected: imapSucceeded,
      configured: config.isConfigured,
      mailbox: config.address,
      error: connectionError
    }
  };
}

export async function fetchMessageDetail(uid, folder = 'INBOX') {
  const config = await getEmailConfig();
  const numUid = Number(uid);

  // Check if this is an inbound website lead inquiry
  if (numUid >= 800000) {
    const leads = await getInboundLeadMessages();
    const foundLead = leads.find(l => l.uid === numUid);
    if (foundLead) {
      try {
        const supabase = getSupabase();
        if (supabase && foundLead.unread) {
          await supabase.from('queries').update({ status: 'read' }).eq('id', foundLead.leadId);
          foundLead.unread = false;
        }
      } catch (e) {
        console.warn('Supabase mark read notice:', e.message);
      }
      return { success: true, data: foundLead, message: foundLead };
    }
  }

  // Live IMAP message detail
  if (config.isConfigured && numUid < 800000 && !imapAuthCooldownMessage(config.imap)) {
    const client = createImapClient(config.imap);
    const normFolder = normalizeFolder(folder);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(normFolder === 'Starred' ? 'INBOX' : normFolder);
      try {
        const fetchResult = await client.fetchOne(String(uid), { source: true, flags: true }, { uid: true });
        if (fetchResult && fetchResult.source) {
          const parsed = await simpleParser(fetchResult.source);
          try {
            await client.messageFlagsAdd({ uid: numUid }, ['\\Seen']);
          } catch (flagErr) {
            console.warn('Flag mark read notice:', flagErr.message);
          }

          const detail = {
            uid: numUid,
            messageId: parsed.messageId || '',
            from: {
              name: parsed.from?.value?.[0]?.name || parsed.from?.text || '',
              address: parsed.from?.value?.[0]?.address || ''
            },
            to: (parsed.to?.value || []).map(t => ({ name: t.name || '', address: t.address || '' })),
            cc: (parsed.cc?.value || []).map(t => ({ name: t.name || '', address: t.address || '' })),
            subject: parsed.subject || '(No Subject)',
            date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            html: parsed.html || (parsed.text ? `<p>${parsed.text.replace(/\n/g, '<br>')}</p>` : ''),
            text: parsed.text || '',
            hasAttachments: Boolean(parsed.attachments && parsed.attachments.length > 0),
            attachments: (parsed.attachments || []).map(a => ({
              filename: a.filename || 'attachment',
              contentType: a.contentType || 'application/octet-stream',
              size: a.size || 0
            }))
          };

          return {
            success: true,
            data: detail,
            message: detail
          };
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err) {
      recordImapAuthFailure(config.imap, err);
      console.warn('IMAP message detail notice, checking fallback:', String(err.code || 'IMAP_ERROR'));
    }
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('mailbox_messages').select('*')
      .eq('mailbox_email', config.address)
      .eq('folder', normalizeFolder(folder))
      .eq('imap_uid', numUid)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      const detail = mapStoredMailboxMessage(data, true);
      return { success: true, data: detail, message: detail };
    }
  } catch (error) {
    console.warn(`Stored mailbox detail read failed: ${String(error?.code || 'MAILBOX_STORAGE_ERROR')}`);
  }

  return { success: false, error: 'Email not found in the live mailbox.' };
}

export async function updateMessageState(uid, { read, star, moveTo, folder = 'INBOX' }) {
  const config = await getEmailConfig();
  const numUid = Number(uid);

  // If inbound lead message, update Supabase
  if (numUid >= 800000) {
    try {
      const supabase = getSupabase();
      const leadId = numUid - 800000;
      const updates = {};
      if (read !== undefined) updates.status = read ? 'read' : 'new';
      if (star !== undefined) updates.starred = star;
      if (supabase && Object.keys(updates).length > 0) {
        await supabase.from('queries').update(updates).eq('id', leadId);
      }
      return { success: true };
    } catch (err) {
      console.warn('Lead state update notice:', err.message);
      return { success: true };
    }
  }

  const normFolder = normalizeFolder(folder);
  if (config.isConfigured && !imapAuthCooldownMessage(config.imap)) {
    const client = createImapClient(config.imap);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(normFolder === 'Starred' ? 'INBOX' : normFolder);
      try {
        if (read === true) await client.messageFlagsAdd({ uid: numUid }, ['\\Seen']);
        if (read === false) await client.messageFlagsRemove({ uid: numUid }, ['\\Seen']);
        if (star === true) await client.messageFlagsAdd({ uid: numUid }, ['\\Flagged']);
        if (star === false) await client.messageFlagsRemove({ uid: numUid }, ['\\Flagged']);
        if (moveTo) {
          await client.messageMove({ uid: numUid }, moveTo);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err) {
      recordImapAuthFailure(config.imap, err);
      console.warn('IMAP update message notice:', String(err.code || 'IMAP_ERROR'));
    }
  }

  return { success: true };
}

export async function deleteMessage(uid, folder = 'INBOX') {
  return updateMessageState(uid, { moveTo: 'Trash', folder });
}

export async function sendEmail({ to, cc, bcc, subject, html, text, inReplyTo, references }) {
  const config = (await getEmailConfig()).smtp;
  let provider;
  try {
    provider = new SmtpService(config);
    const info = await provider.sendEmail({ to, cc, bcc, subject, text, html, inReplyTo, references });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    console.warn(`Inbox SMTP send failed: ${diagnostic.stage} ${diagnostic.code}`);
    return { success: false, ...diagnostic, error: diagnostic.message };
  } finally {
    provider?.close();
  }
}
