'use strict';
/**
 * Route webhook Yousign — réception des événements de signature
 *
 * URL à enregistrer dans Yousign Dashboard :
 *   POST https://163.172.158.24/api/signatures/webhook
 *
 * Événements traités :
 *   signature_request.done     → auto-accepte le devis OU active la LDM
 *   signature_request.declined → passe le devis en "refuse" / la LDM en "annulee"
 *   signature_request.expired  → log seulement
 */

const express  = require('express');
const router   = express.Router();
const pool     = require('../config/db');
const yousign  = require('../utils/yousign');
const ldmService = require('../services/ldmService');
const { genererFacturesDepuisLDM } = require('../utils/facturation');
const { injecterTachesLDM } = require('./lettres');

// ─── Migration : colonnes yousign sur devis + lettres_mission ─────────────
;(async () => {
  const migrations = [
    ['devis',           'yousign_request_id', 'VARCHAR(255) DEFAULT NULL'],
    ['devis',           'yousign_signer_id',  'VARCHAR(255) DEFAULT NULL'],
    ['devis',           'yousign_status',     "VARCHAR(50) DEFAULT NULL"],
    ['devis',           'yousign_signing_url','TEXT DEFAULT NULL'],
    ['lettres_mission', 'yousign_request_id', 'VARCHAR(255) DEFAULT NULL'],
    ['lettres_mission', 'yousign_signer_id',  'VARCHAR(255) DEFAULT NULL'],
    ['lettres_mission', 'yousign_status',     "VARCHAR(50) DEFAULT NULL"],
    ['lettres_mission', 'yousign_signing_url','TEXT DEFAULT NULL'],
  ];
  for (const [table, col, def] of migrations) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, col]
    );
    if (!row.n) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[signatures] Colonne ${table}.${col} ajoutée`);
    }
  }
})().catch(e => console.error('[signatures] migration:', e.message));

// ── Activer la mission si LDM + tous les mandats Yousign sont signés ──────
async function activerMissionSiComplete(ldmId) {
  // 1. Vérifier que la LDM elle-même est marquée done
  const [[ldm]] = await pool.query(
    `SELECT id, numero, statut, collaborateur_id, chef_mission_id, devis_id
     FROM lettres_mission WHERE id = ? AND yousign_status = 'done' AND statut = 'envoyee'`,
    [ldmId]
  );
  if (!ldm) return; // LDM pas encore signée ou déjà activée

  // 2. Vérifier que tous les mandats envoyés via Yousign sont signés
  const [mandatsYousign] = await pool.query(
    `SELECT signe FROM mandats WHERE ldm_id = ? AND yousign_request_id IS NOT NULL`,
    [ldmId]
  );
  const tousSignes = mandatsYousign.length === 0 || mandatsYousign.every(m => m.signe === 1);
  if (!tousSignes) {
    console.log(`[yousign] LDM ${ldm.numero} : en attente des mandats (${mandatsYousign.filter(m => !m.signe).length} restant(s))`);
    return;
  }

  // 3. Tout est signé → activer la mission
  let tachesCreees = 0, facturesCreees = 0;
  try {
    await ldmService.transitionner(ldmId, 'signer', 'expert', null, 'Yousign – tous documents signés', { skipUrlCheck: true });
  } catch (e) {
    console.error(`[yousign] LDM ${ldm.numero} transition erreur:`, e.message);
  }

  try {
    tachesCreees = await injecterTachesLDM(ldmId, ldm.collaborateur_id || null, ldm.chef_mission_id || null, null);
  } catch (e) {
    console.error(`[yousign] LDM ${ldm.numero} injection tâches erreur:`, e.message);
  }

  try {
    const result = await genererFacturesDepuisLDM(ldmId);
    facturesCreees = result?.factureIds?.length || 0;
  } catch (e) {
    console.error(`[yousign] LDM ${ldm.numero} génération factures erreur:`, e.message);
  }

  const [experts] = await pool.query(
    `SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission') AND actif = 1`
  ).catch(() => [[]]);
  for (const u of experts) {
    await pool.query(
      `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue) VALUES (?,?,?,?,?,0)`,
      [u.id, 'ldm_signee', `LDM signée : ${ldm.numero}`,
       `La lettre de mission ${ldm.numero} et ses mandats ont tous été signés. ${tachesCreees} tâche(s) planifiée(s), ${facturesCreees} facture(s) générée(s).`,
       `/lettres-mission/${ldmId}`]
    ).catch(() => {});
  }
  console.log(`[yousign] LDM ${ldm.numero} activée — ${tachesCreees} tâches, ${facturesCreees} factures`);
}

