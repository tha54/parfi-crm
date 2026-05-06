# Mission d'audit du repo Parfi

## Contexte

Plusieurs chantiers ont été cadrés via des specs markdown (déposées dans le repo, probablement dans `docs/chantiers/` ou équivalent). D'autres modifications ont été demandées directement en session, sans passer par une spec écrite. Il est temps de refaire un état des lieux factuel pour cadrer proprement la suite.

**Ce qu'on attend de toi : un rapport d'audit, pas du code.** Aucune migration, aucune modification de fichier dans le cadre de cette mission. Uniquement de la lecture et de la synthèse.

## Livrable attendu

Un fichier `docs/audit/audit-YYYY-MM-DD.md` (à dater du jour) structuré comme ci-dessous. Sois factuel, précis, et **n'invente rien** : si tu ne sais pas, écris « non identifié » ou « à vérifier ».

---

## Plan du rapport

### 1. Inventaire des specs trouvées dans le repo

Liste tous les fichiers de spec que tu trouves (probablement dans `docs/chantiers/`, `docs/`, ou à la racine). Pour chacun :

- Chemin complet
- Titre du chantier
- Date du fichier (modification ou création, selon ce que tu peux récupérer)
- Statut perçu : « cadré uniquement », « partiellement implémenté », « implémenté », « obsolète » — avec ta justification en une ligne

### 2. État du modèle de données

#### 2.1 Tables effectivement présentes en base

> Si tu as accès à un dump SQL, à un fichier de migrations, ou à un schéma type Prisma/Sequelize/etc., utilise-le. Sinon, liste les tables référencées dans le code backend (requêtes SQL, ORM).

Pour chaque table, indique :
- Nom de la table
- Rôle métier (en une ligne)
- Date de création approximative (par numéro de migration ou contexte)

#### 2.2 Comparaison avec les specs

Liste les tables / champs **prévus dans les specs** (chantiers cadrés) et indique pour chacun :
- ✅ présent en base
- ⚠️ présent mais structure différente de la spec
- ❌ absent
- ➕ présent en base mais absent des specs (ajout en cours de route)

Tables à vérifier en priorité (issues des specs des chantiers cadrés) :

- `mission_rubriques` (Chantier 1 — Templates conditionnels)
- `mission_templates` (Chantier 1)
- `template_rubriques` (Chantier 1)
- `rubrique_conditions` (Chantier 1)
- `volumetrie_champs` (Chantier 1 bis — Profils sectoriels)
- `profils_sectoriels` (Chantier 1 bis)
- `profils_sectoriels_volumetries` (Chantier 1 bis)
- Champ `type_ldm` (recurrente / ponctuelle) sur la table LDM (Chantier 2 — Portefeuille)
- Champ `chapitre` (comptable_fiscal / social / juridique) sur les rubriques (Chantier 2)
- Champ `mode_suivi` (temps / forfait) sur les rubriques (Chantier 1)
- Vue ou table d'agrégat pour le portefeuille (Chantier 2)

### 3. État du backend

#### 3.1 Endpoints implémentés liés aux chantiers

Pour chaque chantier cadré, liste les routes Express trouvées et leur état :

**Chantier 1 — Templates conditionnels**
- CRUD rubriques : routes trouvées ?
- CRUD templates : routes trouvées ?
- Évaluation des conditions d'activation pour un client donné : route trouvée ?
- Wizard de dimensionnement refondu : routes appelées par le frontend ?

**Chantier 1 bis — Profils sectoriels**
- CRUD profils sectoriels : routes trouvées ?
- Application d'un profil à un dossier (pré-remplissage volumétrie) : route trouvée ?

**Chantier 2 — Portefeuille**
- Endpoint « mon portefeuille » : route trouvée ?
- Endpoint « portefeuille d'un autre collaborateur » : route trouvée ?
- Endpoint « portefeuille cabinet » : route trouvée ?
- Endpoint « fiche client — récap budgets » : route trouvée ?
- Contrôle de droits (collaborateur / chef / EC) : où est-il implémenté ?

