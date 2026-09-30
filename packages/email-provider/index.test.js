import test from 'node:test';
import assert from 'node:assert/strict';
import { SmtpService, loadMailConfig, loadSmtpConfig, classifySmtpError } from './index.js';

function testConfig(overrides = {}) {
  return loadSmtpConfig({
    EMAIL_PROVIDER: 'titan',
    SMTP_USER: 'connect@fluvo.in',
    SMTP_PASSWORD: 'test-only-secret',
    EMAIL_FROM_NAME: 'Test Fluvo',
    EMAIL_FROM_ADDRESS: 'connect@fluvo.in',
    ...overrides
  });
}

test('provider modes choose safe host and TLS defaults', () => {
  assert.deepEqual(
    (({ provider, host, port, secure }) => ({ provider, host, port, secure }))(testConfig()),
    { provider: 'titan', host: 'smtp.titan.email', port: 465, secure: true }
  );
  assert.deepEqual(
    (({ provider, host, port, secure }) => ({ provider, host, port, secure }))(testConfig({ EMAIL_PROVIDER: 'godaddy' })),
    { provider: 'godaddy', host: 'smtpout.secureserver.net', port: 465, secure: true }
  );
  assert.deepEqual(
    (({ host, port, secure }) => ({ host, port, secure }))(testConfig({ SMTP_PORT: '587', SMTP_SECURE: 'false' })),
    { host: 'smtp.titan.email', port: 587, secure: false }
  );
  assert.deepEqual(
    (({ host, port, secure }) => ({ host, port, secure }))(testConfig({
      SMTP_HOST: ' smtpout.secureserver.net ',
      SMTP_PORT: ' 465 ',
      SMTP_SECURE: ' true '
    })),
    { host: 'smtpout.secureserver.net', port: 465, secure: true }
  );
});

test('provider rejects sender mismatch and invalid TLS/port pairings', () => {
  assert.equal(testConfig({ EMAIL_FROM_ADDRESS: 'other@example.com' }).error?.code, 'SMTP_CONFIGURATION_ERROR');
  assert.equal(testConfig({ SMTP_PORT: '587', SMTP_SECURE: 'true' }).error?.code, 'SMTP_CONFIGURATION_ERROR');
  assert.equal(testConfig({ SMTP_PORT: 'invalid' }).error?.message, 'SMTP_PORT must be a valid TCP port.');
  assert.equal(testConfig({ SMTP_SECURE: 'invalid' }).error?.message, 'SMTP_SECURE must be true or false.');
  assert.equal(testConfig({ SMTP_PASSWORD: '' }).error?.message, 'SMTP_PASSWORD is required.');
  assert.equal(testConfig({ SMTP_USER: '' }).error?.message, 'SMTP_USER is required.');
});

test('mail configuration shares SMTP credentials and supplies secure GoDaddy IMAP defaults', () => {
  const config = loadMailConfig({
    SMTP_HOST: 'smtpout.secureserver.net',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'connect@fluvo.in',
    SMTP_PASSWORD: 'test-only-secret',
    EMAIL_FROM_ADDRESS: 'connect@fluvo.in'
  });

  assert.equal(config.email, 'connect@fluvo.in');
  assert.equal(config.smtp.configured, true);
  assert.equal(config.imap.host, 'imap.secureserver.net');
  assert.equal(config.imap.port, 993);
  assert.equal(config.imap.secure, true);
  assert.equal(config.imap.user, 'connect@fluvo.in');
  assert.equal(config.imap.password, 'test-only-secret');
  assert.equal(config.imap.configured, true);
  assert.deepEqual(config.missingConfiguration, []);
});

test('mail configuration reports absent IMAP credentials without exposing values', () => {
  const config = loadMailConfig({
    SMTP_HOST: 'smtpout.secureserver.net',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'connect@fluvo.in',
    SMTP_PASSWORD: 'test-only-secret',
    EMAIL_FROM_ADDRESS: 'connect@fluvo.in',
    EMAIL_IMAP_PASSWORD: ''
  });

  assert.equal(config.imap.configured, true);
  assert.deepEqual(config.missingConfiguration, []);
  const missingImap = loadMailConfig({ SMTP_USER: 'connect@fluvo.in' });
  assert.equal(missingImap.imap.configured, false);
  assert.ok(missingImap.missingConfiguration.includes('SMTP_PASSWORD'));
  assert.ok(missingImap.missingConfiguration.includes('EMAIL_IMAP_PASSWORD (or SMTP_PASSWORD)'));
});

