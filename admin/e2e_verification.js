import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

const BASE_URL = 'http://localhost:5174';

async function runE2ETests() {
  console.log('=== STARTING END-TO-END VERIFICATION ===\n');
  let cookie = '';

  // 1. Authenticate
  console.log('[STEP 1] Authenticating...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'connect@fluvo.in',
      password: 'Vv@5661850'
    })
  });

  if (!loginRes.ok) {
    const text = await loginRes.text();
    console.error('Login failed:', loginRes.status, text);
    return;
  }

  const setCookieHeader = loginRes.headers.get('set-cookie');
  if (setCookieHeader) {
    cookie = setCookieHeader.split(';')[0];
  }
  console.log('Authentication SUCCESS! Session established.\n');

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': cookie
  };

  // 2. Test Name Parsing & Deduplication (TEST 4 & TEST 9)
  console.log('[STEP 2] Testing Name Parsing & Deduplication (TEST 4 & 9)...');
  const validateRes = await fetch(`${BASE_URL}/api/email/leads/validate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      leads: [
        { email: 'john.doe@gmail.com' },
        { email: 'meghamandre@gmail.com' },
        { email: 'john.doe@gmail.com' }
      ],
      allowRecontact: true
    })
  });

  const validateData = await validateRes.json();
  console.log('Validate status:', validateRes.status);
  console.log('Recipients returned:', validateData.recipients?.length);
  for (const r of validateData.recipients || []) {
    console.log(`- ${r.email}: firstName="${r.firstName}", company="${r.companyName}", status="${r.status}"`);
  }

  // 3. Test Campaign Creation
  console.log('\n[STEP 3] Creating Campaign with Deduplicated Recipients...');
  const createRes = await fetch(`${BASE_URL}/api/email/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `E2E Test Campaign ${Date.now()}`,
      recipients: [
        { email: 'john.doe@gmail.com' },
        { email: 'meghamandre@gmail.com' },
        { email: 'JOHN.DOE@GMAIL.COM' } // duplicate with different case
      ],
      complianceConfirmed: true,
      allowRecontact: true
    })
  });

  const createData = await createRes.json();
  console.log('Create campaign status:', createRes.status);
  if (!createRes.ok) {
    console.error('Campaign creation failed:', createData);
    return;
  }
  const campaign = createData.campaign;
  console.log(`Campaign created: id="${campaign.id}", total_recipients=${campaign.total_recipients}`);
  console.log('Unique recipients in campaign:');
  for (const r of createData.recipients || []) {
    console.log(`- ${r.email}: firstName="${r.firstName}", company="${r.companyName}", status="${r.status}"`);
  }

  // 4. Test Fetch Campaign Details (Verifying company name and first name are populated)
  console.log('\n[STEP 4] Fetching Campaign Details...');
  const detailRes = await fetch(`${BASE_URL}/api/email/campaigns/${campaign.id}`, { headers });
  const detailData = await detailRes.json();
  console.log('Recipients in campaign detail:');
  const recipientIds = [];
  for (const r of detailData.recipients || []) {
    recipientIds.push({ id: r.id, email: r.recipient_email });
    console.log(`- ID: ${r.id}, Email: ${r.recipient_email}, First Name: ${r.first_name}, Company: ${r.company_name}, Status: ${r.status}`);
  }

  // 5. Test Suppression List (TEST 5)
  console.log('\n[STEP 5] Testing Suppression (TEST 5)...');
  const testSuppressEmail = `suppressed-${Date.now()}@example.com`;
  const suppressRes = await fetch(`${BASE_URL}/api/email/suppress`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: testSuppressEmail,
      reason: 'Administrator manual suppression'
    })
  });
  const suppressData = await suppressRes.json();
  console.log('Suppression status:', suppressRes.status, suppressData);

  // 6. Test Campaign Creation with Suppressed Recipient
  console.log('\n[STEP 6] Testing Campaign with Suppressed Recipient...');
  const createSuppRes = await fetch(`${BASE_URL}/api/email/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Suppression Check ${Date.now()}`,
      recipients: [{ email: testSuppressEmail }],
      complianceConfirmed: true
    })
  });
  const createSuppData = await createSuppRes.json();
  console.log('Suppressed campaign recipient status:', createSuppData.recipients?.[0]?.status);

  // 7. Test Deletion of Recipient Activity Record (TEST 8)
  console.log('\n[STEP 7] Testing Deletion of Activity Record (TEST 8)...');
  if (recipientIds.length > 0) {
    const targetToDelete = recipientIds[0];
    console.log(`Deleting recipient: ${targetToDelete.email} (id: ${targetToDelete.id})`);
    const deleteRes = await fetch(`${BASE_URL}/api/email/recipients/${targetToDelete.id}`, {
      method: 'DELETE',
      headers
    });
    const deleteData = await deleteRes.json();
    console.log('Delete status:', deleteRes.status, deleteData);

    // Verify it is gone from campaign
    const checkRes = await fetch(`${BASE_URL}/api/email/campaigns/${campaign.id}`, { headers });
    const checkData = await checkRes.json();
    const remainingIds = (checkData.recipients || []).map(r => r.id);
    console.log('Recipient deleted successfully?', !remainingIds.includes(targetToDelete.id));
    console.log('Updated campaign total_recipients:', checkData.campaign?.total_recipients);
  }

  // 8. Test Re-launch Idempotency (TEST 10)
  console.log('\n[STEP 8] Testing Re-launch Idempotency (TEST 10)...');
  // First, create a single recipient campaign for launch test
  const singleCampaignRes = await fetch(`${BASE_URL}/api/email/campaigns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Single Recipient Launch ${Date.now()}`,
      recipients: [{ email: 'shikhamandre31@gmail.com' }],
      complianceConfirmed: true
    })
  });
  const singleData = await singleCampaignRes.json();
  const singleCampaignId = singleData.campaign.id;
  console.log(`Created campaign ${singleCampaignId} with 1 recipient: shikhamandre31@gmail.com`);

  console.log('\n[STEP 9] Launching Campaign (TEST 1 & Send Execution)...');
  const launchRes = await fetch(`${BASE_URL}/api/email/campaigns/${singleCampaignId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'launch' })
  });
  const launchData = await launchRes.json();
  console.log('Launch status:', launchRes.status, launchData);

  // Check campaign status in DB
  const verifyLaunchRes = await fetch(`${BASE_URL}/api/email/campaigns/${singleCampaignId}`, { headers });
  const verifyData = await verifyLaunchRes.json();
  console.log('Post-launch campaign status:', verifyData.campaign?.status);
  console.log('Post-launch sent_count:', verifyData.campaign?.sent_count);
  for (const r of verifyData.recipients || []) {
    console.log(`- Recipient: ${r.recipient_email}, Status: ${r.status}, Attempts: ${r.attempts}, Sent At: ${r.sent_at}, Provider Msg ID: ${r.provider_message_id}`);
  }

  // Re-launch: TEST 10
  console.log('\n[STEP 10] Testing Re-Launch on Completed Campaign (TEST 10)...');
  const relaunchRes = await fetch(`${BASE_URL}/api/email/campaigns/${singleCampaignId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'launch' })
  });
  const relaunchData = await relaunchRes.json();
  console.log('Relaunch response:', relaunchData);

  console.log('\n=== END-TO-END VERIFICATION COMPLETED ===');
}

runE2ETests().catch(console.error);
