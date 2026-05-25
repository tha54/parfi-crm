const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// ─── Migration : toutes les tables micro au démarrage ────────────────────────
;(async () => {
  const tables = [
    {
      name: 'micro_clients',
      ddl: `CREATE TABLE micro_clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        siren VARCHAR(9),
        siret VARCHAR(14),
        nom_commercial VARCHAR(255),
        forme_juridique ENUM('micro_bic_vente','micro_bic_prestation','micro_bnc') NOT NULL DEFAULT 'micro_bic_prestation',
        regime_tva ENUM('franchise','tva_normale') DEFAULT 'franchise',
        numero_tva_intra VARCHAR(20),
        adresse_facturation TEXT,
        iban VARCHAR(34),
        bic VARCHAR(11),
        logo_url VARCHAR(500),
        prefixe_devis VARCHAR(10) DEFAULT 'DEV',
        prefixe_facture VARCHAR(10) DEFAULT 'FAC',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_contacts',
      ddl: `CREATE TABLE micro_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL,
        nom VARCHAR(255) NOT NULL,
        prenom VARCHAR(255),
        societe VARCHAR(255),
        siren VARCHAR(9),
        email VARCHAR(255),
        telephone VARCHAR(20),
        adresse TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_prestations',
      ddl: `CREATE TABLE micro_prestations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL,
        libelle VARCHAR(500) NOT NULL,
        description TEXT,
        unite VARCHAR(50) DEFAULT 'forfait',
        prix_unitaire DECIMAL(10,2) NOT NULL,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_devis',
      ddl: `CREATE TABLE micro_devis (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL,
        contact_id INT NOT NULL,
        numero VARCHAR(50) NOT NULL UNIQUE,
        date_emission DATE NOT NULL,
        date_validite DATE NOT NULL,
        objet VARCHAR(500),
        statut ENUM('brouillon','envoye','signe','refuse','expire','converti') DEFAULT 'brouillon',
        montant_ht DECIMAL(10,2) NOT NULL DEFAULT 0,
        taux_tva DECIMAL(5,2) DEFAULT 0,
        montant_tva DECIMAL(10,2) DEFAULT 0,
        montant_ttc DECIMAL(10,2) NOT NULL DEFAULT 0,
        conditions_paiement TEXT,
        notes TEXT,
        signature_token VARCHAR(100) UNIQUE,
        signature_date DATETIME,
        signature_ip VARCHAR(45),
        pdf_url VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
        FOREIGN KEY (contact_id) REFERENCES micro_contacts(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_devis_lignes',
      ddl: `CREATE TABLE micro_devis_lignes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        devis_id INT NOT NULL,
        libelle VARCHAR(500) NOT NULL,
        description TEXT,
        quantite DECIMAL(10,3) NOT NULL DEFAULT 1,
        unite VARCHAR(50) DEFAULT 'forfait',
        prix_unitaire DECIMAL(10,2) NOT NULL,
        remise_pct DECIMAL(5,2) DEFAULT 0,
        montant_ht DECIMAL(10,2) NOT NULL,
        ordre INT DEFAULT 0,
        FOREIGN KEY (devis_id) REFERENCES micro_devis(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_factures',
      ddl: `CREATE TABLE micro_factures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL,
        contact_id INT NOT NULL,
        devis_id INT,
        numero VARCHAR(50) NOT NULL UNIQUE,
        date_emission DATE NOT NULL,
        date_echeance DATE NOT NULL,
        objet VARCHAR(500),
        statut ENUM('brouillon','envoyee','partiellement_payee','payee','en_retard','annulee') DEFAULT 'brouillon',
        montant_ht DECIMAL(10,2) NOT NULL DEFAULT 0,
        taux_tva DECIMAL(5,2) DEFAULT 0,
        montant_tva DECIMAL(10,2) DEFAULT 0,
        montant_ttc DECIMAL(10,2) NOT NULL DEFAULT 0,
        montant_regle DECIMAL(10,2) DEFAULT 0,
        solde_restant DECIMAL(10,2),
        conditions_paiement TEXT,
        mention_franchise VARCHAR(500) DEFAULT 'TVA non applicable, art. 293 B du CGI',
        notes TEXT,
        pdf_url VARCHAR(500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
        FOREIGN KEY (contact_id) REFERENCES micro_contacts(id),
        FOREIGN KEY (devis_id) REFERENCES micro_devis(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_factures_lignes',
      ddl: `CREATE TABLE micro_factures_lignes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facture_id INT NOT NULL,
        libelle VARCHAR(500) NOT NULL,
        description TEXT,
        quantite DECIMAL(10,3) NOT NULL DEFAULT 1,
        unite VARCHAR(50) DEFAULT 'forfait',
        prix_unitaire DECIMAL(10,2) NOT NULL,
        remise_pct DECIMAL(5,2) DEFAULT 0,
        montant_ht DECIMAL(10,2) NOT NULL,
        ordre INT DEFAULT 0,
        FOREIGN KEY (facture_id) REFERENCES micro_factures(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_paiements',
      ddl: `CREATE TABLE micro_paiements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facture_id INT NOT NULL,
        date_paiement DATE NOT NULL,
        montant DECIMAL(10,2) NOT NULL,
        mode ENUM('virement','cheque','especes','carte','prelevement','autre') NOT NULL,
        reference VARCHAR(255),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (facture_id) REFERENCES micro_factures(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_relances',
      ddl: `CREATE TABLE micro_relances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facture_id INT NOT NULL,
        niveau TINYINT NOT NULL,
        date_envoi DATETIME NOT NULL,
        email_destinataire VARCHAR(255),
        statut ENUM('envoyee','echec') DEFAULT 'envoyee',
        FOREIGN KEY (facture_id) REFERENCES micro_factures(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
    {
      name: 'micro_livre_recettes',
      ddl: `CREATE TABLE micro_livre_recettes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        micro_client_id INT NOT NULL,
        paiement_id INT NOT NULL,
        date_encaissement DATE NOT NULL,
        reference_facture VARCHAR(50) NOT NULL,
        client_nom VARCHAR(255) NOT NULL,
        nature_prestation VARCHAR(500) NOT NULL,
        montant_encaisse DECIMAL(10,2) NOT NULL,
        mode_reglement VARCHAR(50) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
        FOREIGN KEY (paiement_id) REFERENCES micro_paiements(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    },
  ];

  for (const { name, ddl } of tables) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name]
    );
    if (!row.n) {
      await pool.query(ddl);
      console.log(`[micro] Table ${name} créée`);
    }
  }
})().catch(e => console.error('[micro] migration:', e.message));

// ─── GET /api/micro-clients — liste (scoped) ─────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT mc.*, c.nom AS client_nom, c.code_client,
              (SELECT COUNT(*) FROM micro_factures mf WHERE mf.micro_client_id = mc.id AND mf.statut NOT IN ('brouillon','annulee')) AS nb_factures,
              (SELECT COALESCE(SUM(mf.montant_ttc),0) FROM micro_factures mf WHERE mf.micro_client_id = mc.id AND mf.statut = 'payee' AND YEAR(mf.date_emission) = YEAR(CURDATE())) AS ca_ytd,
              (SELECT COALESCE(SUM(mf.solde_restant),0) FROM micro_factures mf WHERE mf.micro_client_id = mc.id AND mf.statut IN ('envoyee','partiellement_payee','en_retard')) AS impayés
       FROM micro_clients mc
       JOIN clients c ON c.id = mc.client_id
       ORDER BY c.nom`,
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/micro-clients/:id ───────────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query(
      `SELECT mc.*, c.nom AS client_nom, c.code_client, c.adresse AS client_adresse,
              c.ville AS client_ville, c.code_postal AS client_cp
       FROM micro_clients mc
       JOIN clients c ON c.id = mc.client_id
       WHERE mc.id = ?`,
      [req.params.id]
    );
    if (!mc) return res.status(404).json({ error: 'Non trouvé' });
    res.json(mc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/micro-clients/by-client/:clientId ───────────────────────────────
router.get('/by-client/:clientId', verifyToken, async (req, res) => {
  try {
    const [[mc]] = await pool.query(
      `SELECT mc.*, c.nom AS client_nom, c.code_client
       FROM micro_clients mc
       JOIN clients c ON c.id = mc.client_id
       WHERE mc.client_id = ?`,
      [req.params.clientId]
    );
    res.json(mc || null);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/micro-clients ──────────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const {
    client_id, siren, siret, nom_commercial, forme_juridique,
    regime_tva, numero_tva_intra, adresse_facturation,
    iban, bic, logo_url, prefixe_devis, prefixe_facture,
  } = req.body;
  try {
    const [r] = await pool.query(
      `INSERT INTO micro_clients
       (client_id, siren, siret, nom_commercial, forme_juridique,
        regime_tva, numero_tva_intra, adresse_facturation, iban, bic,
        logo_url, prefixe_devis, prefixe_facture)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [client_id, siren, siret, nom_commercial, forme_juridique || 'micro_bic_prestation',
       regime_tva || 'franchise', numero_tva_intra, adresse_facturation,
       iban, bic, logo_url, prefixe_devis || 'DEV', prefixe_facture || 'FAC']
    );
    const [[mc]] = await pool.query('SELECT * FROM micro_clients WHERE id = ?', [r.insertId]);
    res.status(201).json(mc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /api/micro-clients/:id ───────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const {
    siren, siret, nom_commercial, forme_juridique,
    regime_tva, numero_tva_intra, adresse_facturation,
    iban, bic, logo_url, prefixe_devis, prefixe_facture,
  } = req.body;
  try {
    await pool.query(
      `UPDATE micro_clients SET
        siren=?, siret=?, nom_commercial=?, forme_juridique=?,
        regime_tva=?, numero_tva_intra=?, adresse_facturation=?,
        iban=?, bic=?, logo_url=?, prefixe_devis=?, prefixe_facture=?
       WHERE id=?`,
      [siren, siret, nom_commercial, forme_juridique,
       regime_tva, numero_tva_intra, adresse_facturation,
       iban, bic, logo_url, prefixe_devis, prefixe_facture,
       req.params.id]
    );
    const [[mc]] = await pool.query('SELECT * FROM micro_clients WHERE id = ?', [req.params.id]);
    res.json(mc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/micro-clients/:id/kpis ─────────────────────────────────────────
router.get('/:id/kpis', verifyToken, async (req, res) => {
  try {
    const [[kpis]] = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN mf.statut = 'payee' AND YEAR(mf.date_emission) = YEAR(CURDATE()) THEN mf.montant_ttc ELSE 0 END), 0) AS ca_ytd,
        COALESCE(SUM(CASE WHEN mf.statut = 'payee' AND MONTH(mf.date_emission) = MONTH(CURDATE()) AND YEAR(mf.date_emission) = YEAR(CURDATE()) THEN mf.montant_ttc ELSE 0 END), 0) AS encaisse_mois,
        COALESCE(SUM(CASE WHEN mf.statut IN ('envoyee','partiellement_payee','en_retard') THEN mf.solde_restant ELSE 0 END), 0) AS impayés,
        COUNT(CASE WHEN mf.statut IN ('envoyee','partiellement_payee') THEN 1 END) AS factures_attente,
        COUNT(CASE WHEN mf.statut = 'en_retard' THEN 1 END) AS factures_retard,
        COUNT(DISTINCT md.id) AS devis_brouillon
       FROM micro_clients mc
       LEFT JOIN micro_factures mf ON mf.micro_client_id = mc.id
       LEFT JOIN micro_devis md ON md.micro_client_id = mc.id AND md.statut = 'brouillon'
       WHERE mc.id = ?`,
      [req.params.id]
    );
    res.json(kpis);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/micro-clients/:id/ca-mensuel ────────────────────────────────────
router.get('/:id/ca-mensuel', verifyToken, async (req, res) => {
  const annee = parseInt(req.query.annee) || new Date().getFullYear();
  try {
    const [rows] = await pool.query(
      `SELECT
         MONTH(mlr.date_encaissement) AS mois,
         COALESCE(SUM(mlr.montant_encaisse), 0) AS ca
       FROM micro_livre_recettes mlr
       WHERE mlr.micro_client_id = ?
         AND YEAR(mlr.date_encaissement) = ?
       GROUP BY MONTH(mlr.date_encaissement)
       ORDER BY mois ASC`,
      [req.params.id, annee]
    );
    // Renvoie un tableau de 12 valeurs (0 si aucun encaissement ce mois)
    const mois = Array.from({ length: 12 }, (_, i) => {
      const found = rows.find(r => r.mois === i + 1);
      return { mois: i + 1, ca: found ? Number(found.ca) : 0 };
    });
    res.json({ annee, mois });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
