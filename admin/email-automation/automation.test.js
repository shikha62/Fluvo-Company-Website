import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutomationSettings, getProviderConfig, createUnsubscribeToken, sanitizedProviderError, verifyUnsubscribeToken, sendRenderedEmail, SENDER_EMAIL } from '../api/email/_automation.js';
import { summarizeRecipients } from '../api/email/leads/validate.js';

test('validation summaries always include numeric zero counts', () => {
  assert.deepEqual(summarizeRecipients([{ status: 'ready' }]), {
    ready: 1,
    invalid: 0,
    duplicate: 0,
    suppressed: 0,
    already_contacted: 0
  });
});

test('test-mode settings keep database test mode and server recipient', () => {
  const keys = ['EMAIL_TEST_MODE', 'TEST_EMAIL_RECIPIENT', 'EMAIL_RATE_LIMIT_PER_HOUR', 'EMAIL_RATE_LIMIT_PER_DAY', 'EMAIL_DELAY_SECONDS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const settings = getAutomationSettings({
      test_mode: true,
      test_email_recipient: 'qa@example.com',
      max_emails_per_hour: 7,
      max_emails_per_day: 23,
      delay_seconds: 0
    });
    assert.equal(settings.testMode, true);
    assert.equal(settings.testEmailRecipient, 'qa@example.com');
    assert.equal(settings.maxEmailsPerHour, 7);
    assert.equal(settings.maxEmailsPerDay, 23);
    assert.equal(settings.delaySeconds, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('SMTP configuration remains absent until server credentials are configured', () => {
  const keys = ['EMAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(getProviderConfig().configured, false);
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'mail.example.test';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'connect@fluvo.in';
    process.env.SMTP_PASSWORD = 'local-test-only';
    const config = getProviderConfig();
    assert.equal(config.configured, true);
    assert.equal(config.fromAddress, 'connect@fluvo.in');
    process.env.SMTP_PASSWORD = '<enter password locally>';
    assert.equal(getProviderConfig().configured, false);
    process.env.SMTP_PORT = '465.5';
    assert.equal(getProviderConfig().configured, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('unsubscribe token is signed and tamper resistant', () => {
  const previous = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'local-test-signing-key';
  try {
    const token = createUnsubscribeToken('Person@Example.com');
    assert.equal(verifyUnsubscribeToken(token), 'person@example.com');
    assert.equal(verifyUnsubscribeToken(`${token.slice(0, -1)}x`), null);
    assert.equal(verifyUnsubscribeToken('not-a-token'), null);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = previous;
  }
});

test('unsubscribe signing derives a separate key from JWT_SECRET when no explicit key is set', () => {
  const previousUnsubscribeSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  const previousJwtSecret = process.env.JWT_SECRET;
  delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
  process.env.JWT_SECRET = 'a-local-session-signing-secret-with-at-least-32-characters';
  try {
    const token = createUnsubscribeToken('shikha@example.com');
    assert.equal(verifyUnsubscribeToken(token), 'shikha@example.com');
  } finally {
    if (previousUnsubscribeSecret === undefined) delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.EMAIL_UNSUBSCRIBE_SECRET = previousUnsubscribeSecret;
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});

test('missing SMTP configuration returns actionable settings instead of a generic provider error', () => {
  const previous = process.env.EMAIL_PROVIDER;
  try {
    process.env.EMAIL_PROVIDER = 'smtp';
    const message = sanitizedProviderError(getProviderConfig().error);
    assert.match(message, /SMTP_HOST/);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = previous;
  }
});

test('SMTP authentication errors identify the active host without exposing credentials', () => {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_PROVIDER'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'connect@fluvo.in';
    process.env.SMTP_PASSWORD = 'test-only-secret';
    const message = sanitizedProviderError(Object.assign(new Error('auth failed'), { code: 'EAUTH' }));
    assert.match(message, /third-party email access/);
    assert.doesNotMatch(message, /smtp\.example\.test/);
    assert.doesNotMatch(message, /test-only-secret/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

class MockEmailProvider {
  constructor(config = { fromName: 'Fluvo', fromAddress: SENDER_EMAIL }) {
    this.config = config;
    this.sent = [];
  }
  async sendEmail(message) {
    this.sent.push({
      ...message,
      from: { name: this.config.fromName, address: this.config.fromAddress }
    });
    return { messageId: `<mock-${this.sent.length}@fluvo.in>` };
  }
}

test('campaign sending (isTest: false) delivers to actual lead recipient, NOT configured test recipient', async () => {
  const provider = new MockEmailProvider();
  const settings = {
    testMode: true,
    testEmailRecipient: 'test-qa@example.com'
  };

  const result = await sendRenderedEmail({
    recipient: 'actual-lead@customer.com',
    subject: 'Growth Opportunity',
    body: 'Hi Lead,\n\nWe noticed an opportunity.',
    settings,
    provider,
    isTest: false,
    campaignId: 'camp-123',
    recipientId: 'recip-456'
  });

  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, 'actual-lead@customer.com');
  assert.notEqual(provider.sent[0].to, 'test-qa@example.com');
  assert.equal(provider.sent[0].from.address, 'connect@fluvo.in');
  assert.equal(provider.sent[0].subject, 'Growth Opportunity');
  assert.equal(result.messageId, '<mock-1@fluvo.in>');
});

test('test email (isTest: true) intentionally routes to test recipient with [TEST] subject', async () => {
  const provider = new MockEmailProvider();
  const settings = {
    testMode: true,
    testEmailRecipient: 'configured-test@fluvo.in'
  };

  await sendRenderedEmail({
    recipient: 'manual-test@qa.com',
    subject: 'Preview Template',
    body: 'Test body',
    settings,
    provider,
    isTest: true
  });

  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, 'manual-test@qa.com');
  assert.equal(provider.sent[0].from.address, 'connect@fluvo.in');
  assert.equal(provider.sent[0].subject, '[TEST] Preview Template');
});

test('campaign rendering normalizes bare carriage returns before SMTP delivery', async () => {
  const provider = new MockEmailProvider();
  await sendRenderedEmail({
    recipient: 'actual-lead@customer.com',
    subject: 'Hello\r\nInjected Header',
    body: 'First line\rSecond line\r\nThird line',
    provider,
    isTest: false
  });

  assert.equal(provider.sent[0].subject, 'Hello Injected Header');
  assert.match(provider.sent[0].text, /^First line\nSecond line\nThird line\n\nTo unsubscribe from future emails:/);
  assert.doesNotMatch(provider.sent[0].text, /\r/);
});

test('multiple campaign recipients retain their distinct addresses without global overwrite', async () => {
  const provider = new MockEmailProvider();
  const settings = {
    testMode: true,
    testEmailRecipient: 'configured-test@fluvo.in'
  };

  const leads = ['lead1@alpha.com', 'lead2@beta.com', 'lead3@gamma.com'];
  for (const lead of leads) {
    await sendRenderedEmail({
      recipient: lead,
      subject: `Hello ${lead}`,
      body: 'Body',
      settings,
      provider,
      isTest: false,
      campaignId: 'camp-multi',
      recipientId: `recip-${lead}`
    });
  }

  assert.equal(provider.sent.length, 3);
  assert.equal(provider.sent[0].to, 'lead1@alpha.com');
  assert.equal(provider.sent[1].to, 'lead2@beta.com');
  assert.equal(provider.sent[2].to, 'lead3@gamma.com');
  for (const item of provider.sent) {
    assert.equal(item.from.address, 'connect@fluvo.in');
    assert.notEqual(item.to, 'configured-test@fluvo.in');
  }
});

test('getAutomationSettings respects test_mode: false when EMAIL_TEST_MODE is not active', () => {
  const previous = process.env.EMAIL_TEST_MODE;
  try {
    delete process.env.EMAIL_TEST_MODE;
    const settings = getAutomationSettings({ test_mode: false, test_email_recipient: 'test@example.com' });
    assert.equal(settings.testMode, false);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_TEST_MODE;
    else process.env.EMAIL_TEST_MODE = previous;
  }
});
