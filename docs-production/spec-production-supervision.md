# Spécification fonctionnelle — Module Production & Supervision

**Projet** : extension de l'outil de gestion PARFI France
**Version** : 1.0
**Date** : août 2026
**Destinataire** : implémentation Claude Code

---

## 0. Conventions

- Noms de tables et de champs en `snake_case`, sans accents, vocabulaire métier français (cohérence avec le domaine, qui est français et normé).
- Toutes les dates sont stockées en UTC, affichées en heure locale Europe/Paris.
- Aucune suppression physique : tous les objets ont un champ `archive_le` (nullable). Les requêtes par défaut excluent les enregistrements archivés.
- Tout objet porte `cree_le`, `cree_par`, `modifie_le`, `modifie_par`.
- **Clés primaires : `INT AUTO_INCREMENT`** (cohérence avec les 74 tables existantes du CRM).
  Les mentions `uuid` ailleurs dans ce document sont à lire comme `int`. Le choix `uuid` par
  défaut n'apporte rien ici : pas de génération côté client, pas de système distribué,
  pas de fusion de bases prévue.
- **Équivalences de nommage code ↔ spec** (voir CLAUDE-production.md pour le détail) :
  `mission` = table `ldm_missions` (préexistante, étendue sur place, pas renommée) ;
  `periode` = `production_periode` ; `tache` = `production_tache` (pour cohabiter avec le
  to-do `taches` du CRM). Les autres noms (`dossier`, `tache_modele`, `alerte`, `suspens`,
  `revue`) sont conservés tels quels dans le code.

---

## 1. Principe d'architecture

Le module se greffe sur l'existant selon la chaîne suivante :

```
prospect  ──►  client  ──►  lettre_de_mission  ──►  mission  ──►  periode  ──►  tache
                  │                                    │            │
                  └──► dossier (segmentation)          │            ├──► alerte
                                                        │            ├──► suspens
                                                        └──► temps   └──► revue
```

**Trois principes non négociables.**

1. **La lettre de mission est la source de vérité de la production.** Une mission signée, dotée d'une périodicité, génère automatiquement ses occurrences de production. Aucune période n'est créée manuellement en régime normal. Corollaire : un temps imputé sur un dossier sans mission active correspondante est du hors-mission, qualifié automatiquement.

2. **`periode` est un enregistrement autonome, pas un attribut.** C'est l'objet qui permet de piloter par échéance (« où en sont mes 40 CA3 au 12 ? ») plutôt que par dossier. Sans lui, l'outil reproduit le classeur Excel qu'il remplace.

3. **Le module a une vocation probante.** Il doit permettre de démontrer, plusieurs années après, qui a fait quoi et quand. Cela impose un journal d'audit en append-only et l'interdiction de la modification rétroactive silencieuse (§ 7).

---

## 2. Modèle de données

### 2.1 `dossier`

Entité juridique suivie. Rattachée au client du CRM. Porte la segmentation et l'affectation.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `client_id` | fk → client | objet CRM existant |
| `raison_sociale` | string | |
| `siren` | string(9) | unique, nullable (dossiers en création) |
| `forme_juridique` | enum | |
| `jour_cloture` / `mois_cloture` | tinyint | deux entiers séparés (1-31 / 1-12), pas une date arbitraire. Alimentés par migration depuis `clients.date_cloture` puis `clients.date_cloture` passe en lecture seule. Une date portant une année arbitraire produirait des bugs au 29 février et des comparaisons d'années fausses. |
| `regime_tva` | enum | `franchise`, `reel_simplifie`, `reel_normal_mensuel`, `reel_normal_trimestriel` |
| `classe` | enum | `A`, `B`, `C` — calculé, voir RG-01 |
| `classe_forcee` | enum nullable | surcharge manuelle, motivée obligatoirement |
| `profils` | array\<enum\> | `T`, `E`, `N`, `B`, `L`, `H`, `P` — pilote l'applicabilité des tâches et contrôles |
| `score_risque` | decimal(3,2) | |
| `score_complexite` | decimal(3,2) | |
| `cotation_notes` | jsonb | `{R1..R6, C1..C6}` |
| `surclassements` | array\<enum\> | `S1`..`S6` |
| `materialite` | integer | euros, voir RG-02 |
| `ca_reference` | integer | euros |
| `taux_tva_theorique` | decimal(4,3) | nullable, pour le contrôle F01 |
| `fourchette_645_641_min` / `_max` | decimal | pour le contrôle C03 |
| `jours_caisse_admis` | integer | pour le contrôle D02 |
| `collaborateur_id` | fk → utilisateur | |
| `chef_de_mission_id` | fk → utilisateur | |
| `statut_annuaire` | enum | `non_inscrit`, `en_cours`, `inscrit` |
| `plateforme_agreee` | string nullable | |
| `mandat_pa_signe_le` | date nullable | |
| `cotation_lab` | enum | `faible`, `standard`, `renforcee`, `elevee` |
| `date_derniere_cotation` | date | |
| `statut` | enum | `actif`, `en_entree`, `en_sortie`, `clos` |
| `niveau_requis` | enum | `junior`, `medior`, `senior` — **dérivé** du niveau de complexité (RG-41). Champ prévu dès le lot 1, exploité au lot 3. |

### 2.2 `mission`

Ligne de la lettre de mission. **Implémentée par extension de la table préexistante
`ldm_missions`** (chantier 2), pas par création d'une nouvelle table : deux sources de vérité
sur le périmètre contractuel seraient le pire scénario possible, puisque c'est ce périmètre qui
déclenche toute la production et qui qualifie le hors-mission.

Une ligne héritée pouvait grouper plusieurs prestations d'une même catégorie (ex : ligne
« fiscal » = TVA + Liasses). Les 4 lignes fiscales mixtes de la base initiale ont été **splittées
lors de la migration** en 2 lignes distinctes (TVA récurrente + fiscal annuel), avec le flag
`repartition_auto = 1` pour être revalidées manuellement.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `dossier_id` | fk | |
| `lettre_de_mission_id` | fk | objet CRM existant |
| `libelle` | string | |
| `nature` | enum | `tenue`, `revision`, `presentation_comptes`, `declaratif`, `social`, `juridique`, `conseil` |
| `periodicite` | enum | `mensuelle`, `trimestrielle`, `semestrielle`, `annuelle`, `ponctuelle` |
| `honoraire_annuel` | integer | euros HT |
| `budget_temps_annuel` | integer | minutes |
| `date_debut` / `date_fin` | date | |
| `genere_production` | boolean | si vrai, la mission génère des `periode` (RG-03) |
| `statut` | enum | `en_projet`, `active`, `suspendue`, `terminee` |