// ─── POST /webhook — réception des événements Yousign ────────────────────
// Note : rawBody est fourni par le middleware express.raw() enregistré dans server.js
router.post('/webhook', async (req, res) => {
  try {
    // Vérification de la signature Yousign
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const sigHeader = req.headers['x-yousign-signature-256'] || req.headers['x-yousign-signature'];

    if (!yousign.verifyWebhookSignature(rawBody, sigHeader)) {
      console.warn('[yousign webhook] signature invalide');
      return res.status(401).json({ message: 'Signature invalide' });
    }

    const event      = req.body;
    const eventName  = event?.name || event?.event_name;
    const requestId  = event?.data?.signature_request?.id || event?.signature_request_id;

    console.log(`[yousign webhook] ${eventName} — requestId: ${requestId}`);

    if (!requestId) return res.json({ ok: true });

    // ── Retrouver l'entité liée ──────────────────────────────────────────
    const [[devis]] = await pool.query(
      `SELECT id, numero, statut, client_id, prospect_id, opportunite_id
       FROM devis WHERE yousign_request_id = ? LIMIT 1`,
      [requestId]
    );

    const [[ldm]] = await pool.query(
      `SELECT id, numero, statut, client_id, prospect_id, devis_id, collaborateur_id, chef_mission_id
       FROM lettres_mission WHERE yousign_request_id = ? LIMIT 1`,
      [requestId]
    );

    // Mandat éventuel
    const [[mandat]] = await pool.query(
      `SELECT m.id, m.type, m.ldm_id, lm.numero AS ldm_numero, lm.client_id
       FROM mandats m JOIN lettres_mission lm ON lm.id = m.ldm_id
       WHERE m.yousign_request_id = ? LIMIT 1`,
      [requestId]
    ).catch(() => [[null]]);

    if (eventName === 'signature_request.done') {
      // ── Devis signé ─────────────────────────────────────────────────
      if (devis && devis.statut === 'envoye') {
        await pool.query(
          `UPDATE devis SET statut = 'accepte', yousign_status = 'done', dateSignature = NOW(), updatedAt = NOW() WHERE id = ?`,
          [devis.id]
        );
        // Log événement signature Yousign
        await pool.query(
          `INSERT INTO devis_evenements (devis_id, type, acteur_id, acteur_nom, statut_avant, statut_apres, commentaire)
           VALUES (?, 'signature_yousign', NULL, 'Yousign', 'envoye', 'accepte', 'Signature électronique Yousign reçue')`,
          [devis.id]
        ).catch(e => console.error('[signatures] log devis evenement:', e.message));

        // Pipeline
        if (devis.opportunite_id) {
          await pool.query(
            `UPDATE opportunites SET statut = 'devis_fait', probabilite = 80, updatedAt = NOW() WHERE id = ?`,
            [devis.opportunite_id]
          ).catch(() => {});
        }

        // Notifications experts
        const [experts] = await pool.query(
          `SELECT id FROM utilisateurs WHERE role IN ('expert','chef_mission') AND actif = 1`
        ).catch(() => [[]]);
        for (const u of experts) {
          await pool.query(
            `INSERT INTO notifications (utilisateur_id, type, titre, message, lien, lue)
             VALUES (?,?,?,?,?,0)`,
            [u.id, 'devis_signe',
             `Devis signé : ${devis.numero}`,
             `Le devis ${devis.numero} a été signé électroniquement via Yousign. Vous pouvez maintenant créer la lettre de mission.`,
             `/devis/${devis.id}`]
          ).catch(() => {});
        }

        console.log(`[yousign] Devis ${devis.numero} accepté automatiquement`);
      }

      // ── LDM signée ───────────────────────────────────────────────────
      if (ldm && ldm.statut === 'envoyee') {
        await pool.query(
          `UPDATE lettres_mission SET yousign_status = 'done' WHERE id = ?`, [ldm.id]
        );
        console.log(`[yousign] LDM ${ldm.numero} signée — vérification des mandats...`);
        await activerMissionSiComplete(ldm.id);
      }

      // ── Mandat signé ─────────────────────────────────────────────────
      if (mandat && !devis && !ldm) {
        await pool.query(
          `UPDATE mandats SET signe = 1, date_signature = CURDATE() WHERE id = ?`,
          [mandat.id]
        );
        console.log(`[yousign] Mandat ${mandat.type} (LDM ${mandat.ldm_numero}) signé`);

        // Télécharger et archiver le PDF signé dans la GED
        try {
          const fs   = require('fs');
          const path = require('path');
          const remote = await yousign.getSignatureRequestStatus(requestId);
          const docId  = remote.documents?.[0]?.id;
          if (docId) {
            const signedBuf = await yousign.downloadSignedDocument(requestId, docId);
            const DOCS_BASE = '/opt/parfi-data/documents';
            const year = new Date().getFullYear();
            const dir  = path.join(DOCS_BASE, String(mandat.client_id || 'general'), String(year));
            fs.mkdirSync(dir, { recursive: true });
            const TYPE_LABEL = { prelevement: 'Mandat_SEPA', impots: 'Procuration_Fiscale', urssaf: 'Procuration_Sociale' };
            const fname = `${Date.now()}_${TYPE_LABEL[mandat.type] || 'Mandat'}_signe.pdf`;
            const fpath = path.join(dir, fname);
            fs.writeFileSync(fpath, signedBuf);

            const [ins] = await pool.query(
              `INSERT INTO documents (nom, description, chemin, type_document, type, lettreMissionId, client_id, taille, mimeType)
               VALUES (?, ?, ?, 'mandat', 'mandat', ?, ?, ?, 'application/pdf')`,
              [
                fname,
                `${TYPE_LABEL[mandat.type] || 'Mandat'} signé — LDM ${mandat.ldm_numero}`,
                fpath,
                mandat.ldm_id,
                mandat.client_id || null,
                signedBuf.length,
              ]
            );
            await pool.query(
              `UPDATE mandats SET chemin_pdf_signe = ? WHERE id = ?`,
              [fpath, mandat.id]
            );
            console.log(`[yousign] Mandat ${mandat.type} archivé dans la GED (doc id=${ins.insertId})`);
          }
        } catch (archErr) {
          console.error(`[yousign] archivage mandat ${mandat.type}:`, archErr.message);
        }

        // Vérifier si tous les documents sont maintenant signés pour activer la mission
        await activerMissionSiComplete(mandat.ldm_id);
      }
    }

    if (eventName === 'signature_request.declined') {
      if (devis && devis.statut === 'envoye') {
        await pool.query(
          `UPDATE devis SET statut = 'refuse', yousign_status = 'declined', updatedAt = NOW() WHERE id = ?`,
          [devis.id]
        );
        console.log(`[yousign] Devis ${devis.numero} refusé`);
      }
      if (ldm && ['envoyee','brouillon','a_valider','validee_interne'].includes(ldm.statut)) {
        await pool.query(
          `UPDATE lettres_mission SET yousign_status = 'declined', statut = 'annulee', updatedAt = NOW() WHERE id = ?`,
          [ldm.id]
        );
        if (ldm.devis_id) {
          await pool.query(
            `UPDATE devis SET verrouille = 0, ldm_generee_id = NULL WHERE id = ?`,
            [ldm.devis_id]
          ).catch(() => {});
        }
        console.log(`[yousign] LDM ${ldm.numero} refusée → annulée`);
      }
    }

    if (eventName === 'signature_request.expired') {
      if (devis)  await pool.query(`UPDATE devis SET yousign_status = 'expired' WHERE id = ?`, [devis.id]).catch(() => {});
      if (ldm)    await pool.query(`UPDATE lettres_mission SET yousign_status = 'expired' WHERE id = ?`, [ldm.id]).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[yousign webhook] erreur:', e.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── GET /status/:type/:id — statut Yousign d'un devis ou LDM ────────────
router.get('/status/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const table = type === 'devis' ? 'devis' : 'lettres_mission';
    const [[row]] = await pool.query(
      `SELECT yousign_request_id, yousign_status, yousign_signing_url FROM ${table} WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ message: 'Introuvable' });
    if (!row.yousign_request_id) return res.json({ yousign: false });

    // Optionnellement rafraîchir depuis Yousign
    let remoteStatus = null;
    if (yousign.isConfigured() && row.yousign_request_id && row.yousign_status !== 'done') {
      try {
        const remote = await yousign.getSignatureRequestStatus(row.yousign_request_id);
        remoteStatus = remote.status;
        if (remoteStatus !== row.yousign_status) {
          await pool.query(`UPDATE ${table} SET yousign_status = ? WHERE id = ?`, [remoteStatus, id]);
        }
      } catch { /* ignorer */ }
    }

    res.json({
      yousign: true,
      requestId:  row.yousign_request_id,
      status:     remoteStatus || row.yousign_status,
      signingUrl: row.yousign_signing_url,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
