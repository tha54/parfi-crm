# Cartographie des clauses — Lettre de Mission Parfi France

> Version 0.1 — Issue de la décomposition du modèle V1.4 + décisions Thierry
> Document de travail destiné à devenir le seed `BibliothequeClause`

## Conventions de codage

Format des codes de clause : `XX-NN-LIBELLE`
- `XX` = catégorie : `CP` (Conditions Particulières), `CG` (Conditions Générales), `AN` (Annexe)
- `NN` = numéro d'ordre dans la catégorie (sur 2 chiffres)
- `LIBELLE` = identifiant lisible (kebab-case, sans accents)

Exemples : `CP-01-PREAMBULE`, `CG-08-RESPONSABILITE`, `AN-02-RGPD-PRINCIPES`

## Légende des colonnes

- **Code** : identifiant stable de la clause (clé `BibliothequeClause.code`)
- **Catégorie Prisma** : valeur de l'enum `ClauseCategorie`
- **Activation** : `OBLIGATOIRE` (toujours incluse) ou condition logique
- **Source V1.4** : référence dans le modèle d'origine (`-` si nouveau)
- **Action** : `REPRENDRE` / `ADAPTER` / `RÉÉCRIRE` / `NOUVEAU` / `SUPPRIMER`

---

## I. CONDITIONS PARTICULIÈRES

Le **corps contractuel** de la LDM. Document signé qui prévaut sur les CG et annexes.

| Code | Titre | Catégorie Prisma | Activation | Source V1.4 | Action |
|---|---|---|---|---|---|
| `CP-01-PREAMBULE` | Préambule et identification des parties | TRONC_COMMUN | OBLIGATOIRE | En-tête + formule d'accueil | REPRENDRE |
| `CP-02-RECUEIL-BESOIN` | Recueil du besoin et compréhension de la situation | TRONC_COMMUN | OBLIGATOIRE | — | NOUVEAU |
| `CP-03-PROPOSITION-INTRO` | Proposition de mission — paragraphe d'introduction | TRONC_COMMUN | OBLIGATOIRE | Article 1 (chapeau) | ADAPTER |
| `CP-03A-MISSION-TENUE` | Mission de tenue comptable | MISSION_TENUE | si missionTypes contient TENUE | Article 1 (sous-bloc tenue) | ADAPTER |
| `CP-03B-MISSION-COMPTES` | Mission d'établissement des comptes annuels | MISSION_REVISION | si missionTypes contient REVISION | Article 1 (sous-bloc comptes) | ADAPTER |
| `CP-03C-MISSION-FISCAL` | Mission de déclarations fiscales | MISSION_FISCAL | si missionTypes contient FISCAL | Article 1 (sous-bloc fiscalité) | ADAPTER |
| `CP-03D-MISSION-SOCIAL` | Mission sociale et paie | MISSION_SOCIAL | si missionTypes contient SOCIAL | — (absent du V1.4 en tant que clause, présent dans annexe 3) | NOUVEAU |
| `CP-03E-MISSION-JURIDIQUE` | Mission de secrétariat juridique | MISSION_JURIDIQUE | si missionTypes contient JURIDIQUE | — | NOUVEAU |
| `CP-03F-MISSION-CONSEIL` | Mission de conseil | MISSION_CONSEIL | si missionTypes contient CONSEIL | — | NOUVEAU |
| `CP-03G-MISSION-AUDIT` | Mission d'audit contractuel | MISSION_AUDIT | si missionTypes contient AUDIT | — | NOUVEAU |
| `CP-04-HONORAIRES` | Honoraires et modalités de calcul | TRONC_COMMUN | OBLIGATOIRE | Annexe 1 (refondue) | RÉÉCRIRE |
| `CP-05-DUREE` | Durée et renouvellement | TRONC_COMMUN | OBLIGATOIRE | Article 2 | REPRENDRE |
| `CP-06-EXECUTION` | Modalités d'exécution | TRONC_COMMUN | OBLIGATOIRE | Article 3 | ADAPTER (délécraniser Pennylane → Tiime) |
| `CP-07-DOCUMENTATION` | Documentation contractuelle | TRONC_COMMUN | OBLIGATOIRE | Article 4 | ADAPTER (nouvelle hiérarchie : 5 → 3 documents) |
| `CP-08-SIGNATURE` | Bloc signature et reconnaissance contractuelle | TRONC_COMMUN | OBLIGATOIRE | Bloc signature + Getaccept | ADAPTER (signature manuscrite ou électronique générique) |

