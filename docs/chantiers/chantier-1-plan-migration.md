# Parfi CRM — Chantier 1 · Plan de migration des fiches client/prospect

> Document à appliquer par Claude Code après validation de l'audit (`chantier-1-audit-fiches-client.md`). Ce plan formalise les décisions métier prises avec l'utilisateur et constitue la référence d'exécution.
>
> **Règle d'or de la migration** : en cas de doute ou d'incohérence dans les données legacy, on laisse les champs en `NULL` et on flague le client comme "à compléter" via une colonne `migration_anomalie`. **On ne devine pas.**

---

## 1. Contexte

L'audit de l'étape 1 a révélé que sur 9 caractéristiques discriminantes nécessaires au moteur de dimensionnement conditionnel :
- 2 sont en bon état (date de clôture, code APE)
- 4 sont partiellement présentes mais sémantiquement incorrectes (forme juridique, régime fiscal, régime TVA, activité)
- 3 sont entièrement absentes (présence salariés, multi-établissements, convention collective)

L'objectif de cette étape est de produire une base de données **propre et exploitable** par la logique conditionnelle des templates. Volumétrie estimée à l'arrivée : ~190 fiches migrées proprement, ~115 fiches en anomalie à traiter manuellement par les EC. C'est un état réaliste qui révèle une dette de qualité de données jusque-là invisible.

---

## 2. Nouveaux ENUM et colonnes

### 2.1 Sur la table `clients`

#### Colonnes à modifier

```sql
-- Régime fiscal (impôt sur le résultat)
regime_fiscal ENUM('IS', 'IR_BIC', 'IR_BNC', 'IR_translucide', 'micro_bic', 'micro_bnc') NULL
-- IR_translucide : SCI à l'IR (régime de translucidité fiscale)
-- BA volontairement absent : pas de dossier BA dans le cabinet

-- Régime TVA (à reconstruire complètement, ne plus stocker la périodicité ici)
regime_tva ENUM('reel_normal', 'reel_simplifie', 'franchise', 'hors_champ') NULL

-- Forme juridique (normaliser depuis VARCHAR libre)
forme_juridique ENUM(
  'SARL', 'SAS', 'SASU', 'EURL', 'EI', 'EIRL',
  'SCI', 'SCEA', 'SA', 'SELARL', 'SCCV', 'SCM',
  'SCP', 'SCA', 'SC', 'GIE', 'Association', 'Autre'
) NULL
```

#### Colonnes à créer

```sql
-- Périodicité TVA (extraite du champ regime_tva legacy qui la contenait à tort)
periodicite_tva ENUM('mensuelle', 'trimestrielle', 'annuelle', 'sans_objet') NULL

-- Présence et nombre de salariés
presence_salaries TINYINT(1) NULL
nb_salaries SMALLINT NULL

-- Multi-établissements
nb_etablissements TINYINT UNSIGNED DEFAULT 1

-- Activité fonctionnelle (pour la logique conditionnelle)
activite_type ENUM('bic', 'bnc', 'immobilier', 'holding', 'autre') NULL
-- Note : ba volontairement absent

-- Convention collective (pertinent uniquement si presence_salaries = 1)
convention_collective VARCHAR(150) NULL

-- Mécanisme d'anomalie de migration
migration_anomalie TEXT NULL
-- Rempli automatiquement par le script de migration quand une fiche ne peut être migrée proprement.
-- Effacé automatiquement quand la fiche est complétée (cf. §6).
```

#### Colonnes à conserver pour traçabilité

```sql
-- Conserver les valeurs legacy en colonnes _legacy pour audit et debug pendant 6 mois
regime_fiscal_legacy VARCHAR(50) NULL  -- ancien contenu de regime_fiscal
regime_tva_legacy VARCHAR(30) NULL     -- ancien contenu de regime_tva
forme_juridique_legacy VARCHAR(100) NULL  -- ancien contenu de forme_juridique
```

#### Colonne `type` ENUM existante

**Décision en attente.** Avant de la modifier ou de la conserver, demander à Claude Code de produire un **rapport d'usage** : où est-elle lue dans le backend, le frontend, les vues SQL, les rapports ? Selon le résultat :
- Peu utilisée → la transformer en `activite_type` après migration des usages.
- Très utilisée → la garder telle quelle, `activite_type` vit en parallèle.
- Décision à prendre **après le rapport**, avant le déploiement final.

