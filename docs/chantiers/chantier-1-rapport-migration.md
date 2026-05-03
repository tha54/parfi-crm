# Parfi CRM — Chantier 1 · Rapport de migration
> Généré le 2026-05-03 · Script : `chantier1-02-migrate-data.js`

---

## 1. Résumé exécutif

| Indicateur | Valeur |
|---|---|
| Total fiches traitées | 306 |
| Fiches migrées proprement | **154** (50,3 %) |
| Fiches avec anomalie | **152** (49,7 %) |
| Contrôles post-migration | ✅ 4/4 verts |

La migration révèle une dette de qualité attendue : ~50 % des fiches nécessitent une complétion manuelle, principalement due aux codes SCIC/SCIS (SCI sans précision IS/IR) et aux régimes fiscaux non renseignés.

---

## 2. Ventilation des anomalies (152 fiches)

| Type d'anomalie | Nb | Action requise |
|---|---|---|
| Incohérence TVA non_soumis (ISRS/BICRS + TVA legacy = non_soumis) | 50 | Préciser le régime TVA réel |
| SCI ambiguë — code SCIC/SCIS/SCMS, IS/IR non déterminable | 47 | Qualifier IS ou IR translucide |
| Régime fiscal non renseigné (NULL en base) | 42 | Saisir le régime fiscal |
| TVA trimestriel incohérent avec Réel simplifié | 4 | Confirmer annuelle ou corriger vers RN |
| BA hors périmètre cabinet (BARN) | 3 | Requalifier ou archiver |
| Autre (codes non reconnus) | 3 | Traitement au cas par cas |
| MICRO — micro-BIC ou micro-BNC non précisé | 2 | Préciser le type |
| Incohérence ISRN + TVA Simplifié | 1 | Corriger le régime TVA |

> Note : 1 fiche peut porter plusieurs anomalies concaténées dans le champ `migration_anomalie`.

---

## 3. État des champs après migration

### Forme juridique (clients)

| Valeur | Nb | Observation |
|---|---|---|
| SCI | 82 | Inclut les 47 SCIC/SCIS/SCMS décodés partiellement |
| SARL | 63 | — |
| SAS | 47 | — |
| EI | 46 | Mappé depuis 'Entreprise individuelle' |
| EURL | 17 | — |
| SASU | 15 | — |
| SA | 14 | — |
| NULL | 10 | Forme juridique non renseignée → à compléter |
| Autres (SCEA, EIRL, Association…) | 12 | — |
| Autre | 1 | 'Société de fait' → requalifiée + anomalie |

### Régime fiscal

| Valeur | Nb |
|---|---|
| IS | 164 |
| IR_BIC | 25 |
| IR_BNC | 24 |
| NULL | 93 |

### Régime TVA + Périodicité

| Régime TVA | Périodicité | Nb |
|---|---|---|
| NULL | NULL | 130 |
| reel_simplifie | annuelle | 101 |
| reel_normal | mensuelle | 36 |
| hors_champ | sans_objet | 21 |
| reel_normal | NULL | 17 |
| reel_normal | trimestrielle | 1 |

### Activité type

| Valeur | Nb |
|---|---|
| bic | 121 |
| immobilier | 99 |
| bnc | 36 |
| NULL | 28 |
| holding | 21 |
| autre | 1 |

---

## 4. Codes APE non reconnus dans la table de mapping

Un seul code non mappé parmi les 306 clients :

| Code APE | Libellé | Nb clients | Décision |
|---|---|---|---|
| `0121Z` | Culture de la vigne | 3 | **BA hors périmètre** — ces 3 clients ont aussi `BARN` comme code fiscal. À requalifier avec l'EC (archivage ou conversion). |

---

## 5. Variantes forme_juridique_legacy traitées

| Valeur legacy | Mapping appliqué | Nb |
|---|---|---|
| `Entreprise individuelle` | → `EI` | 46 |
| `Société de fait` | → `Autre` + anomalie | 1 |
| Valeurs conformes à l'ENUM (SARL, SCI, SAS…) | Direct | 249 |
| NULL | → NULL + anomalie | 10 |

---

## 6. Contrôles post-migration

| Contrôle | Résultat |
|---|---|
| Aucune incohérence regime_tva / periodicite_tva | ✅ 0 incohérence |
| Tous les legacy non-NULL → regime_fiscal rempli OU anomalie | ✅ 0 fuite |
| propres + anomalies = total | ✅ 154 + 152 = 306 |
| Aucun regime_fiscal renseigné avec periodicite_tva manquante (hors anomalie) | ✅ 0 cas |

---

## 7. Actions requises par les EC (priorisation suggérée)

1. **50 clients ISRS/BICRS + TVA non_soumis** : vérifier si ces clients sont réellement en franchise ou hors-champ. Probablement des erreurs de saisie anciennes.
2. **47 SCI ambiguës** : confirmer IS ou IR translucide pour chacune. Données visibles dans la page "Clients à compléter".
3. **42 régimes fiscaux NULL** : saisie manuelle, fiches les plus anciennes souvent concernées.
4. **3 dossiers BA (BARN + 0121Z)** : discussion avec l'EC pour archivage ou requalification.
