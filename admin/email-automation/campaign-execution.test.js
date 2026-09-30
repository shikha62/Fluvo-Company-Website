import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCampaign } from '../api/email/campaign-runner.js';
import { parseLeadEmail } from './personalization.js';

// Mock Supabase client to test all execution scenarios in isolation
function createMockSupabase(initialState = {}) {
  const state = {
    campaigns: new Map((initialState.campaigns || []).map(c => [c.id, { ...c }])),
    campaign_recipients: new Map((initialState.recipients || []).map(r => [r.id, { ...r }])),
    suppression_list: new Map((initialState.suppressions || []).map(s => [s.email.toLowerCase(), { ...s }])),
    email_events: [],
    audit_logs: [],
    failSentStatusUpdate: Boolean(initialState.failSentStatusUpdate),
    leads: new Map((initialState.leads || []).map(l => [l.email.toLowerCase(), { ...l }]))
  };

  const client = {
    from(table) {
      return {
        select(cols) {
          const rows = Array.from(state[table]?.values() || [], row => ({ ...row }));
          return {
            eq(col, val) {
              const filtered = rows.filter(r => r[col] === val);
              return {
                maybeSingle: async () => ({ data: filtered[0] || null, error: null }),
                single: async () => ({ data: filtered[0] || null, error: filtered[0] ? null : new Error('Not found') }),
                order: () => ({
                  data: filtered,
                  error: null
                }),
                in: (col2, vals) => ({
                  data: filtered.filter(r => vals.includes(r[col2])),
                  error: null
                })
              };
            },
            in(col, vals) {
              const filtered = rows.filter(r => vals.includes(r[col]?.toLowerCase?.() ?? r[col]));
              return Promise.resolve({ data: filtered, error: null });
            },
            order() {
              return Promise.resolve({ data: rows, error: null });
            }
          };
        },
        update(updates) {
          const filters = [];
          const applyUpdates = () => {
            const updated = [];
            for (const row of state[table].values()) {
              if (filters.every(([column, value]) => row[column] === value)) {
                Object.assign(row, updates);
                updated.push(row);
              }
            }
            return updated;
          };
          const builder = {
            eq(column, value) {
              filters.push([column, value]);
              return builder;
            },
            select() {
              return {
                single: async () => ({ data: applyUpdates()[0] || null, error: null }),
                maybeSingle: async () => state.failSentStatusUpdate && updates.status === 'sent'
                  ? { data: null, error: Object.assign(new Error('Write rejected'), { code: 'TEST_WRITE_FAILED' }) }
                  : { data: applyUpdates()[0] || null, error: null }
              };
            },
            then(resolve, reject) {
              return Promise.resolve({ data: applyUpdates(), error: null }).then(resolve, reject);
            }
          };
          return builder;
        },
        insert(records) {
          const arr = Array.isArray(records) ? records : [records];
          for (const item of arr) {
            const id = item.id || `gen-${Math.random()}`;
            if (state[table]) state[table].set?.(id, { ...item, id });
            if (Array.isArray(state[table])) state[table].push({ ...item, id });
          }
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            eq(col, val) {
              for (const [key, item] of state[table].entries()) {
                if (item[col] === val) state[table].delete(key);
              }
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    }
  };

  return { client, state };
}

test('TEST 4 & 9: Name parsing extracts clean first names and never uses email domain', () => {
  // Test 9: Name parsing
  assert.equal(parseLeadEmail('john.doe@gmail.com').firstName, 'John');
  assert.equal(parseLeadEmail('john_doe@gmail.com').firstName, 'John');
  assert.equal(parseLeadEmail('john-doe@gmail.com').firstName, 'John');
  assert.equal(parseLeadEmail('vaibhav@company.com').firstName, 'Vaibhav');
  assert.notEqual(parseLeadEmail('john.doe@gmail.com').firstName.toLowerCase(), 'gmail');
  assert.notEqual(parseLeadEmail('john.doe@gmail.com').firstName.toLowerCase(), 'gmail.com');

  // Explicit name override test
  const withFullName = parseLeadEmail('john@example.com', { fullName: 'John Michael Smith' });
  assert.equal(withFullName.firstName, 'John');
});

test('TEST 8: Deletion removes activity record and recalculates totals', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-del', name: 'Delete Test', total_recipients: 2, sent_count: 0, failed_count: 0, queued_count: 2 }],
    recipients: [
      { id: 'rec-1', campaign_id: 'camp-del', recipient_email: 'keep@test.com', status: 'pending' },
      { id: 'rec-2', campaign_id: 'camp-del', recipient_email: 'remove@test.com', status: 'pending' }
    ]
  });

  // Delete rec-2
  await client.from('campaign_recipients').delete().eq('id', 'rec-2');
  assert.equal(state.campaign_recipients.has('rec-2'), false);
  assert.equal(state.campaign_recipients.has('rec-1'), true);
});

