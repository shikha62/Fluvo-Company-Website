import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImapFlow } from 'imapflow';
import { SmtpService, classifySmtpError, loadMailConfig } from '@fluvo/email-provider';
import { syncInbox } from '../api/email/_service.js';

const directory = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(directory, '../.env.local');

try {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch {
  console.log('Local admin env file unavailable; using the current process environment.');
}

const config = loadMailConfig();
let smtpOk = false;
let imapOk = false;
let syncOk = true;

if (config.smtp.configured) {
  const smtp = new SmtpService(config.smtp);
  try {
    await smtp.verifyConnection();
    smtpOk = true;
    console.log('SMTP: PASS');
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    console.log(`SMTP: FAIL (${diagnostic.stage}/${diagnostic.code})`);
  } finally {
    smtp.close();
  }
} else {
  console.log(`SMTP: NOT CONFIGURED (${config.missingConfiguration.filter(name => name.startsWith('SMTP_') || name === 'EMAIL_FROM_ADDRESS').join(', ')})`);
}

if (config.imap.configured) {
  const imap = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.password },
    logger: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    tls: { rejectUnauthorized: true }
  });
  try {
    await imap.connect();
    await imap.logout();
    imapOk = true;
    console.log('IMAP: PASS');
  } catch (error) {
    const code = String(error?.code || '').toUpperCase();
    console.log(`IMAP: FAIL (${error?.authenticationFailed || ['AUTHENTICATIONFAILED', 'EAUTH'].includes(code) ? 'AUTHENTICATION' : code || 'CONNECTION'})`);
  }
} else {
  console.log(`IMAP: NOT CONFIGURED (${config.missingConfiguration.filter(name => name.startsWith('EMAIL_IMAP')).join(', ')})`);
}

if (process.argv.includes('--sync')) {
  const result = await syncInbox();
  syncOk = result.success;
  console.log(result.success ? `INBOX SYNC: PASS (${result.synced} messages upserted)` : `INBOX SYNC: FAIL (${result.error})`);
}

const assetDirectory = resolve(directory, '../dist');
const assetFiles = [];
function collectAssetFiles(directoryPath) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = resolve(directoryPath, entry.name);
    if (entry.isDirectory()) collectAssetFiles(entryPath);
    else assetFiles.push(entryPath);
  }
}

let browserBundleSafe = false;
if (existsSync(assetDirectory)) {
  collectAssetFiles(assetDirectory);
  const secretValues = [config.smtp.password, config.imap.password].filter(Boolean);
  browserBundleSafe = !secretValues.some(secret => assetFiles.some(file => readFileSync(file, 'utf8').includes(secret)));
  console.log(`BROWSER SECRET SCAN: ${browserBundleSafe ? 'PASS' : 'FAIL'}`);
} else {
  console.log('BROWSER SECRET SCAN: NOT RUN (admin/dist is missing)');
}

process.exitCode = smtpOk && imapOk && syncOk && browserBundleSafe ? 0 : 1;