### Notes sur `CP-02-RECUEIL-BESOIN`

Décision D13 : recueil structuré avec catégories prédéfinies. Le contenu de la clause sera donc un **gabarit avec sections à remplir** plutôt qu'une zone de texte libre. Sections proposées :

- **Activité** : description de l'activité, secteur, code APE/NAF, marchés
- **Effectif** : nombre de salariés, statuts, conventions collectives applicables
- **Enjeux** : problématiques identifiées, projets en cours, échéances
- **Contraintes** : régime fiscal, particularités sectorielles, exigences spécifiques

Côté implémentation, ce sera un champ texte enrichi dans `LettreDeMission` (par ex. `recueilBesoinJson` Json) plutôt qu'une clause de bibliothèque pure — la trame est dans la bibliothèque, le contenu est saisi par mission.

### Notes sur `CP-04-HONORAIRES`

Décision D11 : pas de grille fixe. Le contenu de la clause type :

```
Les honoraires de la Mission sont fixés au forfait annuel, sur la base d'une
estimation du temps requis par profil de collaborateur intervenant :

- Mission [libellé] : [X] heures × [taux] € HT = [montant] € HT
- (...)

Total annuel HT : [somme] €
TVA ([taux]%) : [montant] €
Total TTC : [montant] €

Modalité de facturation : [mensualisation / trimestrialisation / autre]
Modalité de règlement : [prélèvement SEPA / virement à 30 jours / autre]

Révision annuelle : à chaque renouvellement de l'exercice comptable, les
honoraires font l'objet d'une négociation entre les parties, prenant en
compte l'évolution réelle du temps passé, l'évolution du périmètre de la
Mission, et l'évolution des taux de facturation du Cabinet.

Dépassement de budget : si le temps réellement passé dépasse de plus de
[X]% l'estimation initiale, le Cabinet en informe le Client et propose
un avenant.
```

C'est une trame substituée à la génération avec les données du `mission-sizing`.

---

## II. CONDITIONS GÉNÉRALES

Les 16 articles du modèle V1.4, dans leur grande majorité repris tels quels.

| Code | Titre | Catégorie | Activation | Source V1.4 | Action |
|---|---|---|---|---|---|
| `CG-01-DOMAINE` | Domaine d'application | TRONC_COMMUN | OBLIGATOIRE | CG art. 1 | REPRENDRE |
| `CG-02-DEFINITION-MISSION` | Définition de la Mission | TRONC_COMMUN | OBLIGATOIRE | CG art. 2 | REPRENDRE |
| `CG-03-OBLIGATIONS-CABINET` | Obligations du Cabinet | TRONC_COMMUN | OBLIGATOIRE | CG art. 3 | REPRENDRE (références déontologie OEC + LCB-FT) |
| `CG-04-OBLIGATIONS-CLIENT` | Obligations du Client | TRONC_COMMUN | OBLIGATOIRE | CG art. 4 | REPRENDRE |
| `CG-05-OUTILS` | Outils utilisés par le Cabinet | TRONC_COMMUN | OBLIGATOIRE | CG art. 5 (Pennylane) | RÉÉCRIRE (Tiime usage interne, pas de souscription client requise) |
| `CG-06-DONNEES` | Données comptables et droits associés | TRONC_COMMUN | OBLIGATOIRE | CG art. 6 | REPRENDRE (suppression mention « Données de Paiement » spécifique Pennylane) |
| `CG-07-PAIEMENT` | Modalités de paiement | TRONC_COMMUN | OBLIGATOIRE | CG art. 7 | ADAPTER (généraliser : prélèvement SEPA OU virement, pas obligatoire prélèvement) |
| `CG-08-RESPONSABILITE` | Assurance et responsabilité | TRONC_COMMUN | OBLIGATOIRE | CG art. 8 | ADAPTER (renseigner la RC pro Parfi, supprimer alinéas chaîne paiement Pennylane) |
| `CG-09-RESILIATION` | Résiliation de la mission | TRONC_COMMUN | OBLIGATOIRE | CG art. 9 | ADAPTER (supprimer alinéa Pennylane sur justificatifs après le 10 du mois) |
| `CG-10-FORCE-MAJEURE` | Force majeure | TRONC_COMMUN | OBLIGATOIRE | CG art. 10 | REPRENDRE |
| `CG-11-DONNEES-PERSO` | Données personnelles (renvoi annexe) | TRONC_COMMUN | OBLIGATOIRE | CG art. 11 | REPRENDRE |
| `CG-12-PUBLICITE` | Publicité (utilisation nom et logo client) | TRONC_COMMUN | OBLIGATOIRE | CG art. 12 | REPRENDRE |
| `CG-13-NULLITE` | Nullité partielle | TRONC_COMMUN | OBLIGATOIRE | CG art. 13 | REPRENDRE |
| `CG-14-INTEGRALITE` | Intégralité du contrat et hiérarchie | TRONC_COMMUN | OBLIGATOIRE | CG art. 14 | ADAPTER (nouvelle hiérarchie documentaire) |
| `CG-15-INTERPRETATION` | Interprétation | TRONC_COMMUN | OBLIGATOIRE | CG art. 15 | REPRENDRE |
| `CG-16-LITIGES` | Réclamations, litiges et juridiction | TRONC_COMMUN | OBLIGATOIRE | CG art. 16 | ADAPTER (Tribunal de commerce de Briey ou Nancy à confirmer pour Longwy) |

