# Spécification d'implémentation — moteur de cotation, devis et lettres de mission (CRM Parfi)

Document destiné à l'implémentation. Il complète `modele-cotation.md` (le modèle métier)
et `SKILL.md` (les règles de rédaction). Stack cible : Express.js / MySQL / React.

---

## 1. Principe d'architecture

Une chaîne, quatre sorties, une seule source de vérité.

```
profil_dossier
   ↓ (moteur de dérivation)
lignes de tâches applicables  ──→ devis (cotation)
   ↓                          ──→ lettre de mission (textes + répartition)
   ↓                          ──→ plan de charge (tâches planifiées et affectées)
   └──────────────────────────→ budget par tâche, comparé aux temps réels
```

Règle non négociable : le devis et la lettre de mission ne recalculent rien. Ils lisent le
même jeu de lignes dérivées, figé par un instantané au moment de l'édition.

---

## 2. Modèle de données

### 2.1 Paramètres millésimés

```sql
CREATE TABLE parametre (
  code            VARCHAR(64)  NOT NULL,
  date_effet      DATE         NOT NULL,
  valeur_num      DECIMAL(12,4) NULL,
  valeur_texte    VARCHAR(255) NULL,
  commentaire     VARCHAR(255) NULL,
  PRIMARY KEY (code, date_effet)
);
```

