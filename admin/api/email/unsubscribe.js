import { setSecurityHeaders } from '../_auth.js';
import { getSupabase, verifyUnsubscribeToken } from './_automation.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const token = req.query.token || req.body?.token || '';
  const email = verifyUnsubscribeToken(token);
  if (!email) return res.status(400).send('This unsubscribe link is invalid or expired.');

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body style="font:16px system-ui;background:#0b0b0b;color:#f5f2ec;max-width:560px;margin:12vh auto;padding:24px"><h1>Email preferences</h1><p>Confirm that you no longer want outreach from Fluvo at ${escapeHtml(email)}.</p><form method="post" action="/api/email/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button style="background:#c4622d;color:white;padding:12px 18px;border:0;border-radius:4px" type="submit">Unsubscribe</button></form></body></html>`);
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed.');
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('suppression_list').upsert({ email, reason: 'recipient_unsubscribe' }, { onConflict: 'email' });
    if (error) throw error;
    const { data: affected } = await supabase.from('campaign_recipients').update({ status: 'unsubscribed', error_message: 'Recipient unsubscribed.', updated_at: new Date().toISOString() })
      .eq('recipient_email', email).in('status', ['pending', 'queued']).select('id');
    if (affected?.length) {
      await supabase.from('email_events').insert(affected.map(row => ({ campaign_recipient_id: row.id, event_type: 'unsubscribed', metadata: {} })));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><body style="font:16px system-ui;background:#0b0b0b;color:#f5f2ec;max-width:560px;margin:12vh auto;padding:24px"><h1>You are unsubscribed</h1><p>Fluvo will not send further outreach to this address.</p></body></html>');
  } catch (error) {
    console.error('Unsubscribe request failed:', error.message);
    return res.status(500).send('We could not process the request. Please retry or contact connect@fluvo.in.');
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}