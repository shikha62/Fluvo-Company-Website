#!/usr/bin/env node
// Reset stuck campaign recipients so they can be retried
// Usage: node scripts/reset-campaign.js <campaignId>

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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const campaignId = process.argv[2];
if (!campaignId) {
  // List all campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id,name,status,sent_count,failed_count,total_recipients')
    .order('created_at', { ascending: false })
    .limit(10);
  
  console.log('\nRecent campaigns:');
  for (const c of campaigns || []) {
    console.log(`  [${c.status}] ${c.id} — ${c.name} (sent:${c.sent_count} failed:${c.failed_count} total:${c.total_recipients})`);
  }
  console.log('\nUsage: node scripts/reset-campaign.js <campaignId>');
  process.exit(0);
}

console.log(`\nResetting failed recipients for campaign: ${campaignId}`);

// Reset all 'failed' recipients back to 'pending' so they can retry
const { data, error } = await supabase
  .from('campaign_recipients')
  .update({ status: 'pending', error_message: null, attempts: 0, updated_at: new Date().toISOString() })
  .eq('campaign_id', campaignId)
  .eq('status', 'failed')
  .select('id,recipient_email');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`✅ Reset ${data?.length || 0} recipients to pending:`);
for (const r of data || []) {
  console.log(`   - ${r.recipient_email}`);
}

// Also reset campaign status to queued if completed/failed
await supabase
  .from('campaigns')
  .update({ status: 'queued', failed_count: 0 })
  .eq('id', campaignId)
  .in('status', ['failed', 'completed']);

console.log('\nCampaign reset complete. You can now re-launch it from the dashboard.');
