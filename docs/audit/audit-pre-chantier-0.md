# Audit pré-Chantier 0 — Parfi CRM
## Phase 1 : audit de précision

> Produit conformément au §11 phase 1 de `docs/chantiers/parfi-chantier-0-consolidation.md`.
> **Lecture seule — aucun fichier modifié.**
> Date : 2026-05-05

---

## 1. Tables candidates à la suppression (§4.1)

Pour chaque table : volume de données, références actives recensées, complexité de déprise.

---

### 1.1 `users` → cible : `utilisateurs`

**Données** : 0 ligne.

**Références SQL actives** : aucune. Les occurrences du mot `users` dans `powens.js` et `tiime.js` désignent des variables JS ou des segments d'URL d'API externe (Powens `/users/me/accounts`) — pas la table MySQL.

**Verdict** : ✅ Orpheline. Suppression sans pré-requis.

---

### 1.2 `interactions` → cible : `interactions_log`

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Ligne | Nature |
|---|---|---|
| `backend/src/routes/contacts.js` | 69 | `SELECT * FROM interactions WHERE contactId = ?` |
| `backend/src/routes/contacts.js` | 187 | `INSERT INTO interactions (contactId, type, titre, ...)` |
| `backend/src/routes/rapports.js` | 177 | `LEFT JOIN interactions i ON i.client_id=c.id` |

`search.js` utilise `interactions_log` — pas de confusion.

**Différence de schéma** : `interactions` utilise `contactId` (lien vers `contacts`) ; `interactions_log` utilise `client_id` (lien vers `clients`). Les 3 références actives dans `contacts.js` doivent être reroutées vers `interactions_log` avec adaptation du champ de liaison avant suppression.

**Verdict** : ⚠️ 0 donnée mais 3 références actives à rerouter dans `contacts.js` (×2) et `rapports.js` (×1).

---

### 1.3 `clauses_bibliotheque` → cible : `bibliotheque_clauses`

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Lignes | Nature |
|---|---|---|
| `backend/src/routes/parametres.js` | 81, 151–186 | CRUD complet exposé via `GET/POST/PUT/DELETE /api/parametres/clauses` |

**Frontend** : `Parametres.jsx` dispose d'une section « Bibliothèque de clauses » qui consomme ces routes. Elle est visible et fonctionnelle pour les experts.

**Différence de schéma** :

| Colonne | `clauses_bibliotheque` | `bibliotheque_clauses` |
|---|---|---|
| Identifiant de type | `type` ENUM (resiliation, rgpd…) | `categorie` ENUM (tronc_commun, mission_tenue…) |
| Champs supplémentaires | `typesMission`, `estDefaut`, `actif` | `version` |

Les deux tables ne sont pas iso-schéma. Les routes dans `parametres.js` doivent être redirigées vers `bibliotheque_clauses` avec adaptation des colonnes avant suppression.

**Verdict** : ⚠️ 0 donnée mais CRUD actif côté backend et frontend. Adaptation nécessaire dans `parametres.js` et vérification de `Parametres.jsx`.

---

### 1.4 `saisies_temps` → cible : `tache_temps`

**Données** : 1 ligne (date 2026-04-29, `missionId = 2`, test de saisie).

**Références SQL actives** :

| Fichier | Lignes | Nature |
|---|---|---|
| `backend/src/routes/missions.js` | 65, 106, 167, 182, 188 | Lecture, insertion, suppression, agrégation liées à `missionId` |

`saisies_temps` est couplée à `missions` via `missionId`. `tache_temps` est couplée à `taches` via `tache_id`. Les schémas sont incompatibles — il n'y a pas de migration de données possible (les entités parentes sont différentes). La seule donnée existante (1 ligne, mission de test) peut être perdue sans impact métier.

**Verdict** : ⚠️ 1 ligne (données de test), entièrement dépendante de `missions.js`. La suppression ne peut avoir lieu qu'après suppression ou refactoring de `missions.js`.

---

### 1.5 `missions` → cible : `taches`

**Données** : 5 lignes — toutes issues de signatures de LDM (colonnes `nom` au format `tenue_comptable — LM LM-2026-xxx`).

