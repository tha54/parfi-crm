# CLAUDE.md — Parfi CRM

## Contexte
CRM cabinet Parfi France (Longwy). Stack : React + Vite (nginx /dist), Express.js API port 3001 (pm2 `parfi-crm-api`), MySQL `parfi` (user=parfi / Parfi2026!).

## Commandes clés
- Redémarrer API : `pm2 restart parfi-crm-api`
- Build frontend : `cd /opt/parfi-crm/frontend && npm run build`
- Reload nginx : `nginx -s reload`

## Notes DB
- `factures` : colonnes `totalHT`, `totalTTC`, `dateEmission` (pas `montantHT`/`dateFacture`)
- `interactions_log` = vraie table interactions (pas `interactions` qui est legacy)
- `tache_dependances` a les deux colonnes `depend_de_tache_id` ET `depend_de`
- `taches` : colonnes ajoutées = `budget_minutes`, `dimensionnement_ligne_id`, `periodicite`
- `ADD COLUMN IF NOT EXISTS` non supporté MySQL 8.0.45 → utiliser information_schema check

## Historique des sessions

### Session 1 — Améliorations v2.2 → v2.3
- Correction bug prospect (création pipeline auto + redirect)
- Correction doublons liste clients
- Navigation restructurée (Travaux, Portefeuille, Absences, Rapports)
- Pipeline 6 colonnes avec modal conversion drag → Client
- Recherche globale Ctrl+K (`GlobalSearch.jsx`)
- Webhook Vapi (`/api/calls/webhook`) avec analyse Claude AI
- Module Absences complet (congés + jours fériés Gauss)
- Rapports : hebdo / mensuel / portefeuille
- Coefficients complexité clients
- `type_travail` sur tâches
- Notification icons extended

### Session 2 — Module Dimensionnement (BRIEF "SESSION CE SOIR")
**Fait :**
- Tables MySQL créées : `dimensionnement`, `dimensionnement_lignes`
- Colonnes ajoutées à `taches` : `budget_minutes`, `dimensionnement_ligne_id`, `periodicite`
- Route Express `/api/dimensionnement` complète :
  - GET / (liste), GET /:id (détail + lignes), POST / (créer + calculer lignes auto)
  - PUT /:id (modifier), PUT /:id/send-devis, PUT /:id/accept-devis
  - PUT /:id/sign-ldm → injecte tâches dans `taches` avec `budget_minutes`, `origine='ldm'`
  - DELETE /:id, POST /recalcul (calcul sans persistance)
- `DimensionnementWizard.jsx` — wizard 3 étapes :
  - Étape 1 : sélection type entité (EI/Société/Association) + recherche SIREN via recherche-entreprises.api.gouv.fr + liaison client CRM
  - Étape 2 : params (régime fiscal/TVA, nb établissements) + sliders volumétrie (5 champs)
  - Étape 3 : tableau des missions calculées par section (5 sections), toggle actif/inactif par ligne, slider remise 0-30%, totaux HT/TTC/mensuel, boutons save/send-devis/sign-LDM
- `Dimensionnement.jsx` modifié : tab toggle "Nouveau wizard" (défaut) / "Ancien outil"
- Sidebar : "Dimensionnement" → "Devis & LDM"
- Calcul temps-based conforme BRIEF : 5 sections × taux horaires (EC=84, Collab=42, Social=28, Juridique=60, Aide=28)

**Reste à faire (sessions suivantes) :**
- Génération PDF devis depuis le wizard (actuellement seul l'ancien outil génère PDF)
- `LDMViewer` — affichage lettre de mission OEC-conforme
- `DimensionnementList` — historique des devis/LDM par client
- Lien depuis ClientCockpit → wizard avec client pré-sélectionné
- Facturation (plan de facturation depuis devis)
- GED, Hub comm, Assistant IA Vapi
