import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const SENDER_ADDRESS = 'connect@fluvo.in';
const AUTH_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const AUTH_FAILURES = globalThis[Symbol.for('@fluvo/email-provider/auth-failures')] || new Map();
globalThis[Symbol.for('@fluvo/email-provider/auth-failures')] = AUTH_FAILURES;

const PROVIDERS = Object.freeze({
  titan: { host: 'smtp.titan.email', port: 465 },
  godaddy: { host: 'smtpout.secureserver.net', port: 465 },
  smtp: { host: '', port: 0 }
});

export class SmtpConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SmtpConfigurationError';
    this.stage = 'configuration';
    this.code = 'SMTP_CONFIGURATION_ERROR';
  }
}

function configuredValue(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || /^<[^>]+>$/.test(normalized) || /^(your[-_ ]|placeholder\b)/i.test(normalized)) return '';
  return normalized;
}

export function loadSmtpConfig(env = process.env) {
  const provider = configuredValue(env.EMAIL_PROVIDER)?.toLowerCase() || 'titan';
  const defaults = PROVIDERS[provider];
  if (!defaults) {
    return {
      provider,
      configured: false,
      error: new SmtpConfigurationError('EMAIL_PROVIDER must be titan, godaddy, or smtp.')
    };
  }

  const host = configuredValue(env.SMTP_HOST) || defaults.host;
  const rawPort = configuredValue(env.SMTP_PORT);
  const port = rawPort ? Number(rawPort) : (defaults?.port || 465);

  const rawSecure = configuredValue(env.SMTP_SECURE);
  let secure;
  if (rawSecure) {
    const lower = rawSecure.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      secure = true;
    } else if (lower === 'false' || lower === '0' || lower === 'no') {
      secure = false;
    } else {
      secure = null;
    }
  } else {
    secure = port === 465;
  }

  const user = configuredValue(env.SMTP_USER);
  const password = configuredValue(env.SMTP_PASSWORD);
  const fromName = configuredValue(env.EMAIL_FROM_NAME) || 'Fluvo';
  const fromAddress = configuredValue(env.EMAIL_FROM_ADDRESS) || user;

  let error = null;
  if (!host) error = new SmtpConfigurationError('SMTP_HOST is required.');
  else if (!Number.isInteger(port) || port < 1 || port > 65535) error = new SmtpConfigurationError('SMTP_PORT must be a valid TCP port.');
  else if (secure === null) error = new SmtpConfigurationError('SMTP_SECURE must be true or false.');
  else if (port === 465 && !secure) error = new SmtpConfigurationError('Port 465 requires SMTP_SECURE=true (implicit TLS).');
  else if (port === 587 && secure) error = new SmtpConfigurationError('Port 587 requires SMTP_SECURE=false (STARTTLS).');
  else if (!user) error = new SmtpConfigurationError('SMTP_USER is required.');
  else if (!password) error = new SmtpConfigurationError('SMTP_PASSWORD is required.');
  else if (!fromAddress) error = new SmtpConfigurationError('EMAIL_FROM_ADDRESS is required.');
  else if (user !== fromAddress) error = new SmtpConfigurationError('SMTP_USER must exactly match EMAIL_FROM_ADDRESS.');
  else if (fromAddress !== SENDER_ADDRESS) error = new SmtpConfigurationError(`EMAIL_FROM_ADDRESS must be ${SENDER_ADDRESS}.`);

  return { provider, host, port, secure: Boolean(secure), user, password, fromName, fromAddress, configured: !error, error };
}

