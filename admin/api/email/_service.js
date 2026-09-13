import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

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
      connectionTimeout: 8000,   // 8s — Vercel functions time out at 10s
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

// ── IMAP Operations ──────────────────────────────────────────────────────────

export async function fetchFolders() {
  const config = getEmailConfig();

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
          folderList.push({
            name: m.name,
            path: m.path,
            total: status.messages || 0,
            unread: status.unseen || 0
          });
        } catch {
          folderList.push({ name: m.name, path: m.path, total: 0, unread: 0 });
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
      console.warn('IMAP live connection failed, falling back to simulated storage:', err.message);
    }
  }

  // Fallback / local dev store counts
  const inboxUnread = mockMailbox.filter(m => m.folder === 'INBOX' && m.unread).length;
  const inboxTotal = mockMailbox.filter(m => m.folder === 'INBOX').length;
  const starredTotal = mockMailbox.filter(m => m.starred).length;
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

        const list = [];
        if (pageUids.length > 0) {
          for await (const msg of client.fetch(pageUids, { envelope: true, flags: true, bodyStructure: true, uid: true })) {
            const flags = Array.from(msg.flags || []);
            const fromAddr = msg.envelope?.from?.[0] || {};
            list.push({
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

        return {
          success: true,
          data: list,
          total: uids.length,
          page,
          limit,
          unreadCount: list.filter(m => m.unread).length
        };
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (err) {
      console.warn('IMAP fetchMessages live error, serving cache/fallback:', err.message);
    }
  }

  // Fallback mock filtering
  let filtered = [...mockMailbox];
  if (normFolder === 'Starred') {
    filtered = filtered.filter(m => m.starred);
  } else {
    filtered = filtered.filter(m => m.folder === normFolder);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(m =>
      m.from.name.toLowerCase().includes(q) ||
      m.from.address.toLowerCase().includes(q) ||
      m.subject.toLowerCase().includes(q) ||
      m.snippet.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  const offset = (page - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit);
  const unreadCount = mockMailbox.filter(m => m.folder === 'INBOX' && m.unread).length;

  return {
    success: true,
    data: paginated,
    total: filtered.length,
    page,
    limit,
    unreadCount
  };
}

export async function fetchMessageDetail(uid, folder = 'INBOX') {
  const config = getEmailConfig();
  const normFolder = normalizeFolder(folder);

  if (config.isConfigured) {
    const client = new ImapFlow(config.imap);
    try {
      await client.connect();
      const lock = await client.getMailboxLock(normFolder === 'Starred' ? 'INBOX' : normFolder);
      try {
        const msg = await client.download(uid, ['rfc822'], { uid: true });
        const parsed = await simpleParser(msg.content);
        const flags = await client.messageFlagsAdd({ uid }, ['\\Seen']);

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
      console.warn('IMAP message detail live error, using fallback:', err.message);
    }
  }

  const numUid = Number(uid);
  const found = mockMailbox.find(m => m.uid === numUid);
  if (!found) {
    return { success: false, error: 'Email not found.' };
  }

  // Mark read
  found.unread = false;

  return {
    success: true,
    data: found
  };
}

export async function updateMessageState(uid, { read, star, moveTo, folder = 'INBOX' }) {
  const config = getEmailConfig();
  const normFolder = normalizeFolder(folder);
  const numUid = Number(uid);

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
      console.warn('IMAP update message live error:', err.message);
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
      console.warn('SMTP live send error, storing in sent folder:', err.message);
    }
  }

  // Simulated sent record
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
    simulated: !config.isConfigured
  };
}