### 2.2 Sur la table `prospects`

Reporter **toutes les nouvelles colonnes** ci-dessus sauf `nb_etablissements` (rarement pertinent au stade prospect, à ajouter si besoin).

La modal de **conversion prospect → client** doit transférer toutes ces colonnes.

---

## 3. Règles de migration des données existantes

### 3.1 Mapping `regime_fiscal_legacy` → nouveaux champs

Le champ legacy encode simultanément le régime fiscal et le régime TVA. Le mapping ci-dessous applique la règle d'or : on migre proprement quand la combinaison est non ambiguë, sinon on flague une anomalie.

| Code legacy | Volume | `regime_fiscal` | `regime_tva` | `periodicite_tva` | Anomalie |
|---|---|---|---|---|---|
| `ISRS` | 113 | `IS` | `reel_simplifie` | `annuelle` | — |
| `ISRN` | 51 | `IS` | `reel_normal` | depuis `regime_tva_legacy` (cf. §3.2) | si legacy ne contient ni `mensuel` ni `trimestriel` |
| `BICRS` | 24 | `IR_BIC` | `reel_simplifie` | `annuelle` | — |
| `BICRN` | 1 | `IR_BIC` | `reel_normal` | depuis legacy (cf. §3.2) | si legacy incohérent |
| `BNC` | 24 | `IR_BNC` | cf. §3.3 | cf. §3.3 | cf. §3.3 |
| `SCIC`, `SCIS`, `SCMS` | 47 | `NULL` | `NULL` | `NULL` | "Code legacy '{code}' : SCI sans précision IS/IR — à qualifier" |
| `BARN` | 3 | `NULL` | `NULL` | `NULL` | "Code legacy 'BARN' : pas de BA dans le cabinet — à requalifier" |
| `MICRO` | 2 | `NULL` | `NULL` | `NULL` | "Code legacy 'MICRO' : préciser micro-BIC ou micro-BNC" |
| `NULL` | 41 | `NULL` | `NULL` | `NULL` | "Régime fiscal non renseigné" |

### 3.2 Croisement avec `regime_tva_legacy` (pour les `ISRN` et `BICRN`)

Pour les régimes au réel normal, la périodicité doit être extraite du champ legacy `regime_tva` :

| `regime_tva_legacy` | `periodicite_tva` | Anomalie |
|---|---|---|
| `mensuel` | `mensuelle` | — |
| `trimestriel` | `trimestrielle` | — |
| `Simplifié` | — | "Incohérence : régime fiscal RN mais TVA legacy = Simplifié" |
| `non_soumis` | — | "Incohérence : régime fiscal RN mais TVA legacy = non_soumis" |
| `NULL` ou autre | `NULL` | "Périodicité TVA legacy manquante ou non reconnue" |

### 3.3 Cas spécifique des BNC (24 clients)

Pour les 24 BNC, le `regime_fiscal` est automatiquement `IR_BNC`. Le régime TVA dépend du champ legacy :

| `regime_tva_legacy` | `regime_tva` | `periodicite_tva` | Anomalie |
|---|---|---|---|
| `non_soumis` | `hors_champ` | `sans_objet` | — |
| `mensuel` | `reel_normal` | `mensuelle` | — |
| `trimestriel` | `reel_normal` | `trimestrielle` | — |
| `Simplifié` | `reel_simplifie` | `annuelle` | — |
| `NULL` ou autre | `NULL` | `NULL` | "BNC sans régime TVA legacy renseigné — à compléter" |

### 3.4 Mapping `forme_juridique_legacy` → ENUM normalisé

Pour les 296 fiches avec `forme_juridique_legacy` renseignée, appliquer un `UPPER()` et un `TRIM()`, puis mapper vers l'ENUM. Les valeurs déjà conformes (SCI, SARL, SAS, etc.) passent telles quelles. Les variantes orthographiques sont à recenser pendant la migration.

Pour les 10 fiches avec `forme_juridique_legacy` NULL : `forme_juridique = NULL` + anomalie "Forme juridique non renseignée".

### 3.5 Activité

- Si `code_ape` existe : déduire `activite_type` via une table de mapping APE → catégorie fonctionnelle (cf. §3.6 ci-dessous). Si la déduction est non ambiguë, migrer ; sinon, NULL + anomalie.
- Si `code_ape` est NULL : `activite_type = NULL` + anomalie "Code APE manquant".

