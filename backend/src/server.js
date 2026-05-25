require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const utilisateursRoutes = require('./routes/utilisateurs');
const clientsRoutes = require('./routes/clients');
const attributionsRoutes = require('./routes/attributions');
const tachesRoutes = require('./routes/taches');
const dashboardRoutes = require('./routes/dashboard');
const devisRoutes = require('./routes/devis');
const facturesRoutes = require('./routes/factures');
const lettresRoutes = require('./routes/lettres');
const prospectsRoutes = require('./routes/prospects');
const pappersRoutes = require('./routes/pappers');
const contactsRoutes = require('./routes/contacts');
const opportunitesRoutes = require('./routes/opportunites');
const missionsRoutes = require('./routes/missions');
const intervenantsRoutes = require('./routes/intervenants');
const relancesRoutes = require('./routes/relances');
const parametresRoutes = require('./routes/parametres');
const rentabiliteRoutes = require('./routes/rentabilite');
const interactionsRoutes = require('./routes/interactions');
const documentsRoutes = require('./routes/documents');
const paiementsRoutes = require('./routes/paiements');
const planningRoutes = require('./routes/planning');
const gedRoutes = require('./routes/ged');
const portalRoutes = require('./routes/portal');
const briefingRoutes = require('./routes/briefing');
const notificationsRoutes = require('./routes/notifications');
const commentairesRoutes = require('./routes/commentaires');
const wikiRoutes = require('./routes/wiki');
const auditRoutes = require('./routes/audit');
const automationsRoutes = require('./routes/automations');
const intakeRoutes = require('./routes/intake');
const tiimeRoutes = require('./routes/tiime');
const tacheTempsRoutes = require('./routes/tacheTemps');
const contratsRoutes = require('./routes/contrats');
const callsRoutes = require('./routes/calls');
const searchRoutes = require('./routes/search');
const absencesRoutes = require('./routes/absences');
const rapportsRoutes = require('./routes/rapports');
const dimensionnementRoutes = require('./routes/dimensionnement');
const chifrageRoutes = require('./routes/chiffrage');
const portefeuilleRoutes = require('./routes/portefeuille');
const chargeTravailRoutes = require('./routes/chargeTravail');
const activiteRoutes = require('./routes/activite');
const alertesFacturationRoutes = require('./routes/alertesFacturation');
const { router: powensRoutes, handleWebhook: powensWebhook } = require('./routes/powens');
const signaturesRoutes = require('./routes/signatures');
const microClientsRoutes = require('./routes/micro_clients');
const microContactsRoutes = require('./routes/micro_contacts');
const microPrestationsRoutes = require('./routes/micro_prestations');
const microDevisRoutes = require('./routes/micro_devis');
const microFacturesRoutes = require('./routes/micro_factures');
const { router: microRelancesRoutes } = require('./routes/micro_relances');

const { startScheduler } = require('./scheduler');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173',
    'https://163.172.158.24', 'https://parfi-suivi',
  ],
  credentials: true,
}));
// Capture rawBody avant parsing JSON (nécessaire pour vérification signature Yousign)
app.use((req, res, next) => {
  if (req.path === '/api/signatures/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      req.rawBody = raw;
      req._body   = true; // signale à body-parser que le body est déjà lu
      try { req.body = JSON.parse(raw); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads preview
app.use('/uploads', express.static('/opt/parfi-data/documents'));
app.use('/micro-devis-pdf', express.static('/opt/parfi-data/micro-devis'));

app.use('/api/signatures', signaturesRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/utilisateurs', utilisateursRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/attributions', attributionsRoutes);
app.use('/api/taches', tachesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/devis', devisRoutes);
app.use('/api/factures', facturesRoutes);
app.use('/api/lettres-mission', lettresRoutes);
app.use('/api/prospects', prospectsRoutes);
app.use('/api/pappers', pappersRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/opportunites', opportunitesRoutes);
app.use('/api/missions', missionsRoutes);
app.use('/api/intervenants', intervenantsRoutes);
app.use('/api/relances', relancesRoutes);
app.use('/api/parametres', parametresRoutes);
app.use('/api/rentabilite', rentabiliteRoutes);
app.use('/api/charge-travail', chargeTravailRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/paiements', paiementsRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/ged', gedRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/commentaires', commentairesRoutes);
app.use('/api/wiki', wikiRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/intake', intakeRoutes);
app.use('/api/tiime', tiimeRoutes);
app.use('/api/tache-temps', tacheTempsRoutes);
app.use('/api/contrats', contratsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/absences', absencesRoutes);
app.use('/api/rapports', rapportsRoutes);
app.use('/api/dimensionnement', dimensionnementRoutes);
app.use('/api/chiffrage', chifrageRoutes);
app.use('/api/portefeuille', portefeuilleRoutes);
app.use('/api/activite-cabinet', activiteRoutes);
app.use('/api/alertes-facturation', alertesFacturationRoutes);
app.use('/api/powens', powensRoutes);
app.use('/api/micro-clients', microClientsRoutes);
app.use('/api/micro-contacts', microContactsRoutes);
app.use('/api/micro-prestations', microPrestationsRoutes);
app.use('/api/micro-devis', microDevisRoutes);
app.use('/api/micro-factures', microFacturesRoutes);
app.use('/api/micro-relances', microRelancesRoutes);
app.use('/micro-factures-pdf', express.static('/opt/parfi-data/micro-factures'));
app.post('/api/webhooks/powens', powensWebhook);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Parfi CRM API v2.3' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Parfi CRM API démarré sur le port ${PORT}`);
  startScheduler();
});
