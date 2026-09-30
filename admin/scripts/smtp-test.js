#!/usr/bin/env node
// Direct SMTP diagnostic — run with: node scripts/smtp-test.js
// Reads from admin/.env.local automatically

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local');
try {
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
} catch (e) {
  console.error('Could not read .env.local:', e.message);
}

const host = process.env.SMTP_HOST || 'smtpout.secureserver.net';
const port = Number(process.env.SMTP_PORT) || 465;
const user = process.env.SMTP_USER || 'connect@fluvo.in';
const pass = process.env.SMTP_PASSWORD;
const from = process.env.EMAIL_FROM_ADDRESS || user;
const to = process.argv[2] || 'meghamandre@gmail.com';

console.log(`\n=== SMTP Diagnostic ===`);
console.log(`Host: ${host}:${port} (secure: true)`);
console.log(`From: ${from}`);
console.log(`To: ${to}`);
console.log(`User: ${user}`);
console.log('');

const transport = nodemailer.createTransport({
  host,
  port,
  secure: true,
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  tls: { rejectUnauthorized: false }, // allow self-signed for diagnostics
  debug: true,
  logger: true,
});

console.log('Testing SMTP connection...');
try {
  await transport.verify();
  console.log('✅ SMTP connection OK\n');
} catch (err) {
  console.error(`❌ Connection verify failed: [${err.code}] ${err.message}`);
  if (err.response) console.error(`   SMTP response: ${err.response}`);
  if (err.responseCode) console.error(`   Response code: ${err.responseCode}`);
  process.exit(1);
}

console.log(`\nSending test email to ${to}...`);
try {
  const result = await transport.sendMail({
    from: { name: 'Fluvo', address: from },
    to,
    subject: `[SMTP Diagnostic] Test ${new Date().toISOString()}`,
    text: 'This is a diagnostic test email from the Fluvo admin SMTP diagnostic script.',
    html: '<p>This is a <strong>diagnostic test email</strong> from the Fluvo admin SMTP diagnostic script.</p>',
  });
  console.log(`✅ Email sent!`);
  console.log(`   messageId: ${result.messageId}`);
  console.log(`   response: ${result.response}`);
} catch (err) {
  console.error(`❌ Send failed: [${err.code}] ${err.message}`);
  if (err.response) console.error(`   SMTP response: ${err.response}`);
  if (err.responseCode) console.error(`   Response code: ${err.responseCode}`);
  if (err.command) console.error(`   At command: ${err.command}`);
}

transport.close();
