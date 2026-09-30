#!/usr/bin/env node
// Test sending with the real campaign runner to verify the fix
// Usage: node scripts/test-campaign-send.js <recipientEmail>

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const toEmail = process.argv[2] || 'meghamandre@gmail.com';

// Test the sendRenderedEmail function directly
import('../server-api/email/_automation.js').then(async ({ sendRenderedEmail, getProviderConfig, EmailProvider, getUnsubscribeUrl }) => {
  const config = getProviderConfig();
  if (!config.configured) {
    console.error('SMTP not configured:', config.error?.message);
    process.exit(1);
  }

  const provider = new EmailProvider(config);
  
  const unsubUrl = getUnsubscribeUrl(toEmail);
  const body = `Hi there,

We wanted to reach out about how Fluvo can help your business grow.

Our team specializes in technology-driven digital growth and performance engineering.

Would love to connect and learn more about your goals.

Best regards,
The Fluvo Team

Unsubscribe: ${unsubUrl}`;

  console.log(`\nSending campaign test email to: ${toEmail}`);
  console.log(`Unsubscribe URL: ${unsubUrl || '(none — header will be skipped)'}`);
  
  try {
    const result = await sendRenderedEmail({
      recipient: toEmail,
      subject: 'Campaign Test — Fluvo',
      body,
      provider,
      isTest: false,
      campaignId: 'test-direct',
      recipientId: 'test-recipient'
    });
    console.log(`\n✅ Campaign email sent!`);
    console.log(`   messageId: ${result?.messageId}`);
  } catch (err) {
    console.error(`\n❌ Failed: ${err.message}`);
    if (err.code) console.error(`   Code: ${err.code}`);
  } finally {
    provider.close();
  }
});
