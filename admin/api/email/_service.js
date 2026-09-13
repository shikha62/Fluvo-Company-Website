import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

// Configuration helper
export function getEmailConfig() {
  const address = process.env.EMAIL_ADDRESS || process.env.EMAIL_USER || 'connect@fluvo.in';
  const password = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || '';
  const imapHost = process.env.EMAIL_IMAP_HOST || 'imap.titan.email';
  const imapPort = parseInt(process.env.EMAIL_IMAP_PORT || '993', 10);
  const smtpHost = process.env.EMAIL_SMTP_HOST || 'smtp.titan.email';
  // Try port 587 (STARTTLS) first — more reliable in serverless; fallback to 465 (SSL)
  const smtpPort = parseInt(process.env.EMAIL_SMTP_PORT || '587', 10);
  const smtpSecure = smtpPort === 465; // true only for port 465 (implicit SSL)

  return {
    address,
    password,
    imap: {
      host: imapHost,
      port: imapPort,
      secure: true, // always SSL for IMAP 993
      auth: { user: address, pass: password },
      logger: false,
      connectionTimeout: 8000,   // 8s — prevent Vercel serverless freeze
      socketTimeout: 8000,
      greetingTimeout: 8000,
    },
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,       // false for 587 (STARTTLS), true for 465
      requireTLS: smtpPort === 587,
      auth: { user: address, pass: password },
      connectionTimeout: 8000,
      socketTimeout: 8000,
      greetingTimeout: 8000,
    },
    isConfigured: Boolean(password && password.length > 3),
  };
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';
  if (!url || !key) return null;
  return createClient(url, key);
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
  const config = getEmailConfig();
  const leads = await getInboundLeadMessages();
  const leadUnread = leads.filter(l => l.unread).length;
  const leadTotal = leads.length;

  // If live credentials configured, attempt real IMAP
  if (config.isConfigured) {
    const client = new ImapFlow(config.imap);
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
        folders: folderList
      };
    } catch (err) {
      console.warn('IMAP live connection notice, serving cached storage:', err.message);
    }
  }

  // Fallback / local dev store counts
  const inboxUnread = mockMailbox.filter(m => m.folder === 'INBOX' && m.unread).length + leadUnread;
  const inboxTotal = mockMailbox.filter(m => m.folder === 'INBOX').length + leadTotal;
  const starredTotal = mockMailbox.filter(m => m.starred).length + leads.filter(l => l.starred).length;
  const sentTotal = mockMailbox.filter(m => m.folder === 'Sent').length;
  const draftsTotal = mockMailbox.filter(m => m.folder === 'Drafts').length;
  const archiveTotal = mockMailbox.filter(m => m.folder === 'Archive').length;
  const trashTotal = mockMailbox.filter(m => m.folder === 'Trash').length;
  const spamTotal = mockMailbox.filter(m => m.folder === 'Spam').length;

  return {
    success: true,
    provider: config.isConfigured ? 'Titan Email (Reconnecting)' : 'Fluvo Enterprise Mailbox Engine',
    mailbox: config.address,
    folders: [
      { name: 'Inbox', path: 'INBOX', total: inboxTotal, unread: inboxUnread },
      { name: 'Starred', path: 'Starred', total: starredTotal, unread: 0 },
      { name: 'Sent', path: 'Sent', total: sentTotal, unread: 0 },
      { name: 'Drafts', path: 'Drafts', total: draftsTotal, unread: 0 },
      { name: 'Archive', path: 'Archive', total: archiveTotal, unread: 0 },
      { name: 'Trash', path: 'Trash', total: trashTotal, unread: 0 },
      { name: 'Spam', path: 'Spam', total: spamTotal, unread: 0 }
    ]
  };
}

export async function fetchMessages({ folder = 'INBOX', page = 1, limit = 25, search = '' }) {
  const config = getEmailConfig();
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

  if (config.isConfigured) {
    const client = new ImapFlow(config.imap);
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
      console.warn('IMAP fetch notice:', err.message);
    }
  }

  // Combine IMAP messages (or fallback mock) with relevant inbound leads
  let combined = [];
  if (imapSucceeded) {
    combined = [...relevantLeads, ...imapList];
  } else {
    let filteredMock = [...mockMailbox];
    if (normFolder === 'Starred') {
      filteredMock = filteredMock.filter(m => m.starred);
    } else {
      filteredMock = filteredMock.filter(m => m.folder === normFolder);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredMock = filteredMock.filter(m =>
        m.from.name.toLowerCase().includes(q) ||
        m.from.address.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.snippet.toLowerCase().includes(q)
      );
    }
    combined = [...relevantLeads, ...filteredMock];
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
    unreadCount
  };
}