> **Point d'attention.** Séparer `mission` de `lettre_de_mission` est indispensable : une lettre peut couvrir plusieurs missions de périodicités différentes (tenue mensuelle + bilan annuel + social). Sans cette séparation, la génération des périodes est impossible.

### 2.3 `periode`

Occurrence de production. **Objet central du module.**

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `mission_id` | fk | |
| `dossier_id` | fk | dénormalisé pour les requêtes de pilotage |
| `numero` | integer | 1 à 12 selon périodicité |
| `date_debut` / `date_fin` | date | période comptable couverte |
| `exercice` | integer | |
| `date_echeance_interne` | date | calculée, RG-04 |
| `date_echeance_declarative` | date nullable | |
| `statut` | enum | machine à états § 3.1 |
| `responsable_id` | fk → utilisateur | |
| `date_mise_a_disposition` | timestamp nullable | |
| `revue_requise` | boolean | calculé selon classe, RG-05 |
| `temps_budget` | integer | minutes |
| `temps_realise` | integer | minutes — **cache dénormalisé** (voir note ci-dessous) |

> **`temps_realise` — cache dénormalisé assumé.** La valeur strictement dérivée serait `SUM(temps.duree_minutes) WHERE temps.periode_id = periode.id`. Recalculer à chaque lecture imposerait une agrégation de `temps` par ligne de portefeuille affichée, ce qui est inacceptable pour les vues 6.1 à 6.3.
>
> **Écriture unique et contrôlée par le service `temps` (lot 3).** Le cache est mis à jour à chaque création, modification ou suppression d'une imputation de temps rattachée à une période, dans la même transaction que l'écriture sur `temps`. Aucun autre chemin n'a le droit d'écrire sur `temps_realise` : ni route CRUD directe, ni import, ni script ad hoc.
>
> **Commande de reconstruction complète.** Prévoir une commande d'administration `reconstruire-temps-realise` qui, pour un périmètre donné (mission, dossier, portefeuille entier), remet `temps_realise` à la valeur agrégée depuis `temps`. Divergence garantie à terme entre cache et source — la commande est le seul recours propre. Journaliser chaque exécution (périmètre, écarts constatés, correcteur).

Contrainte d'unicité : `(mission_id, exercice, numero)`.

### 2.4 `tache_modele` et `tache`

`tache_modele` est le catalogue des 26 tâches de la note de service.

| Champ | Type | Notes |
|---|---|---|
| `code` | string | `A1`, `B1`, … `F5` |
| `bloc` | enum | `A`..`F` |
| `libelle` | string | |
| `diligence_attendue` | text | |
| `point_de_vigilance` | text | |
| `obligatoire` | boolean | si vrai, bloque la clôture (RG-08) |
| `profils_applicables` | array\<enum\> | `["T"]` = toutes, sinon liste |
| `classes_applicables` | array\<enum\> | |
| `ordre` | integer | |

`tache` est l'instance sur une période.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `periode_id` | fk | |
| `tache_modele_code` | fk | |
| `statut` | enum | `N` (non fait), `EC` (en cours), `F` (fait), `NA` (non applicable) |
| `motif_na` | text nullable | **obligatoire si statut = NA** (RG-09) |
| `fait_par` | fk → utilisateur nullable | |
| `fait_le` | timestamp nullable | |
| `commentaire` | text nullable | |

### 2.5 `controle` et `alerte`

`controle` est le catalogue des 69 contrôles automatiques.

| Champ | Type | Notes |
|---|---|---|
| `reference` | string | `A01`..`G10` |
| `famille` | enum | `activite`, `marge`, `personnel`, `tresorerie`, `bilan`, `fiscal`, `qualite` |
| `libelle` | string | |
| `regle_calcul` | text | description métier |
| `source` | enum | `fec`, `paie`, `bancaire`, `caisse`, `declaratif`, `externe`, `interne` |
| `mode` | enum | `rupture`, `seuil`, `tendance` |
| `seuil_relatif_defaut` | decimal nullable | |
| `applique_materialite` | boolean | faux pour `rupture` |
| `periodes_tendance` | integer nullable | pour le mode `tendance` |
| `gravite` | integer | 1, 2 ou 3 |
| `destinataire_initial` | enum | `collaborateur`, `chef_de_mission`, `expert_comptable` |
| `profils_applicables` | array\<enum\> | |
| `actif` | boolean | |

`alerte` est l'occurrence détectée.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `controle_reference` | fk | |
| `dossier_id` | fk | |
| `periode_id` | fk nullable | nullable pour les contrôles annuels |
| `date_detection` | date | |
| `libelle_anomalie` | string | généré par le moteur |
| `valeur_constatee` | decimal nullable | |
| `ecart` | decimal nullable | |
| `gravite` | integer | copié du contrôle à la détection (dé-normalisé volontairement : le recalibrage ultérieur d'un contrôle ne doit pas réécrire l'historique) |
| `statut` | enum | machine à états § 3.2 |
| `anciennete_jours` | integer | **dérivé**, RG-10 |
| `cran` | integer | **dérivé**, 0 à 3, RG-11 |
| `proprietaire_id` | fk → utilisateur | modifié automatiquement au changement de cran |
| `motif_cloture` | text nullable | **obligatoire pour clôturer** (RG-12) |
| `action_corrective` | text nullable | |
| `date_cloture` | date nullable | |
| `sans_suite` | boolean | pour le calibrage, § 6 |

### 2.6 `suspens`

**Objet distinct de `alerte`.** Une alerte est une anomalie détectée par le cabinet ; un suspens est une question posée au client. Cycles de vie, destinataires et délais différents.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `dossier_id` | fk | |
| `periode_origine_id` | fk | |
| `alerte_id` | fk nullable | un suspens peut naître d'une alerte |
| `libelle` | string | |
| `montant` | decimal nullable | |
| `compte` | string nullable | |
| `date_ouverture` | date | |
| `statut` | enum | machine à états § 3.3 |
| `date_derniere_relance` | date nullable | |
| `nombre_relances` | integer | |
| `mode_information_client` | enum | `email`, `courrier`, `portail`, `entretien` |
| `preuve_information` | fk → document nullable | |
| `resolution` | enum nullable | `justifie`, `traite_office`, `abandonne` |
| `imputation_office` | string nullable | compte retenu si `traite_office` |

