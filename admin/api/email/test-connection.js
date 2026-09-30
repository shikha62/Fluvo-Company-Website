import { authorize, classifySmtpError, EmailProvider, getProviderConfig, sendJson } from './_automation.js';

export default async function handler(req, res) {
  const actor = authorize(req, res);
  if (!actor) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
  const config = getProviderConfig();
  if (!config.configured) {
    const diagnostic = classifySmtpError(config.error);
    console.warn(`SMTP verification failed: ${diagnostic.stage} ${diagnostic.code}`);
    return sendJson(res, 400, {
      success: false,
      message: diagnostic.message || 'SMTP configuration missing',
      stage: diagnostic.stage,
      code: diagnostic.code
    });
  }
  let provider;
  try {
    console.info('SMTP verification started');
    provider = new EmailProvider(config);
    await provider.verifyConnection();
    console.info('SMTP verification succeeded');
    return sendJson(res, 200, {
      success: true,
      message: 'SMTP connection verified successfully',
      stage: 'authentication',
      code: 'SMTP_AUTHENTICATED',
      senderEmail: config.user || 'connect@fluvo.in'
    });
  } catch (error) {
    const diagnostic = classifySmtpError(error);
    console.warn(`SMTP verification failed: ${diagnostic.stage} ${diagnostic.code}`);
    return sendJson(res, 502, {
      success: false,
      message: diagnostic.message,
      stage: diagnostic.stage,
      code: diagnostic.code
    });
  } finally {
    provider?.close();
  }
}