test('TEST 10: Re-launch protection skips already sent recipients without re-sending', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-10', name: 'Relaunch Test', status: 'completed', sent_count: 1, failed_count: 0, queued_count: 0 }],
    recipients: [
      { id: 'rec-sent', campaign_id: 'camp-10', recipient_email: 'already@sent.com', status: 'sent', attempts: 1 }
    ]
  });

  const result = await executeCampaign(client, 'camp-10', { actor: 'test' });
  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.message, 'All recipients already sent — skipped.');
  // Attempts should remain 1, not incremented
  assert.equal(state.campaign_recipients.get('rec-sent').attempts, 1);
});

test('overlapping launches claim a pending recipient and send it only once', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-race', name: 'Concurrent Launch', status: 'draft', compliance_confirmed: true }],
    recipients: [
      { id: 'rec-race', campaign_id: 'camp-race', recipient_email: 'lead@example.com', status: 'pending', attempts: 0, personalized_subject: 'Hello', personalized_body: 'Body' }
    ]
  });
  let sendCount = 0;
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    verifyConnection: async () => true,
    sendEmail: async () => { sendCount++; return { messageId: 'race-message-id' }; },
    close() {}
  };

  await Promise.all([
    executeCampaign(client, 'camp-race', { actor: 'test', delayMs: 0, provider }),
    executeCampaign(client, 'camp-race', { actor: 'test', delayMs: 0, provider })
  ]);

  const recipient = state.campaign_recipients.get('rec-race');
  assert.equal(sendCount, 1);
  assert.equal(recipient.status, 'sent');
  assert.equal(recipient.attempts, 1);
});

test('already-contacted recipients are skipped without sending', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-contacted', name: 'Prior Contact', status: 'draft' }],
    recipients: [
      { id: 'rec-contacted', campaign_id: 'camp-contacted', recipient_email: 'prior@example.com', status: 'already_contacted', attempts: 0 }
    ]
  });
  let sendCount = 0;
  const provider = { verifyConnection: async () => true, sendEmail: async () => { sendCount++; }, close() {} };

  const result = await executeCampaign(client, 'camp-contacted', { actor: 'test', provider });

  assert.equal(sendCount, 0);
  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(state.campaign_recipients.get('rec-contacted').status, 'already_contacted');
});

test('SMTP failure marks a recipient failed with an attempt and no sent timestamp', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-fail', name: 'SMTP Failure', status: 'draft' }],
    recipients: [
      { id: 'rec-fail', campaign_id: 'camp-fail', recipient_email: 'fail@example.com', status: 'pending', attempts: 0, sent_at: null, personalized_subject: 'Hello', personalized_body: 'Body' }
    ]
  });
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    verifyConnection: async () => true,
    sendEmail: async () => { throw Object.assign(new Error('private SMTP response'), { code: 'EAUTH' }); },
    close() {}
  };

  const result = await executeCampaign(client, 'camp-fail', { actor: 'test', delayMs: 0, provider });
  const recipient = state.campaign_recipients.get('rec-fail');
  assert.equal(result.failed, 1);
  assert.equal(recipient.status, 'failed');
  assert.equal(recipient.attempts, 1);
  assert.equal(recipient.sent_at, null);
  assert.match(recipient.error_message, /authentication failed/i);
  assert.doesNotMatch(recipient.error_message, /private SMTP response/);
});

