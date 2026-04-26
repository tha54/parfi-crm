require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }));
app.use(express.json());

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
app.use('/api/charge-travail', rentabiliteRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/paiements', paiementsRoutes);
app.use('/api/planning', planningRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Parfi CRM API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Parfi CRM API démarré sur le port ${PORT}`));