export function loadMailConfig(env = process.env) {
  const smtp = loadSmtpConfig(env);
  const email = configuredValue(env.MAILBOX_EMAIL) || configuredValue(env.EMAIL_ADDRESS) ||
    configuredValue(env.SMTP_USER) || SENDER_ADDRESS;
  const host = configuredValue(env.EMAIL_IMAP_HOST) || 'imap.secureserver.net';
  const rawPort = configuredValue(env.EMAIL_IMAP_PORT);
  const port = rawPort ? Number(rawPort) : 993;
  const secureValue = configuredValue(env.EMAIL_IMAP_SECURE);
  const secure = secureValue ? /^(true|1|yes)$/i.test(secureValue) : true;
  const user = configuredValue(env.EMAIL_IMAP_USER) || configuredValue(env.SMTP_USER) || email;
  const password = configuredValue(env.EMAIL_IMAP_PASSWORD) || configuredValue(env.SMTP_PASSWORD);
  const imapError = !Number.isInteger(port) || port < 1 || port > 65535
    ? new Error('EMAIL_IMAP_PORT must be a valid TCP port.')
    : secureValue && !/^(true|false|1|0|yes|no)$/i.test(secureValue)
      ? new Error('EMAIL_IMAP_SECURE must be true or false.')
      : !user
        ? new Error('EMAIL_IMAP_USER is required.')
        : !password
          ? new Error('EMAIL_IMAP_PASSWORD or SMTP_PASSWORD is required.')
          : null;

  const missingConfiguration = [];
  if (!smtp.configured) {
    if (!configuredValue(env.SMTP_USER)) missingConfiguration.push('SMTP_USER');
    if (!configuredValue(env.SMTP_PASSWORD)) missingConfiguration.push('SMTP_PASSWORD');
    if (!configuredValue(env.EMAIL_FROM_ADDRESS) && !configuredValue(env.SMTP_USER)) missingConfiguration.push('EMAIL_FROM_ADDRESS');
  }
  if (imapError) {
    if (imapError.message.includes('EMAIL_IMAP_PORT')) missingConfiguration.push('EMAIL_IMAP_PORT');
    else if (imapError.message.includes('EMAIL_IMAP_SECURE')) missingConfiguration.push('EMAIL_IMAP_SECURE');
    else if (imapError.message.includes('EMAIL_IMAP_USER')) missingConfiguration.push('EMAIL_IMAP_USER');
    else missingConfiguration.push('EMAIL_IMAP_PASSWORD (or SMTP_PASSWORD)');
  }

  return {
    email,
    smtp,
    imap: { host, port, secure, user, password, configured: !imapError, error: imapError },
    missingConfiguration: [...new Set(missingConfiguration)]
  };
}

export function classifySmtpError(error) {
  if (error instanceof SmtpConfigurationError) {
    return { stage: 'configuration', code: error.code, message: error.message };
  }
  if (error?.stage && String(error?.code || '').startsWith('SMTP_') && error?.message) {
    return { stage: error.stage, code: error.code, message: error.message };
  }

  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  if (code === 'SMTP_AUTH_COOLDOWN') {
    return {
      stage: 'authentication',
      code,
      message: 'SMTP authentication is temporarily paused after a previous rejection. Update the mailbox credentials and restart the server before testing again.'
    };
  }
  if (code === 'EAUTH') {
    return {
      stage: 'authentication',
      code: 'SMTP_AUTH_FAILED',
      message: 'SMTP authentication failed. Verify third-party email access and use the correct Titan/GoDaddy mailbox password or application password.'
    };
  }
  if (['ENOTFOUND', 'EAI_AGAIN', 'EDNS'].includes(code)) {
    return { stage: 'dns', code: 'SMTP_DNS_FAILED', message: 'SMTP host unreachable. Could not resolve the configured SMTP server.' };
  }
  if (['ECONNREFUSED', 'ECONNECTION'].includes(code)) {
    return { stage: 'connection', code: 'SMTP_CONNECTION_REFUSED', message: 'SMTP connection failed. The server refused the connection.' };
  }
  if (['ETIMEDOUT', 'ESOCKETTIMEOUT', 'ESOCKET'].includes(code)) {
    return { stage: 'connection', code: 'SMTP_CONNECTION_TIMEOUT', message: 'SMTP timeout. The server connection timed out.' };
  }
  if (code === 'ETLS' || code.startsWith('ERR_TLS') || code.startsWith('ERR_SSL') || code.startsWith('CERT_')) {
    return { stage: 'tls', code: 'SMTP_TLS_FAILED', message: 'TLS negotiation with the SMTP server failed. Check the port and encryption mode.' };
  }
  if (['ERATELIMIT', 'EENVELOPE'].includes(code) || [421, 450, 451, 452, 454].includes(responseCode)) {
    return { stage: 'rate_limiting', code: 'SMTP_RATE_LIMITED', message: 'The email provider temporarily limited or rejected this request. Keep queued mail paused and follow the provider’s sending limits.' };
  }
  if (responseCode >= 500) {
    return { stage: 'provider_rejection', code: 'SMTP_PROVIDER_REJECTED', message: 'The email provider rejected the request. Check the sender mailbox and provider policy.' };
  }
  return { stage: 'unknown', code: 'SMTP_UNKNOWN_ERROR', message: 'SMTP connection failed. Check the server-side provider settings and provider logs.' };
}