#### 3.2 Endpoints ajoutés hors spec

Liste les endpoints récents (par date de fichier ou commit récent si tu as accès à git) qui ne correspondent à aucun chantier cadré. Pour chacun, déduis du code ce qu'il fait.

### 4. État du frontend

#### 4.1 Écrans / composants liés aux chantiers

**Chantier 1**
- Wizard de dimensionnement refondu : présent ? structuré en combien d'étapes ? étapes nommées ?
- Sections « Missions au temps passé » / « Missions au forfait » dans devis et LDM : présentes ?
- Écran Paramètres avec gestion bibliothèque rubriques + templates + conditions : présent ?

**Chantier 1 bis**
- Sélecteur de profil sectoriel dans le wizard : présent ?
- Écran Paramètres pour CRUD des profils sectoriels : présent ?

**Chantier 2 — Portefeuille**
- Onglet « Portefeuille » dans la barre latérale : présent ?
- Écran liste des clients du portefeuille avec colonnes spécifiées : présent ?
- Sélecteur de portefeuille (mon portefeuille / collaborateur X / cabinet) : présent ?
- Bandeau de consolidation (sticky bottom) : présent ?
- Fiche client enrichie avec blocs « Lettres de mission » / « Budget de temps » / « Budget d'honoraires » : présents ?

#### 4.2 Écrans ajoutés hors spec

Liste les écrans / composants récents qui ne correspondent à aucun chantier cadré.

### 5. Écarts identifiés

Synthèse en trois colonnes :

| Élément | Spec | Réalité |
|---|---|---|

Liste tous les écarts notables entre ce qui était prévu et ce qui est en place : choix techniques différents, fonctionnalités partielles, simplifications, additions non prévues.

Si tu vois un écart **dont la raison est documentée** (commentaire dans le code, message de commit explicite, fichier de notes), cite la source.

### 6. Dette technique visible

Liste ce qui te saute aux yeux à la lecture du code :

- TODO, FIXME, code commenté massif
- Fonctions ou fichiers très longs (> 500 lignes) qui pourraient bénéficier d'un découpage
- Duplication apparente
- Tests : présents ? quelle couverture approximative ?
- Migrations qui ont été modifiées rétroactivement (mauvaise pratique)
- Dépendances obsolètes (regarde le `package.json` et compare avec les dernières versions stables sur les libs critiques uniquement)

Sois factuel : « tel fichier fait 1200 lignes » plutôt que « gros fichier ». Pas de jugement, juste des constats.

### 7. Zones d'incertitude

Liste les points où tu n'as pas pu trancher faute d'éléments suffisants. Ce sont les questions à me poser ensuite.

---

## Méthode d'investigation suggérée

1. Liste les fichiers de spec dans `docs/` et lis-les attentivement avant de regarder le code, pour avoir l'intention en tête.
2. Examine le schéma de base (migrations ou dump).
3. Parcours les routes Express (probablement dans `routes/`, `api/`, `server/` selon convention).
4. Parcours les pages / composants principaux du frontend (probablement dans `src/pages/`, `src/views/`, `src/components/`).
5. Si git est accessible, regarde les commits des 30 derniers jours pour repérer ce qui a bougé récemment.
6. Rédige le rapport.

## Règles importantes

- **Aucune modification de fichier** dans le cadre de cette mission. Lecture seule.
- **Pas d'invention** : si tu ne trouves pas, écris-le.
- **Sois bref et précis** : un audit utile tient en quelques pages denses, pas en un roman.
- **Cite les chemins exacts** des fichiers que tu mentionnes.
- **N'essaie pas de corriger** ce que tu trouves de problématique — c'est un audit, pas une remise en état. Les corrections viendront après, sur la base d'un plan validé.