### 2.7 `temps`

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `utilisateur_id` | fk | |
| `date` | date | |
| `duree_minutes` | integer | |
| `dossier_id` | fk nullable | null si code interne |
| `mission_id` | fk nullable | **null = hors mission**, RG-13 |
| `periode_id` | fk nullable | |
| `nature` | enum | `collecte`, `tenue`, `revision`, `declaratif`, `relation_client`, `hors_mission`, `interne` |
| `code_interne` | enum nullable | `formation`, `reunion`, `administration`, `veille`, `commercial` |
| `commentaire` | text nullable | |
| `verrouille` | boolean | vrai après clôture du mois, RG-14 |

### 2.8 `echeance_declarative`

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `dossier_id` | fk | |
| `periode_id` | fk nullable | |
| `type` | enum | `tva_ca3`, `tva_ca12`, `acompte_is`, `solde_is`, `cfe`, `cvae`, `deb_des`, `e_reporting`, `liasse` |
| `date_limite` | date | |
| `date_depot` | date nullable | |
| `accuse_reception` | fk → document nullable | |
| `statut` | enum | `a_faire`, `preparee`, `deposee`, `en_retard` |

### 2.9 `revue`

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `niveau` | enum | `N2`, `N3` |
| `dossier_id` | fk | |
| `periode_id` | fk nullable | null pour les revues N3 annuelles |
| `reviseur_id` | fk → utilisateur | |
| `date_revue` | date | |
| `grille` | jsonb | points de contrôle et réponses |
| `conclusion` | enum | `satisfaisant`, `reserves`, `non_satisfaisant` |
| `constats` | text | |
| `cause_racine` | text nullable | obligatoire si conclusion ≠ satisfaisant |
| `plan_remediation` | text nullable | idem |
| `echeance_remediation` | date nullable | idem |
| `remediation_soldee_le` | date nullable | |

Contrainte : `reviseur_id` ≠ producteur de la période (RG-15).

### 2.10 `evenement_dossier`

Alimente les règles de surclassement.

| Champ | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `dossier_id` | fk | |
| `type` | enum | `entree_relation`, `controle_fiscal_ouvert`, `controle_fiscal_clos`, `procedure_collective`, `reclamation_client`, `sinistre_rcp`, `operation_haut_de_bilan`, `changement_dirigeant`, `cotation_lab_elevee` |
| `date_debut` | date | |
| `date_fin` | date nullable | |
| `commentaire` | text | |

---

## 3. Machines à états

### 3.1 `periode`

```
planifiee ──► en_cours ──► prete_pour_revue ──► revue_ok ──► cloturee
                  ▲               │                 │            │
                  └───────────────┴─────────────────┘            │
                            (retour pour correction)             │
                  ◄──────────────────────────────────────────────┘
                            (reouverture, motivée)
```

- `planifiee → en_cours` : première imputation de temps ou première tâche renseignée.
- `en_cours → prete_pour_revue` : toutes les tâches obligatoires sont `F` ou `NA` motivé (RG-08).
- `prete_pour_revue → revue_ok` : revue N2 enregistrée. **Transition sautée si `revue_requise` est faux.**
- `→ cloturee` : bloquée s'il subsiste une alerte de gravité 1 ouverte sur la période (RG-16).
- `cloturee → en_cours` : réouverture possible, motif obligatoire, tracée au journal d'audit.

### 3.2 `alerte`

```
ouverte ──► en_cours ──► en_attente_client ──► cloturee
     └───────────┴──────────────┴────────────────►
```

Le `cran` n'est **pas** un état mais un champ dérivé, pour éviter la combinatoire.

> **Décision de conception à ne pas contourner.** Le compteur d'ancienneté ne se suspend jamais, y compris à l'état `en_attente_client`. Suspendre le compteur pendant l'attente client permettrait à une anomalie de rester ouverte indéfiniment derrière une relance sans réponse, ce qui est exactement le scénario que le dispositif vise à empêcher. L'attente client est une information, pas une excuse.

### 3.3 `suspens`

```
ouvert ──► relance_1 ──► relance_2 ──► resolu
                              │
                              ├──► traite_office (décision chef de mission)
                              └──► abandonne (décision expert-comptable)
```

`traite_office` exige `preuve_information` non nulle (RG-17).

---

## 4. Règles de gestion