function authKey(config) {
  return crypto.createHash('sha256')
    .update(`${config.provider}\0${config.host}\0${config.port}\0${config.user}\0${config.password}`)
    .digest('hex');
}

function makeSafeError(error, config) {
  const diagnostic = classifySmtpError(error);
  let message = diagnostic.message;
  if (Number(error?.responseCode) >= 500 && error?.response) {
    let response = String(error.response).replace(/[\r\n\t]+/g, ' ');
    for (const secret of [config?.password, config?.user]) {
      if (secret) response = response.replaceAll(secret, '[redacted]');
    }
    response = response
      .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[address]')
      .replace(/\b(password|passphrase|token|secret)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    if (response) message = `${message} Provider response: ${response}`;
  }
  const safeError = new Error(message);
  Object.assign(safeError, { ...diagnostic, message });
  return safeError;
}

export class SmtpService {
  constructor(config = loadSmtpConfig(), options = {}) {
    if (!config.configured) throw config.error || new SmtpConfigurationError('SMTP configuration is incomplete.');
    this.config = config;
    const createTransport = options.createTransport || nodemailer.createTransport;
    this.transport = createTransport({
      host: config.host,
      port: Number(config.port),
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: { rejectUnauthorized: true }
    });
    this.cooldownKey = authKey(config);
  }

  assertAuthNotCoolingDown() {
    const blockedUntil = AUTH_FAILURES.get(this.cooldownKey) || 0;
    if (blockedUntil > Date.now()) {
      const error = new Error('SMTP authentication is temporarily paused after a previous rejection.');
      error.code = 'SMTP_AUTH_COOLDOWN';
      throw makeSafeError(error, this.config);
    }
    if (blockedUntil) AUTH_FAILURES.delete(this.cooldownKey);
  }

  async verifyConnection() {
    this.assertAuthNotCoolingDown();
    try {
      await this.transport.verify();
      AUTH_FAILURES.delete(this.cooldownKey);
      return true;
    } catch (error) {
      if (String(error?.code || '').toUpperCase() === 'EAUTH') {
        AUTH_FAILURES.set(this.cooldownKey, Date.now() + AUTH_FAILURE_COOLDOWN_MS);
      }
      throw makeSafeError(error, this.config);
    }
  }

  async sendEmail(message) {
    this.assertAuthNotCoolingDown();
    const { from: _ignoredFrom, ...safeMessage } = message || {};
    try {
      return await this.transport.sendMail({
        ...safeMessage,
        from: { name: this.config.fromName, address: this.config.fromAddress }
      });
    } catch (error) {
      if (String(error?.code || '').toUpperCase() === 'EAUTH') {
        AUTH_FAILURES.set(this.cooldownKey, Date.now() + AUTH_FAILURE_COOLDOWN_MS);
      }
      throw makeSafeError(error);
    }
  }

  async sendBatch(messages) {
    if (!Array.isArray(messages) || messages.length > 10) throw new Error('SMTP batches are limited to 10 messages.');
    const results = [];
    for (const message of messages) results.push(await this.sendEmail(message));
    return results;
  }

  close() {
    this.transport.close();
  }
}

export async function sendSmtpEmail(message, options = {}) {
  const service = new SmtpService(options.config || loadSmtpConfig(), options);
  try {
    return await service.sendEmail(message);
  } finally {
    service.close();
  }
}
