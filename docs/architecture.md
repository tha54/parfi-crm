# Architecture technique — Parfi CRM

## Stack

- **Frontend** : React + Vite, servi par nginx depuis `/opt/parfi-crm/frontend/dist`
- **Backend** : Express.js, port 3001, géré par pm2 (`parfi-crm-api`)
- **Base de données** : MySQL 8.0, base `parfi`, user `parfi`
- **Serveur** : Linux, IP publique `163.172.158.24`

## Génération PDF

### Dévis

Route `POST /api/devis/:id/generer-pdf` et `GET /api/devis/:id/pdf` dans `backend/src/routes/devis.js`.

Implémentation : `backend/src/utils/devisGenerator.js` appelle via `child_process.spawn` :

```
python3 backend/src/python/run_pipeline.py
```

Pipeline Python :
1. `run_pipeline.py` — point d'entrée, lit le payload JSON sur stdin
2. `aggregate_prestations.py` — regroupe les lignes en 5 catégories commerciales
3. `generate_devis_module.py` — génère le PDF 4 pages (ReportLab)

### Lettres de mission

Routes `POST /api/lettres-mission/:id/generer-pdf` et `GET /api/lettres-mission/:id/pdf` dans `backend/src/routes/lettres.js` (lignes 731 et 1494).

Appel direct :
```
python3 backend/src/python/generate_ldm_module.py
```

`generate_ldm_module.py` génère le PDF LDM conforme OEC NP 3-100 (couverture, conditions particulières, tableau des tâches, honoraires, conditions générales 10 articles, signatures).

### Dépendances système requises

- `python3` >= 3.10 — installé sur le serveur (3.10.12)
- `reportlab` >= 4.0 — installé sur le serveur (4.5.0)

Voir `backend/src/python/requirements.txt` pour installer sur un nouveau serveur :
```
pip install -r backend/src/python/requirements.txt
```

## Automations planifiées

`backend/src/scheduler.js` — lancé dans `server.js` après `app.listen()`. Utilise `node-cron` (v4.2.1).

| Job | Planification | Rôle |
|---|---|---|
| `tache_retard` | Quotidien 08h00 | Alerte clients avec tâches en retard |
| `facture_impayee_30j` | Quotidien 08h05 | Alerte clients avec factures impayées 30j+ |

Logs dans la table `automation_logs`.

## Tables non documentées dans les specs (actives)

| Table | Rôle |
|---|---|
| `attributions` | Attribution des dossiers aux collaborateurs (responsable / assistant / chef_mission) — centrale pour le portefeuille |
| `taches_dimensionnement_config` | Configuration des 8 rubriques du moteur de chiffrage (taux horaires surchargeables) — préfigure `mission_rubriques` du Chantier 1 |
| `devis_comprehension_templates` | Textes de compréhension du besoin insérés dans les PDF devis selon le segment client |