export async function fetchMessageDetail(uid, folder = 'INBOX') {
  const config = getEmailConfig();
  const numUid = Number(uid);

  // Check if this is an inbound website lead inquiry
  if (numUid >= 800000) {
    const leads = await getInboundLeadMessages();
    const foundLead = leads.find(l => l.uid === numUid);
    if (foundLead) {
      // Mark as read in Supabase if new
      try {
        const supabase = getSupabase();
        if (supabase && foundLead.unread) {
          await supabase.from('queries').update({ status: 'read' }).eq('id', foundLead.leadId);
          foundLead.unread = false;
        }
      } catch (e) {
        console.warn('Supabase mark read notice:', e.message);
      }
      return { success: true, data: foundLead };
    }
  }

  // Live IMAP message detail
  if (config.isConfigured && numUid < 800000) {
    const client = new ImapFlow(config.imap);
    const normFolder = normalizeFolder(folder);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(normFolder === 'Starred' ? 'INBOX' : normFolder);
      try {
        const msg = await client.download(uid, ['rfc822'], { uid: true });
        const parsed = await simpleParser(msg.content);
        await client.messageFlagsAdd({ uid }, ['\\Seen']);

        return {
          success: true,
          data: {
            uid: Number(uid),
            messageId: parsed.messageId || '',
            from: { name: parsed.from?.value?.[0]?.name || parsed.from?.text, address: parsed.from?.value?.[0]?.address },
            to: (parsed.to?.value || []).map(t => ({ name: t.name, address: t.address })),
            cc: (parsed.cc?.value || []).map(t => ({ name: t.name, address: t.address })),
            subject: parsed.subject || '(No Subject)',
            date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
            html: parsed.html || `<p>${(parsed.text || '').replace(/\n/g, '<br>')}</p>`,
            text: parsed.text || '',
            attachments: (parsed.attachments || []).map(a => ({
              filename: a.filename || 'attachment',
              contentType: a.contentType,
              size: a.size
            }))
          }
        };
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err) {
      console.warn('IMAP message detail notice, checking fallback:', err.message);
    }
  }

  // Fallback in mock store
  const found = mockMailbox.find(m => m.uid === numUid);
  if (!found) {
    return { success: false, error: 'Email not found.' };
  }

  found.unread = false;
  return {
    success: true,
    data: found
  };
}

export async function updateMessageState(uid, { read, star, moveTo, folder = 'INBOX' }) {
  const config = getEmailConfig();
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
  if (config.isConfigured) {
    const client = new ImapFlow(config.imap);
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
      console.warn('IMAP update message notice:', err.message);
    }
  }

  // Update in memory fallback
  const found = mockMailbox.find(m => m.uid === numUid);
  if (found) {
    if (read !== undefined) found.unread = !read;
    if (star !== undefined) found.starred = star;
    if (moveTo !== undefined) found.folder = normalizeFolder(moveTo);
  }

  return { success: true };
}

export async function deleteMessage(uid, folder = 'INBOX') {
  return updateMessageState(uid, { moveTo: 'Trash', folder });
}

export async function sendEmail({ to, cc, bcc, subject, html, text, inReplyTo, references }) {
  const config = getEmailConfig();

  if (config.isConfigured) {
    const transporter = nodemailer.createTransport(config.smtp);
    try {
      const info = await transporter.sendMail({
        from: `"Fluvo Connect" <${config.address}>`,
        to,
        cc,
        bcc,
        subject,
        text,
        html,
        inReplyTo,
        references
      });

      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.warn('SMTP live send error:', err.message);
      return {
        success: false,
        error: `SMTP Error: ${err.message}. Please check EMAIL_PASSWORD / EMAIL_SMTP_HOST in Vercel settings.`
      };
    }
  }

  // Simulated sent record when credentials are not configured yet
  const sentRecord = {
    uid: Date.now(),
    messageId: `<fluvo_${Date.now()}@fluvo.in>`,
    from: { name: 'Fluvo Executive Team', address: config.address },
    to: [{ name: to, address: to }],
    subject: subject || '(No Subject)',
    snippet: text ? text.slice(0, 120) : 'Outgoing message from Fluvo Executive Portal',
    date: new Date().toISOString(),
    folder: 'Sent',
    unread: false,
    starred: false,
    hasAttachments: false,
    attachments: [],
    html: html || `<p>${(text || '').replace(/\n/g, '<br>')}</p>`,
    text: text || ''
  };

  mockMailbox.unshift(sentRecord);

  return {
    success: true,
    messageId: sentRecord.messageId,
    simulated: true
  };
}