### Notes sur les réécritures

**`CG-05-OUTILS`** — la version Pennylane oblige le client à souscrire un contrat REV. C'est sans objet pour Parfi : Tiime est l'outil interne du cabinet, le client n'a pas à souscrire. Proposition de réécriture :

```
Pour la réalisation de la Mission, le Cabinet a recours à des outils
professionnels dont notamment le logiciel Tiime, qui constitue son
environnement de production interne. Le Client n'est pas tenu de souscrire
à ces outils. Le Cabinet pourra mettre à disposition du Client des
interfaces de dépôt de pièces ou de consultation, dont l'usage sera
précisé par écrit le cas échéant.
```

**`CG-07-PAIEMENT`** — la version V1.4 impose le prélèvement automatique. Pour Parfi, il faut prévoir le prélèvement SEPA **et** le virement à échéance. À éclaircir avec toi : quelle est la modalité par défaut Parfi ?

**`CG-08-RESPONSABILITE`** — il faut renseigner la **RC professionnelle réelle** de Parfi (compagnie, montant de garantie). Donnée à m'apporter.

**`CG-16-LITIGES`** — le V1.4 mentionne « tribunal de commerce de [Paris] » entre crochets. Pour Parfi à Longwy, je propose **tribunal de commerce de Briey** (compétent territorialement) — à confirmer avec toi car ça peut aussi être Nancy selon la convention de prorogation que tu veux retenir.

---

## III. ANNEXES

| Code | Titre | Catégorie | Activation | Source V1.4 | Action |
|---|---|---|---|---|---|
| `AN-01-REPARTITION` | Tableau de répartition des tâches | ANNEXE | OBLIGATOIRE | Annexe 2 | ADAPTER (lignes activées selon missions) |
| `AN-02-RGPD-PRINCIPES` | RGPD — Principes généraux et responsabilités | ANNEXE | OBLIGATOIRE | Annexe 5 art. 1-2 | REPRENDRE |
| `AN-02-RGPD-OBLIGATIONS` | RGPD — Obligations Responsable et Sous-traitant | ANNEXE | OBLIGATOIRE | Annexe 5 art. 3-6 | REPRENDRE |
| `AN-02-RGPD-SOUS-TRAITANTS` | RGPD — Sous-traitants de second et troisième rang | ANNEXE | OBLIGATOIRE | Annexe 5 art. 7 | RÉÉCRIRE (D12 : Tiime + hébergeur Tiime uniquement) |
| `AN-02-RGPD-PERSONNES` | RGPD — Droits des personnes concernées | ANNEXE | OBLIGATOIRE | Annexe 5 art. 8-10 | REPRENDRE |
| `AN-02-RGPD-TRANSFERTS` | RGPD — Transferts hors UE et registre | ANNEXE | OBLIGATOIRE | Annexe 5 art. 11-13 | REPRENDRE |
| `AN-02-RGPD-VIOLATION` | RGPD — Violation, restitution, responsabilité | ANNEXE | OBLIGATOIRE | Annexe 5 art. 14-16 | REPRENDRE |
| `AN-02-RGPD-APPENDICE` | RGPD — Appendice détails du traitement | ANNEXE | OBLIGATOIRE | Annexe 5 Appendice 1 | REPRENDRE |

