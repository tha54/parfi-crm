-- Chantier 1 — Étape 2 · Commit 1 : Évolution du schéma clients + prospects
-- Auteur : Claude Code · Date : 2026-05-03
-- Exécuter D'ABORD sur parfi_test, valider, puis sur parfi.
-- Idempotent : toutes les instructions vérifient l'existence avant d'agir.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE clients
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colonnes nouvelles (infrastructure) — toutes NULL par défaut
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS periodicite_tva   ENUM('mensuelle','trimestrielle','annuelle','sans_objet') NULL AFTER regime_tva,
  ADD COLUMN IF NOT EXISTS presence_salaries TINYINT(1) NULL AFTER periodicite_tva,
  ADD COLUMN IF NOT EXISTS nb_salaries       SMALLINT NULL AFTER presence_salaries,
  ADD COLUMN IF NOT EXISTS nb_etablissements TINYINT UNSIGNED DEFAULT 1 AFTER nb_salaries,
  ADD COLUMN IF NOT EXISTS activite_type     ENUM('bic','bnc','immobilier','holding','autre') NULL AFTER nb_etablissements,
  ADD COLUMN IF NOT EXISTS convention_collective VARCHAR(150) NULL AFTER activite_type,
  ADD COLUMN IF NOT EXISTS migration_anomalie TEXT NULL AFTER convention_collective;

-- 2. Colonnes _legacy pour traçabilité (copie des anciennes avant altération)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS regime_fiscal_legacy  VARCHAR(50)  NULL AFTER migration_anomalie,
  ADD COLUMN IF NOT EXISTS regime_tva_legacy     VARCHAR(30)  NULL AFTER regime_fiscal_legacy,
  ADD COLUMN IF NOT EXISTS forme_juridique_legacy VARCHAR(100) NULL AFTER regime_tva_legacy;

-- 3. Copier les valeurs legacy AVANT de modifier les colonnes sources
UPDATE clients SET
  regime_fiscal_legacy   = regime_fiscal,
  regime_tva_legacy      = regime_tva,
  forme_juridique_legacy = forme_juridique
WHERE regime_fiscal_legacy IS NULL
  AND regime_tva_legacy IS NULL
  AND forme_juridique_legacy IS NULL;

-- 4. Vider les colonnes sources (nécessaire avant MODIFY vers ENUM restreint)
UPDATE clients SET regime_fiscal = NULL, regime_tva = NULL, forme_juridique = NULL;

-- 5. Modifier les colonnes vers les nouveaux ENUM
ALTER TABLE clients
  MODIFY COLUMN regime_fiscal   ENUM('IS','IR_BIC','IR_BNC','IR_translucide','micro_bic','micro_bnc') NULL,
  MODIFY COLUMN regime_tva      ENUM('reel_normal','reel_simplifie','franchise','hors_champ') NULL,
  MODIFY COLUMN forme_juridique ENUM(
    'SARL','SAS','SASU','EURL','EI','EIRL',
    'SCI','SCEA','SA','SELARL','SCCV','SCM',
    'SCP','SCA','SC','GIE','Association','Autre'
  ) NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE prospects
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Colonnes nouvelles
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS regime_fiscal     ENUM('IS','IR_BIC','IR_BNC','IR_translucide','micro_bic','micro_bnc') NULL AFTER forme_juridique,
  ADD COLUMN IF NOT EXISTS regime_tva        ENUM('reel_normal','reel_simplifie','franchise','hors_champ') NULL AFTER regime_fiscal,
  ADD COLUMN IF NOT EXISTS periodicite_tva   ENUM('mensuelle','trimestrielle','annuelle','sans_objet') NULL AFTER regime_tva,
  ADD COLUMN IF NOT EXISTS presence_salaries TINYINT(1) NULL AFTER periodicite_tva,
  ADD COLUMN IF NOT EXISTS nb_salaries       SMALLINT NULL AFTER presence_salaries,
  ADD COLUMN IF NOT EXISTS activite_type     ENUM('bic','bnc','immobilier','holding','autre') NULL AFTER nb_salaries,
  ADD COLUMN IF NOT EXISTS convention_collective VARCHAR(150) NULL AFTER activite_type,
  ADD COLUMN IF NOT EXISTS migration_anomalie TEXT NULL AFTER convention_collective,
  ADD COLUMN IF NOT EXISTS forme_juridique_legacy VARCHAR(100) NULL AFTER migration_anomalie;

-- 2. Copier forme_juridique legacy et normaliser
UPDATE prospects SET forme_juridique_legacy = forme_juridique WHERE forme_juridique IS NOT NULL AND forme_juridique_legacy IS NULL;
UPDATE prospects SET forme_juridique = NULL;

-- 3. Modifier forme_juridique vers le nouvel ENUM
ALTER TABLE prospects
  MODIFY COLUMN forme_juridique ENUM(
    'SARL','SAS','SASU','EURL','EI','EIRL',
    'SCI','SCEA','SA','SELARL','SCCV','SCM',
    'SCP','SCA','SC','GIE','Association','Autre'
  ) NULL;
