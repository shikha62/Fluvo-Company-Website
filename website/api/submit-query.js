import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://fluvo.in',
    'https://www.fluvo.in',
    'https://fluvo-company-website.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174'
  ];

  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://fluvo.in');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function sendNotificationEmail(query) {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const recipient = process.env.ADMIN_NOTIFICATION_EMAIL || 'owner@fluvo.in';

  if (!host || !user || !pass) {
    console.log('[Email] SMTP credentials not configured in environment; skipping email notification.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

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
        <span class="badge">New Enterprise Inquiry</span>
        <h2>${query.full_name || query.fullName || 'New Lead'} submitted an inquiry</h2>
        <table>
          <tr><td class="label">Name</td><td class="val">${query.full_name || query.fullName || '—'}</td></tr>
          <tr><td class="label">Email</td><td class="val">${query.work_email || query.workEmail || '—'}</td></tr>
          <tr><td class="label">Phone</td><td class="val">${query.phone || '—'}</td></tr>
          <tr><td class="label">Company</td><td class="val">${query.company || '—'}</td></tr>
          <tr><td class="label">Budget / Spend</td><td class="val">${query.ad_spend || query.adSpend || '—'}</td></tr>
          <tr><td class="label">Preferred Date</td><td class="val">${query.preferred_date || query.preferredDate || '—'}</td></tr>
          <tr><td class="label">Received At</td><td class="val">${new Date().toUTCString()}</td></tr>
        </table>
        ${query.message ? `
          <div style="margin-top: 14px;">
            <strong style="font-size: 13px; color: #666;">Message / Strategic Goals:</strong>
            <div class="message-box">${query.message}</div>
          </div>
        ` : ''}
        <a href="https://admin.fluvo.in" class="btn">Open Admin Dashboard &rarr;</a>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"Fluvo Growth Portal" <${user}>`,
    to: recipient,
    subject: `⚡ New Inquiry: ${query.full_name || query.fullName || 'Prospective Client'} (${query.company || 'Enterprise'})`,
    html
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

    if (!fullName || !workEmail) {
      return res.status(400).json({ error: 'Full name and email are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const newRecord = {
      full_name: fullName,
      work_email: workEmail,
      phone: phone || null,
      company: company || null,
      message: message || null,
      ad_spend: adSpend,
      preferred_date: preferredDate || null,
      status: 'new',
      starred: false,
      created_at: new Date().toISOString()
    };

    const supabase = getSupabase();
    let savedRecord = newRecord;

    if (supabase) {
      const { data, error } = await supabase
        .from('queries')
        .insert([newRecord])
        .select()
        .single();

      if (error) {
        console.error('[Supabase Insert Error]', error);
        // If columns differ (e.g. camelCase vs snake_case), try fallback
        const fallbackRecord = {
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
        const retry = await supabase.from('queries').insert([fallbackRecord]).select().single();
        if (!retry.error) {
          savedRecord = retry.data;
        } else {
          console.error('[Supabase Fallback Insert Error]', retry.error);
        }
      } else {
        savedRecord = data;
      }
    }

    // Attempt email notification non-blockingly
    try {
      await sendNotificationEmail(newRecord);
    } catch (emailErr) {
      console.error('[Email Notification Error]', emailErr);
    }

    return res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully.',
      id: savedRecord.id || null
    });
  } catch (err) {
    console.error('[Submit Query Handler Error]', err);
    return res.status(500).json({ error: 'Internal server error processing inquiry.' });
  }
}
