'use strict';
/**
 * Yousign API v3 — client léger (natif fetch Node 20, pas de dépendance externe)
 *
 * Variables d'env requises :
 *   YOUSIGN_API_KEY          — clé API Yousign
 *   YOUSIGN_WEBHOOK_SECRET   — secret pour vérifier les webhooks
 *   YOUSIGN_BASE_URL         — https://api.yousign.app/v3 (prod)
 *                              https://api-sandbox.yousign.app/v3 (sandbox)
 */

const crypto = require('crypto');
const pdfParse = require('pdf-parse');

const BASE_URL = () => (process.env.YOUSIGN_BASE_URL || 'https://api-sandbox.yousign.app/v3').replace(/\/$/, '');
const API_KEY  = () => process.env.YOUSIGN_API_KEY;

function isConfigured() {
  return !!API_KEY();
}

// ── Helper JSON request ────────────────────────────────────────────────────
async function apiRequest(method, path, body) {
  const key = API_KEY();
  if (!key) throw new Error('YOUSIGN_API_KEY non configuré');

  const res = await fetch(`${BASE_URL()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Yousign ${res.status} ${method} ${path}: ${text}`);
    err.status = res.status;
    err.body   = text;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// ── Multipart upload ────────────────────────────────────────────────────────
async function uploadDocument(requestId, pdfBuffer, filename) {
  const key = API_KEY();
  if (!key) throw new Error('YOUSIGN_API_KEY non configuré');

  const blob     = new Blob([pdfBuffer], { type: 'application/pdf' });
  const formData = new FormData();
  formData.append('file', blob, filename);
  formData.append('nature', 'signable_document');

  const res = await fetch(`${BASE_URL()}/signature_requests/${requestId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: formData,
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Yousign upload ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

// ── Détecter le nombre de pages du PDF ────────────────────────────────────
async function getPageCount(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.numpages || 1;
  } catch {
    return 1;
  }
}

// ── Créer une demande de signature complète ────────────────────────────────
/**
 * @param {object} opts
 * @param {Buffer} opts.pdfBuffer       — PDF à signer
 * @param {string} opts.filename        — nom du fichier (ex: DEV-2026-001.pdf)
 * @param {string} opts.requestName     — nom lisible (ex: "Devis DEV-2026-001")
 * @param {object} opts.signer          — { email, firstName, lastName }
 * @param {string} [opts.redirectSuccess] — URL de redirection après signature
 * @param {number} [opts.expirationDays=30]
 * @returns {{ requestId, signerId, signingUrl }}
 */
async function createSignatureRequest({ pdfBuffer, filename, requestName, signer, redirectSuccess, expirationDays = 30 }) {
  // 1 — Créer la demande
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expirationDays);

  const signReq = await apiRequest('POST', '/signature_requests', {
    name:              requestName,
    delivery_mode:     'email',
    timezone:          'Europe/Paris',
    expiration_date:   expDate.toISOString(),
    signers_allowed_to_decline: true,
    email_notification: {
      from_name: 'ParFi France',
    },
  });

  const requestId = signReq.id;

  // 2 — Uploader le PDF
  const doc = await uploadDocument(requestId, pdfBuffer, filename);
  const documentId = doc.id;

  // 3 — Détecter la dernière page pour positionner la signature
  const lastPage = await getPageCount(pdfBuffer);

  // Zone signature client : bas-droite de la dernière page (A4 = 595 x 842 points)
  const sigField = {
    document_id: documentId,
    type:        'signature',
    page:        lastPage,
    x:           340,
    y:           740,
    width:       200,
    height:       60,
  };

  // 4 — Ajouter le signataire
  const signerPayload = {
    info: {
      first_name: signer.firstName || signer.email.split('@')[0],
      last_name:  signer.lastName  || '',
      email:      signer.email,
      locale:     'fr',
    },
    signature_level:                'electronic_signature',
    signature_authentication_mode:  'no_otp',
    fields: [sigField],
  };
  if (redirectSuccess) {
    signerPayload.redirect_urls = { success: redirectSuccess };
  }

  const signerResult = await apiRequest('POST', `/signature_requests/${requestId}/signers`, signerPayload);
  const signerId  = signerResult.id;
  const signingUrl = signerResult.signature_link || signerResult.signing_url || null;

  // 5 — Activer (envoie l'email Yousign au client)
  await apiRequest('POST', `/signature_requests/${requestId}/activate`);

  return { requestId, signerId, signingUrl };
}

// ── Vérifier la signature d'un webhook Yousign ────────────────────────────
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.YOUSIGN_WEBHOOK_SECRET;
  if (!secret) return true; // pas de secret configuré → accepter (dev)

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from((signatureHeader || '').replace(/^sha256=/, ''), 'hex')
  );
}

// ── Récupérer le statut d'une demande ─────────────────────────────────────
async function getSignatureRequestStatus(requestId) {
  return apiRequest('GET', `/signature_requests/${requestId}`);
}

// ── Télécharger le PDF signé ──────────────────────────────────────────────
async function downloadSignedDocument(requestId, documentId) {
  const key = API_KEY();
  if (!key) throw new Error('YOUSIGN_API_KEY non configuré');

  const res = await fetch(
    `${BASE_URL()}/signature_requests/${requestId}/documents/${documentId}/download`,
    { headers: { Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) throw new Error(`Yousign download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = {
  isConfigured,
  createSignatureRequest,
  verifyWebhookSignature,
  getSignatureRequestStatus,
  downloadSignedDocument,
};