**Références SQL actives — backend** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/missions.js` | CRUD complet (195 lignes) |
| `backend/src/routes/lettres.js` | `INSERT INTO missions` lors de la **signature d'une LDM** (ligne 591) — impact direct sur le workflow actif |
| `backend/src/routes/intervenants.js` | `LEFT JOIN missions` pour lister les missions actives par intervenant |
| `backend/src/routes/briefing.js` | `COUNT(*) AS missions_actives FROM missions` |
| `backend/src/routes/dashboard.js` | `COUNT(*) AS missionsEnCours FROM missions WHERE statut = 'en_cours'` |
| `backend/src/routes/planning.js` | `LEFT JOIN missions m ON t.mission_id = m.id` |
| `backend/src/routes/portal.js` | 2 requêtes `FROM missions WHERE client_id = ?` — portail client |
| `backend/src/routes/contacts.js` | `FROM missions WHERE contactId = ?` |

**Références frontend** :

| Fichier | Nature |
|---|---|
| `frontend/src/pages/Missions.jsx` | Page dédiée CRUD + saisies de temps |
| `frontend/src/pages/MonEspace.jsx` | Section « Mes missions actives » (`/missions?statut=en_cours`) |
| `frontend/src/pages/ClientCockpit.jsx` | `api.get('/missions?client_id=X')` au chargement de la fiche client |

**Point critique** : `lettres.js` insère encore dans `missions` lors de la signature d'une LDM. Ce couplage doit être rompu avant toute suppression.

**Verdict** : 🔴 Dépendances actives dans 8 fichiers backend et 3 fichiers frontend. Suppression à haute complexité — nécessite de retirer l'INSERT dans `lettres.js`, de rerouter `briefing.js`, `dashboard.js`, `planning.js`, `portal.js` vers `taches`, et de refondre `MonEspace.jsx` et la section missions de `ClientCockpit.jsx`.

---

### 1.6 `mission_lignes` → cible : `lignes_devis`

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/contrats.js` | CRUD complet (SELECT, INSERT, UPDATE, DELETE) + agrégation via `contrat_id` |

`mission_lignes` est couplée à `contrats` via `contrat_id`. Elle n'est pas structurellement équivalente à `lignes_devis` (qui est couplée à `devis`). La suppression est conditionnée à celle de `contrats.js`.

**Verdict** : ✅ 0 donnée. Suppression possible dès que `contrats.js` est retiré.

---

### 1.7 `taches_mission` → cible : `taches`

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/missions.js` | CRUD complet (SELECT, INSERT, UPDATE, DELETE) |

Entièrement contenu dans `missions.js`.

**Verdict** : ✅ 0 donnée. Suppression possible dès que `missions.js` est retiré.

---

### 1.8 `mission_revisions` — à étudier

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/contrats.js` | Lecture, insertion, mise à jour (lignes 144, 178, 367–411) |

Entièrement contenu dans `contrats.js`. Représente des révisions annuelles d'honoraires sur un contrat. Fonctionnalité sans équivalent dans `lettres_mission` (qui dispose de `date_resiliation` et `motif_resiliation` mais pas d'un historique de révisions structuré).

**Note à valider** : avant suppression, confirmer que la gestion des révisions d'honoraires sera portée par la LDM ou par un autre mécanisme.

**Verdict** : ✅ 0 donnée. Suppression possible dès que `contrats.js` est retiré. Soumettre la question des révisions d'honoraires à l'utilisateur.

---

### 1.9 `modele_missions` — à étudier

**Données** : 0 ligne.

