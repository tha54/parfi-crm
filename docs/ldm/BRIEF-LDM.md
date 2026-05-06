# Brief — Module Lettre de Mission (LDM) — v2

> **Version** : 2.0 (mise à jour après cartographie clauses + délécranisation Pennylane → Tiime)
> **Destiné à** : Claude Code
> **Auteur fonctionnel** : Thierry (associé Parfi France, expert-comptable)
> **Co-conception technique** : Claude (chat)
> **Stack cible** : React + tRPC + Prisma + MySQL
> **Périmètre** : logique métier backend uniquement (modèle de données + services + routes tRPC)
> **Hors périmètre** : génération PDF, UI React, bibliothèque de clauses (rédigée en parallèle), signature électronique

---

## 1. Contexte

Le CRM Parfi France dispose déjà d'un module **Devis** modélisé sur RCA Lettre de Mission. Une fois un devis accepté par le client, il doit être transformé en **Lettre de Mission (LDM)** OEC-compliant.

Le cabinet utilise **Tiime** comme logiciel de production comptable (pas Pennylane comme dans certains modèles de référence du marché). La LDM doit refléter cette réalité.

L'équipe Parfi France compte 11 collaborateurs avec 4 profils : expert (180€/h), chef de mission (120€/h), collaborateur (75€/h), assistant (45€/h). Le calcul des honoraires LDM s'appuie sur ces taux (mission-sizing).

---

## 2. Décisions arbitrées

**16 décisions, à respecter sans remise en cause sans validation explicite.**

| # | Décision | Rationale |
|---|---|---|
| D1 | Workflow hybride : pré-remplissage auto au passage `Devis = ACCEPTE` + validation humaine obligatoire avant envoi | Sécurité contractuelle |
| D2 | Snapshot client + cabinet au moment de la génération | Cohérence à la date de signature |
| D3 | Verrouillage du devis dès création d'une LDM (devis en lecture seule) | Évite incohérences ; toute modif → avenant |
| D4 | Architecture modulaire : tronc commun + clauses par mission | Conforme RCA/OEC |
| D5 | Bibliothèque OEC standard, peu éditable | Conformité, indépendance au jugement individuel |
| D6 | Pas de contrainte 4-yeux : un associé peut valider sa propre LDM | Équipe de 11, contrainte trop lourde |
| D7 | Snapshot des clauses figé avec version source | LDM existantes inchangées si la bibliothèque évolue |
| D8 | Audit trail systématique par événement à chaque transition | Conformité OEC |
| D9 | Idempotence de `genererDepuisDevis` : 2 appels = même LDM | Robustesse retries / double-clics |
| D10 | Signature électronique hors scope cette itération (upload manuel du PDF signé) | Itération suivante |
| **D11** | **Suppression de la grille tarifaire fixe** (paie 60€, AG 350€, etc.). Tout passe par mission-sizing Parfi (heures × taux profil) | Cohérence avec le CRM Parfi existant |
| **D12** | **Sous-traitants RGPD limités à TIIME SOFTWARE + AWS EMEA (via Tiime)** | Réalité du stack Parfi |
| **D13** | **Recueil du besoin structuré** avec 4 catégories prédéfinies : activité, effectif, enjeux, contraintes | Saisie guidée |
| **D14** | **Tribunal compétent : Tribunal de commerce de Briey** | Compétence territoriale Longwy |
| **D15** | **Modalité de paiement : prélèvement SEPA imposé** | Discipline financière, alignement modèle de référence |
| **D16** | **Modèle `Cabinet` à créer** (RC pro, tribunal, sous-traitants RGPD, outils) | Sortir des données en dur |

---

## 3. Architecture documentaire de la LDM

**Refonte importante par rapport au modèle de référence V1.4** : les honoraires remontent dans le corps contractuel (conditions particulières) au lieu d'être en annexe. Les annexes sont réduites à 2.

### Structure cible

```
I. CONDITIONS PARTICULIÈRES (corps contractuel)
   1. Préambule et identification des parties
   2. Recueil du besoin (NOUVEAU - 4 catégories : activité, effectif, enjeux, contraintes)
   3. Proposition (avec sous-blocs par mission retenue : tenue, comptes, fiscal, social, etc.)
   4. Honoraires (mission-sizing Parfi détaillé)
   5. Durée et renouvellement (tacite reconduction, dénonciation 3 mois avant clôture)
   6. Modalités d'exécution (Tiime mentionné, pas Pennylane)
   7. Documentation contractuelle (hiérarchie : Corps > Annexe 1 > Annexe 2 > CG)
   8. Signature

II. CONDITIONS GÉNÉRALES (16 articles repris du modèle V1.4, délécranisés)

III. ANNEXES (2 seulement)
   - Annexe 1 : Tableau de répartition des tâches
   - Annexe 2 : RGPD / Traitements des données personnelles
```