### 3.6 Mapping APE → `activite_type`

Le script de migration s'appuie sur une table de correspondance simple (à enrichir au fil de l'eau) :

| Code APE | `activite_type` |
|---|---|
| 6810Z, 6820A, 6820B, 6831Z, 6832A | `immobilier` |
| 6420Z, 7010Z | `holding` |
| 8690E, 8690F, 6920Z (libéral), 7022Z (conseil) | `bnc` (si l'activité dominante est libérale) |
| 4110A, 4521A, 4711B, 5610A, etc. (commerce, artisanat, industrie) | `bic` |
| Autre / non reconnu | `NULL` + anomalie |

> Cette table reste évolutive. Claude Code peut proposer une version étendue après analyse des codes APE réellement présents dans la base.

### 3.7 Champs entièrement nouveaux (présence salariés, multi-établissements, convention)

Ces champs sont **systématiquement NULL** après migration (sauf alimentation depuis `devis.effectif` ou `devis.nb_etablissements` quand la donnée existe).

Aucune anomalie générée pour ces champs : leur absence est attendue. La complétion se fera au fil de l'eau lors de l'utilisation du wizard.

---

## 4. Règles de cohérence à imposer en base

Après migration, le système doit garantir :

```
SI regime_tva = 'reel_normal'      ALORS periodicite_tva ∈ {'mensuelle', 'trimestrielle'}
SI regime_tva = 'reel_simplifie'   ALORS periodicite_tva = 'annuelle'
SI regime_tva = 'franchise'        ALORS periodicite_tva = 'sans_objet'
SI regime_tva = 'hors_champ'       ALORS periodicite_tva = 'sans_objet'
SI presence_salaries = 0           ALORS nb_salaries = 0 ou NULL
                                   ET   convention_collective = NULL
```

À implémenter via :
- contraintes au niveau applicatif (validation côté backend Express),
- éventuellement triggers MySQL si l'équipe le souhaite (optionnel).

---

## 5. Expérience utilisateur (UX)

### 5.1 Bandeau d'alerte sur la fiche client

Sur les fiches avec `migration_anomalie IS NOT NULL` ou avec un des **champs critiques** vides (`forme_juridique`, `regime_fiscal`, `regime_tva`, `periodicite_tva`), afficher un bandeau **persistant et non dismissible** en haut de la fiche.

Contenu du bandeau :
- icône d'alerte
- titre : "Profil incomplet"
- corps :
  - si `migration_anomalie` existe : afficher son contenu en clair
  - liste des champs critiques manquants
- call-to-action : "Compléter la fiche" qui ouvre directement l'onglet Informations.

### 5.2 Page "Clients à compléter"

Nouvelle page accessible aux **EC, chefs de mission, chefs de groupe**.

- Liste des fiches avec `migration_anomalie IS NOT NULL` OU au moins un champ critique vide.
- Colonnes : nom client, anomalie / champs vides, collaborateur référent, date dernière modification.
- Filtres : par type d'anomalie, par référent, par ancienneté.
- Bouton "Compléter" → ouvre la fiche client.

### 5.3 Blocage partiel du wizard de dimensionnement

Le wizard ne peut être lancé sur un client que si les **4 champs critiques** sont renseignés :
- `forme_juridique`
- `regime_fiscal`
- `regime_tva`
- `periodicite_tva`

Si l'un manque : message d'erreur clair avec lien direct vers la fiche client à compléter, et le bouton "Compléter" déclenche l'ouverture de la fiche dans un nouvel onglet.

Les autres caractéristiques (`presence_salaries`, `convention_collective`, `nb_etablissements`, `activite_type`) sont **optionnelles** : leur absence ne bloque pas le wizard mais affecte la pré-sélection des rubriques (mode dégradé, l'EC sélectionne plus de rubriques manuellement).

### 5.4 Effacement automatique de `migration_anomalie`

Quand un EC complète une fiche et que tous les champs critiques associés à l'anomalie sont désormais cohérents, le système efface automatiquement le contenu de `migration_anomalie` (passage à NULL).

Logique : un trigger applicatif sur la mise à jour des champs concernés, qui revalide la cohérence et nettoie l'anomalie si tout est en ordre.

---

## 6. Méthodologie d'exécution

### 6.1 Préparation

1. **Sauvegarde complète** de la base avant toute modification.
2. **Environnement de test/staging** : appliquer le script de migration d'abord ici. Ne **jamais** lancer directement sur la prod.

### 6.2 Ordre des opérations

1. Ajout des nouvelles colonnes (vides) sur `clients` et `prospects`.
2. Renommage des colonnes existantes en `_legacy` (`regime_fiscal` → `regime_fiscal_legacy`, etc.).
3. Création des nouvelles colonnes `regime_fiscal`, `regime_tva`, `forme_juridique` avec les nouveaux ENUM.
4. Exécution du script de migration des données (lecture des `_legacy`, écriture dans les nouveaux champs, alimentation de `migration_anomalie`).
5. Validation : exécution de requêtes de contrôle (cf. §6.3).
6. Déploiement frontend des nouvelles UX (bandeau, page, blocage wizard).
7. **Conservation des colonnes `_legacy` pendant 6 mois** pour audit. À supprimer ensuite.

### 6.3 Contrôles post-migration à exécuter

Avant validation finale, vérifier que :

- Aucun client n'a une combinaison `regime_tva` / `periodicite_tva` incohérente.
- Tous les clients avec `regime_fiscal_legacy IS NOT NULL` ont soit un `regime_fiscal` rempli, soit une `migration_anomalie`.
- Le total des fiches migrées proprement + en anomalie = total des fiches en base. Aucune fuite.
- La modal de conversion prospect → client transfère correctement les nouveaux champs (test manuel sur un prospect).
- Le wizard de dimensionnement bloque correctement sur un client incomplet (test manuel).
- Le bandeau d'alerte s'affiche correctement (test manuel).

### 6.4 Rapport de migration

À l'issue de la migration, Claude Code produit un **rapport de migration** dans `docs/chantiers/chantier-1-rapport-migration.md` listant :
- nombre total de fiches traitées,
- nombre de fiches migrées proprement,
- nombre de fiches en anomalie, ventilées par type d'anomalie,
- liste des codes APE non reconnus rencontrés,
- liste des variantes orthographiques de `forme_juridique_legacy` rencontrées,
- temps d'exécution.

---

## 7. Sous-chantier différé : décision sur la colonne `type` ENUM

Avant la fin du Chantier 1, Claude Code doit produire un **rapport d'usage** de la colonne `type` ENUM existante :

- Recensement de tous les usages dans le backend (Express, requêtes SQL).
- Recensement de tous les usages dans le frontend (composants React, filtres, affichages).
- Recensement dans les vues SQL et rapports éventuels.

Sur la base de ce rapport, décision conjointe (utilisateur + Claude Code) entre :
- transformer `type` en `activite_type` (si peu d'usages),
- conserver `type` en parallèle de `activite_type` (si nombreux usages, déprécation progressive),
- conserver `type` tel quel et utiliser uniquement `activite_type` pour le moteur conditionnel.

---

## 8. Critères d'acceptation de cette étape

Cette étape de migration est validée quand :

1. Toutes les nouvelles colonnes sont créées avec leurs ENUM corrects sur `clients` et `prospects`.
2. Le script de migration s'est exécuté sans erreur sur staging puis prod.
3. Le rapport de migration (§6.4) a été produit et revu.
4. Les contrôles post-migration (§6.3) sont tous verts.
5. Les colonnes `_legacy` sont conservées pour traçabilité.
6. Le bandeau d'alerte fonctionne sur les fiches en anomalie.
7. La page "Clients à compléter" est accessible et listait les fiches attendues.
8. Le wizard de dimensionnement bloque correctement sur un client incomplet.
9. La modal de conversion prospect → client transfère bien les nouveaux champs.
10. Le rapport d'usage de `type` ENUM a été produit.

---

## 9. Hors scope de cette étape

- Création des templates de mission (étape 3 du Chantier 1).
- Création de la bibliothèque de rubriques et des règles d'activation (étape 3-4).
- Refonte du wizard à proprement parler (étape 5).
- Affichage des sections temps/forfait dans le devis (étape 6).
- Sections Paramètres (étape 7).

Ces étapes seront traitées dans des prompts ultérieurs, une fois la base de données propre et fiable.
