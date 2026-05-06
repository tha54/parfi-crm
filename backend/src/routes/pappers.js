const express = require('express');
const https = require('https');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Mapping des codes nature juridique INSEE → libellé
const NATURE_JURIDIQUE = {
  '1000': 'Entrepreneur individuel',
  '1100': 'Artisan-commerçant',
  '1200': 'Commerçant',
  '1300': 'Artisan',
  '2110': 'Indivision',
  '5120': 'EURL',
  '5202': 'SNC',
  '5306': 'SCA',
  '5308': 'EARL',
  '5410': 'SA',
  '5415': 'SA cotée',
  '5422': 'SCA',
  '5499': 'SARL',
  '5596': 'SAS',
  '5710': 'SAS',
  '5720': 'SASU',
  '5785': 'SA (cotée)',
  '5599': 'Société anonyme',
  '5800': 'SA à directoire',
  '6317': 'SCOP',
  '6530': 'Société civile',
  '6531': 'SCI',
  '6532': 'SCI de vente',
  '6533': 'SCI coopérative',
  '6534': 'SCI',
  '6535': 'SCI',
  '6536': "SCI d'attribution",
  '6540': 'SCI',
  '6552': 'SCPI',
  '6560': 'Société civile foncière',
  '6561': 'SCI',
  '6599': 'Société civile',
  '9110': 'Syndicat de copropriétaires',
  '9120': 'Association déclarée',
  '9210': 'Association non déclarée',
  '9221': 'Association loi 1901',
  '9230': 'Fondation',
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ParfiCRM/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Réponse invalide')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// GET /api/pappers/search?q=<texte libre>
router.get('/search', verifyToken, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  try {
    const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=8&minimal=false`;
    const { status, body } = await httpsGet(url);
    if (status !== 200 || !body.results) return res.json([]);

    const results = body.results.map(e => {
      const siege = e.siege || {};
      return {
        nom:             e.nom_complet || e.nom_raison_sociale || '',
        siren:           e.siren || '',
        siret:           siege.siret || '',
        forme_juridique: NATURE_JURIDIQUE[String(e.nature_juridique)] || String(e.nature_juridique || ''),
        adresse:         siege.adresse || '',
        code_postal:     siege.code_postal || '',
        ville:           siege.libelle_commune || '',
        code_naf:        e.activite_principale || '',
        activite:        '',
        date_creation_ent: e.date_creation || null,
        capital:         null,
        etat:            e.etat_administratif || '',
      };
    });
    res.json(results);
  } catch (err) {
    console.error('Erreur search entreprises:', err.message);
    res.status(500).json({ message: 'Erreur lors de la recherche' });
  }
});

// GET /api/pappers/siren/:siren
router.get('/siren/:siren', verifyToken, async (req, res) => {
  const { siren } = req.params;

  if (!/^\d{9}$/.test(siren)) {
    return res.status(400).json({ message: 'Numéro SIREN invalide — 9 chiffres attendus' });
  }

  try {
    // ── Source principale : API gouvernementale (gratuite, sans clé) ──────────
    const govUrl = `https://recherche-entreprises.api.gouv.fr/search?q=${siren}&per_page=1`;
    const { status: govStatus, body: govBody } = await httpsGet(govUrl);

    if (govStatus !== 200 || !govBody.results?.length) {
      return res.status(404).json({ message: 'Entreprise introuvable (SIREN non reconnu)' });
    }

    const e     = govBody.results[0];
    const siege = e.siege || {};

    const result = {
      nom:               e.nom_complet || e.nom_raison_sociale || '',
      siren:             e.siren || siren,
      siret:             siege.siret || '',
      forme_juridique:   NATURE_JURIDIQUE[String(e.nature_juridique)] || String(e.nature_juridique || ''),
      adresse:           siege.adresse || '',
      code_postal:       siege.code_postal || '',
      ville:             siege.libelle_commune || '',
      capital:           null,
      code_naf:          e.activite_principale || '',
      activite:          '',
      date_creation_ent: e.date_creation || null,
    };

    // ── Source complémentaire : Pappers (si clé configurée et quota dispo) ────
    const apiKey = process.env.PAPPERS_API_KEY;
    if (apiKey) {
      try {
        const papUrl = `https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${apiKey}`;
        const { status: papStatus, body: papBody } = await httpsGet(papUrl);
        if (papStatus === 200) {
          if (papBody.capital)           result.capital    = papBody.capital;
          if (papBody.libelle_code_naf)  result.activite   = papBody.libelle_code_naf;
          if (papBody.forme_juridique)   result.forme_juridique = papBody.forme_juridique;
        }
      } catch (_) { /* Pappers optionnel — on ignore les erreurs */ }
    }

    res.json(result);
  } catch (err) {
    console.error('Erreur lookup SIREN:', err.message);
    res.status(500).json({ message: 'Impossible de récupérer les données (vérifiez la connexion)' });
  }
});

module.exports = router;