**Références SQL actives** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/parametres.js` | CRUD complet lignes 73, 191–226 — `GET/POST/PUT/DELETE /api/parametres/modeles-missions` |

**Frontend** : `Parametres.jsx` dispose d'une section « Modèles de mission » (distincte de la bibliothèque de rubriques du Chantier 1). Elle est rendue et fonctionnelle pour les experts.

**Question à valider** : le Chantier 1 prévoira `mission_templates` pour les templates de dimensionnement. `modele_missions` semble préfigurer ce besoin de façon moins structurée. Faut-il le supprimer maintenant ou le conserver jusqu'au Chantier 1 pour ne pas casser la section Paramètres ?

**Verdict** : ⚠️ 0 donnée mais UI active dans Paramètres. Décision à soumettre à l'utilisateur avant suppression.

---

### 1.10 `contrats` → cible : `lettres_mission`

**Données** : 0 ligne.

**Références SQL actives — backend** :

| Fichier | Nature |
|---|---|
| `backend/src/routes/contrats.js` | CRUD complet (423 lignes) : création, mise à jour, signature, activation, lignes, mandats, révisions |

**Références frontend** :

| Fichier | Nature |
|---|---|
| `frontend/src/pages/ClientCockpit.jsx` | `TabContrats` (≈380 lignes, ligne 1551+) : affichage, création, signature mandats, révisions, activation — 9 appels à `/api/contrats/*` |
| `frontend/src/App.jsx` | ligne 115 : `<Navigate to="/lettres-mission?tab=contrats" replace />` — la route `/contrats` est déjà redirigée |
| `frontend/src/App.jsx` | ligne 43 : import de `Contrats.jsx` (inutile si la route est redirigée) |
| `frontend/src/pages/Contrats.jsx` | Page standalone importée mais jamais rendue (route redirigée) |

**Point important** : `TabContrats` dans `ClientCockpit.jsx` est le seul endroit où les `contrats` sont créés et gérés. Cette fonctionnalité (suivi du cycle commercial prospect → LDM signée → mission active, avec mandats et révisions d'honoraires) n'a pas d'équivalent direct dans le workflow `lettres_mission` actuel — qui couvre la LDM mais pas les mandats commerciaux ni les révisions annuelles via le cockpit client.

**Verdict** : 🔴 0 donnée mais `TabContrats` dans `ClientCockpit.jsx` est une fonctionnalité active utilisée en production. Suppression à haute complexité. Décision à prendre avec l'utilisateur : migrer `TabContrats` vers le workflow `lettres_mission`, ou maintenir temporairement.

---

## 2. Pages frontend à supprimer (§4.2)

### 2.1 `Contrats.jsx`

Route `/contrats` déjà redirigée vers `/lettres-mission?tab=contrats` dans `App.jsx` (ligne 115). La page est importée mais jamais rendue. Peut être supprimée dès que l'import est retiré de `App.jsx`. **Pas de risque de régression directe** — la page n'est pas accessible.

### 2.2 `Missions.jsx`

Accessible via `App.jsx` ligne 89 : route `/missions` active. La page a un CRUD complet et est référencée depuis `MonEspace.jsx`. **Suppression conditionnée au retrait de la route et refactoring de `MonEspace.jsx`**.

### 2.3 `DimensionnementWizard.jsx`

Toujours importé et rendu par `Dimensionnement.jsx` (lignes 4 et 408). `Dimensionnement.jsx` est la page active accessible depuis le module Chiffrage. **Ce fichier ne peut pas être supprimé avant la création du nouvel écran Chiffrage** (§5 de la spec).

---

## 3. Scripts Python (§6.1)

### 3.1 Qui les appelle ?

**`run_pipeline.py` + `aggregate_prestations.py` + `generate_devis_module.py`** :

Appelés via `spawn('python3', [SCRIPT])` depuis `backend/src/utils/devisGenerator.js`, lui-même importé par `backend/src/routes/devis.js` (ligne 8) pour les routes `POST /api/devis/:id/generer-pdf` et `GET /api/devis/:id/pdf`.

**`generate_ldm_module.py`** :

Appelé directement via `spawn` depuis `backend/src/routes/lettres.js` en deux endroits (lignes 731 et 1494) — pour la génération du PDF LDM via `POST /api/lettres-mission/:id/generer-pdf` et `GET /api/lettres-mission/:id/pdf`.

### 3.2 Ce qu'ils font

| Script | Rôle |
|---|---|
| `run_pipeline.py` | Point d'entrée : lit le payload JSON sur stdin, appelle `aggregate_prestations` si nécessaire, appelle `generate_devis_module`, écrit le PDF sur stdout |
| `aggregate_prestations.py` | Regroupe les lignes détaillées d'un devis en 5 catégories commerciales (Comptabilité, Fiscalité, Social, Juridique, Conseil) par matching de mots-clés |
| `generate_devis_module.py` | Génère un PDF 4 pages au format Parfi (couverture navy, présentation cabinet, missions + honoraires, 4e de couverture) via ReportLab |
| `generate_ldm_module.py` | Génère le PDF LDM conforme OEC NP 3-100 : couverture, conditions particulières, tableau des tâches, honoraires, conditions générales (10 articles), signatures |

### 3.3 Verdict

**Ces scripts sont actifs et indispensables.** Ils constituent le moteur de génération PDF pour les devis et les LDM. Ils ne sont pas orphelins.

**Décision** : Conserver. Documenter dans `docs/architecture.md` (déclenchement via `spawn` depuis Express, dépendance à `python3` et `reportlab` sur le serveur).

---

## 4. Tables non documentées (§4.4)

### 4.1 `devis_comprehension_templates` (5 lignes)

**Références** :
- `backend/src/routes/devis.js` lignes 819 et 1212 : `SELECT texte FROM devis_comprehension_templates WHERE segment = ?`
- Segments présents : `tpe`, `pme`, `profession_liberale`, `sci`, `transfrontalier`

**Rôle** : Textes de compréhension du besoin insérés dans les devis PDF selon le profil du client (segment). Utilisé lors de la génération PDF du devis.

**Verdict** : Table active, utile, à conserver. À documenter dans `docs/architecture.md`.

### 4.2 `taches_dimensionnement_config` (40 lignes)

**Références** :
- `backend/src/routes/dimensionnement.js` ligne 154 : lecture des `taux_specifique` pour surcharger les taux horaires par défaut du moteur
- `backend/src/routes/parametres.js` lignes 11–32, 236, 255 : initialisation (`CREATE TABLE IF NOT EXISTS`), CRUD exposé aux experts via `GET/PUT /api/parametres/taches-config`

**Contenu** : 40 lignes = configuration des 8 rubriques du moteur de calcul avec possibilité de surcharger le taux horaire par rubrique.

**Cohérence avec le Chantier 1** : Cette table préfigure partiellement ce que `mission_rubriques` du Chantier 1 devra porter (liste des rubriques + profils intervenants + taux). Elle n'a pas la structure complète prévue (pas de `mode_suivi`, pas de `rubrique_conditions`, pas de `profils_concernés`) mais elle couvre déjà la surcharge de taux. À conserver sans modification dans ce chantier ; à intégrer dans la réflexion du Chantier 1.

**Verdict** : Table active, à conserver. À documenter. Note de cohérence : elle préfigure `mission_rubriques` du Chantier 1.

### 4.3 `pricing_simulations` (0 ligne)

**Références** : aucune dans le code backend ou frontend.

**Verdict** : ✅ Complètement orpheline. Suppression sans pré-requis.

### 4.4 `attributions` (625 lignes)

**Références** : table centrale pour `portefeuille.js`, `clients.js` et le chiffrage des dossiers par collaborateur. 272 attributions `responsable`, 351 `assistant`, 2 `chef_mission`.

**Verdict** : Table active et importante. À conserver et documenter dans `docs/architecture.md`.

---

## 5. Synthèse et ordre de traitement recommandé

### 5.1 Suppressions sans pré-requis (données nulles, aucune référence active)

| Table | Lignes | Action |
|---|---|---|
| `users` | 0 | Supprimer directement |
| `pricing_simulations` | 0 | Supprimer directement |

### 5.2 Suppressions après retrait de `contrats.js` (et `missions.js`)

| Table | Lignes | Condition |
|---|---|---|
| `mission_lignes` | 0 | Après suppression de `contrats.js` |
| `taches_mission` | 0 | Après suppression de `missions.js` |
| `mission_revisions` | 0 | Après suppression de `contrats.js` + décision sur les révisions d'honoraires |
| `saisies_temps` | 1 (test) | Après suppression de `missions.js` |

### 5.3 Suppressions après refactoring (références actives à rerouter)

| Table | Lignes | Travaux requis avant suppression |
|---|---|---|
| `interactions` | 0 | Rerouter `contacts.js` (×2) et `rapports.js` (×1) vers `interactions_log` |
| `clauses_bibliotheque` | 0 | Rerouter `parametres.js` (CRUD) vers `bibliotheque_clauses` avec adaptation du schéma de colonnes |
| `missions` | 5 | Retirer l'INSERT dans `lettres.js` (ligne 591) ; rerouter `briefing.js`, `dashboard.js`, `planning.js`, `portal.js`, `contacts.js`, `intervenants.js` ; refondre `MonEspace.jsx` et la section missions de `ClientCockpit.jsx` |
| `contrats` | 0 | Décision sur `TabContrats` dans `ClientCockpit.jsx` : migrer vers `lettres_mission` ou maintenir temporairement |

### 5.4 Tables à conserver (en attente d'une décision ou d'un chantier ultérieur)

| Table | Lignes | Motif |
|---|---|---|
| `modele_missions` | 0 | UI active dans Paramètres — décision à soumettre (remplacé par Chantier 1 ?) |
| `taches_dimensionnement_config` | 40 | Active, préfigure `mission_rubriques` du Chantier 1 — conserver |
| `devis_comprehension_templates` | 5 | Active, utilisée pour les PDF devis — conserver |
| `attributions` | 625 | Centrale au portefeuille — conserver |

### 5.5 Pages frontend

| Page | Lignes | Condition de suppression |
|---|---|---|
| `Contrats.jsx` | — | Retirer l'import dans `App.jsx` — la route est déjà redirigée, la page n'est jamais rendue |
| `Missions.jsx` | — | Après refactoring de `MonEspace.jsx` et retrait de la route dans `App.jsx` |
| `DimensionnementWizard.jsx` | 1030 | Uniquement après livraison du nouvel écran Chiffrage |

---

## 6. Décisions validées (2026-05-05)

1. **`contrats` / `TabContrats` dans `ClientCockpit.jsx`** : conservé tel quel pour ce chantier. Désactivation visuelle avant suppression de la table `contrats`. Refonte reportée au Chantier 1.

2. **`modele_missions`** : maintenu jusqu'au Chantier 1. Aucune suppression dans ce chantier.

3. **`mission_revisions`** : suppression. Concept de révision annuelle documenté dans `docs/ldm/concepts-metier.md` pour porter le besoin dans un futur chantier.

4. **Données `missions` (5 lignes)** : perte fonctionnelle acceptable. Dump SQL d'archive obligatoire dans `docs/archive/dumps/legacy-missions-2026-05-05.sql` avant toute suppression.

5. **Scripts Python** : conservés (moteur PDF actif). `backend/src/python/requirements.txt` créé ; dépendance documentée dans `docs/architecture.md`.

---

## 7. Investigation Python complémentaire (Phase 1)

**Résultats** :
- Aucun Dockerfile, aucun README, aucun `requirements.txt` dans le repo — dépendance non documentée.
- `python3 3.10.12` et `reportlab 4.5.0` installés sur le serveur.
- Aucun appel Python dans `scheduler.js` ni dans `automations.js`.
- Aucun cron système référençant les scripts.
- Appels `spawn('python3', ...)` dans 2 fichiers uniquement :
  - `backend/src/utils/devisGenerator.js` → `run_pipeline.py` (PDF devis)
  - `backend/src/routes/lettres.js` lignes 731 et 1494 → `generate_ldm_module.py` (PDF LDM)
- Aucune autre référence dans le code (npm scripts, cron, scheduler).

**Décision** : conservation documentée. Créer `requirements.txt` et entrée dans `docs/architecture.md`.

---

## 8. Séquencement Phase 2 validé

| Sous-étape | Contenu | Pré-requis |
|---|---|---|
| A | Suppressions sans pré-requis : `users`, `pricing_simulations`, import `Contrats.jsx` dans `App.jsx` | Aucun |
| B | Reroutages simples : `interactions` → `interactions_log` dans `contacts.js`/`rapports.js` ; `clauses_bibliotheque` → `bibliotheque_clauses` dans `parametres.js` | A terminé |
| C | Refonte module Chiffrage : nouvel écran, route `/api/chiffrage/calculer`, `mode_suivi` sur `lignes_devis`, suppression wizard | Indépendant |
| D | Découplage signature LDM ↔ `missions` : `lettres.js` ligne 591 → `taches`, reroutage des 6 consommateurs, refonte `MonEspace.jsx` + section missions `ClientCockpit.jsx` | **Tests minimaux obligatoires avant** |
| E | Suppressions en cascade : `missions.js`, `Missions.jsx`, `contrats.js`, puis tables avec dumps SQL d'archive | D terminé |