test('SMTP error classifier distinguishes DNS, connection, TLS, rate limit, and provider rejection', () => {
  assert.equal(classifySmtpError({ code: 'ENOTFOUND' }).stage, 'dns');
  assert.equal(classifySmtpError({ code: 'ECONNREFUSED' }).stage, 'connection');
  assert.equal(classifySmtpError({ code: 'ETIMEDOUT' }).code, 'SMTP_CONNECTION_TIMEOUT');
  assert.equal(classifySmtpError({ code: 'ESOCKET', message: 'socket closed' }).stage, 'connection');
  assert.equal(classifySmtpError({ code: 'ETLS' }).stage, 'tls');
  assert.equal(classifySmtpError({ responseCode: 421 }).stage, 'rate_limiting');
  assert.equal(classifySmtpError({ responseCode: 550 }).stage, 'provider_rejection');
  assert.equal(classifySmtpError({ code: 'UNKNOWN' }).stage, 'unknown');
});

test('service verifies once and forces the configured sender on messages', async () => {
  let verifyCount = 0;
  let captured;
  const service = new SmtpService(testConfig(), {
    createTransport: options => ({
      verify: async () => { verifyCount += 1; return true; },
      sendMail: async message => { captured = { options, message }; return { messageId: 'unit-test-id' }; },
      close() {}
    })
  });
  await service.verifyConnection();
  const result = await service.sendEmail({ from: 'attacker@example.com', to: 'qa@example.com', subject: 'Test', text: 'Test' });
  assert.equal(verifyCount, 1);
  assert.equal(result.messageId, 'unit-test-id');
  assert.deepEqual(captured.message.from, { name: 'Test Fluvo', address: 'connect@fluvo.in' });
  assert.equal(captured.options.host, 'smtp.titan.email');
  service.close();
});

test('provider rejection detail is bounded and redacts credentials and email addresses', async () => {
  const service = new SmtpService(testConfig(), {
    createTransport: () => ({
      verify: async () => true,
      sendMail: async () => {
        throw Object.assign(new Error('rejected'), {
          responseCode: 550,
          response: '550 rejected connect@fluvo.in to customer@example.com password: test-only-secret due to policy'
        });
      },
      close() {}
    })
  });

  await assert.rejects(service.sendEmail({ to: 'customer@example.com', subject: 'Test', text: 'Test' }), error => {
    assert.match(error.message, /SMTP 550|provider rejected/i);
    assert.match(error.message, /\[address\]/);
    assert.doesNotMatch(error.message, /connect@fluvo\.in|customer@example\.com|test-only-secret/);
    return true;
  });
  service.close();
});

test('authentication failure is classified safely and prevents repeated verify attempts', async () => {
  let verifyCount = 0;
  const createTransport = () => ({
    verify: async () => { verifyCount += 1; throw Object.assign(new Error('credential response contains private detail'), { code: 'EAUTH' }); },
    sendMail: async () => { throw new Error('not expected'); },
    close() {}
  });
  const config = testConfig({ SMTP_PASSWORD: 'unique-cooldown-secret' });
  const first = new SmtpService(config, { createTransport });
  await assert.rejects(first.verifyConnection(), error => {
    const diagnostic = classifySmtpError(error);
    assert.equal(diagnostic.stage, 'authentication');
    assert.equal(diagnostic.code, 'SMTP_AUTH_FAILED');
    assert.doesNotMatch(diagnostic.message, /private detail|unique-cooldown-secret/);
    return true;
  });
  const second = new SmtpService(config, { createTransport });
  await assert.rejects(second.verifyConnection(), error => error.code === 'SMTP_AUTH_COOLDOWN');
  assert.equal(verifyCount, 1);
  first.close();
  second.close();
});
