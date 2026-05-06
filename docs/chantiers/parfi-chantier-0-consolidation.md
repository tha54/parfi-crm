# Parfi CRM — Chantier 0
## Consolidation, désherbage et clarification de l'architecture

> Spec à destination de Claude Code. Le « quoi » et les règles métier sont fixés ; le « comment » (choix d'implémentation détaillés) reste à l'appréciation de Claude Code dans le respect de l'architecture existante (React + Vite, Express.js, MySQL 8.0).
>
> Ce chantier doit être réalisé **avant** la reprise des chantiers 1, 1 bis et 2. Il vise à assainir le repo, lever les doublons, clarifier le vocabulaire métier et mettre en place une couche de tests minimale, sans laquelle la suite des chantiers se fera sur des fondations instables.

---

## 1. Contexte

L'audit du 5 mai 2026 a mis en lumière plusieurs zones de dette :

- **Doublons de tables** issus de migrations partielles : `users` / `utilisateurs`, `tache_temps` / `saisies_temps`, `interactions` / `interactions_log`, `clauses_bibliotheque` / `bibliotheque_clauses`, `contrats` / `lettres_mission`.
- **Modèle de production legacy** (`missions`, `mission_lignes`, `taches_mission`, `mission_revisions`) coexistant avec le modèle actif (`taches`, `tache_temps`).
- **Duplication du moteur de dimensionnement** entre backend (`backend/src/utils/dimensionnement.js`) et frontend (`DimensionnementWizard.jsx`, fonction `calculerLignes`). Toute évolution du moteur doit aujourd'hui se faire en deux endroits, avec un risque de divergence silencieuse.
- **Wizard de dimensionnement** (`DimensionnementWizard.jsx`, 1030 lignes) qui fait double emploi avec le module backend et masque le fait qu'on n'a pas de chemin léger pour les missions au forfait.
- **Vocabulaire métier flottant** : `dimensionnement` est un nom inadapté quand on traite des devis 100 % forfait, et la coexistence `contrats` / `lettres_mission` brouille la lecture.
- **Scripts Python orphelins** dans `backend/src/python/` dont l'usage n'est pas identifié.
- **Brief LDM en stack tRPC + Prisma + TypeScript** (`docs/ldm/BRIEF-LDM.md`) qui ne correspond pas à la stack réelle du projet.
- **Couverture de tests : 0 %.**

L'objectif du chantier est de remettre tout cela à plat **sans introduire de nouvelle fonctionnalité métier**. La nouveauté métier viendra dans les chantiers 1, 1 bis et 2 (refondu si nécessaire).

---

## 2. Vocabulaire cible

### 2.1 Le module « Chiffrage »

Le module qui permet de configurer une mission (rubriques, volumétrie, calcul honoraires et budgets temps) s'appelle désormais **Chiffrage**. C'est le nom utilisé dans :

- l'interface utilisateur (libellés de menu, titres d'écrans, breadcrumbs)
- le code (composants React, routes Express, libellés de colonnes en base si pertinent)
- la documentation

Le mot « dimensionnement » subsiste **uniquement** comme terme technique interne au moteur de calcul (au sens : dimensionner les heures par profil pour une mission au temps). Il n'apparaît plus dans l'UI.

### 2.2 Architecture conceptuelle de Chiffrage

Le module **Chiffrage** est l'outil de configuration des missions. Il alimente deux livrables :

```
Chiffrage  →  Devis (livrable 1, communication client)
            \
             →  LDM (livrable 2, contrat signé)
```

Un même chiffrage produit successivement un devis (envoyé au prospect) puis une LDM (signée par le client) sans saisie supplémentaire — la LDM reprend les données du devis avec les clauses légales.

### 2.3 Deux modes de saisie dans Chiffrage

Le module Chiffrage propose **deux modes de saisie**, qui peuvent coexister dans un même chiffrage :

