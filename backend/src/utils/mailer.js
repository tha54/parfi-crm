const https = require('https');
const pool  = require('../config/db');

/**
 * Send an email via Brevo (Sendinblue) REST API.
 * Falls back to nodemailer SMTP if SMTP_HOST is set in env.
 */
async function sendEmail({ to, toName, subject, htmlContent, attachments = [] }) {
  const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
  const cabinet = cab || {};

  const brevoKey    = cabinet.brevoApiKey   || process.env.BREVO_API_KEY;
  const fromEmail   = cabinet.emailExpediteur || process.env.SMTP_FROM || 'contact@parfi-france.fr';
  const fromName    = cabinet.nomExpediteur   || cabinet.nomCabinet || 'ParFi France';

  if (brevoKey) {
    return sendViaBrevo({ to, toName, subject, htmlContent, attachments, apiKey: brevoKey, fromEmail, fromName });
  }

  // SMTP fallback via nodemailer
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    return sendViaSMTP({ to, toName, subject, htmlContent, attachments, fromEmail, fromName });
  }

  throw new Error("Aucun service email configuré. Renseignez la clé API Brevo dans Paramètres > Cabinet.");
}

function sendViaBrevo({ to, toName, subject, htmlContent, attachments, apiKey, fromEmail, fromName }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender:      { name: fromName, email: fromEmail },
      to:          [{ email: to, name: toName || to }],
      subject,
      htmlContent,
      attachment:  attachments.map(a => ({ content: a.base64, name: a.filename })),
    });

    const options = {
      hostname: 'api.brevo.com',
      path:     '/v3/smtp/email',
      method:   'POST',
      headers:  {
        'Content-Type': 'application/json',
        'api-key':      apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, provider: 'brevo' });
        } else {
          reject(new Error(`Brevo API ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendViaSMTP({ to, toName, subject, htmlContent, attachments, fromEmail, fromName }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });

  await transporter.sendMail({
    from:        `"${fromName}" <${fromEmail}>`,
    to:          toName ? `"${toName}" <${to}>` : to,
    subject,
    html:        htmlContent,
    attachments: attachments.map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.base64, 'base64'),
      contentType: 'application/pdf',
    })),
  });

  return { ok: true, provider: 'smtp' };
}

module.exports = { sendEmail };
