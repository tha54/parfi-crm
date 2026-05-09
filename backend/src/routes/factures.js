'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { generateFacturXML, generateFacturePDF } = require('../utils/facturx');
const factureService = require('../services/factureService');

async function getCabinet() {
  const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[null]]);
  return cab || {};
}

// ─── Liste ────────────────────────────────────────────────────────────────────

router.get('/', verifyToken, async (req, res) => {
  try {
    const { client_id, collaborateur_id, statut, mois } = req.query;
    const where = ['1=1'];
    const params = [];

    if (client_id)        { where.push('f.client_id = ?');                params.push(client_id); }
    if (collaborateur_id) { where.push('f.collaborateur_referent_id = ?'); params.push(collaborateur_id); }
    if (statut)           { where.push('f.statut = ?');                    params.push(statut); }
    if (mois)             { where.push('DATE_FORMAT(f.mois_facturation,\'%Y-%m\') = ?'); params.push(mois); }

    const [rows] = await pool.query(
      `SELECT f.*,
              c.nom  AS client_nom,
              u.prenom AS collab_prenom, u.nom AS collab_nom,
              lm.numero AS ldm_numero,
              COALESCE(d.id, lm.devis_id) AS devis_id_resolved,
              COALESCE(d.numero, dlm.numero) AS devis_numero
       FROM factures f
       LEFT JOIN clients c  ON f.client_id = c.id
       LEFT JOIN utilisateurs u ON f.collaborateur_referent_id = u.id
       LEFT JOIN lettres_mission lm ON f.lettre_mission_id = lm.id
       LEFT JOIN devis d  ON f.devisId = d.id
       LEFT JOIN devis dlm ON lm.devis_id = dlm.id
       WHERE ${where.join(' AND ')}
       ORDER BY f.mois_facturation DESC, f.createdAt DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ─── Dépassements budget (avant /:id pour éviter conflit) ────────────────────

router.get('/depassements', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[cab]] = await pool.query('SELECT seuil_depassement_budget FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
    const seuil = Number(cab?.seuil_depassement_budget || 20);
    const results = await factureService.getDepassements(seuil);
    res.json(results);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ─── Détail ───────────────────────────────────────────────────────────────────

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[f]] = await pool.query(
      `SELECT f.*,
              c.nom AS client_nom, c.siren AS client_siren, c.adresse AS client_adresse,
              u.prenom AS collab_prenom, u.nom AS collab_nom,
              lm.numero AS ldm_numero,
              COALESCE(d.id, lm.devis_id) AS devis_id_resolved,
              COALESCE(d.numero, dlm.numero) AS devis_numero
       FROM factures f
       LEFT JOIN clients c ON f.client_id = c.id
       LEFT JOIN utilisateurs u ON f.collaborateur_referent_id = u.id
       LEFT JOIN lettres_mission lm ON f.lettre_mission_id = lm.id
       LEFT JOIN devis d  ON f.devisId = d.id
       LEFT JOIN devis dlm ON lm.devis_id = dlm.id
       WHERE f.id = ?`,
      [req.params.id]
    );
    if (!f) return res.status(404).json({ message: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM lignes_facture WHERE factureId = ? ORDER BY ordre', [f.id]);
    const [evenements] = await pool.query(
      `SELECT fe.*, u.prenom, u.nom FROM factures_evenements fe
       LEFT JOIN utilisateurs u ON fe.acteur_id = u.id
       WHERE fe.facture_id = ? ORDER BY fe.date DESC`,
      [f.id]
    );
    res.json({ ...f, lignes, evenements });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ─── Création manuelle ────────────────────────────────────────────────────────

router.post('/', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id, type, lettre_mission_id, totalHT, tauxTVA, totalTVA, totalTTC, notesInternes, lignes } = req.body;
  if (!client_id) return res.status(400).json({ message: 'Client requis' });
  try {
    const numero = await factureService.nextNumeroBrouillon();
    const tva = tauxTVA ?? 20;
    const ht  = totalHT ?? 0;
    const tvamnt = totalTVA ?? ht * tva / 100;
    const ttc = totalTTC ?? ht + tvamnt;

    const [result] = await pool.query(
      `INSERT INTO factures
         (numero, client_id, contactId, type, statut,
          totalHT, tauxTVA, totalTVA, totalTTC,
          lettre_mission_id, collaborateur_referent_id, notesInternes)
       VALUES (?, ?, 0, ?, 'brouillon', ?, ?, ?, ?, ?, ?, ?)`,
      [numero, client_id, type || 'facture', ht, tva, tvamnt, ttc,
       lettre_mission_id || null, req.user.id, notesInternes || null]
    );
    const factureId = result.insertId;

    if (lignes?.length) {
      for (let i = 0; i < lignes.length; i++) {
        const l = lignes[i];
        await pool.query(
          `INSERT INTO lignes_facture (factureId, ordre, description, quantite, prixUnitaireHT, remisePct, totalHT)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [factureId, i, l.description, l.quantite || 1, l.prixUnitaireHT || 0, l.remisePct || 0, l.totalHT || 0]
        );
      }
    }

    await factureService.logEvenement(factureId, 'creation', req.user.id, 'Brouillon créé manuellement');
    res.status(201).json({ id: factureId, numero });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

// ─── Modification brouillon ───────────────────────────────────────────────────

router.put('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const result = await factureService.modifierBrouillon(Number(req.params.id), req.body, req.user.id);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

// ─── Actions métier ───────────────────────────────────────────────────────────

router.post('/:id/marquer-vu', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    res.json(await factureService.marquerVu(Number(req.params.id), req.user.id));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

router.post('/:id/emettre', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    res.json(await factureService.emettre(Number(req.params.id), req.user.id));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

router.post('/:id/marquer-payee', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    res.json(await factureService.marquerPayee(Number(req.params.id), req.user.id));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

router.post('/:id/annuler', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const { motif } = req.body;
    res.json(await factureService.annuler(Number(req.params.id), req.user.id, motif));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// ─── Aide à la décision ───────────────────────────────────────────────────────

router.get('/:id/aide-decision', verifyToken, async (req, res) => {
  try {
    res.json(await factureService.getAideDecision(Number(req.params.id)));
  } catch (e) { res.status(e.status || 500).json({ message: e.message }); }
});

// ─── Factur-X XML ─────────────────────────────────────────────────────────────

router.get('/:id/facturx-xml', verifyToken, async (req, res) => {
  try {
    const [[f]] = await pool.query(
      `SELECT f.*, c.nom AS client_nom, c.siren AS client_siren
       FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?`,
      [req.params.id]
    );
    if (!f) return res.status(404).json({ message: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM lignes_facture WHERE factureId = ? ORDER BY ordre', [f.id]);
    const cabinet = await getCabinet();
    const xml = generateFacturXML(f, cabinet, lignes);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="facturx-${f.numero_fiscal || f.numero}.xml"`);
    res.send(xml);
  } catch (e) { res.status(500).json({ message: 'Erreur génération XML', error: e.message }); }
});

// ─── PDF Factur-X ─────────────────────────────────────────────────────────────

router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const [[f]] = await pool.query(
      `SELECT f.*, c.nom AS client_nom, c.siren AS client_siren, c.adresse AS client_adresse
       FROM factures f LEFT JOIN clients c ON f.client_id = c.id WHERE f.id = ?`,
      [req.params.id]
    );
    if (!f) return res.status(404).json({ message: 'Facture introuvable' });
    const [lignes] = await pool.query('SELECT * FROM lignes_facture WHERE factureId = ? ORDER BY ordre', [f.id]);
    const cabinet = await getCabinet();
    const xml = generateFacturXML(f, cabinet, lignes);
    const pdfBuffer = await generateFacturePDF(f, cabinet, lignes, xml);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${f.numero_fiscal || f.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (e) { res.status(500).json({ message: 'Erreur génération PDF', error: e.message }); }
});

// ─── Export SEPA ──────────────────────────────────────────────────────────────

router.post('/sepa-export', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { mois } = req.body;
  try {
    const [factures] = await pool.query(
      `SELECT f.*, c.nom AS client_nom, c.siren AS client_siren
       FROM factures f LEFT JOIN clients c ON f.client_id = c.id
       WHERE f.statut IN ('emise','envoyee','retard')
         AND DATE_FORMAT(COALESCE(f.mois_facturation, f.dateEmission), '%Y-%m') = ?`,
      [mois]
    );
    if (!factures.length) return res.status(404).json({ message: 'Aucune facture pour ce mois' });

    const msgId = `SEPA-${Date.now()}`;
    const nbTxns = factures.length;
    const totalCtrl = factures.reduce((s, f) => s + Number(f.totalTTC), 0).toFixed(2);
    const createdAt = new Date().toISOString().slice(0, 16);

    const txns = factures.map(f => `
    <DrctDbtTxInf>
      <PmtId><EndToEndId>${f.numero_fiscal || f.numero}</EndToEndId></PmtId>
      <InstdAmt Ccy="EUR">${Number(f.totalTTC).toFixed(2)}</InstdAmt>
      <DbtrAgt><FinInstnId><BIC>XXXXXXXX</BIC></FinInstnId></DbtrAgt>
      <Dbtr><Nm>${(f.client_nom || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>FRXX XXXX XXXX XXXX XXXX XXXX XXX</IBAN></Id></DbtrAcct>
    </DrctDbtTxInf>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.003.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>${nbTxns}</NbOfTxs>
      <CtrlSum>${totalCtrl}</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-001</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${nbTxns}</NbOfTxs>
      <CtrlSum>${totalCtrl}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${new Date().toISOString().slice(0, 10)}</ReqdColltnDt>
      <Cdtr><Nm>Parfi France</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>FRXX XXXX XXXX XXXX XXXX XXXX XXX</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>XXXXXXXX</BIC></FinInstnId></CdtrAgt>
      ${txns}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="sepa-${mois}.xml"`);
    res.send(xml);
  } catch (e) { res.status(500).json({ message: 'Erreur export SEPA', error: e.message }); }
});

// ─── Suppression (brouillon uniquement) ──────────────────────────────────────

router.delete('/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    const [[f]] = await pool.query('SELECT statut FROM factures WHERE id = ?', [req.params.id]);
    if (!f) return res.status(404).json({ message: 'Facture introuvable' });
    if (!['brouillon', 'vu', 'annulee'].includes(f.statut)) {
      return res.status(400).json({ message: 'Seuls les brouillons et annulées peuvent être supprimés' });
    }
    await pool.query('DELETE FROM lignes_facture WHERE factureId = ?', [req.params.id]);
    await pool.query('DELETE FROM factures_evenements WHERE facture_id = ?', [req.params.id]);
    await pool.query('DELETE FROM factures WHERE id = ?', [req.params.id]);
    res.json({ message: 'Facture supprimée' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', error: e.message }); }
});

module.exports = router;