**Référence détaillée** : voir `CARTOGRAPHIE-CLAUSES.md` joint, qui liste les 31 codes de clauses identifiés avec leur catégorie et leurs conditions d'activation.

---

## 4. Workflow cible

```
Devis ACCEPTE
     │ (auto via event ou bouton manuel "Générer la LDM")
     ▼
LDM créée en statut BROUILLON
     │ - Snapshot client + cabinet figé
     │ - Snapshot des clauses applicables figé (avec version source)
     │ - Recueil du besoin pré-rempli vide (à saisir lors de la relecture)
     │ - Échéancier de facturation calculé (mensuel par défaut, prélèvement SEPA)
     │ - Devis verrouillé (lecture seule)
     │ - Événement CREATION enregistré
     ▼
A_VALIDER (collaborateur ou associé soumet — après saisie du recueil du besoin)
     ▼
VALIDEE_INTERNE (associé valide — peut être lui-même le créateur, D6)
     ▼
ENVOYEE (associé déclenche l'envoi, upload du PDF non signé)
     ▼
SIGNEE (upload du PDF signé par le client + date de signature)
     ▼
ACTIVE (activation automatique après signature)
     │
     ├──► RESILIEE (avant terme, motif obligatoire ≥10 caractères)
     └──► ECHUE (arrivée à terme sans renouvellement)

Branche d'erreur : depuis BROUILLON, A_VALIDER, VALIDEE_INTERNE ou ENVOYEE,
on peut rollback en BROUILLON pour corriger, ou ANNULER (déverrouille le devis).
```

---

## 5. Modèle de données Prisma

### 5.1 Nouveau modèle `Cabinet`

Fichier de référence : `prisma/schema-cabinet.prisma` (joint).

**Champs clés** :
- Identification juridique (denomination, formeJuridique, siren, rcs, codeAPE, numeroTVA)
- Coordonnées (adresse, codePostal, ville, telephone, email)
- Inscription ordinale (numeroInscriptionOEC, conseilRegionalOEC)
- `rcProfessionnelle Json` : `{ compagnie, numeroPolice, montantGarantie, dateRenouvellement }`
- `tribunalCompetent String` : `"Tribunal de commerce de Briey"` pour Parfi
- `sousTraitantsRGPD Json` : liste des sous-traitants pour clause `AN-02-RGPD-SOUS-TRAITANTS`
- `outilsProduction Json` : liste des outils mentionnés en CG art. 5
- `estParDefaut Boolean` : un seul cabinet par défaut (pour future multi-cabinets Parfi Group)

**Seed Parfi à appliquer après migration** : voir `schema-cabinet.prisma`. Les sous-traitants RGPD réels sont déjà renseignés (TIIME SOFTWARE SAS 823811278 + AWS EMEA SARL B186284). Les autres champs (SIREN Parfi, RC pro, numéro OEC) sont à compléter avec Thierry — laisser des placeholders explicites.

### 5.2 Modèle `LettreDeMission` (existant à enrichir)

Le schéma de référence est dans `prisma/schema-ldm.prisma`. **Modifications par rapport à la v1** :

1. **Ajouter** `recueilBesoinJson Json?` :
   ```typescript
   {
     activite: string,    // description activité, secteur, code APE/NAF
     effectif: string,    // nombre salariés, statuts, conventions collectives
     enjeux: string,      // problématiques identifiées, projets, échéances
     contraintes: string  // régime fiscal, particularités sectorielles
   }
   ```
   Pré-rempli vide à la génération, complété pendant la phase BROUILLON. Vérification de remplissage au passage en `A_VALIDER`.

2. **Ajouter** `tableauRepartitionJson Json?` :
   Lignes du tableau de répartition des tâches activées selon les missions retenues. Format à définir mais probablement un tableau de `{ ligneCode, libelle, cabinet: bool, client: bool, autres: bool, periodicite: string }`.

3. **Ajouter relation** vers `Cabinet` :
   ```prisma
   cabinetId String
   cabinet   Cabinet @relation(fields: [cabinetId], references: [id])
   ```
   Le snapshot cabinet existant (`snapshotCabinetDenomination`, etc.) est conservé pour figer les données à la signature, mais on garde aussi un lien vers le cabinet vivant pour les rapports/recherches.