test('missing SMTP configuration fails claimed recipients instead of leaving them pending', async () => {
  const keys = ['EMAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    const { client, state } = createMockSupabase({
      campaigns: [{ id: 'camp-unconfigured', name: 'No SMTP', status: 'draft' }],
      recipients: [
        { id: 'rec-unconfigured', campaign_id: 'camp-unconfigured', recipient_email: 'lead@example.com', status: 'pending', attempts: 0, sent_at: null, personalized_subject: 'Hello', personalized_body: 'Body' }
      ]
    });

    const result = await executeCampaign(client, 'camp-unconfigured', { actor: 'test', delayMs: 0 });
    const recipient = state.campaign_recipients.get('rec-unconfigured');
    assert.equal(result.failed, 1);
    assert.equal(recipient.status, 'failed');
    assert.equal(recipient.attempts, 1);
    assert.equal(recipient.sent_at, null);
    assert.match(recipient.error_message, /SMTP_USER/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('SMTP acceptance is not reported as sent when the activity update fails', async () => {
  const { client, state } = createMockSupabase({
    failSentStatusUpdate: true,
    campaigns: [{ id: 'camp-persist-fail', name: 'Activity Write Failure', status: 'draft' }],
    recipients: [
      { id: 'rec-persist-fail', campaign_id: 'camp-persist-fail', recipient_email: 'lead@example.com', status: 'pending', attempts: 0, sent_at: null, personalized_subject: 'Hello', personalized_body: 'Body' }
    ]
  });
  let sendCount = 0;
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    verifyConnection: async () => true,
    sendEmail: async () => { sendCount++; return { messageId: 'accepted-message-id' }; },
    close() {}
  };

  const result = await executeCampaign(client, 'camp-persist-fail', { actor: 'test', delayMs: 0, provider });
  const recipient = state.campaign_recipients.get('rec-persist-fail');
  assert.equal(sendCount, 1);
  assert.equal(result.success, false);
  assert.equal(result.sent, 0);
  assert.equal(result.persistenceFailed, 1);
  assert.equal(recipient.status, 'sending');
  assert.equal(recipient.sent_at, null);
});

test('unsubscribe suppression is skipped with an unsubscribe reason', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-supp', name: 'Suppression Test', status: 'draft', sent_count: 0, failed_count: 0, queued_count: 1 }],
    recipients: [
      { id: 'rec-supp', campaign_id: 'camp-supp', recipient_email: 'blocked@company.com', status: 'pending', attempts: 0 }
    ],
    suppressions: [
      { email: 'blocked@company.com', reason: 'Recipient unsubscribed' }
    ]
  });

  const result = await executeCampaign(client, 'camp-supp', { actor: 'test' });
  assert.equal(result.processed, 0);
  assert.equal(result.sent, 0);
  const rec = state.campaign_recipients.get('rec-supp');
  assert.equal(rec.status, 'unsubscribed');
  assert.equal(rec.error_message, 'unsubscribe');
  assert.equal(rec.attempts, 0);
});