| Mode | Pour quoi ? | Saisie | Calcul |
|---|---|---|---|
| **Temps** | Mission comptable & fiscale | Caractéristiques client + rubriques + volumétrie | Moteur de calcul (heures × profils × taux → honoraires + budgets temps) |
| **Forfait** | Mission sociale, juridique, ou cas ponctuel | Rubrique + montant forfaitaire saisi | Aucun (le montant saisi est l'honoraire ; pas de budget temps) |

Un chiffrage standard pour un client TPE typique mélangera les deux modes : mission C&F en mode temps + paie en mode forfait + secrétariat juridique en mode forfait. Cette mixité est la norme, pas l'exception.

### 2.4 Vocabulaire des objets

| Terme à utiliser | Terme à bannir |
|---|---|
| LDM (Lettre De Mission) | Contrat |
| Tâche | Mission (au sens de l'objet legacy) |
| Saisie de temps | Saisie d'heures |
| Chiffrage | Dimensionnement (dans l'UI) |

Le mot « mission » conserve son sens métier (« la mission comptable et fiscale du dossier Dupont »), mais ne désigne plus une **table** ni une **entité** dans le code applicatif actif.

---

## 3. Périmètre du chantier

### 3.1 Ce qui est dans le scope

1. Suppression des tables et écrans legacy listés au §4.
2. Refonte du module Chiffrage : suppression du wizard, mise en place d'un module unique avec deux modes de saisie, levée de la duplication du moteur de calcul.
3. Renommage / harmonisation du vocabulaire dans l'UI et le code.
4. Investigation et statut des scripts Python.
5. Statut du brief LDM tRPC/Prisma.
6. Mise en place d'une couche de tests minimale sur les chemins critiques.
7. Documentation : création d'un `docs/architecture.md` qui recense les modules actifs et les conventions.

### 3.2 Ce qui n'est pas dans le scope

- Aucune nouvelle fonctionnalité métier (les chantiers 1, 1 bis, 2 viendront après).
- Aucun renommage de table en base si ce n'est pas strictement nécessaire (on supprime ce qui doit l'être, on ne renomme pas l'existant qui fonctionne).
- Aucune migration de stack technique (on reste sur Express + MySQL + JS).

---

## 4. Désherbage des tables et entités legacy

### 4.1 Tables à supprimer (sous réserve d'audit)

Pour chaque table ci-dessous, **avant suppression** :

1. Recenser tous les fichiers du repo (backend + frontend + scripts) qui référencent la table.
2. Si des références actives existent, les rerouter vers la table cible avant suppression.
3. Si la table contient des données, vérifier qu'elles sont déjà présentes dans la table cible. Sinon, écrire une migration de données.
4. Produire dans le rapport de fin de chantier la liste des actions effectuées par table.

| Table à supprimer | Table cible | Justification |
|---|---|---|
| `users` | `utilisateurs` | Modèle legacy ; `utilisateurs` est le modèle actif avec `role_metier` |
| `interactions` | `interactions_log` | Confirmé legacy par le `CLAUDE.md` du repo |
| `clauses_bibliotheque` | `bibliotheque_clauses` | Modèle legacy ; `bibliotheque_clauses` est structurée pour les LDM |
| `saisies_temps` | `tache_temps` | Modèle legacy lié à `missions` ; `tache_temps` est lié à `taches` (modèle actif) |
| `missions` | `taches` (selon usage) | Entité legacy de production ; le modèle actif passe par `taches` issues des LDM |
| `mission_lignes` | `lignes_devis` (selon usage) | Legacy associé à `missions` |
| `taches_mission` | `taches` | Legacy associé à `missions` |
| `mission_revisions` | (à étudier) | Possiblement déjà sans usage actif |
| `modele_missions` | (à étudier) | Référencé par la page « Modèles de mission » de `Parametres.jsx` — vérifier si encore utilisé |
| `contrats` | `lettres_mission` | Doublon ; `lettres_mission` est le modèle actif et porte le vocabulaire métier (LDM) |
| `mission_lignes` | `lignes_devis` | Idem |

Pour les tables marquées « à étudier », produire une note d'analyse et soumettre la décision à l'utilisateur **avant** suppression.

### 4.2 Pages frontend à supprimer ou refondre

| Page | Action | Justification |
|---|---|---|
| `Contrats.jsx` | Supprimer | La gestion des LDM se fait via les pages dédiées aux lettres de mission |
| `Missions.jsx` | Supprimer | Modèle legacy ; les tâches s'affichent via les pages collaborateur (`MaJournee.jsx`, `MonPortefeuille.jsx`) |
| `DimensionnementWizard.jsx` | Supprimer (cf. §5) | Remplacé par le nouveau module Chiffrage |

### 4.3 Routes backend à supprimer

Pour chaque table supprimée au §4.1, supprimer également les routes Express qui l'exposent (probablement dans `backend/src/routes/missions.js`, `contrats.js`, etc.).

### 4.4 Tables non documentées : statut à clarifier

| Table | Action |
|---|---|
| `devis_comprehension_templates` | Investiguer son usage. Si orpheline → supprimer. Si utilisée → documenter dans `docs/architecture.md`. |
| `taches_dimensionnement_config` | Investiguer. Si elle préfigure ce que les chantiers 1 / 1 bis veulent porter (`mission_rubriques`), produire une note de cohérence. Ne pas supprimer sans concertation. |
| `pricing_simulations` | Investiguer son usage et décider du sort. |
| `attributions` | Documenter (semble être le lien client ↔ collaborateur avec rôle, important pour les chantiers 2 et au-delà). Conserver. |

---

## 5. Refonte du module Chiffrage

### 5.1 Suppression du wizard

`DimensionnementWizard.jsx` (1030 lignes) est supprimé. Sa fonction `calculerLignes()`, qui duplique le moteur backend, disparaît avec lui.

### 5.2 Module unique côté backend

Le fichier `backend/src/utils/dimensionnement.js` reste l'**unique source de vérité** du moteur de calcul. Il est étendu (sans nouvelle logique métier dans ce chantier — celle-ci viendra avec le Chantier 1) pour exposer une fonction de calcul utilisable par les modes temps **et** forfait.

Une route Express dédiée au calcul est exposée :

- `POST /api/chiffrage/calculer` — accepte un payload de chiffrage (rubriques + volumétrie + paramètres) et retourne les lignes calculées (honoraires, budgets temps par profil et par tâche pour le mode temps, montants forfaitaires pour le mode forfait).

### 5.3 Module unique côté frontend

Le frontend appelle systématiquement `POST /api/chiffrage/calculer` pour obtenir les lignes — il n'y a plus de calcul métier en JavaScript dans le navigateur. Pour préserver l'UX (calcul réactif pendant la saisie), l'appel est **debounced** (300 à 500 ms après la dernière modification de saisie) et un indicateur visuel discret signale qu'un recalcul est en cours.

> **Note** : le partage de code entre back et front (option B initialement envisagée) n'est pas retenu. La latence d'un appel API local est acceptable pour ce cas d'usage et l'architecture reste plus simple.

### 5.4 Nouvel écran Chiffrage

Un seul écran principal, accessible depuis le menu (renommer la rubrique « Dimensionnement » en « Chiffrage »).

L'écran propose :

- Étape d'identification du client / prospect (existante)
- Saisie des rubriques avec un sélecteur de mode (temps ou forfait) par rubrique
- Pour les rubriques en mode temps : saisie de la volumétrie (comme aujourd'hui)
- Pour les rubriques en mode forfait : saisie directe d'un montant
- Récapitulatif des lignes calculées avec totaux par mode (temps / forfait) et total général
- Actions de fin : générer le devis, ou directement la LDM

> **Note** : la logique des templates conditionnels (Chantier 1) et l'évolution du wizard à 4 étapes ne sont **pas** dans le scope de ce chantier. On livre une version refondue mais minimale, à 1 ou 2 écrans, qui supprime la duplication et introduit le mode forfait. Le Chantier 1 enrichira cet écran avec la sélection de templates et la conditionnalité.

### 5.5 Liaison avec Devis et LDM

La table `dimensionnement` est conservée pour le moment (renommage éventuel à voir avec le Chantier 1) et alimente la table `devis` via `lignes_devis`. La table `lignes_devis` reçoit le champ `mode_suivi` (`temps` / `forfait`) prévu initialement par le Chantier 1 — c'est une avance utile sur ce chantier mais nécessaire pour matérialiser la distinction temps / forfait dès maintenant.

---

## 6. Scripts Python

### 6.1 Investigation

Pour chacun des fichiers de `backend/src/python/` :
- `aggregate_prestations.py`
- `generate_devis_module.py`
- `generate_ldm_module.py`
- `run_pipeline.py`

Identifier :
- Qui les appelle (cron, route Express via sous-process, exécution manuelle, rien) ?
- Quelles tables ils lisent / écrivent ?
- Sont-ils référencés dans `package.json`, dans un cron système, dans le `scheduler.js`, ou ailleurs ?

### 6.2 Décision

- **Si actifs et utilisés** : produire une note d'usage dans `docs/architecture.md` (qui les déclenche, à quelle fréquence, ce qu'ils font), ne rien toucher.
- **Si orphelins** : déplacer dans `docs/archive/python-legacy/` plutôt que supprimer brutalement (au cas où une utilité réapparaîtrait), et documenter la décision.
- **Si à moitié branchés** : produire une note circonstanciée et soumettre la décision à l'utilisateur.

---

## 7. Brief LDM tRPC/Prisma

### 7.1 Statut

Le fichier `docs/ldm/BRIEF-LDM.md` cible une stack tRPC + Prisma + TypeScript qui ne correspond pas à la stack réelle (Express + MySQL + JS).

### 7.2 Action

- Le brief est **archivé** (déplacement vers `docs/archive/ldm/BRIEF-LDM-tRPC-prisma.md`) avec un en-tête ajouté qui précise sa nature de document conceptuel obsolète sur le plan technique.
- Les concepts métier qu'il contient (workflow de signature, snapshots de clauses, recueil_besoin_json, tableau_repartition_json) sont synthétisés dans une note `docs/ldm/concepts-metier.md` qui devient la référence métier pour la suite.
- Les fichiers de référence techniques (`docs/ldm/reference/*`) qui supposent Prisma/tRPC sont également archivés.

---

## 8. Tests minimaux

### 8.1 Périmètre

Mise en place d'une couche de tests minimaux sur les chemins critiques. L'objectif n'est pas une couverture de 80 %, c'est de **sécuriser ce qui ne doit jamais casser silencieusement**.

### 8.2 Outillage

- Choisir un framework léger pour le backend Express (suggestion : `vitest` pour cohérence avec Vite côté frontend, ou `jest` si plus familier).
- Configurer une base de test isolée (MySQL en mémoire si possible, sinon une base dédiée avec données de seed).

### 8.3 Tests à écrire

| Périmètre | Test attendu |
|---|---|
| Moteur de chiffrage — mode temps | Pour un payload donné (rubriques + volumétrie connues), le résultat des lignes calculées (honoraires + budgets temps) est conforme aux valeurs attendues |
| Moteur de chiffrage — mode forfait | Le mode forfait produit des lignes sans budget temps et avec le montant saisi |
| Moteur de chiffrage — mixte | Un chiffrage qui mélange temps et forfait produit les bons totaux séparés et le bon total général |
| Génération de tâches à partir d'une LDM signée | Une LDM signée génère bien le bon nombre de tâches, avec les bons budgets temps, les bonnes affectations |
| Calcul du portefeuille collaborateur | Pour un collaborateur affecté à N tâches connues, le calcul de portefeuille retourne les bons clients et les bons budgets agrégés |
| Endpoints d'authentification | Les routes protégées renvoient 401 sans token, 200 avec token valide |

> **Hors scope** : tests UI / end-to-end. À séquencer ultérieurement si le besoin se confirme.

---

## 9. Documentation

### 9.1 Création de `docs/architecture.md`

Document à créer, qui recense :

- La stack technique (versions des libs principales)
- L'arborescence générale du projet (high-level)
- La liste des modules actifs avec leur rôle (Pipeline, Chiffrage, Devis, LDM, Tâches, Portefeuille, Saisie temps, Facturation, Banque, etc.)
- La liste des tables actives avec leur rôle métier en une ligne (le résultat du §4 de l'audit, mis à jour après désherbage)
- Les conventions de nommage utilisées (ex. tables en français au pluriel, routes en kebab-case, etc.)
- Les points d'extension prévus (templates conditionnels, profils sectoriels, etc., pour préparer les chantiers 1 et 1 bis)

### 9.2 Mise à jour du `CLAUDE.md`

Le `CLAUDE.md` à la racine du repo est mis à jour pour refléter :

- Le vocabulaire cible (Chiffrage, LDM, Tâches…)
- L'existence et le chemin de `docs/architecture.md`
- L'existence et le chemin de `docs/chantiers/` pour les specs des chantiers
- Les conventions de tests

---

## 10. Critères d'acceptation

Le chantier est livré quand :

1. Toutes les tables listées au §4.1 sont supprimées (ou un statut documenté pour celles en « à étudier »).
2. Les pages `Contrats.jsx`, `Missions.jsx` et `DimensionnementWizard.jsx` sont supprimées.
3. Le moteur de chiffrage existe à un seul endroit (backend) et est appelé par une unique route `POST /api/chiffrage/calculer`.
4. Un nouvel écran « Chiffrage » remplace le wizard, propose les modes temps et forfait, et fonctionne sur les cas standards.
5. Le champ `mode_suivi` (`temps` / `forfait`) est ajouté à `lignes_devis`.
6. Les scripts Python ont un statut documenté (utilisés, archivés, ou décision soumise à l'utilisateur).
7. Le brief LDM tRPC/Prisma est archivé et ses concepts métier extraits dans une note dédiée.
8. La couche de tests minimaux est en place et au moins les 6 tests listés au §8.3 passent.
9. `docs/architecture.md` est créé et `CLAUDE.md` est mis à jour.
10. Aucune régression sur les fonctionnalités existantes utilisées en production interne (à confirmer par tests manuels sur les parcours suivants : créer un devis, signer une LDM, saisir un temps, générer une facture, voir son portefeuille).

---

## 11. Méthodologie de livraison suggérée

> Indicatif. Claude Code organise comme il le souhaite, mais ce séquencement minimise les risques.

1. **Phase 1 — Audit de précision (rapport, pas de code)** :
   - Pour chaque table à supprimer, recenser les références actives.
   - Investiguer les scripts Python.
   - Investiguer les tables non documentées (§4.4).
   - Produire un rapport `docs/audit/audit-pre-chantier-0.md` à valider par l'utilisateur **avant toute suppression**.

2. **Phase 2 — Mise en place des tests minimaux** : on écrit les tests sur l'existant **avant** de toucher au code de production. Ainsi toute régression introduite par le désherbage sera détectée immédiatement.

3. **Phase 3 — Refonte du module Chiffrage** : suppression du wizard, mise en place du nouvel écran, route `/api/chiffrage/calculer`, ajout du champ `mode_suivi`.

4. **Phase 4 — Désherbage** : suppression progressive des tables et pages legacy, en validant après chaque suppression que les tests passent toujours.

5. **Phase 5 — Documentation** : création de `docs/architecture.md`, mise à jour du `CLAUDE.md`, archivage du brief LDM.

6. **Phase 6 — Recette manuelle** : passage des parcours critiques listés au §10 critère 10.

---

## 12. Points ouverts à valider avec l'utilisateur en cours de chantier

Ces points ne bloquent pas le démarrage mais devront être tranchés au fil du chantier :

- Sort des tables `modele_missions`, `mission_revisions`, `pricing_simulations`, `devis_comprehension_templates` après audit d'usage.
- Sort des scripts Python après investigation.
- Confirmation de la suppression des données legacy (les enregistrements présents dans `users`, `missions`, `contrats`, etc.) ou sauvegarde préalable dans un dump SQL d'archive.
