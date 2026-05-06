const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET / — liste des paiements
router.get('/', verifyToken, async (req, res) => {
  try {
    const { facture_id, client_id, limit = 100 } = req.query;
    let where = '1=1';
    const params = [];
    if (facture_id) { where += ' AND p.facture_id = ?'; params.push(facture_id); }
    if (client_id) { where += ' AND f.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT p.*, f.numero AS facture_numero, c.nom AS client_nom
       FROM paiements p
       LEFT JOIN factures f ON p.facture_id = f.id
       LEFT JOIN clients c ON f.client_id = c.id
       WHERE ${where}
       ORDER BY p.datePaiement DESC
       LIMIT ?`,
      [...params, Number(limit)]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST / — enregistrer un paiement
router.post('/', verifyToken, async (req, res) => {
  const { facture_id, montant, datePaiement, modePaiement, reference } = req.body;
  if (!facture_id || !montant) return res.status(400).json({ message: 'Facture et montant requis' });
  try {
    const [r] = await pool.query(
      `INSERT INTO paiements (facture_id, montant, datePaiement, modePaiement, reference)
       VALUES (?,?,?,?,?)`,
      [facture_id, montant, datePaiement || new Date(), modePaiement || 'virement', reference || null]
    );

    // Recalculer le montant payé sur la facture
    const [[{ total_paye }]] = await pool.query(
      'SELECT COALESCE(SUM(montant),0) AS total_paye FROM paiements WHERE facture_id = ?',
      [facture_id]
    );
    const [[facture]] = await pool.query('SELECT montantTTC FROM factures WHERE id = ?', [facture_id]);
    const nouveauStatut = total_paye >= facture.montantTTC ? 'payee' : 'envoyee';
    await pool.query('UPDATE factures SET statut = ? WHERE id = ?', [nouveauStatut, facture_id]);

    res.status(201).json({ id: r.insertId, nouveauStatut });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur', e: e.message }); }
});

// POST /sepa-export — génère un fichier SEPA XML PAIN.008 pour les factures du mois
router.post('/sepa-export', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const moisAnnee = req.body.moisAnnee || new Date().toISOString().slice(0, 7);
  const [year, month] = moisAnnee.split('-').map(Number);
  const dateDebut = `${moisAnnee}-01`;
  const dateFin   = new Date(year, month, 0).toISOString().slice(0, 10);

  try {
    const [[cab]] = await pool.query('SELECT * FROM parametres_cabinet LIMIT 1').catch(() => [[{}]]);
    const iban = cab?.iban || 'FRXX XXXX XXXX XXXX XXXX XXXX XXX';
    const bic  = cab?.bic  || 'BNPAFRPPXXX';
    const creditorNom = cab?.nomCabinet || 'ParFi France';

    const [factures] = await pool.query(
      `SELECT f.id, f.numero, f.totalTTC, f.dateEcheance, cl.nom AS client_nom
       FROM factures f
       LEFT JOIN clients cl ON f.client_id = cl.id
       WHERE f.statut IN ('envoyee','retard')
         AND f.dateEcheance BETWEEN ? AND ?
         AND f.totalTTC > 0`,
      [dateDebut, dateFin]
    );

    const now = new Date();
    const msgId = `PARFI-${now.getTime()}`;
    const collectDate = dateFin;
    const total = factures.reduce((s, f) => s + parseFloat(f.totalTTC || 0), 0);

    const txEntries = factures.map((f, i) => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>PARFI-${f.id}-${moisAnnee}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${parseFloat(f.totalTTC).toFixed(2)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>MANDAT-${f.id}</MndtId>
            <DtOfSgntr>${collectDate}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt><FinInstnId><BIC>XXXXXXXX</BIC></FinInstnId></DbtrAgt>
        <Dbtr><Nm>${(f.client_nom || 'Client').replace(/[<>&]/g, '')}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>FRXX XXXX XXXX XXXX XXXX XXXX XXX</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>Honoraires ${f.numero} ${moisAnnee}</Ustrd></RmtInf>
      </DrctDbtTxInf>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.003.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now.toISOString()}</CreDtTm>
      <NbOfTxs>${factures.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <InitgPty><Nm>${creditorNom.replace(/[<>&]/g, '')}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${msgId}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${factures.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${collectDate}</ReqdColltnDt>
      <Cdtr><Nm>${creditorNom.replace(/[<>&]/g, '')}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${iban.replace(/\s/g, '')}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>${bic}</BIC></FinInstnId></CdtrAgt>${txEntries}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;

    // Enregistrement dans prelevements_sepa
    await pool.query(
      `INSERT INTO prelevements_sepa (moisAnnee, statut, dateExport, nbEcheances, montantTotal)
       VALUES (?, 'exporte', NOW(), ?, ?)`,
      [moisAnnee, factures.length, total]
    ).catch(() => {});

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sepa-${moisAnnee}.xml"`);
    res.send(xml);
  } catch (e) {
    res.status(500).json({ message: 'Erreur génération SEPA', e: e.message });
  }
});

// DELETE /:id
router.delete('/:id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [[p]] = await pool.query('SELECT facture_id FROM paiements WHERE id = ?', [req.params.id]);
    await pool.query('DELETE FROM paiements WHERE id = ?', [req.params.id]);
    if (p) {
      const [[{ total_paye }]] = await pool.query(
        'SELECT COALESCE(SUM(montant),0) AS total_paye FROM paiements WHERE facture_id = ?',
        [p.facture_id]
      );
      const [[facture]] = await pool.query('SELECT montantTTC FROM factures WHERE id = ?', [p.facture_id]);
      const nouveauStatut = total_paye >= facture.montantTTC ? 'payee' : 'envoyee';
      await pool.query('UPDATE factures SET statut = ? WHERE id = ?', [nouveauStatut, p.facture_id]);
    }
    res.json({ message: 'Paiement supprimé' });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur' }); }
});

module.exports = router;
