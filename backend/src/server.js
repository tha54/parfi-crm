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

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'Parfi CRM API' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Parfi CRM API démarré sur le port ${PORT}`));
