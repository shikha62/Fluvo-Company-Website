import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve('c:/Users/HP/Downloads/reachora-main/admin/.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = (match[2] || '').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[match[1]] = value;
  }
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: updated, error } = await supabase
    .from('campaign_recipients')
    .update({ status: 'pending', error_message: null })
    .eq('status', 'already_contacted')
    .select('id, recipient_email, status');
    
  if (error) console.error('Error updating:', error);
  else console.log('Successfully reset recipients to pending:', updated);
}

run();
