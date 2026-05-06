'use strict';
/**
 * Route Powens — Open Banking
 *
 * Variables d'environnement requises :
 *   POWENS_CLIENT_ID, POWENS_CLIENT_SECRET
 *   POWENS_DOMAIN      (ex: "parfi")
 *   POWENS_BASE_URL    (ex: "https://parfi.biapi.pro/2.0")
 *   POWENS_WEBVIEW_URL (ex: "https://webview.powens.com")
 *   POWENS_CALLBACK_URL (ex: "https://163.172.158.24/api/powens/callback")
 *
 * Flux OAuth2 :
 *   1. GET /connect/:client_id      → génère une URL webview Powens
 *   2. GET /callback                → reçoit connection_id après connexion bancaire
 *   3. POST /sync                   → déclenche la synchronisation manuelle
 *   4. GET /mouvements              → liste les mouvements avec filtres
 *   5. PUT /mouvements/:id/lettrer  → affecte un mouvement à une facture
 */

const express  = require('express');
const router   = express.Router();
const pool     = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const BASE_URL    = process.env.POWENS_BASE_URL    || '';
const WEBVIEW_URL = process.env.POWENS_WEBVIEW_URL || 'https://webview.powens.com';
const CLIENT_ID   = process.env.POWENS_CLIENT_ID   || '';
const CLIENT_SEC  = process.env.POWENS_CLIENT_SECRET || '';
const DOMAIN      = process.env.POWENS_DOMAIN      || '';
const CALLBACK    = process.env.POWENS_CALLBACK_URL || '';

// ─── Migration au démarrage ────────────────────────────────────────────────