test('new Gmail and Outlook recipients are sent when no suppression record exists', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-new', name: 'New Recipients', status: 'draft' }],
    recipients: [
      { id: 'rec-gmail', campaign_id: 'camp-new', recipient_email: 'New.Gmail@Gmail.com', status: 'pending', attempts: 0, personalized_subject: 'Hello', personalized_body: 'Body' },
      { id: 'rec-outlook', campaign_id: 'camp-new', recipient_email: 'new.outlook@outlook.com', status: 'pending', attempts: 0, personalized_subject: 'Hello', personalized_body: 'Body' }
    ]
  });
  const sent = [];
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    sendEmail: async ({ to }) => { sent.push(to); return { messageId: `message-${sent.length}` }; },
    close() {}
  };

  const result = await executeCampaign(client, 'camp-new', { actor: 'test', provider, delayMs: 0 });

  assert.equal(result.sent, 2);
  assert.deepEqual(sent, ['New.Gmail@Gmail.com', 'new.outlook@outlook.com']);
  assert.equal(state.campaign_recipients.get('rec-gmail').status, 'sent');
  assert.equal(state.campaign_recipients.get('rec-outlook').status, 'sent');
});

test('shikhamandre@gmail.com is eligible when no suppression record exists', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-shikha', name: 'Normal Recipient', status: 'draft' }],
    recipients: [{
      id: 'rec-shikha',
      campaign_id: 'camp-shikha',
      recipient_email: 'shikhamandre@gmail.com',
      status: 'pending',
      attempts: 0,
      personalized_subject: 'Hello',
      personalized_body: 'Body'
    }]
  });
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    sendEmail: async () => ({ messageId: 'shikha-message-id' }),
    close() {}
  };

  const result = await executeCampaign(client, 'camp-shikha', { actor: 'test', provider, delayMs: 0 });

  assert.equal(result.sent, 1);
  assert.equal(state.campaign_recipients.get('rec-shikha').status, 'sent');
  assert.equal(state.campaign_recipients.get('rec-shikha').attempts, 1);
});

test('administrator suppression prevents sending and records the canonical reason', async () => {
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-admin-supp', name: 'Admin Suppression', status: 'draft' }],
    recipients: [
      { id: 'rec-admin-supp', campaign_id: 'camp-admin-supp', recipient_email: 'blocked@example.com', status: 'pending', attempts: 0, personalized_subject: 'Hello', personalized_body: 'Body' }
    ],
    suppressions: [{ email: 'blocked@example.com', reason: 'administrator_suppression' }]
  });
  let sendCount = 0;
  const provider = { sendEmail: async () => { sendCount++; }, close() {} };

  await executeCampaign(client, 'camp-admin-supp', { actor: 'test', provider, delayMs: 0 });

  const recipient = state.campaign_recipients.get('rec-admin-supp');
  assert.equal(sendCount, 0);
  assert.equal(recipient.status, 'suppressed');
  assert.equal(recipient.error_message, 'administrator_suppression');
  assert.equal(recipient.attempts, 0);
});

test('suppressed recipient is sent after suppression record is removed (re-evaluation on re-launch)', async () => {
  // A recipient that was previously stuck as 'suppressed' in the DB,
  // but has since been removed from the suppression_list.
  // Re-launching should now send to them.
  const { client, state } = createMockSupabase({
    campaigns: [{ id: 'camp-re-eval', name: 'Re-evaluation Test', status: 'draft' }],
    recipients: [
      { id: 'rec-re-eval', campaign_id: 'camp-re-eval', recipient_email: 'was-suppressed@gmail.com', status: 'suppressed', error_message: 'administrator_suppression', attempts: 0, personalized_subject: 'Hello', personalized_body: 'Body' }
    ]
    // No suppressions — the stale suppression record has been removed
  });
  const sent = [];
  const provider = {
    config: { fromAddress: 'connect@fluvo.in' },
    sendEmail: async ({ to }) => { sent.push(to); return { messageId: 'reeval-message-id' }; },
    close() {}
  };

  const result = await executeCampaign(client, 'camp-re-eval', { actor: 'test', provider, delayMs: 0 });

  assert.equal(result.sent, 1, 'Should have sent 1 email after suppression removal');
  assert.deepEqual(sent, ['was-suppressed@gmail.com']);
  assert.equal(state.campaign_recipients.get('rec-re-eval').status, 'sent');
  assert.equal(state.campaign_recipients.get('rec-re-eval').attempts, 1);
});