### Notes sur l'annexe 1 (répartition des tâches)

Le tableau de répartition n'est pas un texte fixe : c'est une **structure dynamique** dont les lignes sont activées selon les missions retenues.

Plutôt qu'une seule clause monolithique, je propose une **modélisation différente** : une table `LdmTacheRepartition` avec les lignes-types (organisation comptabilité, justification clients/fournisseurs, contrôle TVA, etc.) et les valeurs par défaut de répartition (Cabinet / Client / Autre intervenant). Au moment de la génération, on ne crée que les lignes pertinentes pour les missions retenues.

C'est un sujet à part entière qui mériterait sa propre modélisation — je peux te la livrer comme petit livrable séparé après.

### Notes sur `AN-02-RGPD-SOUS-TRAITANTS`

Réécriture nécessaire (D12). **Données collectées via les CGU et mentions légales officielles de Tiime Software** (15 rue Auber 75009 Paris, SIREN 823 811 278 RCS Paris) :

- **Sous-traitant de second rang** : TIIME SOFTWARE SAS — l'éditeur du logiciel utilisé par le Cabinet pour la production comptable.
- **Sous-traitant de troisième rang** : Amazon Web Services Europe SARL (AWS EMEA), siège social 38 avenue John F. Kennedy, 1855 Luxembourg — l'hébergeur de l'infrastructure Tiime. Engagement contractuel Tiime : tous les serveurs sont localisés en Union européenne, ce qui évite le recours aux Clauses Contractuelles Types pour transferts hors UE.

Trame de la clause :

```
Le Responsable de Traitement autorise d'ores et déjà le Sous-Traitant à
recourir aux Sous-Traitants de Second et Troisième Rang suivants :

À titre de Sous-Traitant de Second Rang :
- TIIME SOFTWARE, SAS au capital de 1 000 000 €, immatriculée au RCS
  de Paris sous le numéro 823 811 278, dont le siège social est situé
  15 rue Auber, 75009 Paris, en sa qualité d'éditeur et fournisseur du
  logiciel comptable utilisé par le Cabinet pour la réalisation de la
  Mission.

À titre de Sous-Traitant de Troisième Rang, par l'intermédiaire de
TIIME SOFTWARE :
- Amazon Web Services EMEA SARL, immatriculée au Registre de
  Commerce et des Sociétés du Luxembourg sous le numéro B186284,
  dont le siège social est situé 38 avenue John F. Kennedy,
  1855 Luxembourg, en qualité d'hébergeur de l'infrastructure du
  logiciel Tiime. L'ensemble des serveurs utilisés par TIIME SOFTWARE
  sont localisés en Union européenne.

Toute évolution de cette liste sera portée à la connaissance du
Responsable de Traitement dans les conditions prévues à l'article 7
ci-dessus.
```