4. **Enrichir `LdmMission`** avec le détail mission-sizing :
   ```prisma
   nombreHeuresParProfil Json  // { EXPERT: 5, CHEF_DE_MISSION: 20, COLLABORATEUR: 80, ASSISTANT: 0 }
   tauxParProfil         Json  // { EXPERT: 180, CHEF_DE_MISSION: 120, COLLABORATEUR: 75, ASSISTANT: 45 }
   ```
   Permet de régénérer le détail honoraires dans le PDF.

### 5.3 Modèles inchangés depuis la v1

- `LdmClauseSnapshot` (snapshot des clauses appliquées avec version source)
- `LdmEcheanceFacturation`
- `LdmEvenement`
- `BibliothequeClause` (le seed sera fourni séparément, en parallèle)

### 5.4 Enums

Inchangés depuis la v1 : `LdmStatut`, `LdmDureeType`, `LdmEvenementType`, `ClauseCategorie`.

### 5.5 Modifications sur les modèles existants

- `Devis` : ajouter `verrouille Boolean @default(false)` et `ldmGenereeId String?`
- `User` : ajouter relations inverses LDM si pas déjà présentes

---

## 6. Services à implémenter

### 6.1 `LdmTransformationService`
Fichier : `src/services/ldm-transformation.service.ts`
Référence v1 jointe (à adapter aux modifications de la v2).

**Méthode** : `genererDepuisDevis(params)`

**Logique mise à jour pour la v2** :
1. Vérifier que le devis existe et est en statut `ACCEPTE`
2. Idempotence : si LDM existe déjà → retour
3. Récupérer le `Cabinet` par défaut (`estParDefaut: true`) — **plus de getCabinetInfo() en dur**
4. Sélectionner les clauses applicables depuis `BibliothequeClause` (logique inchangée)
5. Calculer dates et numéro
6. Transaction :
   - Créer la `LettreDeMission` avec snapshots client + cabinet
   - **Initialiser `recueilBesoinJson` à `{ activite: "", effectif: "", enjeux: "", contraintes: "" }`** (D13)
   - **Initialiser `tableauRepartitionJson` avec les lignes par défaut activées selon missions** (à raffiner)
   - Créer `LdmMission` avec le détail mission-sizing (D11) — `nombreHeuresParProfil` et `tauxParProfil` issus du devis
   - Créer `LdmClauseSnapshot`
   - Créer `LdmEcheanceFacturation` (mensuel, prélèvement SEPA — D15)
   - Créer événement CREATION
   - Verrouiller le devis

### 6.2 `LdmCycleVieService`
Fichier : `src/services/ldm-cycle-vie.service.ts`
Référence v1 jointe (déjà alignée avec D6, sans contrainte 4-yeux).

**Vérification supplémentaire pour `soumettreAValidation`** : le `recueilBesoinJson` doit être rempli (pas tous les champs vides).

---

## 7. Router tRPC

Fichier : `src/server/routers/ldm.router.ts`
Référence v1 jointe (à étendre).

**Endpoints à ajouter par rapport à la v1** :
- `mettreAJourRecueilBesoin` (mutation) : permet la saisie/mise à jour du recueil du besoin pendant la phase BROUILLON
- `mettreAJourTableauRepartition` (mutation) : ajustement des lignes du tableau de répartition
- `cabinetParDefaut` (query) : retourne le cabinet par défaut (utile pour le frontend)

---

## 8. Critères d'acceptation

- [ ] Migration Prisma générée (Cabinet + modifications LDM) et appliquée sans erreur
- [ ] Seed Cabinet Parfi inséré avec les sous-traitants RGPD réels (TIIME + AWS) ; placeholders explicites pour les données à compléter par Thierry
- [ ] `genererDepuisDevis` initialise correctement `recueilBesoinJson` à 4 chaînes vides
- [ ] `soumettreAValidation` refuse si le recueil du besoin n'est pas rempli (au moins un champ non vide ?)
- [ ] `LdmMission` créées avec `nombreHeuresParProfil` et `tauxParProfil` issus du devis
- [ ] Échéancier de facturation par défaut : mensuel, modalité = "Prélèvement SEPA"
- [ ] Idempotence vérifiée par test
- [ ] Verrouillage devis vérifié par test
- [ ] Tests unitaires sur les transitions interdites et rôles non autorisés
- [ ] Tests unitaires sur `mettreAJourRecueilBesoin` (mise à jour partielle ou complète)

---

## 9. Hors scope (briefs à venir)

