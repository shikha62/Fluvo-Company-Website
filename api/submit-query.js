import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';
  if (!url || !key) return null;
  return createClient(url, key);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://fluvo.in',
    'https://www.fluvo.in',
    'https://fluvo-company-website.vercel.app',
    'https://admin.fluvo.in',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174'
  ];

  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://fluvo.in');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function sendNotificationEmail(query) {
  // Support both EMAIL_* and SMTP_* naming conventions
  const host = process.env.EMAIL_SMTP_HOST || process.env.SMTP_HOST || 'smtp.titan.email';
  const port = parseInt(process.env.EMAIL_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
  const user = process.env.EMAIL_ADDRESS || process.env.EMAIL_USER || process.env.SMTP_USER || 'connect@fluvo.in';
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || '';
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.EMAIL_ADDRESS || 'connect@fluvo.in';

  if (!pass) {
    console.log('[Email Notice] No SMTP password configured; record saved in Supabase.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000
  });

  const leadName = query.full_name || query.fullName || 'Inbound Lead';
  const leadEmail = query.work_email || query.workEmail || '—';
  const leadPhone = query.phone || '—';
  const leadCompany = query.company || 'Enterprise';
  const leadAdSpend = query.ad_spend || query.adSpend || '—';
  const leadDate = query.preferred_date || query.preferredDate || '—';
  const leadMessage = query.message || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111; background-color: #f7f7f7; margin: 0; padding: 24px; }
        .card { max-width: 580px; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #eaeaea; padding: 28px; }
        .badge { display: inline-block; padding: 4px 10px; background: #FFF4ED; color: #D86B2F; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        h2 { margin: 12px 0 16px; font-size: 20px; color: #111; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
        td.label { width: 35%; color: #666; font-weight: 500; }
        td.val { color: #111; font-weight: 600; }
        .message-box { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 14px; margin-top: 14px; font-size: 14px; color: #333; white-space: pre-wrap; }
        .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #D86B2F; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">⚡ Inbound Strategy Call Request</span>
        <h2>${leadName} submitted a call request</h2>
        <table>
          <tr><td class="label">Full Name</td><td class="val">${leadName}</td></tr>
          <tr><td class="label">Work Email</td><td class="val"><a href="mailto:${leadEmail}">${leadEmail}</a></td></tr>
          <tr><td class="label">Phone Number</td><td class="val">${leadPhone}</td></tr>
          <tr><td class="label">Company</td><td class="val">${leadCompany}</td></tr>
          <tr><td class="label">Ad Spend / Budget</td><td class="val">${leadAdSpend}</td></tr>
          <tr><td class="label">Preferred Date</td><td class="val">${leadDate}</td></tr>
          <tr><td class="label">Received At</td><td class="val">${new Date().toUTCString()}</td></tr>
        </table>
        ${leadMessage ? `
          <div style="margin-top: 14px;">
            <strong style="font-size: 13px; color: #666;">Growth Objective / Message:</strong>
            <div class="message-box">${leadMessage}</div>
          </div>
        ` : ''}
        <a href="https://admin.fluvo.in" class="btn">Open Executive Portal &rarr;</a>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Fluvo Lead Engine" <${user}>`,
    to: recipient,
    replyTo: leadEmail !== '—' ? leadEmail : undefined,
    subject: `⚡ [Strategy Call Request] ${leadName} (${leadCompany})`,
    html,
    text: `New Strategy Call Request:\nName: ${leadName}\nEmail: ${leadEmail}\nPhone: ${leadPhone}\nCompany: ${leadCompany}\nBudget: ${leadAdSpend}\nDate: ${leadDate}\nMessage: ${leadMessage}`
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const fullName = String(body.fullName || body.name || body.full_name || '').trim().slice(0, 100);
    const workEmail = String(body.workEmail || body.email || body.work_email || '').trim().toLowerCase().slice(0, 150);
    const phone = String(body.phone || '').trim().slice(0, 30);
    const company = String(body.company || '').trim().slice(0, 120);
    const message = String(body.message || '').trim().slice(0, 3000);
    const adSpend = String(body.adSpend || body.ad_spend || 'Schedule Strategy Call').trim().slice(0, 60);
    const preferredDate = String(body.preferredDate || body.preferred_date || '').trim().slice(0, 40);
    const preferredTime = String(body.preferredTime || body.preferred_time || '').trim().slice(0, 40);

    if (!fullName || !workEmail) {
      return res.status(400).json({ error: 'Full name and email are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const newRecord = {
      type: body.type || 'schedule',
      full_name: fullName,
      work_email: workEmail,
      phone: phone || null,
      company: company || null,
      message: message || null,
      ad_spend: adSpend,
      preferred_date: preferredDate || null,
      preferred_time: preferredTime || null,
      status: 'new',
      starred: false,
      created_at: new Date().toISOString()
    };

    const supabase = getSupabase();
    let savedId = null;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('queries')
          .insert([newRecord])
          .select('id')
          .single();

        if (error) {
          console.warn('[Supabase Insert Notice]', error.message);
          // Fallback camelCase
          const fallbackRecord = {
            type: body.type || 'schedule',
            fullName: fullName,
            workEmail: workEmail,
            phone: phone || null,
            company: company || null,
            message: message || null,
            adSpend: adSpend,
            preferredDate: preferredDate || null,
            status: 'new',
            starred: false,
            createdAt: new Date().toISOString()
          };
          const retry = await supabase.from('queries').insert([fallbackRecord]).select('id').single();
          if (retry.data) savedId = retry.data.id;
        } else if (data) {
          savedId = data.id;
        }
      } catch (dbErr) {
        console.warn('[Supabase Error]', dbErr.message);
      }
    }

    // Attempt email notification
    try {
      await sendNotificationEmail(newRecord);
    } catch (emailErr) {
      console.warn('[Email Notification Notice]', emailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully.',
      id: savedId
    });
  } catch (err) {
    console.error('[Submit Query Handler Error]', err);
    return res.status(500).json({ error: 'Internal server error processing inquiry.' });
  }
}
