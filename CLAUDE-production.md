# CLAUDE.md — Module Production & Supervision

Contexte pour toute session de développement sur ce module.

## Ce que fait ce module

Extension de l'outil de gestion PARFI France (cabinet d'expertise comptable, 7 personnes en production).
Le CRM existant gère le commercial et produit les lettres de mission. Ce module y greffe la production
comptable et fiscale : programmes de travail, contrôles automatiques, registre d'alertes, saisie des temps.

## Équivalences de vocabulaire (spec ↔ code)

La spec parle de `mission`, `periode`, `tache`. Le code utilise des noms adaptés pour éviter les
collisions avec l'existant CRM (et par choix explicite de l'utilisateur) :

| Spec               | Table réelle          | Motif                                                                   |
|--------------------|-----------------------|-------------------------------------------------------------------------|
| `mission`          | `ldm_missions`        | Table préexistante (chantier 2), étendue sur place. Pas de renommage pour éviter un churn de 100+ fichiers. Une source de vérité unique du périmètre contractuel. |
| `periode`          | `production_periode`  | `periode` seul est trop générique.                                      |
| `tache`            | `production_tache`    | `taches` (existant CRM) est le to-do libre et coexiste durablement.     |
| `alerte`, `suspens`, `revue`, `dossier`, `tache_modele` | mêmes noms | pas de conflit.                                            |

Clés primaires : **INT AUTO_INCREMENT** partout (cohérence CRM), et non uuid comme évoqué en spec §0.

## Deux affectations à ne pas confondre

- `lettres_mission.collaborateur_id` / `chef_mission_id` : **référent contractuel et commercial**.
  Change à chaque renouvellement/complément de LM. C'est le signataire, pas le producteur.
- `dossier.collaborateur_id` / `chef_de_mission_id` : **affectation de production**, décision
  d'organisation stable, revue une fois par an. C'est ce qui pilote les vues « Ma semaine »,
  la qualification du hors-mission et les alertes propriétaires.

Une LM peut être renouvelée ou coexister avec une LM complémentaire portant un intervenant
différent ; l'affectation de production, elle, ne change pas pour autant.

## Documents de référence

- `docs-production/spec-production-supervision.md` — spécification fonctionnelle complète (modèle de données,
  machines à états, 43 règles de gestion numérotées RG-01 à RG-43, lots de livraison).
  **Lire les sections concernées avant toute implémentation. Les RG sont normatives.**
  Section 14 (RG-35 à RG-43) : budget de supervision, décomposition par grade, double valorisation.
  Livraison au **lot 3**, mais les champs `utilisateur.grade` et `dossier.niveau_requis` sont
  prévus dès le lot 1 pour éviter une migration ultérieure.
- `docs-production/mockups/` — maquettes HTML de référence visuelle. À consulter **après** le modèle de données,
  pas pendant.
- `docs-production/seed/` — données de référence à charger en base (voir plus bas).

## Séquencement imposé

Livrer **un lot à la fois**, dans cet ordre. Ne pas anticiper sur le lot suivant.

1. **Lot 1 — Socle de production** : `dossier`, `mission`, `periode`, `tache_modele`, `tache`.
   Génération automatique des périodes (RG-03), machine à états période, vues « Ma semaine » et « Échéance ».
2. **Lot 2 — Registre des alertes** : `controle`, `alerte`, `suspens`, moteur de contrôles sur FEC,
   jobs `executer_controles` et `recalculer_crans`.
3. **Lot 3 — Temps et rentabilité** : `temps`, `code_temps`, budgets, qualification du hors-mission.
4. **Lot 4 — Supervision qualité** : `revue`, `evenement_dossier`, snapshot de clôture, journal d'audit.

À l'intérieur du lot 1, trois étapes validées séparément : (a) modèle de données et migrations,
(b) génération des périodes, (c) vues.

## Invariants non négociables

Ces règles produisent des bugs **silencieux** si elles sont mal implémentées. Écrire les tests avant le code.

1. **RG-03 — La génération des périodes est idempotente.** Le job tourne chaque nuit. Contrainte
   d'unicité `(mission_id, exercice, numero)`. Ne jamais réinstancier des tâches déjà renseignées.
   **Plancher de mise en service** `DATE_DEBUT_PRODUCTION` (2026-09-01) : aucune période
   n'est créée dont `date_debut` est antérieure au plancher, quelle que soit
   `mission.date_debut`. Sans lui, l'outil rétro-génère des milliers de périodes vides.