- **Bibliothèque de clauses OEC** : 31 codes de clauses identifiés, contenu juridique en cours de rédaction par Thierry/Claude (en parallèle de Claude Code)
- Génération du PDF (composition + rendu)
- UI React de la page LDM (liste, détail, transitions, formulaire recueil du besoin)
- Hook event-driven : déclenchement auto de `genererDepuisDevis`
- Intégration signature électronique
- Module avenants et renouvellements

---

## 10. Questions à poser à l'humain AVANT de commencer

**Claude Code, ne commence pas à coder sans avoir obtenu réponse à ces points. Pose-les en une seule passe à Thierry.**

1. **Schéma Prisma existant** : peux-tu fournir le contenu actuel de `schema.prisma`, en particulier les modèles `Client`, `Devis`, `Mission`, `User`, `Honoraire` (ou équivalent), et toute table liée à la facturation et au mission-sizing ?

2. **Modèle de mission-sizing** : comment sont actuellement stockées les heures par profil dans le devis ? Y a-t-il déjà un modèle `Honoraire` ou `MissionSizing` qui contient le détail `EXPERT/CHEF_DE_MISSION/COLLABORATEUR/ASSISTANT` ? Si oui, comment s'appelle le champ ?

3. **Init tRPC** : où est défini `protectedProcedure` ? Quel est le contenu de `ctx.user` ? Le rôle utilisateur est-il déjà modélisé `COLLABORATEUR | ASSOCIE | ADMIN` ou autre ?

4. **Conventions du projet** : structure des dossiers, conventions de nommage (camelCase français comme dans la proposition, ou anglais ?), `cuid()` ou `uuid()`, fuseau horaire des `DateTime` ?

5. **Statut du devis** : quelle est la valeur exacte du statut « accepté » (`ACCEPTE`, `SIGNED`, `ACCEPTED`, `VALIDE`...) ? Le devis a-t-il déjà `dateAcceptation` ?

6. **Multi-cabinets** : aujourd'hui Parfi France est seul, mais Parfi Group à terme. Le modèle `Cabinet` proposé est-il OK avec un `estParDefaut` ou faut-il un mécanisme plus sophistiqué dès maintenant ?

7. **Données Parfi à seeder** : Thierry, peux-tu me transmettre directement (ou je les laisse en placeholders à compléter plus tard) :
   - SIREN Parfi France
   - RCS Briey numéro
   - Capital social
   - Adresse complète Longwy + téléphone + email
   - Numéro d'inscription au CROEC Grand Est
   - RC pro : compagnie, numéro de police, montant de garantie

8. **Tableau de répartition des tâches** : on l'a identifié comme un sous-chantier. Pour cette itération, est-ce qu'on stocke juste un `Json` libre dans `LettreDeMission.tableauRepartitionJson`, ou faut-il modéliser une table dédiée `LdmTacheRepartition` dès maintenant ? Recommandation : `Json` libre pour cette itération, table dédiée plus tard si besoin.

---

## 11. Livrables attendus

- `prisma/schema.prisma` : modèle `Cabinet` ajouté + modifications `LettreDeMission` et `LdmMission` + migration générée et appliquée
- Seed Cabinet Parfi avec sous-traitants RGPD réels (TIIME + AWS) et placeholders pour le reste
- `src/services/ldm-transformation.service.ts` (à jour avec D11, D13, D15, D16)
- `src/services/ldm-cycle-vie.service.ts` (vérification recueilBesoin au passage A_VALIDER)
- `src/server/routers/ldm.router.ts` (endpoints v2 inclus)
- Enregistrement du `ldmRouter` dans le router racine tRPC
- Tests unitaires des 2 services (au moins les cas critiques d'acceptation)
- Court README dans `src/services/` documentant l'usage

---

## 12. Pièces jointes (référence technique)

Ces fichiers sont des **propositions techniques de référence**, pas des livrables imposés. Claude Code peut s'en inspirer et les ajuster aux conventions réelles du projet :

- `prisma/schema-ldm.prisma` — modèle LDM v1 (à enrichir selon section 5.2)
- `prisma/schema-cabinet.prisma` — modèle Cabinet + seed Parfi pré-rempli
- `src/services/ldm-transformation.service.ts` — service v1 (à adapter selon section 6.1)
- `src/services/ldm-cycle-vie.service.ts` — service v1 (déjà aligné D6)
- `src/server/routers/ldm.router.ts` — router v1 (à enrichir selon section 7)
- `CARTOGRAPHIE-CLAUSES.md` — référence pour comprendre la structure documentaire et les codes de clauses qui seront seedés en parallèle
