# CLAUDE.md — Parfi CRM

## Contexte
CRM cabinet Parfi France (Longwy). Stack : React + Vite (nginx /dist), Express.js API port 3001 (pm2 `parfi-crm-api`), MySQL `parfi` (user=parfi / Parfi2026!).

## Commandes clés
- Redémarrer API : `pm2 restart parfi-crm-api`
- Build frontend : `cd /opt/parfi-crm/frontend && npm run build`
- Reload nginx : `nginx -s reload`

## HTTPS / nginx
- Accès public : `https://163.172.158.24` (certificat auto-signé, valide jusqu'en 2036)
- Certificat : `/etc/nginx/ssl/parfi.crt` + `/etc/nginx/ssl/parfi.key` (SAN = IP 163.172.158.24)
- Config nginx : `/etc/nginx/sites-enabled/parfi`
  - Port 80 → redirect 301 vers HTTPS
  - Port 443 → frontend React (`/opt/parfi-crm/frontend/dist`) + proxy `/api/*` → `127.0.0.1:3001`
- Webhook Vapi : `https://163.172.158.24/api/calls/webhook` (POST, header `x-vapi-secret` requis)

## Notes DB
- `factures` : colonnes `totalHT`, `totalTTC`, `dateEmission` (pas `montantHT`/`dateFacture`)
- `interactions_log` = vraie table interactions (pas `interactions` qui est legacy)
- `tache_dependances` a les deux colonnes `depend_de_tache_id` ET `depend_de`
- `taches` : colonnes ajoutées = `budget_minutes`, `dimensionnement_ligne_id`, `periodicite`
- `ADD COLUMN IF NOT EXISTS` non supporté MySQL 8.0.45 → utiliser information_schema check
- `devis` : colonnes dimensionnement ajoutées = `type_entite`, `regime_fiscal`, `regime_tva`, `nb_etablissements`, `factures_achat`, `factures_vente`, `lignes_banque`, `immobilisations`, `effectif`, `remise_pct`, `total_ht_net`, `cree_par`, `duplique_de`
- `lignes_devis` : table réelle (pas `devis_lignes`), FK = `devisId` (camelCase). Colonnes ajoutées : `rubrique`, `section`, `intervenant`, `periodicite`, `temps_minutes`, `tarif_ht`, `actif`
- `lettres_mission` : colonnes ajoutées = `collaborateur_id`, `montant_annuel_ht`, `date_resiliation`, `duplique_de`
- `dashboard.js` : bug préexistant colonne `dateEcheance` (devrait être `date_echeance`) — ne pas toucher
- Moteur calcul dimensionnement : `/opt/parfi-crm/backend/src/utils/dimensionnement.js` (8 rubriques, 5 intervenants)
- Auth middleware supporte token en query param (`?token=`) pour les routes HTML ouvertes dans le navigateur

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

### Session 3 — Rôles métier + pages Devis/LDM (BRIEF instructions)
**Fait :**
- `utilisateurs.role_metier` ENUM ajouté : expert_comptable / chef_de_groupe / chef_de_mission / collaborateur / collaborateur_social / collaborateur_juridique
  - Thierry(s) → expert_comptable, Valérie → chef_de_groupe, Audrey → chef_de_mission
- `role_metier` inclus dans le JWT et la réponse de login (auth.js)
- `lettres_mission.devis_id` et `lettres_mission.dimensionnement_id` FK ajoutés
- `mandats.ldm_id` FK ajouté
- Route POST `/api/lettres-mission/:id/signer` — signature LDM + injection complète des tâches dimensionnement (ou repartitionTaches JSON) + création 3 mandats (prélèvement, impôts, URSSAF) + notifications
- Route GET/PUT `/api/lettres-mission/:id/mandats` — gestion mandats par LDM
- `DevisWizard.jsx` — wizard 3 étapes : identification (prospect/client autocomplete) + prestations (import dimensionnement existant ou saisie manuelle) + récapitulatif avec actions brouillon/envoyé
- `DevisDetail.jsx` — page détail devis `/devis/:id` avec statut inline, création LDM depuis devis accepté
- `LDMDetail.jsx` — page détail LDM `/lettres-mission/:id` avec sign button, mandats toggle, tâches injectées
- Routes `/devis/new`, `/devis/:id`, `/lettres-mission/:id` ajoutées dans App.jsx
- Devis + LDM listes : clic sur ligne → navigate to detail, bouton "Wizard" dans Devis
- Sidebar : accès Devis + LDM conditionné par `role_metier` (expert_comptable/chef_de_groupe) avec fallback sur l'ancien role

### Session 4 — Module Devis & LDM conforme BRIEF (implémentation complète)
**Fait :**
- Migration DB : 24 colonnes ajoutées sur `devis`, `lignes_devis`, `lettres_mission`
- Moteur calcul `/backend/src/utils/dimensionnement.js` : 8 rubriques × règles BRIEF exactes
- `devis.js` réécrit : GET/, POST/ (create+calc), GET/:id (+lignes_grouped), PUT/:id (recalc), POST/:id/envoyer|accepter|refuser|dupliquer|convertir-ldm, GET/:id/html (HTML expandable rubriques), DELETE/:id
- `lettres.js` : GET/:id joint `utilisateurs` pour collab_prenom/collab_nom, POST/:id/resilier, POST/:id/dupliquer, GET/:id/html
- `auth.js` middleware : accepte `?token=` en query param pour les routes HTML
- `DevisWizard.jsx` réécrit : Step1 (SIREN API gouv + autocomplete client/prospect + créer prospect), Step2 (dimensionnement : type_entite/regime_fiscal/regime_tva/nb_etablissements + 5 volumétries), Step3 (rubriques expandables calculées côté client + remise % + totaux + save)
- `DevisDetail.jsx` réécrit : rubriques expandables, paramètres dimensionnement, actions envoyer/accepter/refuser/dupliquer/convertir-LDM/aperçu HTML
- `LDMDetail.jsx` : affiche rubriques expandables du devis source (chargées via `/devis/:devis_id`), RubriqueRowLDM, `useState` pour rubriques
- `Devis.jsx` liste : boutons 📄 aperçu + 📋 dupliquer par ligne
- Modal affectation collaborateur avant signature LDM (déjà fait session précédente)

**Reste à faire :**
- Lien depuis ClientCockpit → wizard avec client pré-sélectionné
- Facturation depuis devis (plan de facturation mensuel)
- GED, Hub comm
- Bug préexistant dashboard.js (colonne `dateEcheance`)

### Session 5 — Module Appels téléphoniques IA (BRIEF-VAPI)
**Fait :**
- DB : `taches.source` enum étendu à `('manuelle','fiscale','appel')`, `taches.appel_id INT` ajouté, `appels.task_id INT` ajouté
- `VAPI_SECRET=0CcIguXM5ZixPpdLkXbOj2RnXy1KCulI` ajouté dans `.env`
- `calls.js` POST /webhook réécrit : vérification `x-vapi-secret`, analyse Claude haiku (prompt JSON `{resume,urgence,nom_client}`), lookup client par nom_client LIKE, mapping urgence (faible→basse/moyen→normale/eleve→haute), INSERT appels + taches + UPDATE appels.task_id, retourne `{success:true,task_id}`
- `taches.js` GET / : LEFT JOIN appels pour `appel_transcript` dans les résultats
- `Taches.jsx` : badge amber "📞 Appel" (AppelBadge) dans vue liste et vue kanban quand `source='appel'`
- `TaskCommentDrawer.jsx` : section dépliable "Transcription de l'appel" (fond amber) quand `source='appel'` et `appel_transcript` présent

**Notes :**
- `appels` table colonnes réelles : `call_id` (pas `vapi_call_id`), `resume_ia` (pas `resume`), `urgence` enum `('normale','elevee','critique')`, `duration_seconds`
- ANTHROPIC_API_KEY doit être renseignée dans `.env` pour l'analyse IA (actuellement vide → fallback resume générique)

### Session 6 — AUDIT.md fixes (4 priorités)
**Fait :**
1. **Page Appels IA** (`/appels`) : `Appels.jsx` créée — table historique appels (date, interlocuteur, client, collaborateur, durée, urgence, résumé IA, tâche), filtres, panneau détail + transcription au clic, stats résumées. Route ajoutée dans `App.jsx`, lien sidebar "📞 Appels IA" dans section Cabinet.
2. **Bouton "Générer échéancier"** dans `LDMDetail.jsx` : visible sur LDM signée pour expert/chef_mission. Route backend `POST /api/lettres-mission/:id/generer-echeancier` ajoutée dans `lettres.js` — vérifie que la LDM est signée, appelle `genererFacturesDepuisLDM()`, retourne le nb de factures générées.
3. **Formulaire accès portail client** dans `Parametres.jsx` : nouvelle section "Accès portail client" — select client (avec indicateur ✓ si accès existant), email + mot de passe, bouton `POST /api/portal/admin/create-access`. Réservé à l'expert.
4. **Scheduler automations** (`/backend/src/scheduler.js`) : `node-cron` installé (v4.2.1), deux cron jobs :
   - `tache_retard` — quotidien 08h00 : clients avec tâches en retard
   - `facture_impayee_30j` — quotidien 08h05 : clients avec factures impayées 30j+
   - Logs dans `automation_logs` (colonnes réelles : `ruleId`, `evenement`, `entityType`, `entityId`, `statut`, `message`)
   - Démarré dans `server.js` après `app.listen()`

**Notes DB :**
- `automation_logs` colonnes réelles : `ruleId`, `evenement`, `entityType`, `entityId`, `statut` ENUM('success','skipped','error'), `message`, `createdAt` (pas `automation_id`/`declencheur`)

### Session 7 — AUDIT.md fixes (items 5-10)
**Fait :**
5. **Config auto relances** dans `Relances.jsx` : nouvel onglet "⚙️ Config auto" — sélection facture impayée, nb jours, canal, message modèle, toggle actif. Routes backend dans `relances.js` : GET/POST/PUT/DELETE `/api/relances/config-auto`. `ON DUPLICATE KEY UPDATE` pour upsert par factureId.
6. **Pré-sélection client DevisWizard** : `useSearchParams` lit `?client_id=X`, cherche le client dans la liste chargée et pré-remplit l'entité + le titre. Lien depuis ClientCockpit corrigé (`/devis/nouveau?` → `/devis/new?`).
7. **Page Contrats** (`/contrats`) : `Contrats.jsx` créée — stats (total, actifs, signées, CA), filtres texte+statut, tableau LDM avec client, statut, collaborateur, honoraires HT, dates devis/signature, mandats. Lien sidebar "🤝 Contrats" sous Commercial.
8. **CRUD clauses + modèles** dans `Parametres.jsx` : sections "Bibliothèque de clauses" et "Modèles de mission" avec ajout/édition inline/suppression douce. Routes dans `parametres.js` : POST/PUT/DELETE `/api/parametres/clauses` et `/api/parametres/modeles-missions`.
9. **Export SEPA** : route `POST /api/paiements/sepa-export` génère PAIN.008.003.02 XML pour le mois sélectionné (factures envoyée/retard). Bouton "🏦 Export SEPA" dans `Factures.jsx` avec sélecteur de mois.
10. **Bouton "Générer plan de facturation"** dans `DevisDetail.jsx` : visible sur devis accepté pour expert/chef_mission. Route `POST /api/devis/:id/generer-plan-facturation` : si LDM liée → délègue à `genererFacturesDepuisLDM`, sinon génère 12 mensualités depuis `total_ht_net`.

**Notes :**
- `config_relances_auto.factureId` est UNIQUE → upsert via `ON DUPLICATE KEY UPDATE`
- SEPA XML utilise IBAN placeholder client (non stocké en DB) : `FRXX XXXX XXXX XXXX XXXX XXXX XXX`
- `parametres.js` routes clauses/modeles : soft delete avec `actif=0` (pas de DELETE réel)

### Session 8 — Portail micro-entrepreneur : formulaires devis & factures (sprint 7)
**Fait :**
- **`MicroPortalDevisForm.jsx`** (nouveau) — wizard 4 étapes pour créer un devis depuis le portail micro :
  - Étape 1 Contact : sélection depuis `micro_contacts` + bouton "Créer nouveau contact"
  - Étape 2 Prestations : lignes (libellé, description, quantité, unité, prix unitaire, remise %)
  - Étape 3 Conditions : taux TVA, conditions de paiement, notes, dates (émission + validité)
  - Étape 4 Aperçu & Envoi : récap totaux HT/TVA/TTC + boutons "Enregistrer brouillon" / "📧 Envoyer"
  - Route : `/micro-portail/devis/nouveau`
- **`MicroPortalFactureForm.jsx`** (nouveau) — wizard 4 étapes pour créer une facture (Contact / Lignes / Conditions / Aperçu)
  - Route : `/micro-portail/factures/nouvelle`
- **`backend/src/routes/micro_portail.js`** — nouvelles routes :
  - `GET /contacts` + `POST /contacts` — lecture/création contacts du micro-client
  - `GET /prestations` — catalogue prestations du micro-client
  - `GET /devis/next-numero` — numérotation auto (préfixe `micro_clients.prefixe_devis` + année + séquence 4 chiffres)
  - `POST /devis` — création devis + lignes en transaction, calcul montantHT/TVA/TTC
  - `POST /devis/:id/envoyer` — génération PDF + envoi email + statut → envoyé
  - `GET /factures/next-numero` — numérotation auto factures
  - `POST /factures` — création facture + lignes en transaction
  - `POST /factures/:id/envoyer` — génération PDF + envoi email + statut → envoyée
  - Dossiers persistance PDF : `/opt/parfi-data/micro-devis` et `/opt/parfi-data/micro-factures` (créés automatiquement)
- **`MicroPortalDevis.jsx`** modifié : bouton "+ Nouveau devis" → `/micro-portail/devis/nouveau`, badge renommé `StatutBadge`, affichage contact (société ou prénom+nom), actions inline "📧 Envoyer" (brouillon) / "✅ Accepter" / "❌ Refuser" (envoyé)
- **`MicroPortalFactures.jsx`** modifié : bouton "+ Nouvelle facture" + actions envoyer/valider
- **`App.jsx`** — routes `/micro-portail/devis/nouveau` et `/micro-portail/factures/nouvelle` ajoutées
- **`microDevisPdf.js` / `microFacturePdf.js`** — corrections mineures pour compatibilité envoi email

**Notes :**
- `micro_contacts` colonnes : `id`, `micro_client_id`, `nom`, `prenom`, `societe`, `siren`, `email`, `telephone`, `adresse`
- `micro_devis_lignes` colonnes : `id`, `devis_id`, `libelle`, `description`, `quantite`, `unite`, `prix_unitaire`, `remise_pct`, `montant_ht`, `ordre`
- `micro_factures_lignes` : même structure avec `facture_id` à la place de `devis_id`
- Route `GET /devis/next-numero` **doit** être déclarée avant `GET /devis/:id` dans le fichier (sinon Express interprète "next-numero" comme un `:id`)

## Module devis et lettres de mission
Toute évolution du moteur de cotation, des devis ou des lettres de mission
suit docs/spec-moteur-cotation.md. Ne pas improviser de règle métier : si la
spécification ne couvre pas le cas, s'arrêter et le signaler.