2. **RG-06 — L'ancienneté d'une alerte ne se remet jamais à zéro tant que l'anomalie persiste.**
   Si le moteur redétecte la même anomalie (même `controle_reference` + `dossier_id` + `periode_id`)
   sur une alerte déjà ouverte, mettre à jour `valeur_constatee` **sans toucher à `date_detection`**.
   Créer une nouvelle alerte à chaque exécution transformerait une anomalie d'un an en douze anomalies
   d'un mois, toutes au cran 0. C'est le bug qui viderait le dispositif de son sens.
3. **RG-10 / RG-11 — `anciennete_jours` et `cran` sont dérivés, jamais stockés.** En revanche,
   **journaliser les transitions de cran** : on doit pouvoir prouver qu'à J+61 l'alerte a changé de
   propriétaire et que le nouveau propriétaire a été notifié.
4. **Le compteur d'ancienneté ne se suspend jamais**, y compris à l'état `en_attente_client`.
   C'est une décision de conception assumée, pas un oubli. Ne pas « corriger ».
5. **RG-15 — Un réviseur ne peut pas avoir produit la période qu'il revoit.** Contrainte applicative
   bloquante, pas un avertissement.
6. **RG-31 / RG-32 — Les durées sont des minutes entières, multiples de 15.** Contrainte en base
   (`CHECK duree_minutes % 15 = 0 AND duree_minutes BETWEEN 15 AND 720`), pas seulement dans l'UI.
   Jamais de stockage en heures décimales.
7. **`alerte` et `suspens` sont deux tables distinctes.** L'alerte est une anomalie détectée par le
   cabinet ; le suspens est une question posée au client. La tentation de fusionner sera forte
   (les deux « ressemblent à des tâches »). Les fusionner rend impossible de savoir si le goulot est
   chez nous ou chez le client.
8. **`gravite` est dénormalisée sur `alerte`.** Copiée du contrôle à la détection. Le recalibrage
   ultérieur d'un contrôle ne doit pas réécrire l'historique.

## Données de référence à charger

| Fichier | Table | Lignes | Lot |
|---|---|---|---|
| `docs-production/seed/tache_modele.csv` | `tache_modele` | 26 | 1 |
| `docs-production/seed/controle.csv` | `controle` | 69 | 2 |
| `docs-production/seed/code_temps.csv` | `code_temps` | 54 | 3 |
| `docs-production/seed/taux_grade.csv` | `taux_grade` (référentiel) | 5 | 3 (grade prévu au lot 1) |
| `docs-production/seed/frequence_revue.csv` | `frequence_revue` (référentiel) | 3 | 3 |
| `docs-production/seed/bareme_supervision.csv` | `bareme_supervision` | 18 | 3 |

Ces données évoluent sans changement de code : prévoir un mécanisme de rechargement (commande de
management ou migration de données), pas un `INSERT` en dur dans une migration de schéma.

Deux codes de temps portent le libellé `A COMPLETER` (F05, S02) : à renseigner avant chargement.

## Conventions

- Tables et champs en `snake_case`, vocabulaire métier français.
- Dates stockées en UTC, affichées en Europe/Paris.
- Aucune suppression physique : champ `archive_le` nullable, exclu par défaut des requêtes.
- Tout objet porte `cree_le`, `cree_par`, `modifie_le`, `modifie_par`.
- Horodatage serveur uniquement pour `fait_le`, `date_revue`, `date_cloture`. Jamais de date saisie.

## Ce qu'il ne faut pas faire

- Écrire une authentification maison (voir § 12 de la spec : utiliser le module natif du framework).
- Créer une seconde table utilisateur : le module se raccorde à celle du CRM.
- Modéliser la production comme un pipeline d'opportunités : ce sont des occurrences récurrentes.
- Implémenter les vues avant que la génération des périodes ne soit testée.
- Exposer les codes de temps `I01` à `I04` dans les vues d'analyse partagées (`I02` est une donnée
  de santé au sens de l'article 9 du RGPD).

## Comment travailler

Avant toute modification structurante : présenter le diagnostic et deux options, ne pas corriger
directement. Les erreurs coûteuses ici ne sont pas des erreurs de syntaxe mais des erreurs de modèle.