| Réf | Règle |
|---|---|
| **RG-01** | `classe` = matrice croisée (niveau de risque × niveau de complexité) issue des scores pondérés, sauf si au moins un `surclassement` est actif, auquel cas `classe = A`. Recalcul à chaque modification de `cotation_notes` ou de `surclassements`. |
| **RG-02** | `materialite` = `max(500, ca_reference × 1%)`, surchargeable manuellement avec motif obligatoire. |
| **RG-03** | Chaque nuit, pour toute `mission` active avec `genere_production = true`, générer les `periode` manquantes jusqu'à 2 périodes en avance. **Opération idempotente** : la contrainte d'unicité `(mission_id, exercice, numero)` fait foi. Instancier simultanément les `tache` applicables selon `profils` du dossier et `classe`. **Plancher de mise en service :** aucune période n'est créée dont `date_debut` est antérieure à `DATE_DEBUT_PRODUCTION` (paramètre de service, fixé au 2026-09-01), quelle que soit `mission.date_debut`. Sans ce plancher, l'outil rétro-générerait des milliers de périodes correspondant à du travail réellement effectué mais jamais tracé, rendant tous les indicateurs illisibles dès la mise en service. Modifier ce plancher est une opération de reprise, à tracer au journal d'audit. |
| **RG-04** | `date_echeance_interne` = `date_fin` de la période + 20 jours, ajustée au jour ouvré précédent si nécessaire. Paramétrable par mission. |
| **RG-05** | `revue_requise` = vrai si `classe = A` ; si `classe = B` et `numero` multiple de 3 ; si `classe = C` et `numero` multiple de 6 ; vrai dans tous les cas pour la dernière période de l'exercice. Le champ est **calculé à la création** de la période et figé ensuite. Un changement ultérieur de la classe du dossier ne recalcule `revue_requise` **que pour les périodes en statut `planifiee` ou `en_cours`** ; les périodes en `prete_pour_revue`, `revue_ok` ou `cloturee` ne sont jamais réécrites. Toute recotation est journalisée avec le nombre de périodes impactées. Même principe que RG-36 pour les lignes de budget de supervision : les états consommés restent au barème historique, les états futurs suivent la nouvelle classe. Recalculer rétroactivement une période close réécrirait l'histoire et rendrait non conforme une période qui l'était au moment des faits — inacceptable pour un dispositif à vocation probante. |
| **RG-06** | Le moteur de contrôles s'exécute à chaque import de FEC et, à défaut, la nuit du 10 de chaque mois. Il crée une `alerte` par déclenchement, sauf si une alerte identique (même `controle_reference`, même `dossier_id`, même `periode_id`) est déjà ouverte : dans ce cas, mise à jour de `valeur_constatee` sans réinitialisation de `date_detection`. **L'ancienneté ne se remet jamais à zéro tant que l'anomalie persiste.** |
| **RG-07** | Contrôles de mode `seuil` : déclenchement si `abs(ecart_relatif) > seuil_relatif` **ET** `abs(ecart_absolu) > materialite` du dossier. Contrôles de mode `rupture` : `applique_materialite = false`, déclenchement inconditionnel. Contrôles de mode `tendance` : déclenchement si `periodes_tendance` périodes consécutives d'évolution de même signe, sans condition d'amplitude. |
| **RG-08** | Passage en `prete_pour_revue` interdit tant qu'une `tache` dont `tache_modele.obligatoire = true` n'est pas en statut `F` ou `NA` avec `motif_na` renseigné. |
| **RG-09** | `motif_na` obligatoire si `tache.statut = NA`. Longueur minimale 10 caractères, la valeur « NA » ou « n/a » est rejetée. |
| **RG-10** | `anciennete_jours` = `date_cloture − date_detection` si clôturée, sinon `date_du_jour − date_detection`. Champ dérivé, jamais stocké en dur. |
| **RG-11** | `cran` : gravité 2 et 3 → 0 si ancienneté ≤ 30, 1 si ≤ 60, 2 si ≤ 90, 3 au-delà. Gravité 1 → 1 immédiatement, 2 si ancienneté > 30, 3 si > 60. |
| **RG-12** | Clôture d'une alerte interdite sans `motif_cloture` d'au moins 20 caractères. Les valeurs de la liste noire (`traité`, `ok`, `fait`, `vu`, `ras`) sont rejetées, insensibles à la casse et aux accents. |
| **RG-13** | Un `temps` avec `dossier_id` non nul et `mission_id` nul, ou dont la `nature` n'est couverte par aucune mission active du dossier, est qualifié `hors_mission` et remonté au chef de mission dans le rapport hebdomadaire. |
| **RG-14** | Les `temps` d'un mois sont verrouillés le 5 du mois suivant. Déverrouillage possible par l'expert-comptable uniquement, avec motif, tracé au journal d'audit. |
| **RG-15** | `revue.reviseur_id` ne peut être égal à aucun utilisateur ayant imputé du temps de nature `tenue` ou `revision` sur la période revue. Contrainte applicative bloquante. |
| **RG-16** | Passage en `cloturee` interdit s'il existe une `alerte` de gravité 1 en statut ≠ `cloturee` rattachée à la période. |
| **RG-17** | Passage d'un `suspens` en `traite_office` interdit si `preuve_information` est nulle ou si `date_ouverture` remonte à moins de 60 jours. |
| **RG-18** | À la création d'un `evenement_dossier` de type `controle_fiscal_ouvert`, `procedure_collective`, `reclamation_client`, `sinistre_rcp`, `operation_haut_de_bilan` ou `cotation_lab_elevee`, ajouter le surclassement correspondant au dossier et recalculer la classe (RG-01). À la clôture de l'événement (`date_fin` renseignée), retirer le surclassement après validation explicite de l'expert-comptable. |
| **RG-19** | Alerte automatique au chef de mission lorsque `temps_realise / temps_budget > 80%` sur une mission. |
| **RG-20** | Un collaborateur ne peut être `collaborateur_id` de plus de 3 dossiers de classe A. Contrainte non bloquante (avertissement à l'affectation), le dépassement étant parfois nécessaire en transition. |

---

## 5. Automatisations planifiées

| Job | Fréquence | Action |
|---|---|---|
| `generer_periodes` | quotidien, 02:00 | RG-03 |
| `recalculer_crans` | quotidien, 06:00 | Recalcule `cran` de toutes les alertes ouvertes. En cas de changement, met à jour `proprietaire_id` **et notifie le nouveau propriétaire**. Journalise la transition. |
| `executer_controles` | à l'import FEC, et quotidien 03:00 pour les sources non FEC | RG-06, RG-07 |
| `controler_echeances` | quotidien, 07:00 | Passe en `en_retard` les échéances dépassées sans `date_depot`. Notifie l'expert-comptable (gravité 1). |
| `relancer_suspens` | hebdomadaire, lundi 08:00 | Propose les relances dues. **Ne les envoie pas automatiquement** : la relance client reste un acte humain validé. |
| `verrouiller_temps` | mensuel, le 5 | RG-14 |
| `rapport_hebdomadaire` | vendredi 17:00 | Par chef de mission : périodes en retard, alertes au cran ≥ 1, temps non imputés, hors-mission détecté |

> **Point critique.** Le job `recalculer_crans` est le cœur du dispositif. L'escalade doit être un effet de bord du temps qui passe, jamais une action que quelqu'un doit penser à faire. Si l'implémentation exige une intervention humaine pour escalader, le dispositif échouera, quel que soit le reste.

---

## 6. Vues et écrans

### 6.1 Vue collaborateur — « Ma semaine »

Colonnes : dossier, période, échéance interne, statut, tâches restantes, alertes m'appartenant, suspens en attente. Tri par échéance croissante, **jamais par dossier**.

### 6.2 Vue chef de mission — « Mon pôle »

Deux tableaux :
- Avancement des périodes du pôle (matrice dossiers × statut), avec code couleur sur l'échéance.
- Alertes au cran ≥ 1 dont il est propriétaire, triées par ancienneté décroissante.

### 6.3 Vue expert-comptable — « Supervision »

- Alertes au cran 2 et 3, toutes équipes confondues.
- Ancienneté maximale constatée sur le portefeuille (indicateur unique le plus révélateur).
- Périodes en retard de plus de 5 jours.
- Échéances déclaratives non déposées.
- Revues N2 dues et non faites.
- Remédiations N3 échues et non soldées.

### 6.4 Vue « Échéance »

Sélection d'un type d'échéance et d'une date, affichage de tous les dossiers concernés avec leur statut. C'est la vue qui remplace l'ouverture de 40 classeurs.

### 6.5 Écran de cotation

Saisie des 12 notes, affichage en temps réel des scores, du niveau et de la classe résultante. Historisation de chaque cotation (une cotation ne s'écrase pas, elle se succède).

---

## 7. Traçabilité et valeur probante

Le module doit permettre de démontrer des diligences plusieurs années après leur réalisation. Cela impose :

1. **Journal d'audit append-only** (`journal_audit`) : `id`, `objet_type`, `objet_id`, `champ`, `valeur_avant`, `valeur_apres`, `utilisateur_id`, `horodatage`, `motif` (nullable). Aucune suppression, aucune modification.
2. **Transitions d'escalade journalisées** : on doit pouvoir prouver qu'à J+61 une alerte a effectivement changé de propriétaire et que le nouveau propriétaire a été notifié.
3. **Horodatage serveur uniquement.** Ne jamais faire confiance à une date saisie pour les champs `fait_le`, `date_revue`, `date_cloture`.
4. **Interdiction de l'antidatage.** `tache.fait_le` est renseigné par le serveur au moment du passage en `F`, non saisissable.
5. **Snapshot de clôture.** À la clôture d'une période, générer un PDF figé du programme de travail (tâches, statuts, auteurs, horodatages, alertes et suspens rattachés) et l'attacher à la période. C'est cette pièce qui sera produite en contrôle qualité ou en cas de mise en cause.
6. **Rétention** : 10 ans pour les périodes, tâches, revues et alertes (aligné sur la prescription en matière de responsabilité professionnelle et sur les obligations de conservation comptable).

---

## 8. Intégrations

| Source | Usage | Priorité |
|---|---|---|
| FEC (import fichier) | Moteur de contrôles § 5. Format normé A. 47 A-1 du LPF, donc indépendant de l'outil de production | **Lot 2, indispensable** |
| Tiime (API ou export) | Récupération du FEC, statut des connexions bancaires (contrôle B1), volumétrie des pièces | Lot 2 |
| Journal de paie | Contrôles C03, C04, C05 | Lot 3 |
| impots.gouv | Accusés de réception des télédéclarations | Lot 3 |
| Plateforme agréée | Statuts de cycle de vie des factures, flux e-reporting | Lot 4 |

> Le choix du FEC comme source principale est structurant : il permet d'exécuter rétroactivement l'ensemble des contrôles sur les 24 derniers mois de tout le portefeuille dès la mise en service, sans attendre l'accumulation de données dans le nouvel outil.

---

## 9. Habilitations

| Rôle | Droits |
|---|---|
| `collaborateur` | Lecture-écriture sur ses dossiers. Ne peut pas clôturer une alerte de gravité 1, ni valider une revue, ni modifier une cotation, ni déverrouiller des temps. |
| `chef_de_mission` | Idem sur les dossiers de son pôle, plus : clôture des alertes de gravité 1 et 2, saisie des revues N2, décision de traitement d'office des suspens, proposition de cotation. |
| `expert_comptable` | Tout, plus : validation des cotations, revues N3, réouverture de période, déverrouillage des temps, abandon de suspens, recalibrage des seuils de contrôle. |
| `administrateur` | Paramétrage technique. **Pas d'accès aux données de temps individuelles** (proportionnalité RGPD). |

Contrainte transversale : personne ne peut valider une revue sur une période où il a imputé du temps de production (RG-15), quel que soit son rôle.

> **Distinction rôle vs. grade.** Le rôle applicatif (ci-dessus) porte les droits d'accès. Le champ `utilisateur.grade` (RG-43) est distinct : il ne sert qu'à la valorisation économique (§ 14), n'accorde aucun droit et ne restreint aucun accès. Les trois grades de collaborateur (`junior`, `medior`, `senior`) ont le rôle `collaborateur` et des habilitations identiques.

---

## 10. Lots de livraison

**Lot 1 — Socle de production** (urgent, conditionne l'application de la note de service)
`dossier`, `mission`, `periode`, `tache_modele`, `tache`. Génération automatique (RG-03), machine à états période, vues 6.1 et 6.4. Sans le moteur de contrôles.

**Lot 2 — Registre des alertes**
`controle`, `alerte`, `suspens`, moteur de contrôles sur FEC, jobs `executer_controles` et `recalculer_crans`, vues 6.2 et 6.3. C'est le lot qui apporte la détection ; les lots suivants ne font que l'affiner.

**Lot 3 — Temps et rentabilité**
`temps` relié à `mission`, budgets, qualification du hors-mission (RG-13), verrouillage mensuel.

**Lot 4 — Supervision qualité**
`revue`, `evenement_dossier`, snapshot de clôture, journal d'audit exposé, remédiations N3.

---

## 11. Points d'attention pour l'implémentation

1. **Idempotence de `generer_periodes`.** Le job tournera tous les jours ; il ne doit jamais créer de doublon ni réinstancier des tâches déjà renseignées.
2. **Ne pas stocker `anciennete_jours` ni `cran`.** Ce sont des champs dérivés. Les stocker crée une incohérence dès qu'un job échoue une nuit. En revanche, **journaliser les transitions de cran**, qui elles sont des faits.
3. **Dénormaliser `gravite` sur `alerte`.** Le recalibrage ultérieur d'un contrôle ne doit pas réécrire la gravité des alertes passées, sous peine de rendre l'historique inexploitable et de fausser les indicateurs de calibrage.
4. **Ne pas fusionner `alerte` et `suspens`.** La tentation sera forte car les deux « ressemblent à des tâches à faire ». Elles répondent à des questions différentes : l'alerte mesure ce qui bloque chez nous, le suspens ce qui bloque chez le client. Les fusionner rend impossible de savoir lequel des deux est le goulot.
5. **La saisie doit se faire là où le travail se fait.** Si le collaborateur doit ressaisir dans l'outil ce qu'il a déjà fait dans Tiime, l'adoption échouera en trois mois. Privilégier la remontée automatique de tout ce qui peut l'être (B1, B2, B4 sont détectables par API ou par FEC) et ne demander la saisie manuelle que pour ce qui relève d'un jugement.
6. **Le taux de faux positifs est l'indicateur de survie du dispositif.** Prévoir dès le lot 2 un écran de calibrage exposant, par contrôle, le nombre d'alertes émises et le taux `sans_suite`. Sans lui, les seuils dériveront par confort et le système se neutralisera silencieusement.

---

## 12. Authentification et récupération d'accès

### 12.1 Principe préalable : ne pas écrire cette brique soi-même

L'authentification est le seul composant de l'application où une erreur d'implémentation est silencieuse et totale. Deux options, dans cet ordre de préférence :

1. **Utiliser le module d'authentification natif du framework** (Django auth, Devise, Laravel Breeze, NextAuth selon la stack retenue). Ces modules implémentent déjà correctement le hachage, les jetons de réinitialisation, l'invalidation de session et la protection contre l'énumération.
2. **Déléguer à un fournisseur d'identité** si le cabinet dispose déjà d'un annuaire (Microsoft Entra ID via Microsoft 365, Google Workspace).

Écrire une authentification maison n'est justifié dans aucun scénario ici.

**Contrainte structurante** : le CRM et le module de production doivent partager **un seul compte utilisateur**. Deux jeux d'identifiants pour la même personne sur le même outil produisent inévitablement des mots de passe réutilisés, notés sur papier, et une procédure de récupération doublée. Si le CRM possède déjà une table utilisateur, le module s'y raccorde ; il n'en crée pas une seconde.

### 12.2 L'identifiant est l'adresse électronique professionnelle

**Décision de conception : supprimer la notion d'identifiant distinct du courriel.** Un identifiant séparé (`tdupont`, `theo.d`, `TD01`) crée un secret de plus à mémoriser, sans apporter aucune sécurité : un identifiant n'est pas un secret, il est connu de tous les collègues et figure souvent dans les métadonnées des documents.

Conséquence directe : **la fonction « identifiant oublié » disparaît**, puisqu'il n'y a plus rien à retrouver. C'est la meilleure réponse au besoin exprimé, et elle supprime aussi un vecteur d'attaque (voir RG-22).

### 12.3 Parcours de réinitialisation

```
   saisie du courriel
          │
          ▼
  réponse générique  ──►  « Si un compte existe pour cette adresse,
  (toujours identique)     un lien de réinitialisation vient d'être envoyé. »
          │
          ▼
  courriel avec jeton  ──►  usage unique · 30 minutes · 128 bits · haché en base
          │
          ▼
  page de définition d'un nouveau mot de passe
          │
          ▼
  invalidation de toutes les sessions actives
  + courriel de notification du changement
  + inscription au journal d'audit
```

### 12.4 Règles de gestion

| Réf | Règle |
|---|---|
| **RG-21** | Le mot de passe est stocké sous forme de condensat **Argon2id** (paramètres par défaut de la bibliothèque, jamais réduits pour gagner en performance). Aucun mot de passe n'est stocké, journalisé ni transmis en clair, à aucun moment, y compris dans les logs d'erreur. |
| **RG-22** | **Réponse invariante.** La page de demande de réinitialisation retourne toujours le même message et le même délai de réponse, que l'adresse corresponde ou non à un compte. Toute différenciation permet à un tiers d'énumérer les comptes du cabinet. Cette règle s'applique aussi à la page de connexion : le message d'erreur ne distingue jamais « adresse inconnue » de « mot de passe incorrect ». |
| **RG-23** | Le jeton de réinitialisation est un aléa cryptographique d'au moins 128 bits (`secrets.token_urlsafe(32)` ou équivalent), **stocké haché** en base comme un mot de passe. Durée de vie 30 minutes, usage unique, invalidé à la première utilisation, à la génération d'un nouveau jeton, et à tout changement de mot de passe. |
| **RG-24** | Après réinitialisation réussie : révocation de **toutes** les sessions actives de l'utilisateur, y compris celles d'autres appareils, et envoi d'un courriel de notification à l'adresse du compte (« votre mot de passe a été modifié le … »). Ce courriel est le seul signal dont dispose l'utilisateur si un tiers a pris la main sur son compte. |
| **RG-25** | Limitation de débit : au maximum 5 demandes de réinitialisation par adresse et par heure, 20 par adresse IP et par heure. Sur la page de connexion, **délai croissant** (1 s, 2 s, 4 s, 8 s…) plutôt que verrouillage dur du compte : un verrouillage après N échecs permet à un tiers de bloquer volontairement l'accès de vos collaborateurs le jour d'une échéance déclarative. |
| **RG-26** | **Aucune question secrète.** Les réponses (nom de jeune fille, ville de naissance, nom du premier animal) sont des données publiques ou devinables, et constituent un contournement du mot de passe, non un renfort. |
| **RG-27** | Politique de mot de passe : longueur minimale **14 caractères** pour les comptes courants, **20 caractères** pour l'expert-comptable et l'administrateur. **Aucune règle de complexité imposée** (majuscule, chiffre, caractère spécial) et **aucune expiration périodique** : ces deux règles produisent des mots de passe prévisibles. Les phrases de passe sont explicitement acceptées et suggérées à l'écran. |
| **RG-28** | Le mot de passe choisi est vérifié contre une liste de mots de passe compromis (API *Have I Been Pwned* en k-anonymat, ou liste locale). Un mot de passe figurant dans une fuite connue est refusé, quelle que soit sa longueur. |
| **RG-29** | **Authentification multifacteur obligatoire** pour les rôles `expert_comptable` et `administrateur`, facultative mais proposée pour les autres. Facteur retenu : application TOTP (Authenticator, ou clé physique FIDO2). **Le SMS est exclu** : il est interceptable et contournable par attaque sur la carte SIM. Codes de secours à usage unique remis à l'activation. |
| **RG-30** | **Recours ultime hors ligne.** Si un utilisateur perd à la fois l'accès à son mot de passe et à sa boîte professionnelle, la réinitialisation est effectuée par l'administrateur, **en présence physique de l'intéressé ou après vérification d'identité par un canal distinct du courriel**. Jamais sur simple demande téléphonique ou par message : c'est le vecteur d'ingénierie sociale le plus exploité. Cette opération est tracée au journal d'audit avec le nom de l'opérateur et le motif. |

### 12.5 Journal d'audit des événements d'authentification

Les événements suivants sont inscrits au `journal_audit` (§ 7), sans jamais consigner le jeton ni le mot de passe :

`connexion_reussie`, `connexion_echouee`, `demande_reinitialisation`, `reinitialisation_effectuee`, `mot_de_passe_modifie`, `mfa_active`, `mfa_desactive`, `reinitialisation_administrateur`, `session_revoquee`, `role_modifie`.

Conservation 12 mois glissants, conformément à la position de la CNIL sur les journaux de connexion.

### 12.6 Fondement réglementaire

- **Article 32 du RGPD** : obligation de mettre en œuvre des mesures techniques appropriées au regard du risque. Les données traitées comprennent des données financières de tiers et des données de suivi d'activité des salariés.
- **Secret professionnel** : article 226-13 du code pénal et article 21 de l'ordonnance n° 45-2138 du 19 septembre 1945. Un accès non autorisé au module expose l'intégralité du portefeuille du cabinet.
- **Référentiel** : recommandations de l'ANSSI relatives à l'authentification multifacteur et aux mots de passe (guide v2.0, octobre 2021, cosigné par la CNIL), qui abandonnent la rotation périodique et les règles de complexité au profit de la longueur et de l'entropie.

### 12.7 Ce qui est explicitement proscrit

- Envoyer un mot de passe, même provisoire, par courriel ou par message.
- Afficher ou renvoyer un identifiant à un demandeur non authentifié.
- Indiquer si une adresse correspond ou non à un compte existant.
- Stocker un jeton de réinitialisation en clair en base.
- Réutiliser un jeton déjà consommé.
- Conserver une session active après réinitialisation du mot de passe.
- Imposer une expiration périodique des mots de passe.

---

## 13. Saisie des temps — maille et contrôles

### 13.1 Maille retenue : le quart d'heure

| Réf | Règle |
|---|---|
| **RG-31** | La durée est stockée en **minutes entières** (`duree_minutes`, integer), jamais en décimal. Un temps exprimé en heures décimales (1,25 h) produit des erreurs d'arrondi cumulatives sur les agrégations annuelles et rend les totaux non reproductibles. Toute restitution en décimal est un formatage d'affichage, pas un stockage. |
| **RG-32** | `duree_minutes` doit être un **multiple de 15**, avec un plancher de 15 minutes et un plafond de 720 minutes par ligne. La contrainte est appliquée en base (`CHECK (duree_minutes % 15 = 0 AND duree_minutes BETWEEN 15 AND 720)`) et non seulement dans l'interface : les imports et les API doivent la respecter aussi. |
| **RG-33** | L'arrondi appliqué à toute saisie est **au quart d'heure le plus proche**, jamais au supérieur. L'arrondi systématique au supérieur gonfle mécaniquement le temps imputé (dix interventions de cinq minutes deviendraient 2 h 30 au lieu de 50 minutes) et fausse durablement les budgets de référence, qui sont eux-mêmes calculés à partir de l'historique. |
| **RG-34** | Contrôles de vraisemblance quotidiens, non bloquants, remontés au rapport hebdomadaire du chef de mission : total du jour ouvré compris entre 0 et 7 h (**journée incomplète**), supérieur à 12 h (**journée invraisemblable**), ou nombre de lignes supérieur à 20 sur une journée (**granularité excessive**). |

### 13.2 Le risque propre au plancher de 15 minutes

Un plancher de 15 minutes surestime les interventions courtes. Sur un dossier générant vingt appels de cinq minutes par an, l'écart atteint 3 h 20, soit environ 300 € au taux horaire cible. L'effet est systématique et toujours dans le même sens.

**Traitement retenu : la saisie groupée.** Les codes de contact et de relance (`G02`, `G06`) ne sont pas saisis événement par événement mais **une fois par semaine, en cumul**, sur la base du temps réellement passé. L'interface propose explicitement cette saisie hebdomadaire pour ces deux codes.

Cette règle protège aussi l'adoption : exiger la saisie d'un appel de trois minutes est le meilleur moyen d'obtenir des relevés inventés le vendredi soir.

### 13.3 Ergonomie de saisie

- Incrément et décrément par pas de 15 minutes (boutons, et flèches haut et bas au clavier).
- Boutons de durée courante : 15 min, 30 min, 1 h, 2 h, demi-journée (3 h 30), journée (7 h). Ces deux dernières valeurs sont paramétrables selon la durée collective du travail applicable au cabinet.
- Le champ de durée n'est pas librement éditable au clavier : il n'accepte que des valeurs conformes à RG-32. Cela évite d'avoir à afficher un message d'erreur, qui est toujours moins efficace qu'une saisie rendue impossible.
- Report de la ligne précédente en un clic (même dossier, même code) : c'est la fonction la plus utilisée en pratique, et celle qui décide du taux de saisie au fil de l'eau.

### 13.4 Articulation avec les deux référentiels

Rappel de la distinction posée au § 2.4 : les **codes de temps** (C01, F01, S04…) mesurent la nature de l'activité pour la rentabilité ; les **tâches du programme de travail** (A1, B1, D6…) prouvent la diligence accomplie. Une table de correspondance `tache_modele_code → code_temps_defaut` permet de pré-remplir le code de temps lorsqu'une saisie est déclenchée depuis le programme de travail, sans jamais les confondre.

Correspondances par défaut : `A1, F1, F2, F3 → G02` · `B1 à C4 → C01` · `D1 à D6 → C03` · `E1 à E4 → F01` · `F4 → I07`.

---

## 14. Budget de supervision

### 14.1 Cadre

Le budget de temps d'une mission ne peut pas rester porté « en bloc » sur `mission.budget_temps_annuel` : cet agrégat masque la part réelle de supervision (chef de mission, expert-comptable) et rend impossible tout pilotage de la marge par grade. Deux effets mesurés dans le portefeuille actuel motivent cette décomposition :

1. La supervision est faite mais **non budgétée**, donc systématiquement absorbée en marge par le cabinet, dossier par dossier.
2. Le budget de production, valorisé au taux réel de l'intervenant, fait apparaître **une marge d'autant meilleure que l'intervenant est junior**, alors même que la sur-consommation en heures est plus probable dans ce cas. L'indicateur pousse à la mauvaise décision.

La section décompose donc le budget par grade, ajoute la supervision selon la classe et la fréquence de revue, et sépare la valorisation du budget (au niveau requis) de la valorisation du réalisé (au grade effectif). Elle est implémentée au **lot 3**, en même temps que la refonte des temps et de la rentabilité (§ 10).

### 14.2 Données ajoutées

**Table `budget_ligne`** — décomposition du budget d'une mission.

| Champ | Type | Notes |
|---|---|---|
| `id` | int | |
| `mission_id` | fk → `mission` | |
| `grade` | enum | `junior`, `medior`, `senior`, `chef_mission`, `expert_comptable` |
| `code_temps` | fk → `code_temps` | code de la nature d'activité (§ 13.4) |
| `poste` | enum | `production`, `revue_periodique`, `revue_cloture`, `preparation_entretien`, `entretien_restitution` |
| `minutes` | integer | minutes budgétées sur la ligne |
| `origine` | enum | `dimensionnement`, `bareme_supervision`, `manuel` |
| `consomme` | boolean | vrai dès qu'un `temps` a été imputé sur la ligne (verrou de recalcul, RG-36) |

Contrainte d'unicité : `(mission_id, grade, code_temps, poste)`.

**Champ ajouté à `utilisateur`.**

| Champ | Type | Notes |
|---|---|---|
| `grade` | enum | `junior`, `medior`, `senior`, `chef_mission`, `expert_comptable` — distinct de `role` (RG-43). Alimenté depuis `taux_grade.csv`. |

**Champ ajouté à `dossier`.**

| Champ | Type | Notes |
|---|---|---|
| `niveau_requis` | enum | `junior`, `medior`, `senior` — **dérivé** du niveau de complexité (RG-41). Champ calculé, jamais saisi. |

**Seeds associés** (répertoire `docs-production/seed/`) :

- `taux_grade.csv` — libellé, rôle applicatif, taux horaire cible par grade, complexité correspondante.
- `frequence_revue.csv` — nombre de revues périodiques par exercice selon la classe.
- `bareme_supervision.csv` — barème temps par poste × grade × classe utilisé par le générateur de lignes de supervision (RG-36).

### 14.3 Règles de gestion

| Réf | Règle |
|---|---|
| **RG-35** | Le budget de temps d'une mission est décomposé par grade, non plus porté en bloc. La décomposition vit dans la table `budget_ligne (mission_id, grade, code_temps, poste, minutes)`. `mission.budget_temps_annuel` devient un agrégat dérivé (somme des `minutes` de ses `budget_ligne`), conservé pour compatibilité mais non saisi. |
| **RG-36** | Les lignes de supervision (`poste ∈ {revue_periodique, revue_cloture, preparation_entretien, entretien_restitution}`) sont générées depuis `bareme_supervision.csv` en croisant la classe du dossier (`dossier.classe`) et la fréquence de revue (`frequence_revue.csv`). Tout changement de `classe` recalcule les lignes non encore consommées ; les lignes dont `consomme = true` ne sont **jamais** réécrites (elles restent au barème historique, un delta est ajouté si besoin). |
| **RG-37** | L'entretien de restitution est budgété **dossier par dossier**, sans mutualisation. Chaque entité juridique a ses propres comptes annuels et sa propre restitution, même quand plusieurs dossiers appartiennent au même dirigeant. Aucun mécanisme de groupe à implémenter. **Décision arrêtée par l'expert-comptable, à ne pas réinterpréter.** |
| **RG-38** | Le budget valorisé d'une mission est calculé par la formule : `somme sur budget_ligne de (minutes / 60 × taux_horaire_cible du grade)`. Le taux horaire cible est lu dans `taux_grade.csv`, jamais recalculé à la volée depuis les temps réalisés. |
| **RG-39** | Le budget de supervision **s'ajoute** au budget existant, il ne s'y substitue pas. Interdiction, à la génération comme à la modification manuelle, de réduire la part collaborateur (`grade ∈ {junior, medior, senior}`) pour maintenir un total inchangé. La règle est appliquée en base (trigger ou vérification applicative bloquante) et journalisée à toute tentative. |
| **RG-40** | Les alertes de dépassement de budget (RG-19, seuil 80 %) sont **désactivées par défaut** et ne sont réactivées qu'une fois la supervision intégrée sur **l'ensemble** du portefeuille. Un indicateur booléen global `supervision_generalisee` (paramètre cabinet) commande la réactivation. Tant qu'il est faux, RG-19 est neutralisée pour éviter des alertes massives et non pertinentes pendant la phase de transition. |
| **RG-41** | Le budget de production est valorisé au **taux du niveau requis**, jamais au taux de l'intervenant réellement affecté. Le niveau requis se déduit du niveau de complexité du dossier : `faible → junior`, `moyenne → medior`, `elevee → senior`. Valoriser au taux réel produirait un effet pervers : confier un dossier complexe à un junior améliorerait la marge affichée même s'il y passe deux fois plus de temps. Le champ `dossier.niveau_requis` est dérivé, jamais saisi. |
| **RG-42** | **Double valorisation.** Le budget est valorisé au niveau requis (RG-41), le réalisé est valorisé au grade effectif de chaque intervenant. L'écart entre les deux valorisations constitue l'**indicateur d'adéquation d'affectation**, distinct de l'écart de temps (temps_realise − temps_budget). Les deux écarts sont restitués séparément dans les vues de rentabilité, jamais fusionnés. |
| **RG-43** | Le **grade** (`junior`, `medior`, `senior`, `chef_mission`, `expert_comptable`) est distinct du **rôle applicatif** (§ 9). Le grade sert exclusivement à la valorisation ; les trois grades de collaborateur (`junior`, `medior`, `senior`) ont des habilitations identiques (rôle `collaborateur`). Champ `utilisateur.grade`, à ne pas confondre avec `utilisateur.role`. Aucun droit d'accès ne doit être conditionné par le grade. |

### 14.4 Articulation avec les lots

Le lot 1 (socle de production) crée les tables `dossier` et `mission` étendue, et **prévoit dès à présent** les champs `utilisateur.grade` et `dossier.niveau_requis` pour éviter une migration lourde ultérieure. La table `budget_ligne`, le générateur de supervision et la double valorisation sont livrés au **lot 3**, en même temps que la refonte des temps et de la rentabilité.

> **Point critique.** RG-40 est une garantie de survie : activer des alertes de dépassement avant que la supervision ne soit budgétée sur tout le portefeuille reviendrait à noyer les chefs de mission d'alertes légitimes mais impossibles à traiter. Le déblocage doit être une décision explicite de l'expert-comptable, tracée au journal d'audit.
