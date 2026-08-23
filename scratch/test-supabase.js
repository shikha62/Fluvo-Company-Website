import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tafwdnswcrjfaxhbdnlb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P8A-ht36tSNNi82E4W7mug_qszJUxl1';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('Testing Supabase connection...');
  
  // Test select
  const { data, error } = await supabase.from('queries').select('*');
  console.log('Select result:');
  console.log('Error:', error);
  console.log('Data:', data);

  // Test insert
  const testRow = {
    type: 'schedule',
    full_name: 'Test Executive',
    work_email: 'test@example.com',
    company: 'Test Corp',
    phone: '+1 234 567 8900',
    ad_spend: '$50k-$100k',
    preferred_date: '2026-08-25',
    preferred_time: '2:00 PM',
    message: 'Testing Supabase insertion from script',
    status: 'new',
    starred: false,
    notes: 'Test note'
  };

  const { data: insertData, error: insertError } = await supabase
    .from('queries')
    .insert([testRow])
    .select();

  console.log('Insert result:');
  console.log('Insert Error:', insertError);
  console.log('Insert Data:', insertData);
}

test();