Portée : taux horaires par niveau, cadences de saisie, prix unitaires (bulletin, ligne
d'écriture), seuils de régime, forfait de mise en place, taux d'indexation annuelle.
Aucune de ces valeurs n'apparaît ailleurs que dans cette table.

### 2.2 Profil de dossier

```sql
CREATE TABLE profil_dossier (
  dossier_id              INT PRIMARY KEY,
  forme_juridique         ENUM('EI','EURL','SARL','SAS','SASU','SNC','SCI','SCM','SCP','ASSO'),
  nature_activite         ENUM('BIC','BNC','BA','CIVILE_IMMO','AUTRE'),
  regime_benefice         ENUM('IR','IS'),
  regime_reel             ENUM('MICRO','REEL_SIMPLIFIE','REEL_NORMAL'),
  regime_tva              ENUM('NON_ASSUJETTI','FRANCHISE','REEL_SIMPLIFIE','RN_TRIMESTRIEL','RN_MENSUEL'),
  type_tva                ENUM('FACTURATION','ENCAISSEMENT'),
  dirigeant_type          ENUM('EXPLOITANT','GERANT_MAJORITAIRE','GERANT_MINORITAIRE','PRESIDENT','COGERANCE'),
  dirigeant_remunere      TINYINT(1),
  nb_dirigeants           SMALLINT,
  nb_salaries             SMALLINT,
  idcc                    VARCHAR(8),
  adhesion_oga            TINYINT(1),
  option_ecf              TINYINT(1),
  commissaire_aux_comptes TINYINT(1),
  operations_intracom     ENUM('AUCUNE','BIENS','SERVICES','LES_DEUX'),
  nb_etablissements       SMALLINT,
  nb_immobilisations      SMALLINT,
  premiere_annee          TINYINT(1),
  date_cloture            DATE,
  profil_accompagnement   ENUM('COMPLET','ALLEGE') DEFAULT 'COMPLET',
  particularites          JSON,
  statut_social_calcule   ENUM('TNS','ASSIMILE_SALARIE','AUCUN') -- dérivé, jamais saisi
);
```

`statut_social_calcule` est recalculé à chaque écriture du profil, jamais saisi à la main.
Le cas du gérant de SCI rémunéré reste en `AUCUN` avec un signalement à l'écran tant que
la position de principe du cabinet n'est pas arrêtée.

### 2.3 Volumétrie

```sql
CREATE TABLE volumetrie_journal (
  dossier_id            INT NOT NULL,
  journal               ENUM('ACHATS','VENTES','TRESORERIE','CAISSE','OD') NOT NULL,
  mode_tenue            ENUM('SUR_PIECES','SUR_RELEVE','SUR_BORDEREAU','SUR_MOUVEMENTS') NOT NULL,
  nb_pieces_mois        DECIMAL(8,2) NOT NULL DEFAULT 0,
  imputations_par_piece DECIMAL(6,2) NOT NULL DEFAULT 1,
  paiements_par_piece   DECIMAL(6,2) NOT NULL DEFAULT 1,
  exoneration_tva       TINYINT(1)   NOT NULL DEFAULT 0,
  lignes_calculees      INT          NOT NULL DEFAULT 0,
  lignes_forcees        INT          NULL,
  PRIMARY KEY (dossier_id, journal)
);

CREATE TABLE volumetrie_mouvement (
  dossier_id  INT NOT NULL,
  poste       ENUM('ECHEANCES_EMPRUNTS','COMPTE_EXPLOITANT','SERVICES_BANCAIRES',
                   'REGLEMENTS_CHARGES','ACOMPTES_SALAIRES','AUTRES') NOT NULL,
  nb_annuel   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (dossier_id, poste)
);
```

Formules (validées sur un dossier réel du cabinet).

**Achats et ventes** : 30 factures d'achats par mois, 2 imputations hors taxes, hors
exonération, donne bien 1 440 lignes par exercice.

```
lignes_annuelles = nb_pieces_mois × 12 × (1 + imputations_par_piece + (exoneration_tva ? 0 : 1))
```

soit une ligne de tiers, les imputations de charges ou de produits, et une ligne de TVA.

**Trésorerie** : le journal ne se compte pas en pièces mais en mouvements, chaque
mouvement pesant le même nombre de lignes que les autres journaux.

```
mouvements = (nb_pieces_mois[ACHATS] × 12 × paiements_par_piece[ACHATS])
           + echeances_emprunts
           + mvt_compte_exploitant
           + mvt_services_bancaires
           + mvt_reglements_charges
           + mvt_acomptes_salaires
           + autres_ecritures

lignes_annuelles = mouvements × lignes_par_mouvement   -- paramètre, valeur observée : 4
```

Vérification sur le même dossier : 360 règlements fournisseurs, quatre postes récurrents
de 12 mouvements et 200 autres écritures, soit 608 mouvements, donnent exactement les
2 432 lignes affichées. Le coefficient de 4 lignes par mouvement est une reconstitution et
non une donnée lue : il vit dans la table des paramètres, pas dans le code.

`lignes_forcees`, si renseignée, prime sur le calcul et trace une saisie manuelle.

**Calibrage recommandé.** Plutôt que de reprendre ce coefficient tel quel, le compter sur
les fichiers d'écritures comptables de vos propres dossiers : nombre réel de lignes par
journal rapporté au nombre de pièces et de mouvements, sur un échantillon représentatif.
C'est la même source que celle du moteur d'indicateurs, et cela remplace une hypothèse
héritée par une mesure.

### 2.4 Catalogue de tâches

```sql
CREATE TABLE tache_catalogue (
  code             VARCHAR(16) PRIMARY KEY,      -- aligné sur la nomenclature de suivi des temps
  libelle_interne  VARCHAR(160) NOT NULL,
  mission          ENUM('COMPTA','FISCAL','SOCIAL','JURIDIQUE','ACCOMPAGNEMENT') NOT NULL,
  mode_cotation    ENUM('TEMPS','VOLUME','LIGNE','FORFAIT_UNITAIRE') NOT NULL,
  code_cadence     VARCHAR(64) NULL,             -- → parametre (lignes/heure)
  code_prix_unite  VARCHAR(64) NULL,             -- → parametre (€/unité)
  temps_standard   SMALLINT NULL,                -- minutes, mode TEMPS
  periodicite      ENUM('MENSUEL','TRIMESTRIEL','ANNUEL','CLOTURE','DATE_LEGALE','PONCTUEL'),
  formule_quantite VARCHAR(255) NULL,            -- expression sur le profil
  declencheur      VARCHAR(500) NOT NULL,        -- expression booléenne sur le profil
  repartition      ENUM('CABINET','CLIENT','SANS_OBJET') DEFAULT 'CABINET',
  affichage        ENUM('INTERNE','CLIENT') NOT NULL,
  bloc_texte       VARCHAR(32) NULL,
  actif            TINYINT(1) DEFAULT 1,
  date_fin_validite DATE NULL                    -- élagage des dispositifs supprimés
);

CREATE TABLE tache_affectation (
  tache_code   VARCHAR(16) NOT NULL,
  niveau       ENUM('ASSISTANT','COLLABORATEUR','COLLAB_SOCIAL','CHEF_MISSION','EXPERT_COMPTABLE') NOT NULL,
  temps        SMALLINT NOT NULL,                -- minutes pour ce niveau
  PRIMARY KEY (tache_code, niveau)
);
```

Une prestation mobilisant plusieurs intervenants est **une** ligne de catalogue avec
plusieurs affectations. L'entretien de bilan est une tâche, avec une préparation et une
présence pour le chef de mission et pour l'expert-comptable.

### 2.5 Blocs de texte

```sql
CREATE TABLE bloc_texte (
  code        VARCHAR(32) PRIMARY KEY,
  mission     ENUM('COMPTA','FISCAL','SOCIAL','JURIDIQUE','ACCOMPAGNEMENT','NORMATIF'),
  condition   VARCHAR(500) NOT NULL DEFAULT '1', -- ex. statut_social = 'TNS'
  contenu     TEXT NOT NULL,
  ordre       SMALLINT NOT NULL,
  obligatoire TINYINT(1) DEFAULT 0               -- mentions normatives : toujours retenues
);
```

Les huit mentions normatives de la lettre de mission sont des blocs `obligatoire = 1`,
`condition = '1'`, hors du champ des variantes commerciales.

### 2.6 Instantané du devis

```sql
CREATE TABLE devis (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  dossier_id    INT NOT NULL,
  exercice      YEAR NOT NULL,
  statut        ENUM('BROUILLON','EMIS','ACCEPTE','REFUSE','CADUC'),
  profil_snapshot JSON NOT NULL,                 -- profil figé au moment de l'édition
  total_ht      DECIMAL(10,2),
  cree_le       DATETIME,
  ldm_id        INT NULL                          -- lettre de mission issue de ce devis
);

CREATE TABLE devis_ligne (
  devis_id     INT NOT NULL,
  tache_code   VARCHAR(16) NOT NULL,
  quantite     DECIMAL(10,2),
  temps_total  SMALLINT,
  montant_ht   DECIMAL(10,2),
  affichage    ENUM('INTERNE','CLIENT'),
  mission      VARCHAR(16),
  PRIMARY KEY (devis_id, tache_code)
);
```

La lettre de mission lit `devis_ligne`, elle ne relance jamais le moteur.

---

## 3. Moteur de dérivation

```
1. valider le profil (champs requis, cohérences impossibles)
2. calculer les variables dérivées (statut social, obligations)
3. calculer la volumétrie par journal
4. sélectionner les tâches : declencheur évalué sur le profil enrichi
   → aucune case à cocher ; la sélection manuelle n'est qu'un correctif tracé
5. calculer la quantité de chaque tâche (formule_quantite ou périodicité)
6. calculer temps et montant selon mode_cotation :
     TEMPS            : Σ affectations (temps × taux[niveau]) × quantité
     VOLUME           : quantité / cadence × taux[niveau]
     LIGNE            : quantité × prix_unitaire
     FORFAIT_UNITAIRE : quantité × prix_unitaire
7. appliquer forfait de mise en place, abonnements, remises
8. produire l'instantané : devis_ligne + blocs de texte retenus + tableau de répartition
```

Contrôles bloquants avant émission :
- une périodicité affichée en page tarifaire diverge du tableau de répartition ;
- une ligne affichée sans bloc de texte correspondant, ou l'inverse ;
- une mention normative obligatoire absente ;
- un montant total différent entre devis et lettre de mission.

---

## 4. Cas de test d'acceptation

| Cas | Profil | Attendu |
|---|---|---|
| 1 | EI, BIC réel simplifié, TVA réel simplifié, 1 salarié, exploitant TNS | pas de bulletin pour le dirigeant, module paie actif pour le salarié, pas d'assemblée générale, déclaration de résultat BIC, TVA annuelle avec acomptes |
| 2 | SAS, IS, TVA réel normal mensuel, président rémunéré, 0 salarié | module paie actif pour le seul président, 12 déclarations de TVA, acomptes IS, assemblée générale annuelle |
| 3 | SARL, IS, gérant majoritaire rémunéré, 3 salariés | pas de bulletin gérant, volet TNS côté fiscal, paie sur 3 salariés, assemblée générale |
| 4 | SCI, IS, sans salarié, sans exploitation | `profil_accompagnement = ALLEGE` proposé, entretien de bilan retiré, révision et supervision conservées, pas de module paie |
| 5 | Entité avec commissaire aux comptes | compte rendu de travaux au lieu de l'attestation dans tous les textes générés |
| 6 | Micro, TVA franchise en base | ni liasse ni déclaration de TVA, surveillance de seuil signalée |

Chaque cas produit un devis et une lettre de mission comparés à un attendu figé (test de
non-régression sur le texte et sur le montant).

---

## 5. Phasage

**Lot 1 — le socle de calcul.** Tables paramètres, profil, volumétrie, catalogue,
affectations. Moteur de dérivation et de cotation. Écran de saisie du profil avec
assistant de volumétrie. Sortie : un devis chiffré, sans document.

**Lot 2 — les documents.** Blocs de texte, assemblage de la lettre de mission selon
`SKILL.md`, tableau de répartition dérivé, contrôles bloquants, génération PDF à la
maquette en sept pages du cabinet.

**Lot 3 — la boucle.** Génération des tâches planifiées et affectées à partir des lignes
du devis, budget par tâche, rapprochement avec les temps réels, écarts par dossier et par
tâche, proposition de révision des standards et des honoraires à l'échéance.

**Lot 4 — l'écran d'administration.** Paramétrage du catalogue et des tarifs depuis
l'interface, sans intervention en base.

---

## 6. Migration du catalogue existant

1. Extraire le catalogue actuel du module devis et le rapprocher de la nomenclature de
   suivi des temps, code par code.
2. Marquer `actif = 0` sur les lignes non utilisées depuis deux exercices et sur les
   dispositifs supprimés ou fusionnés.
3. Fusionner les lignes décomposées par intervenant en une tâche à plusieurs affectations.
4. Renseigner `declencheur` sur les lignes conservées : c'est le travail le plus long, et
   celui qui conditionne tout le reste.
5. Calibrer `temps_standard` et les cadences sur les temps réels, par médiane et par
   tranche de volumétrie.

Cible : quarante à soixante tâches vivantes.

---

## 7. Ce qui reste à décider avant le lot 1

- Liste fermée des cas ouvrant droit au profil d'accompagnement allégé.
- Position du cabinet sur le gérant de SCI rémunéré.
- Maintien ou abandon d'une cotation à la ligne cumulée avec la cotation au volume sur les
  mêmes journaux.
- Niveaux d'intervenant retenus : cinq proposés, à confirmer par rapport à la réalité des
  affectations du cabinet.