;(async () => {
  try {
    // powens_connexions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS powens_connexions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        powens_user_id VARCHAR(100),
        access_token TEXT,
        connection_id INT,
        statut ENUM('en_attente','actif','erreur','expire') DEFAULT 'en_attente',
        derniere_sync TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_client (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // comptes_bancaires
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comptes_bancaires (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        connexion_id INT,
        powens_account_id INT UNIQUE,
        iban VARCHAR(34),
        nom VARCHAR(255),
        banque VARCHAR(100),
        type VARCHAR(50),
        solde DECIMAL(15,2),
        devise VARCHAR(3) DEFAULT 'EUR',
        actif TINYINT(1) DEFAULT 1,
        derniere_sync TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_client (client_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // mouvements_bancaires
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mouvements_bancaires (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        compte_id INT,
        powens_transaction_id BIGINT UNIQUE,
        date_operation DATE NOT NULL,
        date_valeur DATE,
        montant DECIMAL(15,2) NOT NULL,
        libelle VARCHAR(500),
        libelle_simplifie VARCHAR(500),
        type VARCHAR(50),
        statut_lettrage ENUM('non_lettre','lettre','ignore') DEFAULT 'non_lettre',
        facture_id INT,
        lettre_par INT,
        lettre_le TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_client (client_id),
        INDEX idx_lettrage (statut_lettrage),
        INDEX idx_date (date_operation)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[powens] Tables vérifiées');
  } catch (e) {
    console.error('[powens] migration:', e.message);
  }
})();

// ─── Helpers Powens API ────────────────────────────────────────────────────

function powensConfigured() {
  return !!(CLIENT_ID && CLIENT_SEC && BASE_URL && DOMAIN);
}

async function powensFetch(path, opts = {}) {
  const url  = `${BASE_URL}${path}`;
  const resp = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    const err = new Error(data?.message || data?.error || `Powens API ${resp.status}`);
    err.status = resp.status;
    err.powens = data;
    throw err;
  }
  return data;
}

async function getManagementToken() {
  const url  = `${BASE_URL}/auth/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SEC,
    scope:         'payments',
  });
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    const err = new Error(data?.message || data?.error || `Powens auth ${resp.status}`);
    err.status = resp.status;
    err.powens = data;
    throw err;
  }
  return data.access_token || data.auth_token;
}

async function createPowensUser(mgmtToken) {
  // Powens v2 : POST /auth/init crée un utilisateur anonyme temporaire
  const data = await powensFetch('/auth/init', {
    method:  'POST',
    headers: { Authorization: `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({}),
  });
  return { powens_user_id: String(data.id_user), access_token: data.auth_token };
}

async function getWebviewCode(powensUserId, userToken) {
  // Le code webview s'obtient avec le token USER (pas le management token)
  const data = await powensFetch('/auth/token/code', {
    method:  'GET',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  return data.code;
}

async function fetchAccounts(accessToken) {
  return powensFetch('/users/me/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function fetchTransactions(accessToken, minDate) {
  const qs = minDate ? `?min_date=${minDate}` : '';
  return powensFetch(`/users/me/transactions${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ─── Sync d'un client (utilisé par le cron et la route manuelle) ──────────

async function syncClient(connexion) {
  const { id: connexionId, client_id, access_token, powens_user_id } = connexion;

  try {
    // Comptes
    const accountsResp = await fetchAccounts(access_token);
    const accounts = accountsResp.accounts || accountsResp || [];
    for (const acc of accounts) {
      await pool.query(`
        INSERT INTO comptes_bancaires
          (client_id, connexion_id, powens_account_id, iban, nom, banque, type, solde, devise, derniere_sync)
        VALUES (?,?,?,?,?,?,?,?,?,NOW())
        ON DUPLICATE KEY UPDATE
          solde=VALUES(solde), nom=VALUES(nom), derniere_sync=NOW()
      `, [
        client_id, connexionId, acc.id,
        acc.iban || null, acc.name || acc.original_name || null,
        acc.company_name || acc.bank_name || null,
        acc.type || null, parseFloat(acc.balance || 0), acc.currency || 'EUR',
      ]);
    }

    // Transactions (dernière sync -1j pour éviter les trous)
    const [[conn]] = await pool.query(
      'SELECT derniere_sync FROM powens_connexions WHERE id = ?', [connexionId]
    );
    let minDate = null;
    if (conn?.derniere_sync) {
      const d = new Date(conn.derniere_sync);
      d.setDate(d.getDate() - 1);
      minDate = d.toISOString().slice(0, 10);
    }

    const txResp = await fetchTransactions(access_token, minDate);
    const txList = txResp.transactions || txResp || [];
    let inserted = 0;

    for (const tx of txList) {
      // Retrouver le compte CRM correspondant
      const [[compte]] = await pool.query(
        'SELECT id FROM comptes_bancaires WHERE powens_account_id = ?', [tx.id_account]
      ).catch(() => [[null]]);

      await pool.query(`
        INSERT IGNORE INTO mouvements_bancaires
          (client_id, compte_id, powens_transaction_id, date_operation, date_valeur,
           montant, libelle, libelle_simplifie, type)
        VALUES (?,?,?,?,?,?,?,?,?)
      `, [
        client_id, compte?.id || null, tx.id,
        tx.date       ? tx.date.slice(0, 10)        : null,
        tx.value_date ? tx.value_date.slice(0, 10)  : null,
        parseFloat(tx.value || tx.amount || 0),
        tx.original_wording || tx.wording || null,
        tx.simplified_wording || tx.wording || null,
        tx.type || null,
      ]);
      inserted++;
    }

    await pool.query(
      `UPDATE powens_connexions SET statut='actif', derniere_sync=NOW() WHERE id = ?`,
      [connexionId]
    );

    return { inserted, accounts: accounts.length };
  } catch (e) {
    await pool.query(
      `UPDATE powens_connexions SET statut='erreur' WHERE id = ?`,
      [connexionId]
    );
    throw e;
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

// GET /status — état de la configuration Powens
router.get('/status', verifyToken, requireRole('expert', 'chef_mission'), (req, res) => {
  res.json({ configured: powensConfigured(), domain: DOMAIN || null, callback: CALLBACK });
});

// GET /connexions — liste des connexions actives
router.get('/connexions', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT pc.*, c.nom AS client_nom,
        (SELECT COUNT(*) FROM comptes_bancaires cb WHERE cb.connexion_id = pc.id AND cb.actif=1) AS nb_comptes,
        (SELECT COUNT(*) FROM mouvements_bancaires mb WHERE mb.client_id = pc.client_id) AS nb_mouvements
      FROM powens_connexions pc
      LEFT JOIN clients c ON c.id = pc.client_id
      ORDER BY pc.client_id, pc.createdAt DESC
    `);
    // Masquer le token dans la réponse
    const safe = rows.map(r => ({ ...r, access_token: r.access_token ? '***' : null }));
    res.json(safe);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// GET /connect/:client_id — génère l'URL webview Powens pour ce client
router.get('/connect/:client_id', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  if (!powensConfigured()) {
    return res.status(400).json({ message: 'Powens non configuré — renseignez POWENS_CLIENT_ID et POWENS_CLIENT_SECRET dans .env' });
  }
  const clientId = parseInt(req.params.client_id);
  try {
    const [[client]] = await pool.query('SELECT id, nom FROM clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ message: 'Client introuvable' });

    // Récupérer ou créer la connexion Powens pour ce client
    let [[connexion]] = await pool.query(
      'SELECT * FROM powens_connexions WHERE client_id = ? ORDER BY createdAt DESC LIMIT 1',
      [clientId]
    );

    const mgmtToken = await getManagementToken();

    if (!connexion || !connexion.powens_user_id) {
      // Créer un utilisateur Powens pour ce client (POST /auth/init)
      const { powens_user_id, access_token } = await createPowensUser(mgmtToken);
      const [ins] = await pool.query(
        `INSERT INTO powens_connexions (client_id, powens_user_id, access_token, statut)
         VALUES (?,?,?,'en_attente')`,
        [clientId, powens_user_id, access_token]
      );
      connexion = { id: ins.insertId, client_id: clientId, powens_user_id, access_token };
    } else if (!connexion.access_token) {
      // Token expiré : re-init pour obtenir un nouveau token (crée un nouveau user Powens)
      const { powens_user_id, access_token } = await createPowensUser(mgmtToken);
      await pool.query(
        `UPDATE powens_connexions SET powens_user_id=?, access_token=?, statut='en_attente' WHERE id=?`,
        [powens_user_id, access_token, connexion.id]
      );
      connexion = { ...connexion, powens_user_id, access_token };
    }

    // Générer un code temporaire pour la webview (avec le user token)
    const tempCode = await getWebviewCode(connexion.powens_user_id, connexion.access_token);

    const state = Buffer.from(JSON.stringify({ connexion_id: connexion.id, client_id: clientId })).toString('base64url');
    const webviewUrl = `${WEBVIEW_URL}/auth/webview/fr/connect`
      + `?domain=${encodeURIComponent(DOMAIN)}`
      + `&client_id=${encodeURIComponent(CLIENT_ID)}`
      + `&redirect_uri=${encodeURIComponent(CALLBACK)}`
      + `&code=${encodeURIComponent(tempCode)}`
      + `&state=${encodeURIComponent(state)}`;

    res.json({ webview_url: webviewUrl, connexion_id: connexion.id });
  } catch (e) {
    console.error('[powens] connect error:', e.message, e.powens);
    res.status(e.status || 500).json({ message: e.message, details: e.powens });
  }
});

// GET /callback — point d'entrée OAuth après connexion bancaire (sans auth JWT)
router.get('/callback', async (req, res) => {
  const { connection_id, state, error, error_reason } = req.query;

  if (error) {
    console.error('[powens] callback error:', error, error_reason);
    return res.redirect(`/lettrage?powens_error=${encodeURIComponent(error_reason || error)}`);
  }

  try {
    let connexionId = null, clientId = null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
        connexionId = decoded.connexion_id;
        clientId    = decoded.client_id;
      } catch { /* state mal formé */ }
    }

    if (connexionId && connection_id) {
      await pool.query(
        `UPDATE powens_connexions SET connection_id=?, statut='actif' WHERE id=?`,
        [parseInt(connection_id), connexionId]
      );
      // Sync immédiate en arrière-plan
      const [[conn]] = await pool.query('SELECT * FROM powens_connexions WHERE id=?', [connexionId]);
      if (conn) syncClient(conn).catch(e => console.error('[powens] sync after connect:', e.message));
    }

    return res.redirect(`/lettrage?connected=1${clientId ? `&client_id=${clientId}` : ''}`);
  } catch (e) {
    console.error('[powens] callback error:', e.message);
    return res.redirect('/lettrage?powens_error=callback_failed');
  }
});

// POST /sync — sync manuelle (tout ou un client)
router.post('/sync', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { client_id } = req.body;
  try {
    let where = "statut IN ('actif','en_attente') AND access_token IS NOT NULL";
    const params = [];
    if (client_id) { where += ' AND client_id = ?'; params.push(client_id); }

    const [connexions] = await pool.query(
      `SELECT * FROM powens_connexions WHERE ${where}`, params
    );
    if (connexions.length === 0) {
      return res.json({ message: 'Aucune connexion active trouvée', synced: 0 });
    }

    let totalInserted = 0;
    const errors = [];
    for (const conn of connexions) {
      try {
        const { inserted } = await syncClient(conn);
        totalInserted += inserted;
      } catch (e) {
        errors.push({ client_id: conn.client_id, error: e.message });
      }
    }

    res.json({
      message: `Sync terminée — ${totalInserted} mouvement(s) importé(s)`,
      synced: connexions.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// GET /comptes — comptes bancaires (optionnel: filtrer par client_id)
router.get('/comptes', verifyToken, async (req, res) => {
  const { client_id } = req.query;
  try {
    let where = 'cb.actif = 1';
    const params = [];
    if (client_id) { where += ' AND cb.client_id = ?'; params.push(client_id); }
    const [rows] = await pool.query(
      `SELECT cb.*, c.nom AS client_nom
       FROM comptes_bancaires cb
       LEFT JOIN clients c ON c.id = cb.client_id
       WHERE ${where}
       ORDER BY c.nom, cb.banque`,
      params
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// GET /mouvements — liste des mouvements bancaires
router.get('/mouvements', verifyToken, async (req, res) => {
  const { client_id, compte_id, statut_lettrage, date_debut, date_fin, limit = 200 } = req.query;
  try {
    let where = '1=1';
    const params = [];
    if (client_id)        { where += ' AND mb.client_id = ?';        params.push(client_id); }
    if (compte_id)        { where += ' AND mb.compte_id = ?';         params.push(compte_id); }
    if (statut_lettrage)  { where += ' AND mb.statut_lettrage = ?';   params.push(statut_lettrage); }
    if (date_debut)       { where += ' AND mb.date_operation >= ?';   params.push(date_debut); }
    if (date_fin)         { where += ' AND mb.date_operation <= ?';   params.push(date_fin); }

    const [rows] = await pool.query(`
      SELECT mb.*,
        c.nom  AS client_nom,
        cb.nom AS compte_nom, cb.banque AS compte_banque, cb.iban AS compte_iban,
        f.numero AS facture_numero, f.totalTTC AS facture_montant,
        CONCAT(u.prenom,' ',u.nom) AS lettre_par_nom
      FROM mouvements_bancaires mb
      LEFT JOIN clients       c  ON c.id  = mb.client_id
      LEFT JOIN comptes_bancaires cb ON cb.id = mb.compte_id
      LEFT JOIN factures      f  ON f.id  = mb.facture_id
      LEFT JOIN utilisateurs  u  ON u.id  = mb.lettre_par
      WHERE ${where}
      ORDER BY mb.date_operation DESC
      LIMIT ?
    `, [...params, Number(limit)]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// PUT /mouvements/:id/lettrer — affecter un mouvement à une facture
router.put('/mouvements/:id/lettrer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  const { facture_id } = req.body;
  const mvtId = req.params.id;
  try {
    if (facture_id) {
      await pool.query(
        `UPDATE mouvements_bancaires
         SET statut_lettrage='lettre', facture_id=?, lettre_par=?, lettre_le=NOW()
         WHERE id=?`,
        [facture_id, req.user.id, mvtId]
      );

      // Créer un paiement côté factures si la facture n'est pas déjà payée
      const [[mvt]] = await pool.query('SELECT montant FROM mouvements_bancaires WHERE id=?', [mvtId]);
      const [[fac]] = await pool.query('SELECT statut, totalTTC FROM factures WHERE id=?', [facture_id]);
      if (fac && fac.statut !== 'payee') {
        await pool.query(
          `INSERT INTO paiements (factureId, montant, datePaiement, modePaiement, reference)
           VALUES (?,?,CURDATE(),'virement','Lettrage Powens')
           ON DUPLICATE KEY UPDATE montant=montant`,
          [facture_id, Math.abs(parseFloat(mvt?.montant || 0))]
        );
        // Mettre à jour le statut facture
        const [[{ total_paye }]] = await pool.query(
          'SELECT COALESCE(SUM(montant),0) AS total_paye FROM paiements WHERE factureId=?', [facture_id]
        );
        const statut = parseFloat(total_paye) >= parseFloat(fac.totalTTC) ? 'payee' : 'partielle';
        await pool.query('UPDATE factures SET statut=? WHERE id=?', [statut, facture_id]);
      }
    } else {
      // Délettrage
      await pool.query(
        `UPDATE mouvements_bancaires
         SET statut_lettrage='non_lettre', facture_id=NULL, lettre_par=NULL, lettre_le=NULL
         WHERE id=?`,
        [mvtId]
      );
    }
    res.json({ message: 'OK' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// PUT /mouvements/:id/ignorer — marquer comme ignoré (pas de facture associée)
router.put('/mouvements/:id/ignorer', verifyToken, requireRole('expert', 'chef_mission'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE mouvements_bancaires SET statut_lettrage='ignore', lettre_par=?, lettre_le=NOW() WHERE id=?`,
      [req.user.id, req.params.id]
    );
    res.json({ message: 'OK' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// DELETE /connexions/:id — déconnecter un compte bancaire
router.delete('/connexions/:id', verifyToken, requireRole('expert'), async (req, res) => {
  try {
    await pool.query(
      `UPDATE powens_connexions SET statut='expire' WHERE id=?`, [req.params.id]
    );
    await pool.query(
      `UPDATE comptes_bancaires SET actif=0 WHERE connexion_id=?`, [req.params.id]
    );
    res.json({ message: 'Connexion désactivée' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// GET /factures-suggerees/:mouvement_id — suggestions de factures pour le lettrage
router.get('/factures-suggerees/:mouvement_id', verifyToken, async (req, res) => {
  try {
    const [[mvt]] = await pool.query(
      'SELECT * FROM mouvements_bancaires WHERE id=?', [req.params.mouvement_id]
    );
    if (!mvt) return res.status(404).json({ message: 'Mouvement introuvable' });

    const montantAbs = Math.abs(parseFloat(mvt.montant));
    const marge = montantAbs * 0.02; // ±2%

    const [factures] = await pool.query(`
      SELECT f.id, f.numero, f.totalTTC, f.dateEmission, f.dateEcheance, f.statut, c.nom AS client_nom
      FROM factures f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.client_id = ?
        AND f.statut IN ('envoyee','retard','partielle')
        AND f.totalTTC BETWEEN ? AND ?
      ORDER BY ABS(f.totalTTC - ?) ASC
      LIMIT 10
    `, [mvt.client_id, montantAbs - marge, montantAbs + marge, montantAbs]);

    res.json(factures);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur', error: e.message });
  }
});

// ─── Webhook Powens (POST /api/webhooks/powens) ────────────────────────────
// Powens envoie une notification quand une sync se termine ou qu'un
// nouveau compte est connecté. On déclenche une sync en arrière-plan.

async function handleWebhook(req, res) {
  try {
    const payload = req.body || {};
    const powensUserId = String(payload.user_id || payload.userId || '');
    const event        = payload.event || payload.type || '';

    console.log(`[powens] webhook event="${event}" user_id="${powensUserId}"`);

    // Répondre immédiatement pour ne pas bloquer Powens
    res.json({ received: true });

    if (!powensUserId) return;

    // Retrouver la connexion CRM correspondante
    const [rows] = await pool.query(
      `SELECT * FROM powens_connexions
       WHERE powens_user_id = ? AND statut IN ('actif','en_attente') AND access_token IS NOT NULL
       LIMIT 1`,
      [powensUserId]
    );
    if (rows.length === 0) {
      console.log(`[powens] webhook: aucune connexion pour user_id=${powensUserId}`);
      return;
    }

    // Sync en arrière-plan
    syncClient(rows[0]).then(({ inserted, accounts }) => {
      console.log(`[powens] webhook sync OK — client_id=${rows[0].client_id} inserted=${inserted} accounts=${accounts}`);
    }).catch(e => {
      console.error(`[powens] webhook sync error — client_id=${rows[0].client_id}:`, e.message);
    });
  } catch (e) {
    console.error('[powens] handleWebhook error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
}

module.exports = { router, syncClient, handleWebhook };
