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
// Uses /Count N from the PDF Pages dictionary (works on all PDF versions)
function getPageCount(pdfBuffer) {
  try {
    const str = pdfBuffer.toString('binary');
    const m = str.match(/\/Count\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  } catch {
    return 1;
  }
}

// ── Créer une demande de signature (1 document = 1 requête Yousign) ────────
/**
 * @param {object} opts
 * @param {Buffer} opts.pdfBuffer       — PDF à signer
 * @param {string} opts.filename        — nom du fichier
 * @param {string} opts.requestName     — nom lisible dans Yousign
 * @param {object} opts.signer          — { email, firstName, lastName }
 * @param {number} [opts.expirationDays=30]
 * @returns {{ requestId, signerId, signingUrl }}
 */
async function createSignatureRequest({ pdfBuffer, filename, requestName, signer, expirationDays = 30 }) {
  const lastPage = getPageCount(pdfBuffer);

  // 1 — Créer la demande
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + expirationDays);

  const signReq = await apiRequest('POST', '/signature_requests', {
    name:              requestName,
    delivery_mode:     'email',
    timezone:          'Europe/Paris',
    expiration_date:   expDate.toISOString().split('T')[0],
    signers_allowed_to_decline: true,
  });

  const requestId = signReq.id;

  // 2 — Uploader le document
  const doc = await uploadDocument(requestId, pdfBuffer, filename);
  const documentId = doc.id;

  // 3 — Ajouter le signataire
  // Yousign v3 : coordonnées depuis le coin bas-gauche, y croissant vers le haut
  const signerResult = await apiRequest('POST', `/signature_requests/${requestId}/signers`, {
    info: {
      first_name: signer.firstName || signer.email.split('@')[0],
      last_name:  signer.lastName  || '.',
      email:      signer.email,
      locale:     'fr',
    },
    signature_level:                'electronic_signature',
    signature_authentication_mode:  'no_otp',
    fields: [
      { document_id: documentId, type: 'signature', page: lastPage, x: 330, y: 90, width: 200, height: 70 },
    ],
  });

  const signerId   = signerResult.id;
  const signingUrl = signerResult.signature_link || signerResult.signing_url || null;

  // 4 — Activer (envoie l'email au signataire)
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
