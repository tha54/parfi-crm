# Parfi CRM — Chantier 1
## Templates conditionnels de dimensionnement

> Spec à destination de Claude Code. Le « quoi » et les règles métier sont fixés ; le « comment » (choix d'implémentation détaillés) reste à l'appréciation de Claude Code dans le respect de l'architecture existante (React + Vite, Express.js, MySQL 8.0).

---

## 1. Contexte

Ce chantier est la fondation d'une refonte plus large de la chaîne **Dimensionnement → Devis → LDM → Tâches → Portefeuille collaborateur**. Sans templates conditionnels, les devis et LDM restent génériques (mêmes 8 rubriques pour tous les clients), ce qui dégrade la qualité commerciale et la pertinence des tâches générées en aval.

L'objectif de ce chantier est de transformer le moteur de dimensionnement actuel (8 rubriques fixes × 5 intervenants) en un système **piloté par le profil du client** :
- une bibliothèque centrale de rubriques métier ;
- des templates (presets) réutilisables par profil type ;
- une logique d'activation conditionnelle basée sur les caractéristiques du client ;
- une distinction claire entre missions **au temps passé** et missions **au forfait**.

### Hors scope de ce chantier

- Versioning des devis (Chantier 2)
- Génération + planification automatique des tâches (Chantier 3)
- Vue calendrier collaborateur avec drag & drop (Chantier 4)
- Tableau de bord EC/Chefs (Chantier 5)
- Reconduction tacite automatisée des LDM (à séquencer ultérieurement)
- Saisie des congés par le collaborateur (à séquencer avec le Chantier 4)

---

## 2. Règles métier clés (à respecter sans exception)

### 2.1 Distinction temps vs forfait

| Domaine | Mode de suivi | Affichage devis / LDM |
|---|---|---|
| Comptable / fiscal | Au temps passé | Détail heures × taux + honoraires |
| Social | **Forfait** | Honoraires forfaitaires, pas de détail horaire |
| Juridique | **Forfait** | Honoraires forfaitaires, pas de détail horaire |

- Les rubriques au forfait n'ont **pas** de budget temps suivi pour la rentabilité.
- Les rubriques au forfait ne consomment **pas** la capacité du collaborateur au sens rentabilité.
- Les rubriques au forfait ne génèrent **pas** d'alerte de dépassement budget temps.
- Le devis et la LDM doivent afficher ces missions dans une section distincte clairement libellée « Missions au forfait ».

### 2.2 Profils intervenants et taux horaires (existants, à conserver)

| Profil | Taux horaire |
|---|---|
| Expert-comptable (EC) | 84 € |
| Collaborateur (Collab) | 42 € |
| Aide | 28 € |
| Social | 28 € (suivi forfait) |
| Juridique | 60 € (suivi forfait) |

Les taux restent paramétrables dans Paramètres cabinet.

### 2.3 Caractéristiques discriminantes du client

Le moteur conditionnel doit pouvoir s'appuyer sur les attributs suivants du client/prospect. Une **étape préalable d'audit** est nécessaire pour vérifier que tous ces champs existent en base et sont correctement saisis (cf. §3.1).

- Forme juridique (SCI, EI, EURL, SARL, SAS, SA, association, autre)
- Régime fiscal (IS, IR, micro-BIC, micro-BNC, micro-BA)
- Régime TVA (réel normal, réel simplifié, franchise en base, hors champ)
- Périodicité TVA (mensuelle, trimestrielle, annuelle, sans objet)
- Date de clôture d'exercice
- Présence de salariés (oui / non) et nombre approximatif
- Activité principale (BIC, BNC, BA, immobilier, holding, autre)
- Multi-établissements (oui / non)
- Convention collective (champ libre ou référentiel)

---

## 3. Modèle de données

### 3.1 Audit préalable des fiches client / prospect

**Avant toute implémentation**, produire un rapport listant :
- les champs déjà présents en base parmi les caractéristiques du §2.3 ;
- les champs manquants ;
- les champs présents mais mal renseignés (taux de remplissage faible) ;
- les migrations nécessaires pour combler les manques.

Ce rapport conditionne la suite. La logique conditionnelle ne fonctionnera que si les données en entrée sont disponibles et fiables.

### 3.2 Tables à créer ou faire évoluer

> Les noms de tables et de colonnes ci-dessous sont **indicatifs**. Claude Code adapte aux conventions existantes du projet (snake_case MySQL, etc.).

#### `mission_rubriques` — bibliothèque centrale

Une rubrique = une unité de prestation dimensionnable (ex. « Tenue comptable », « Liasse fiscale IS », « TVA mensuelle », « Établissement bulletins de paie », « AG ordinaire SCI »).

Champs minimums :
- `id`, `code` (unique, ex. `LIASSE_IS`)
- `libellé`
- `domaine` (`comptable_fiscal`, `social`, `juridique`)
- `mode_suivi` (`temps`, `forfait`) — déduit du domaine mais explicite pour souplesse
- `unité_volumétrie` (ex. nombre d'écritures, nombre de salariés, nombre de baux, sans objet…)
- `profils_concernés` (liste de profils : EC, Collab, Aide, Social, Juridique)
- `actif` (booléen, soft delete)
- horodatage

#### `mission_templates` — presets

Un template = un jeu pré-configuré de rubriques pour un profil type de client (ex. « SCI à l'IR », « EI au réel avec salariés », « SARL avec TVA mensuelle »).

Champs minimums :
- `id`, `nom`, `description`
- `actif`
- horodatage

#### `template_rubriques` — table d'association

Lie un template à ses rubriques par défaut, avec valeurs de pré-remplissage éventuelles (ex. volumétrie typique, profil affecté par défaut).

#### `rubrique_conditions` — règles d'activation

Définit dans quelles conditions une rubrique est **proposée par défaut** lors d'un dimensionnement, en fonction des caractéristiques client. Une rubrique peut avoir plusieurs conditions ; toutes les conditions doivent être satisfaites (ET logique).

Champs minimums :
- `id`, `rubrique_id`
- `attribut_client` (ex. `regime_tva`)
- `opérateur` (`égal`, `différent`, `dans`, `non_dans`)
- `valeur` (string ou JSON pour listes)

Exemples de règles :
- Rubrique `TVA_MENSUELLE` : `regime_tva ∈ {réel_normal, réel_simplifié}` ET `periodicite_tva = mensuelle`
- Rubrique `BULLETINS_PAIE` : `presence_salaries = oui`
- Rubrique `LIASSE_IS` : `regime_fiscal = IS`
- Rubrique `LIASSE_IR_BIC` : `regime_fiscal = IR` ET `activite ∈ {BIC, …}`

> Les conditions sont un **filtre par défaut**, pas un verrou. L'utilisateur (EC, chef de mission, chef de groupe) doit pouvoir ajouter/retirer manuellement n'importe quelle rubrique au moment du dimensionnement.

### 3.3 Évolution des structures Devis et LDM existantes

- Ajouter sur les lignes de devis / LDM la distinction `mode_suivi` (`temps` / `forfait`) afin que les sections d'affichage soient générées correctement.
- Conserver la rétro-compatibilité avec les devis et LDM existants (migration : tous les enregistrements actuels passent en `mode_suivi = temps` par défaut, ajustables manuellement si besoin).

---

## 4. Refonte du wizard de dimensionnement

Le wizard actuel est en 3 étapes (SIREN + volumétrie + 8 rubriques). On passe à 4 étapes pour intégrer la sélection de template et les caractéristiques discriminantes.

### Étape 1 — Identification client

- Recherche SIREN via API gouv (existant).
- Pré-remplissage des champs disponibles depuis l'API.
- Saisie / validation des **caractéristiques discriminantes** (§2.3) si non encore renseignées sur la fiche.
- Si le prospect a déjà une fiche complète, cette étape se réduit à une validation rapide.

### Étape 2 — Choix du template

- Affichage des templates compatibles (filtrés selon les caractéristiques client) en priorité, puis les autres.
- Option « Partir d'une page blanche » (aucun preset).
- Une fois le template choisi, ses rubriques sont chargées en étape 3.

### Étape 3 — Sélection et ajustement des rubriques

- Les rubriques du template sont **pré-cochées**.
- Les rubriques additionnelles dont les conditions d'activation sont satisfaites sont **suggérées** (cochables en un clic).
- Les autres rubriques de la bibliothèque restent accessibles via une recherche / liste dépliable.
- Pour chaque rubrique sélectionnée :
  - saisie de la volumétrie (selon `unité_volumétrie`)
  - affectation du / des profils concernés
  - éventuellement : surcharge du taux par défaut

### Étape 4 — Calcul et validation

- Calcul automatique des honoraires :
  - rubriques **au temps** : volumétrie → heures par profil → honoraires
  - rubriques **au forfait** : honoraires saisis directement (montant proposé par défaut, ajustable)
- Affichage en deux blocs distincts :
  - **Missions au temps passé** : tableau heures × profil × taux
  - **Missions au forfait** : liste rubrique → honoraires
- Total général.
- Validation → génération du devis.

### Permissions

Conformément aux règles existantes :
- Création de devis et de LDM : **EC, chef de mission, chef de groupe uniquement**.
- Le wizard est inaccessible aux autres rôles.

---

## 5. Impacts sur Devis et LDM

### 5.1 Affichage du devis

Le devis (HTML et exports) doit présenter deux sections distinctes et clairement libellées :

```
MISSIONS AU TEMPS PASSÉ
  - Tenue comptable           [détail heures × taux]
  - Liasse fiscale IS         [détail heures × taux]
  - …
                              Sous-total : X €

MISSIONS AU FORFAIT
  - Tenue sociale (paie)              Y € / an
  - Secrétariat juridique annuel      Z € / an
                              Sous-total : Y + Z €

TOTAL ANNUEL : X + Y + Z €
```

### 5.2 LDM

Même logique d'affichage que le devis. À la signature de la LDM :
- Génération des tâches pour **toutes** les rubriques (temps et forfait).
- Les tâches issues de rubriques au forfait n'ont pas de budget temps suivi mais conservent un statut (à faire / en cours / fait) pour le pilotage de l'avancement.
- Les mandats automatiques (prélèvement / impôts / URSSAF) restent générés selon la logique existante.

> **Note** : la planification dans le calendrier des tâches forfaitisées (durée indicative pour la charge) sera traitée au Chantier 3/4. Pour l'instant, on génère les tâches sans positionnement temporel automatique pour les rubriques au forfait.

---

## 6. Paramètres cabinet — nouvelles sections

Ajouter dans **Paramètres** (accessible EC uniquement) :

### 6.1 Bibliothèque de rubriques

CRUD complet sur `mission_rubriques`. Possibilité de désactiver (soft delete) plutôt que supprimer pour préserver l'historique.

### 6.2 Templates de mission

CRUD complet sur `mission_templates` et leur composition (`template_rubriques`).

### 6.3 Règles d'activation

Édition des `rubrique_conditions`. Interface simple : pour chaque rubrique, liste des conditions, ajout / suppression.

### 6.4 Taux horaires (déjà existant)

À conserver, éventuellement réorganiser pour cohérence visuelle avec les nouvelles sections.

---

## 7. Critères d'acceptation

Le chantier est considéré livré quand les cas suivants passent :

### Cas 1 — SCI à l'IR sans salariés
- Caractéristiques : forme juridique = SCI, régime fiscal = IR, TVA = hors champ, salariés = non, activité = immobilier
- Template attendu disponible : « SCI à l'IR »
- Rubriques pré-cochées : tenue, déclaration foncier, AG annuelle (forfait juridique)
- Rubriques **non** proposées : TVA, paie, liasse IS

### Cas 2 — EI au réel avec salariés
- Caractéristiques : forme = EI, régime = IR, activité = BIC, TVA = réel simplifié trimestrielle, salariés = oui (3)
- Rubriques pré-cochées : tenue, TVA trimestrielle, liasse IR-BIC, paie (forfait social), DSN (forfait social)

### Cas 3 — SARL franchise TVA, sans salarié
- Caractéristiques : SARL, IS, TVA = franchise, salariés = non
- Rubrique TVA **non** proposée
- Rubrique liasse IS proposée
- Aucune rubrique sociale proposée

### Cas 4 — Migration des LDM existantes
- Toutes les LDM en cours conservent leur fonctionnement.
- Les anciennes lignes sont marquées `mode_suivi = temps` par défaut.
- Aucune régression sur la facturation, le suivi temps, les mandats.

### Cas 5 — Affichage devis et LDM
- Un devis mixte (temps + forfait) affiche les deux sections distinctes.
- Le total est correct.
- L'export HTML est lisible et professionnel.

### Cas 6 — Permissions
- Un collaborateur (rôle non habilité) ne peut pas accéder au wizard de dimensionnement.
- Un EC peut accéder à toutes les sections de Paramètres.

---

## 8. Méthodologie de livraison suggérée

> Indicatif. Claude Code organise comme il le souhaite, mais ce séquencement minimise les risques.

1. **Audit des fiches client / prospect** (rapport, pas de code).
2. **Migrations base de données** : nouvelles tables + évolution des structures devis/LDM.
3. **Seed initial** : création d'une dizaine de rubriques de référence et de 3-4 templates types pour pouvoir tester immédiatement.
4. **Backend** : endpoints CRUD rubriques, templates, conditions ; endpoint d'évaluation des conditions pour un client donné.
5. **Refonte du wizard** : étape par étape.
6. **Affichage devis / LDM** avec sections temps / forfait.
7. **Sections Paramètres**.
8. **Tests des cas d'acceptation §7**.

---

## 9. Points ouverts à clarifier en cours de chantier

À traiter au fil de l'eau, n'empêchent pas de démarrer :

- Faut-il un système de **catégories de rubriques** (regroupement visuel dans le wizard et le devis : « Comptabilité », « Fiscal », « Social », « Juridique ») ?
- Pour les rubriques au forfait, les honoraires doivent-ils avoir un **mode de calcul** (forfait fixe, ou forfait paramétrique : ex. paie = X € + Y € par bulletin) ? À voir avec l'usage réel.
- Gestion des **rubriques optionnelles non récurrentes** dans une LDM annuelle (ex. CFE) : tâche unique vs tâche récurrente. À traiter pleinement au Chantier 3.