Cette rédaction est défendable juridiquement : tous les sous-traitants sont identifiés, l'hébergement est UE, la chaîne contractuelle est documentée. Le seul risque résiduel est l'évolution future des sous-traitants Tiime (Tiime se réserve le droit d'en ajouter via mise à jour de leur politique de données personnelles) — la clause prévoit déjà la procédure d'information.

---

## IV. CHAMPS VARIABLES (à substituer à la génération)

Tous les `[● placeholder]` du modèle V1.4 et nouveaux placeholders. La substitution se fait à partir du snapshot client + cabinet + données mission.

| Placeholder | Source | Notes |
|---|---|---|
| `{{cabinet.denomination}}` | snapshotCabinetDenomination | « Parfi France » |
| `{{cabinet.adresse}}` | snapshotCabinetAdresse | adresse complète |
| `{{cabinet.siren}}` | snapshotCabinetSiren | |
| `{{cabinet.rcs}}` | snapshotCabinetRcs | |
| `{{cabinet.rcpro.compagnie}}` | nouveau champ Cabinet | compagnie d'assurance RC pro |
| `{{cabinet.rcpro.montant}}` | nouveau champ Cabinet | montant de garantie |
| `{{cabinet.tribunalCompetent}}` | config | tribunal de commerce de Briey ou Nancy |
| `{{client.denomination}}` | snapshotClientDenomination | |
| `{{client.siren}}` | snapshotClientSiren | |
| `{{client.formeJuridique}}` | snapshotClientFormeJuridique | |
| `{{client.adresse}}` | snapshotClientAdresse | |
| `{{client.representant.nom}}` | snapshotClientRepresentantNom | |
| `{{client.representant.qualite}}` | snapshotClientRepresentantQualite | |
| `{{ldm.datePriseEffet}}` | datePriseEffet | format `JJ/MM/AAAA` |
| `{{ldm.honoraires.total}}` | honorairesHTAnnuelTotal | |
| `{{ldm.honoraires.tva}}` | honorairesTVATaux | |
| `{{ldm.honoraires.modaliteFacturation}}` | modaliteFacturation | |
| `{{ldm.honoraires.modaliteReglement}}` | modaliteReglement | |
| `{{ldm.missions[*]}}` | LdmMission | itération sur les missions |
| `{{recueilBesoin.activite}}` | LettreDeMission.recueilBesoinJson.activite | nouveau (D13) |
| `{{recueilBesoin.effectif}}` | idem .effectif | nouveau (D13) |
| `{{recueilBesoin.enjeux}}` | idem .enjeux | nouveau (D13) |
| `{{recueilBesoin.contraintes}}` | idem .contraintes | nouveau (D13) |

---

## V. RÉCAPITULATIF DES IMPACTS SUR LE SCHÉMA PRISMA

Modifications à apporter au `schema-ldm.prisma` produit en début de session :

1. **Nouveau champ** `recueilBesoinJson Json?` sur `LettreDeMission` (D13)
2. **Nouveau champ** `tableauRepartitionJson Json?` sur `LettreDeMission` (lignes activées de l'annexe 1)
3. **Nouveau modèle** `Cabinet` (ou table de configuration) pour les infos Parfi : RC pro, tribunal compétent, sous-traitants RGPD, etc. — actuellement en dur dans `getCabinetInfo()`
4. **Honoraires détaillés par profil** : ajouter sur `LdmMission` les champs `nombreHeuresParProfil Json` (`{ EXPERT: 5, CHEF_DE_MISSION: 20, COLLABORATEUR: 80, ASSISTANT: 0 }`) pour permettre la régénération du détail mission-sizing dans le PDF

---

## VI. CE QUI EST PRÊT POUR LA RÉDACTION DU SEED

À l'issue de cette cartographie, on a 31 codes de clauses identifiés :
- 15 conditions particulières (dont 7 modules mission optionnels)
- 16 conditions générales (toutes obligatoires)
- 8 sous-clauses d'annexe RGPD + 1 annexe répartition tâches

### Décisions actées : 16 (D1 à D16)

### Données validées et collectées
- ✅ Tribunal compétent : Tribunal de commerce de Briey (D14)
- ✅ Modalité de paiement par défaut : prélèvement SEPA imposé (D15)
- ✅ Sous-traitant RGPD second rang : TIIME SOFTWARE SAS, SIREN 823 811 278, 15 rue Auber 75009 Paris
- ✅ Sous-traitant RGPD troisième rang : AWS EMEA SARL, B186284 Luxembourg, serveurs UE
- ✅ Modèle Cabinet créé (`schema-cabinet.prisma`)

### Données restantes à apporter par Thierry
1. **Données juridiques Parfi France** : SIREN, RCS Briey numéro, capital social, code APE, numéro TVA, adresse complète Longwy, téléphone, email
2. **Inscription OEC** : numéro d'inscription au Conseil régional Grand Est
3. **RC professionnelle Parfi** : compagnie d'assurance, numéro de police, montant de garantie (pour CG art. 8)
4. **Confirmation des sous-traitants** : à part Tiime + AWS, Parfi utilise-t-il d'autres outils traitant des données personnelles client ? (Pappers ne traite pas de données client à proprement parler — il sert à enrichir les données depuis registres publics, donc probablement hors scope RGPD)
