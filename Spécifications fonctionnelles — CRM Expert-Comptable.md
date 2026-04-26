# Spécifications fonctionnelles — CRM Expert-Comptable

**Version** : 6.1 — Avril 2026  
**Périmètre** : Application web hébergée sur `crmexpert-kbxuue9s.manus.space`  
**Stack technique** : React 19 + Tailwind 4 + tRPC 11 + Express 4 + MySQL (Drizzle ORM)

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Entités de données](#2-entités-de-données)
3. [Module Contacts & Clients](#3-module-contacts--clients)
4. [Module Pipeline commercial](#4-module-pipeline-commercial)
5. [Module Devis](#5-module-devis)
6. [Module Lettres de mission](#6-module-lettres-de-mission)
7. [Module Missions](#7-module-missions)
8. [Module Tâches](#8-module-tâches)
9. [Module Facturation](#9-module-facturation)
10. [Module Relances](#10-module-relances)
11. [Module Prélèvements SEPA](#11-module-prélèvements-sepa)
12. [Module GED / Documents](#12-module-ged--documents)
13. [Module Emails entrants](#13-module-emails-entrants)
14. [Module Rentabilité](#14-module-rentabilité)
15. [Module Charge de travail](#15-module-charge-de-travail)
16. [Module Portefeuille collaborateur](#16-module-portefeuille-collaborateur)
17. [Module Mon Espace](#17-module-mon-espace)
18. [Module Automatisations](#18-module-automatisations)
19. [Module Paramètres cabinet](#19-module-paramètres-cabinet)
20. [Module Administration](#20-module-administration)
21. [Tableau de bord](#21-tableau-de-bord)
22. [Flux automatisés transverses](#22-flux-automatisés-transverses)
23. [Règles anti-doublon et garde-fous](#23-règles-anti-doublon-et-garde-fous)
24. [Rôles et accès](#24-rôles-et-accès)

---

## 1. Architecture générale

Le CRM est une application monopage (SPA) avec un backend API REST/tRPC. Toutes les procédures backend sont protégées par authentification OAuth Manus (`protectedProcedure`). La base de données MySQL contient **28 tables** couvrant l'ensemble du cycle de vie d'un dossier client, de la prospection à la facturation encaissée.

Les flux principaux sont les suivants :

```
Prospect → Devis → Client
Client → Cotation → Lettre de mission
Lettre signée → Mission créée → Tâches générées → Plan de facturation
Email entrant → Tâche créée → Rattachement client/mission
Mission active → Saisie de temps → Rentabilité
Facture impayée → Relance automatique → Prélèvement SEPA
```

---

## 2. Entités de données

Le schéma de base de données comprend les tables suivantes :

| Table | Rôle |
|-------|------|
| `users` | Comptes utilisateurs (OAuth) |
| `intervenants` | Collaborateurs du cabinet (expert, chef de mission, collaborateur, assistant) |
| `contacts` | Prospects et clients (entité centrale) |
| `personnes_contact` | Contacts secondaires rattachés à un client |
| `opportunites` | Opportunités commerciales (pipeline) |
| `interactions` | Historique des échanges (appel, email, RDV, note) |
| `modele_missions` | Bibliothèque de modèles de missions OEC |
| `devis` | Propositions commerciales |
| `lignes_devis` | Lignes de devis |
| `missions` | Missions actives ou archivées |
| `taches_mission` | Tâches rattachées à une mission spécifique |
| `taches` | Tâches standalone (toutes origines) |
| `factures` | Factures émises |
| `lignes_facture` | Lignes de facturation |
| `paiements` | Encaissements enregistrés |
| `relances` | Historique des relances impayés |
| `config_relances_auto` | Règles de relance automatique par niveau |
| `lettres_mission` | Lettres de mission (LDM) |
| `clauses_bibliotheque` | Bibliothèque de clauses réutilisables |
| `parametres_cabinet` | Configuration du cabinet |
| `envois_email` | Historique des emails envoyés via Brevo |
| `emails_inbox` | Emails entrants ingérés |
| `saisies_temps` | Saisies de temps passé par mission |
| `prelevements_sepa` | Fichiers de prélèvement SEPA |
| `documents` | GED — fichiers stockés sur S3 |
| `pricing_simulations` | Simulations de cotation sauvegardées |
| `plan_facturation` | Plans d'échéances de facturation |
| `automation_rules` | Règles du moteur d'automatisation |
| `automation_logs` | Journal d'exécution des automatisations |

---

## 3. Module Contacts & Clients

### 3.1 Fiche contact

Chaque contact dispose des informations suivantes :

- **Identité** : raison sociale, forme juridique (SAS, SARL, EI, etc.), SIREN (unique en base), SIRET, code NAF, activité, adresse complète, téléphone, email, site web
- **Dirigeant** : nom, email, téléphone du dirigeant
- **Paramètres comptables** : régime fiscal (IS, IR-BIC, IR-BNC, IR-BA, TVA franchise, autre), régime comptable (réel normal, réel simplifié, micro, autre), chiffre d'affaires, nombre de salariés, nombre de bulletins de paie, présence TNS
- **Affectation** : intervenant responsable du dossier
- **Mandat SEPA** : IBAN, BIC, référence mandat, date de signature du mandat
- **Métadonnées** : source d'entrée, notes libres, tags JSON, numéro client (CLT-XXX), date de conversion en client, origine (prospect converti / création directe / import CSV)

Le type du contact est soit `prospect` soit `client`. La conversion prospect → client est déclenchée manuellement ou automatiquement lors de l'acceptation d'un devis.

### 3.2 Personnes de contact secondaires

Un client peut avoir plusieurs interlocuteurs (comptable interne, DRH, dirigeant adjoint). Chaque personne de contact dispose d'un nom, prénom, fonction, email, téléphone et d'un flag `principal`.

### 3.3 Actions disponibles

| Action | Déclencheur | Effet |
|--------|-------------|-------|
| Créer un client | Formulaire en 2 étapes (identité + comptable & fiscal) | INSERT avec vérification SIREN préalable |
| Recherche Pappers | Saisie du SIREN dans le formulaire | Pré-remplissage automatique des champs depuis l'API Pappers |
| Convertir un prospect | Bouton "Convertir en client" sur la fiche | `type` passe à `client`, `origineClient = prospect_converti` |
| Affecter en masse | Sélection multiple + bouton "Affecter" | Mise à jour de `intervenantId` sur N contacts |
| Import CSV | Upload d'un fichier CSV | Import en masse avec rapport (importés / ignorés / erreurs) |
| Export | Bouton "Exporter" | Export CSV de la liste filtrée |

### 3.4 Fiche client — cockpit

La fiche client (page `ContactDetail`) présente les onglets suivants :

- **Vue d'ensemble** : identité, coordonnées, paramètres comptables, intervenant affecté
- **Missions** : liste des missions actives et archivées avec statut, intervenant, temps budgété/passé
- **Facturation** : liste des factures avec statut, montant, échéance
- **Documents** : liste des documents GED rattachés
- **Interactions** : historique des échanges (appels, emails, RDV, notes)
- **Tâches** : liste des tâches en cours rattachées au client
- **Personnes de contact** : gestion des interlocuteurs secondaires

---

## 4. Module Pipeline commercial

Le pipeline suit les opportunités commerciales depuis la détection jusqu'à la conversion. Chaque opportunité est caractérisée par un statut (`nouveau`, `qualification`, `proposition`, `negociation`, `gagne`, `perdu`), un montant estimé, une probabilité de conversion, une date de clôture prévue et un intervenant responsable.

La page Pipeline affiche les statistiques globales (nombre d'opportunités par statut, montant total du pipeline, taux de conversion) et la liste des opportunités avec filtres par statut et par intervenant.

---

## 5. Module Devis

### 5.1 Cycle de vie

Un devis passe par les statuts suivants : `brouillon` → `envoye` → `accepte` / `refuse` / `expire`.

### 5.2 Contenu d'un devis

Chaque devis contient un numéro séquentiel (DEV-XXXX), un contact client, des lignes de devis (description, quantité, prix unitaire HT, remise en %, total HT), un total HT, un taux de TVA, un total TTC, une date d'émission et une date d'expiration.

### 5.3 Actions

| Action | Effet |
|--------|-------|
| `devis.create` | Crée un devis en brouillon avec numéro auto |
| `devis.update` | Met à jour les lignes et les métadonnées |
| `devis.createFromCotation` | Crée un devis pré-rempli depuis une simulation de cotation |
| `devis.createMissionFromDevis` | Convertit un devis accepté en mission |
| `devis.lignes` | Gestion des lignes (ajout, modification, suppression) |

---

## 6. Module Lettres de mission

### 6.1 Présentation

La lettre de mission (LDM) est le document contractuel central du cabinet. Elle est générée à partir d'un assistant en plusieurs étapes (wizard) et suit les modèles de l'Ordre des Experts-Comptables.

### 6.2 Cycle de vie

```
brouillon → envoyee → signee → archivee / resiliee
```

### 6.3 Contenu d'une LDM

| Bloc | Champs |
|------|--------|
| Identification | Numéro (LDM-XXXX), version, contact client, intervenant responsable |
| Type de mission | tenue_comptable, revision, etablissement_comptes, fiscal, social_paie, conseil, juridique, autre |
| Identification des parties | Nom, adresse, SIREN du cabinet ; coordonnées complètes du client |
| Objet de la mission | Description libre, tableau de répartition des tâches (JSON) |
| Honoraires | Montant HT, modalités de paiement, clause de révision, type de facturation (ponctuelle / mensuelle), mode de paiement |
| Plan de facturation | JSON structuré : `[{numero, dateEcheance, montantHT, statut}]` |
| Durée | Date de début, date de fin, tacite reconduction, durée de préavis |
| Clauses légales | Résiliation, RGPD, confidentialité, responsabilité, déontologie, clauses personnalisées |
| Signature | Signature client (base64), date de signature client ; signature cabinet, date de signature cabinet |
| Avenant | Référence à la LDM parente (`avenantDe`) |

### 6.4 Wizard de création

L'assistant de création de LDM guide l'utilisateur en plusieurs étapes :

1. Sélection du client et du type de mission
2. Saisie des informations des parties
3. Définition de l'objet de la mission et du tableau de répartition
4. Paramétrage des honoraires et du plan de facturation
5. Sélection et personnalisation des clauses légales
6. Prévisualisation et génération du PDF

### 6.5 Génération PDF

Le moteur de génération PDF produit un document conforme aux exigences de l'Ordre, avec mise en page professionnelle, logo du cabinet, clauses formatées et zones de signature.

### 6.6 Pipeline de signature (automatisation centrale)

Lorsqu'une LDM passe au statut `signee` (via `ldm.sign`), le pipeline suivant s'exécute automatiquement :

1. **Création de la mission** : si aucune mission n'est déjà liée (`missionId` null), une mission est créée avec les paramètres de la LDM (type, intervenant, temps budgété, honoraires)
2. **Génération des tâches** : les tâches standard du modèle de mission associé sont créées et affectées
3. **Génération du plan de facturation** : les échéances sont calculées selon la périodicité (mensuelle / ponctuelle) et le montant HT de la LDM
4. **Journalisation** : chaque étape est enregistrée dans `automation_logs` avec statut `success`, `skipped` ou `error`

**Garde-fous** : si une mission existe déjà pour cette LDM, l'étape est marquée `skipped` sans duplication. Si un plan de facturation existe déjà, il n'est pas recréé.

### 6.7 Autres actions

| Action | Description |
|--------|-------------|
| `ldm.sendLdm` | Envoi de la LDM par email au client via Brevo |
| `ldm.creerAvenant` | Crée un avenant en clonant la LDM signée avec incrémentation de version |
| `ldm.genererPlanFacturation` | Génère ou régénère le plan d'échéances |
| `ldm.creerFactures` | Crée les factures correspondant aux échéances du plan |
| `ldm.facturesLiees` | Liste les factures liées à la LDM |
| `ldm.historiqueVersions` | Historique des versions et avenants |
| `ldm.automationLogs` | Logs d'exécution du pipeline de signature |
| `ldm.missionLiee` | Récupère la mission créée depuis cette LDM |

---

## 7. Module Missions

### 7.1 Cycle de vie

```
en_cours → suspendue → terminee / archivee
```

### 7.2 Données d'une mission

| Champ | Description |
|-------|-------------|
| `contactId` | Client rattaché |
| `ldmId` | Lettre de mission d'origine |
| `modeleMissionId` | Modèle de mission utilisé |
| `typeMission` | Catégorie OEC (tenue comptable, fiscal, social, etc.) |
| `intervenantId` | Collaborateur responsable |
| `tempsBudgeteH` | Temps budgété total en heures |
| `honorairesBudgetes` | Honoraires budgétés en € HT |
| `avancement` | Pourcentage d'avancement (0-100) |
| `etatProduction` | ok / retard / bloqué |
| `emailThreadId` | Identifiant du fil email associé |

### 7.3 Tâches de mission (`taches_mission`)

Chaque mission dispose de tâches internes avec : nom, description, temps budgété, temps passé, prix de vente horaire, honoraires budgétés, statut (à faire / en cours / terminé / bloqué), priorité, échéance, intervenant affecté.

### 7.4 Saisie de temps

Les collaborateurs saisissent leurs temps passés par mission via `tempsPasses.create`. Chaque saisie enregistre la date, le nombre d'heures, l'intervenant, la mission et une description de l'activité. Le temps passé total est agrégé et comparé au temps budgété pour calculer le taux de rentabilité.

### 7.5 Cockpit de mission

La page `MissionDetail` présente :
- Indicateurs clés : temps budgété, temps passé, taux d'utilisation, honoraires budgétés, CA facturé, rentabilité
- Liste des tâches avec kanban ou vue liste
- Historique des saisies de temps
- Documents rattachés
- Factures liées
- Alertes de dépassement (temps passé > temps budgété)

### 7.6 Actions

| Action | Description |
|--------|-------------|
| `missions.generateTasksFromModele` | Génère les tâches standard depuis le modèle de mission |
| `missions.cockpit` | Données agrégées pour le cockpit (temps, rentabilité, alertes) |
| `missions.alertesRetard` | Liste des missions en retard ou bloquées |
| `missions.recalculerEtat` | Recalcule `etatProduction` selon les tâches et le temps |
| `missions.rentabiliteGlobale` | Taux de rentabilité global de toutes les missions |

---

## 8. Module Tâches

### 8.1 Présentation

Les tâches sont des unités de travail standalone, distinctes des tâches de mission. Elles peuvent être créées manuellement, générées depuis un modèle de mission, créées depuis un email entrant, ou issues d'une LDM signée.

### 8.2 Attributs d'une tâche

| Attribut | Valeurs possibles |
|----------|-------------------|
| `statut` | a_faire, en_cours, en_attente, en_attente_client, bloque, termine |
| `priorite` | basse, normale, haute, urgente |
| `origine` | manuelle, mission, email, echeance, ldm |
| `profilAffecte` | expert, chef_mission, collaborateur, assistant |
| `frequence` | unique, quotidienne, hebdomadaire, mensuelle, trimestrielle, annuelle |

### 8.3 Rattachements

Une tâche peut être rattachée à un contact (`contactId`), une mission (`missionId`) et un intervenant (`intervenantId`). Ces rattachements permettent de filtrer les tâches par client, par mission ou par collaborateur.

### 8.4 Vue kanban et vue liste

La page Tâches offre deux modes d'affichage :
- **Kanban** : colonnes par statut avec drag-and-drop
- **Liste** : tableau avec colonnes (titre, client, mission, priorité, échéance, intervenant, statut)

Les filtres disponibles sont : statut, priorité, intervenant, mission, client, origine.

### 8.5 Actions

| Action | Description |
|--------|-------------|
| `taches.create` | Crée une tâche avec rattachements |
| `taches.update` | Modifie les attributs d'une tâche |
| `taches.updateStatut` | Change le statut (avec motif de blocage si bloqué) |
| `taches.assign` | Affecte un intervenant |
| `taches.flagRelances` | Marque les tâches en retard pour relance |
| `taches.delete` | Supprime une tâche |

---

## 9. Module Facturation

### 9.1 Cycle de vie d'une facture

```
brouillon → envoyee → payee / partielle / retard / annulee
```

### 9.2 Données d'une facture

| Bloc | Champs |
|------|--------|
| Identification | Numéro séquentiel (FAC-XXXX), contact client, devis d'origine |
| Montants | Total HT, taux TVA (défaut 20%), total TVA, total TTC, montant payé |
| Dates | Date d'émission, date d'échéance, date de paiement |
| Récurrence | Flag récurrente, périodicité (mensuelle / trimestrielle / semestrielle / annuelle), prochaine échéance |
| Paiement | Mode (virement, chèque, CB, prélèvement, espèces), conditions de paiement |
| Comptabilité | Catégorie d'opération, option TVA sur débits, adresse de livraison, numéro de bon de commande |
| Relances | Nombre de relances, date de dernière relance |

### 9.3 Lignes de facture

Chaque ligne contient une description, une quantité, un prix unitaire HT, une remise en % et un total HT calculé.

### 9.4 Enregistrement des paiements

Les paiements sont enregistrés via `factures.addPaiement` avec montant, date et mode de paiement. Le statut de la facture est mis à jour automatiquement (`payee` si montant payé = total TTC, `partielle` sinon).

### 9.5 Plan de facturation (`plan_facturation`)

Un plan de facturation est associé à une mission et/ou une LDM. Il définit la fréquence (mensuelle, trimestrielle, semestrielle, annuelle, unique), le montant HT par échéance, et la liste des échéances avec leur statut (planifiée, facturée, payée, annulée) et le lien vers la facture créée.

### 9.6 Exports

| Export | Format | Description |
|--------|--------|-------------|
| `factures.exportFEC` | TXT | Fichier des Écritures Comptables conforme DGFiP |
| `factures.exportCSV` | CSV | Export tabulaire de la liste des factures |

### 9.7 Filtres disponibles

La liste des factures peut être filtrée par : client, statut, période (mois courant, trimestre, année), et triée par date d'échéance.

---

## 10. Module Relances

### 10.1 Présentation

Le module Relances gère le suivi des factures impayées et l'envoi de relances aux clients. Il est alimenté automatiquement par la détection des factures en retard.

### 10.2 Niveaux de relance

Trois niveaux de relance sont configurables dans `config_relances_auto` :
- **Niveau 1** (rappel amiable) : envoyé N jours après l'échéance
- **Niveau 2** (mise en demeure) : envoyé N jours après la première relance
- **Niveau 3** (contentieux) : envoyé N jours après la deuxième relance

### 10.3 Actions

| Action | Description |
|--------|-------------|
| `relances.facturesEnRetard` | Liste des factures dont l'échéance est dépassée |
| `relances.sendEmail` | Envoie une relance par email via Brevo avec sélection du niveau |
| `relances.configurer` | Configure les délais et modèles de relance |
| `relances.reglesFacture` | Règles de relance automatique associées à une facture |

L'envoi d'une relance crée automatiquement un enregistrement dans la table `relances` avec le niveau, la date d'envoi, le montant relancé et l'email destinataire.

---

## 11. Module Prélèvements SEPA

### 11.1 Présentation

Le module SEPA permet de générer les fichiers de prélèvement automatique pour les clients ayant signé un mandat SEPA. Il est conçu pour les cabinets qui encaissent leurs honoraires par prélèvement mensuel.

### 11.2 Workflow

1. Sélection du mois de prélèvement
2. Identification des factures éligibles (mode de paiement = prélèvement, statut = envoyee ou retard, mandat SEPA valide sur le contact)
3. Génération du fichier XML SEPA (format PAIN.008)
4. Export et téléchargement du fichier
5. Marquage des échéances comme exportées

### 11.3 Données d'un prélèvement

Chaque lot de prélèvement enregistre : le mois/année, le statut (brouillon / exporté), la date d'export, le nombre d'échéances, le montant total et l'URL du fichier XML stocké sur S3.

---

## 12. Module GED / Documents

### 12.1 Types de documents gérés

| Type | Description |
|------|-------------|
| `lettre_mission` | LDM signée |
| `contrat` | Contrat de prestation |
| `facture` | Facture client |
| `devis` | Proposition commerciale |
| `bilan` | Bilan comptable |
| `liasse_fiscale` | Liasse fiscale |
| `declaration_tva` | Déclaration de TVA |
| `declaration_is` | Déclaration IS |
| `bulletin_paie` | Bulletin de paie |
| `dsn` | Déclaration Sociale Nominative |
| `statuts` | Statuts de la société |
| `kbis` | Extrait Kbis |
| `releve_bancaire` | Relevé bancaire |
| `autre` | Document non catégorisé |

### 12.2 Métadonnées

Chaque document est rattaché à un contact, optionnellement à une mission, une facture et une LDM. Il dispose d'un exercice comptable (`annee`), d'une description, d'un flag confidentiel, d'un numéro de version et d'une référence au document parent (pour le versioning).

### 12.3 Stockage

Les fichiers sont stockés sur S3 via `storagePut`. Seuls la clé S3 et l'URL publique sont enregistrés en base. La taille maximale par fichier est de 16 Mo.

### 12.4 Actions

| Action | Description |
|--------|-------------|
| `documents.upload` | Upload d'un fichier avec rattachements |
| `documents.list` | Liste filtrée par client, mission, type, année |
| `documents.delete` | Suppression avec nettoyage S3 |
| `documents.stats` | Statistiques (nombre de documents, taille totale) |

---

## 13. Module Emails entrants

### 13.1 Présentation

Le module Emails entrants permet d'ingérer des emails professionnels reçus, de les rattacher automatiquement au bon client et à la bonne mission, et de les convertir en tâches exploitables.

### 13.2 Structure d'un email ingéré

| Champ | Description |
|-------|-------------|
| `sujet` | Objet de l'email |
| `corps` | Corps de l'email (texte brut ou HTML) |
| `expediteurEmail` | Adresse email de l'expéditeur |
| `expediteurNom` | Nom de l'expéditeur |
| `dateReception` | Timestamp UTC de réception |
| `contactId` | Contact rattaché (nullable) |
| `missionId` | Mission rattachée (nullable) |
| `matchConfiance` | Niveau de confiance du rattachement : certain / probable / incertain / aucun |
| `statut` | nouveau / en_cours / converti / traite / ignore / doublon |
| `messageId` | Message-ID SMTP pour dédoublonnage |
| `hashDedoublonnage` | SHA-256(expediteurEmail + sujet + dateReception) |

### 13.3 Logique de rattachement automatique

Lors de l'ingestion (`emails.ingest`), le système :
1. Recherche un contact dont l'email correspond à `expediteurEmail` (confiance = `certain`)
2. Si plusieurs contacts correspondent, choisit le plus récent (confiance = `probable`)
3. Si aucun contact ne correspond, laisse `contactId` null (confiance = `aucun`)
4. Si un contact est trouvé, cherche une mission active associée à ce contact

### 13.4 Anti-doublon

Un email est considéré comme doublon si son `hashDedoublonnage` ou son `messageId` existe déjà en base. Dans ce cas, le statut est mis à `doublon` et l'ingestion est journalisée comme ignorée.

### 13.5 Conversion en tâche

La route `emails.toTask` crée une tâche avec :
- `titre` = sujet de l'email
- `description` = extrait du corps
- `origine` = `email`
- `contactId` et `missionId` du rattachement
- `statut` = `a_faire`
- `priorite` proposée selon le contenu

### 13.6 Actions disponibles

| Action | Description |
|--------|-------------|
| `emails.ingest` | Ingère un email avec rattachement automatique |
| `emails.listInbox` | Liste des emails avec filtres (statut, confiance) |
| `emails.byId` | Détail d'un email |
| `emails.toTask` | Convertit en tâche |
| `emails.markProcessed` | Marque comme traité |
| `emails.markIgnored` | Marque comme ignoré |

---

## 14. Module Rentabilité

### 14.1 Présentation

Le module Rentabilité permet de mesurer la performance économique de chaque mission et du cabinet dans son ensemble.

### 14.2 Indicateurs calculés

| Indicateur | Calcul |
|------------|--------|
| Taux de rentabilité mission | (CA facturé / Honoraires budgétés) × 100 |
| Boni/Mali | CA facturé − Honoraires budgétés |
| Taux d'utilisation temps | (Temps passé / Temps budgété) × 100 |
| Coût horaire moyen | Honoraires budgétés / Temps budgété |
| CA par collaborateur | Somme des honoraires des missions affectées |

### 14.3 Vues disponibles

- **Rentabilité globale** (`Rentabilite.tsx`) : tableau de toutes les missions avec indicateurs, filtres par intervenant et par période
- **Rentabilité client** (`ClientRentabilite.tsx`) : détail par client avec évolution sur plusieurs exercices
- **Cockpit mission** (`MissionDetail.tsx`) : indicateurs en temps réel sur la fiche mission

### 14.4 Alertes de dépassement

La route `missions.alertesRetard` identifie les missions dont le temps passé dépasse le temps budgété de plus de 10%. Ces missions sont signalées dans le tableau de bord et dans la liste des missions.

---

## 15. Module Charge de travail

### 15.1 Présentation

La page Charge de travail (`ChargeTravail.tsx`) offre une vue calendaire de la charge par collaborateur, permettant d'identifier les surcharges et les disponibilités.

### 15.2 Données affichées

- Charge hebdomadaire par intervenant (heures budgétées vs heures disponibles)
- Missions actives par collaborateur
- Tâches à faire dans la semaine
- Alertes de surcharge (charge > capacité hebdomadaire)

---

## 16. Module Portefeuille collaborateur

### 16.1 Présentation

Le module Portefeuille (`Portefeuille.tsx` et `PortefeuilleCollaborateur.tsx`) permet à chaque collaborateur de visualiser son portefeuille de clients et de missions.

### 16.2 Données affichées

| Indicateur | Description |
|------------|-------------|
| Nombre de clients | Clients affectés à l'intervenant |
| Budget honoraires | Somme des honoraires budgétés des missions actives |
| Temps budgété total | Somme des temps budgétés |
| Temps passé total | Somme des temps saisis |
| Taux d'utilisation | Temps passé / Temps budgété |
| CA facturé | Somme des factures émises pour les missions du collaborateur |

### 16.3 Actions

| Action | Description |
|--------|-------------|
| `portefeuille.byIntervenant` | Données du portefeuille d'un collaborateur |
| `portefeuille.all` | Vue consolidée de tous les portefeuilles |
| `portefeuille.affecter` | Réaffecte un client à un autre collaborateur |
| `portefeuille.detailCollaborateur` | Détail complet avec liste des missions |

---

## 17. Module Mon Espace

### 17.1 Présentation

Mon Espace (`MonEspace.tsx`) est le tableau de bord personnel de l'utilisateur connecté. Il centralise les informations pertinentes pour l'intervenant identifié.

### 17.2 Sections affichées

- **Mes tâches urgentes / en retard** : tâches à faire ou en cours dont l'échéance est dépassée, filtrées sur l'intervenant connecté
- **Mes missions actives** : liste des missions dont l'intervenant est responsable
- **Mes factures à envoyer** : factures en brouillon affectées à l'intervenant
- **Mes relances en attente** : factures impayées des clients du portefeuille
- **Activité récente** : dernières saisies de temps, derniers emails traités

---

## 18. Module Automatisations

### 18.1 Moteur d'automatisation

Le moteur d'automatisation (`automation-engine.ts`) exécute des règles déclenchées par des événements métier. Chaque règle est définie dans la table `automation_rules` avec un code, un nom, un événement déclencheur et une configuration JSON.

### 18.2 Événements supportés

| Événement | Déclencheur |
|-----------|-------------|
| `ldm.signed` | LDM passée au statut `signee` |
| `mission.created` | Nouvelle mission créée |
| `facture.overdue` | Facture dont l'échéance est dépassée |
| `tache.overdue` | Tâche dont l'échéance est dépassée |
| `email.received` | Email ingéré dans la boîte |

### 18.3 Actions automatiques disponibles

- Création de mission depuis une LDM signée
- Génération de tâches depuis un modèle de mission
- Génération d'un plan de facturation
- Envoi d'une notification au propriétaire du cabinet
- Création d'une tâche depuis un email entrant

### 18.4 Journal d'exécution

Chaque exécution est enregistrée dans `automation_logs` avec : règle exécutée, événement, entité concernée (type + id), statut (`success` / `skipped` / `error`), message descriptif, timestamp.

### 18.5 Administration des règles

La route `admin.automation` permet d'activer/désactiver les règles et de consulter les logs depuis l'interface d'administration.

---

## 19. Module Paramètres cabinet

### 19.1 Données configurables

| Paramètre | Description |
|-----------|-------------|
| Nom du cabinet | Raison sociale |
| Adresse | Adresse complète |
| SIREN | Numéro SIREN du cabinet |
| Numéro d'inscription à l'Ordre | Référence OEC |
| Email expéditeur | Adresse utilisée pour les envois Brevo |
| Taux TVA par défaut | Taux appliqué aux factures |
| Conditions de paiement | Texte par défaut |
| Logo | URL du logo (stocké sur S3) |
| Clé API Brevo | Pour les envois d'emails |
| Clé API Pappers | Pour la recherche SIREN |

### 19.2 Modèles de missions

La bibliothèque de modèles de missions (`modele_missions`) contient les modèles OEC pré-chargés (`ldm.clauses.seedOEC`) et les modèles personnalisés. Chaque modèle définit : code, nom, catégorie, description, tâches standard (JSON), temps par profil, honoraires indicatifs, fréquence.

### 19.3 Bibliothèque de clauses

La bibliothèque de clauses (`clauses_bibliotheque`) stocke les clauses réutilisables pour les LDM, catégorisées par type (résiliation, RGPD, confidentialité, responsabilité, déontologie, personnalisée).

---

## 20. Module Administration

### 20.1 Gestion des intervenants

La page Intervenants (`Intervenants.tsx`) permet de gérer les collaborateurs du cabinet :
- Création d'un intervenant (nom, prénom, email, profil, taux horaire, capacité hebdomadaire)
- Activation / désactivation
- Affectation du rôle (expert-comptable, chef de mission, collaborateur, assistant)

### 20.2 Exports

La page Exports (`Exports.tsx`) centralise les exports disponibles :
- Export FEC (Fichier des Écritures Comptables)
- Export CSV des clients
- Export CSV des factures
- Export CSV des tâches

### 20.3 Simulation de cotation (Pricing)

L'assistant de cotation (`Cotation.tsx` et `PricingSimulation.tsx`) permet de calculer les honoraires d'une mission en fonction des paramètres du dossier :
- Type de mission, régime fiscal, régime comptable
- Chiffre d'affaires, nombre de salariés, nombre de bulletins
- Présence TNS, complexité estimée
- Résultat : temps estimé par profil, honoraires HT recommandés

Les simulations peuvent être sauvegardées (`pricing.save`) et utilisées pour créer un devis (`devis.createFromCotation`) ou une LDM (`ldm.initFromCotation`).

---

## 21. Tableau de bord

### 21.1 KPIs affichés

| KPI | Calcul |
|-----|--------|
| CA Facturé (année) | Somme des factures `payee` de l'année en cours |
| CA Prévisionnel | Somme des factures `envoyee` et `partielle` non encore encaissées |
| Clients actifs | Nombre de contacts de type `client` |
| Prospects | Nombre de contacts de type `prospect` |
| Devis en attente | Nombre de devis au statut `envoye` |
| Missions en cours | Nombre de missions au statut `en_cours` |
| Impayés | Montant total des factures au statut `retard` |
| Taux de conversion | (Nombre de clients / Nombre de prospects) × 100 |
| Nouveaux clients | Clients créés dans le mois courant |
| Tâches en retard | Tâches non terminées dont l'échéance est dépassée |

### 21.2 Graphiques

- CA par mois (12 derniers mois) — courbe
- Pipeline commercial par statut — barres
- Statistiques LDM (brouillon / envoyée / signée / archivée) — camembert

### 21.3 Alertes

La route `dashboard.alertes` génère les alertes actives :
- Factures impayées depuis plus de 30 jours
- Missions dont le temps passé dépasse le budget
- Tâches urgentes en retard
- LDM en attente de signature depuis plus de 15 jours

---

## 22. Flux automatisés transverses

### 22.1 Flux Prospect → Client

```
1. Création d'un prospect (contacts.create, type = prospect)
2. Création d'un devis (devis.create)
3. Acceptation du devis → devis.createMissionFromDevis
   → contacts.convertProspect (type = client, origineClient = prospect_converti)
   → Création de la mission
```

### 22.2 Flux LDM signée → Mission opérationnelle

```
1. Création de la LDM (ldm.create via wizard)
2. Envoi au client (ldm.sendLdm → Brevo)
3. Signature (ldm.sign)
   → Création de la mission (si absente)
   → Génération des tâches depuis le modèle
   → Génération du plan de facturation
   → Journalisation automation_logs
```

### 22.3 Flux Email entrant → Tâche

```
1. Ingestion de l'email (emails.ingest)
   → Recherche du contact par email expéditeur
   → Recherche de la mission active du contact
   → Calcul du hash de dédoublonnage
2. Affichage dans la boîte (emails.listInbox)
3. Conversion en tâche (emails.toTask)
   → Création de la tâche avec rattachements
   → Statut email → converti
```

### 22.4 Flux Facturation → Encaissement → SEPA

```
1. Création de la facture (factures.create ou depuis plan de facturation)
2. Envoi au client (email.sendFacture → Brevo)
3. Enregistrement du paiement (factures.addPaiement)
   → Statut → payee ou partielle
   OU
3. Génération du prélèvement SEPA (sepa.facturesAPrelevement → sepa.exporterXml)
   → Fichier XML PAIN.008 téléchargeable
```

---

## 23. Règles anti-doublon et garde-fous

| Entité | Règle | Mécanisme |
|--------|-------|-----------|
| Contact | SIREN unique | Vérification préalable avant INSERT + index UNIQUE en base |
| Email ingéré | Hash SHA-256 unique | Vérification `hashDedoublonnage` + `messageId` avant insertion |
| Mission depuis LDM | Une seule mission par LDM | Vérification `ldmId` avant création |
| Plan de facturation | Un seul plan par mission | Vérification `missionId` avant création |
| Tâche depuis email | Statut `converti` bloque la re-conversion | Vérification du statut avant `emails.toTask` |
| Numéro de facture | Séquence unique | Contrainte UNIQUE sur colonne `numero` |
| Numéro de devis | Séquence unique | Contrainte UNIQUE sur colonne `numero` |
| Numéro de LDM | Séquence unique | Contrainte UNIQUE sur colonne `numero` |

---

## 24. Rôles et accès

### 24.1 Authentification

L'authentification est gérée par OAuth Manus. Toutes les procédures tRPC utilisent `protectedProcedure`, ce qui garantit qu'aucune donnée n'est accessible sans session valide.

### 24.2 Rôles utilisateurs

| Rôle | Description | Accès |
|------|-------------|-------|
| `admin` | Propriétaire du cabinet | Accès complet, administration, paramètres |
| `user` | Collaborateur | Accès à son portefeuille, ses tâches, ses missions |

Les procédures d'administration (`admin.*`) vérifient `ctx.user.role === 'admin'` avant exécution.

### 24.3 Profils d'intervenants

Les intervenants sont catégorisés par profil métier (expert-comptable, chef de mission, collaborateur, assistant). Ce profil est utilisé pour l'affectation automatique des tâches depuis les modèles de mission et pour le calcul de la charge de travail.

---

*Document généré automatiquement à partir du code source de l'application — version 6.1, avril 2026.*
