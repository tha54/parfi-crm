# BRIEF — Module Facturation Micro-Entrepreneur
## Parfi France — CRM v2 Extension

---

## 1. Contexte & Objectifs

### Contexte
Le CRM Parfi France (React / tRPC / MySQL / VPS 163.172.158.24) dispose déjà d'un module
facturation pour les clients du cabinet. L'objectif est d'étendre ce système avec un module
dédié aux **micro-entrepreneurs (auto-entrepreneurs)**, utilisable de deux façons :

1. **Usage interne Parfi** — les collaborateurs gèrent la facturation de leurs clients
   micro-entrepreneurs directement depuis le CRM existant
2. **Usage client autonome** — le micro-entrepreneur accède lui-même à un portail
   dédié pour gérer ses propres devis et factures (architecture à préciser en Phase 2,
   marque non encore définie)

### Objectif MVP
Fournir un outil complet de gestion devis → facture pour micro-entrepreneurs, avec :
- Conformité légale française (mentions obligatoires, numérotation, franchise TVA)
- Livre des recettes automatique (obligation comptable du régime micro)
- Relances automatiques des impayés
- Export FEC et PDF

### Phase 2 (hors scope MVP)
- Intégration B2Brouter (facturation électronique, conformité PA septembre 2026)
- API Tierce Déclaration URSSAF (déclaration CA automatique)
- Portail client white-label avec auth propre

---

## 2. Stack Technique

Respecter la stack existante du CRM :
- **Frontend** : React + TypeScript + Tailwind CSS
- **Backend** : Express + tRPC
- **Base de données** : MySQL (même instance)
- **PDF** : puppeteer ou @react-pdf/renderer (à choisir selon ce qui est déjà installé)
- **Email** : Brevo (déjà intégré pour les relances créances)
- **Auth** : système existant du CRM (rôles : expert_comptable, chef_de_groupe,
  chef_de_mission, collaborateur, collaborateur_social, collaborateur_juridique)

---

## 3. Modèle de données

### Tables à créer

```sql
-- Clients micro-entrepreneurs (liés à la table clients existante)
CREATE TABLE micro_clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,                    -- FK → clients existants CRM
  siren VARCHAR(9),
  siret VARCHAR(14),
  nom_commercial VARCHAR(255),
  forme_juridique ENUM('micro_bic_vente','micro_bic_prestation','micro_bnc') NOT NULL,
  regime_tva ENUM('franchise','tva_normale') DEFAULT 'franchise',
  numero_tva_intra VARCHAR(20),              -- si sorti de franchise
  adresse_facturation TEXT,
  iban VARCHAR(34),
  bic VARCHAR(11),
  logo_url VARCHAR(500),
  prefixe_devis VARCHAR(10) DEFAULT 'DEV',
  prefixe_facture VARCHAR(10) DEFAULT 'FAC',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Contacts clients des micro-entrepreneurs (leurs propres clients)
CREATE TABLE micro_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  micro_client_id INT NOT NULL,
  nom VARCHAR(255) NOT NULL,
  prenom VARCHAR(255),
  societe VARCHAR(255),
  siren VARCHAR(9),
  email VARCHAR(255),
  telephone VARCHAR(20),
  adresse TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
);

-- Catalogue prestations
CREATE TABLE micro_prestations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  micro_client_id INT NOT NULL,
  libelle VARCHAR(500) NOT NULL,
  description TEXT,
  unite VARCHAR(50) DEFAULT 'forfait',    -- forfait, heure, jour, unité, etc.
  prix_unitaire DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id)
);

-- Devis
CREATE TABLE micro_devis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  micro_client_id INT NOT NULL,
  contact_id INT NOT NULL,
  numero VARCHAR(50) NOT NULL UNIQUE,     -- ex: DEV-2026-001
  date_emission DATE NOT NULL,
  date_validite DATE NOT NULL,            -- par défaut +30 jours
  objet VARCHAR(500),
  statut ENUM('brouillon','envoye','signe','refuse','expire','converti') DEFAULT 'brouillon',
  montant_ht DECIMAL(10,2) NOT NULL,
  taux_tva DECIMAL(5,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_ttc DECIMAL(10,2) NOT NULL,
  conditions_paiement TEXT,
  notes TEXT,
  signature_token VARCHAR(100) UNIQUE,   -- token pour lien signature
  signature_date DATETIME,
  signature_ip VARCHAR(45),
  pdf_url VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
  FOREIGN KEY (contact_id) REFERENCES micro_contacts(id)
);

-- Lignes de devis
CREATE TABLE micro_devis_lignes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  devis_id INT NOT NULL,
  libelle VARCHAR(500) NOT NULL,
  description TEXT,
  quantite DECIMAL(10,3) NOT NULL DEFAULT 1,
  unite VARCHAR(50) DEFAULT 'forfait',
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pct DECIMAL(5,2) DEFAULT 0,
  montant_ht DECIMAL(10,2) NOT NULL,
  ordre INT DEFAULT 0,
  FOREIGN KEY (devis_id) REFERENCES micro_devis(id) ON DELETE CASCADE
);

-- Factures
CREATE TABLE micro_factures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  micro_client_id INT NOT NULL,
  contact_id INT NOT NULL,
  devis_id INT,                           -- NULL si facture directe
  numero VARCHAR(50) NOT NULL UNIQUE,     -- ex: FAC-2026-001 (séquence ininterrompue)
  date_emission DATE NOT NULL,
  date_echeance DATE NOT NULL,
  objet VARCHAR(500),
  statut ENUM('brouillon','envoyee','partiellement_payee','payee','en_retard','annulee') DEFAULT 'brouillon',
  montant_ht DECIMAL(10,2) NOT NULL,
  taux_tva DECIMAL(5,2) DEFAULT 0,
  montant_tva DECIMAL(10,2) DEFAULT 0,
  montant_ttc DECIMAL(10,2) NOT NULL,
  montant_regle DECIMAL(10,2) DEFAULT 0,
  solde_restant DECIMAL(10,2),           -- calculé : ttc - regle
  conditions_paiement TEXT,
  mention_franchise TEXT DEFAULT 'TVA non applicable, art. 293 B du CGI',
  notes TEXT,
  pdf_url VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
  FOREIGN KEY (contact_id) REFERENCES micro_contacts(id),
  FOREIGN KEY (devis_id) REFERENCES micro_devis(id)
);

-- Lignes de facture
CREATE TABLE micro_factures_lignes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  facture_id INT NOT NULL,
  libelle VARCHAR(500) NOT NULL,
  description TEXT,
  quantite DECIMAL(10,3) NOT NULL DEFAULT 1,
  unite VARCHAR(50) DEFAULT 'forfait',
  prix_unitaire DECIMAL(10,2) NOT NULL,
  remise_pct DECIMAL(5,2) DEFAULT 0,
  montant_ht DECIMAL(10,2) NOT NULL,
  ordre INT DEFAULT 0,
  FOREIGN KEY (facture_id) REFERENCES micro_factures(id) ON DELETE CASCADE
);

-- Paiements reçus
CREATE TABLE micro_paiements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  facture_id INT NOT NULL,
  date_paiement DATE NOT NULL,
  montant DECIMAL(10,2) NOT NULL,
  mode ENUM('virement','cheque','especes','carte','prelevement','autre') NOT NULL,
  reference VARCHAR(255),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (facture_id) REFERENCES micro_factures(id)
);

-- Relances automatiques
CREATE TABLE micro_relances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  facture_id INT NOT NULL,
  niveau TINYINT NOT NULL,               -- 1=amiable, 2=rappel, 3=mise en demeure
  date_envoi DATETIME NOT NULL,
  email_destinataire VARCHAR(255),
  statut ENUM('envoyee','echec') DEFAULT 'envoyee',
  FOREIGN KEY (facture_id) REFERENCES micro_factures(id)
);

-- Livre des recettes (généré automatiquement à chaque paiement enregistré)
CREATE TABLE micro_livre_recettes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  micro_client_id INT NOT NULL,
  paiement_id INT NOT NULL,
  date_encaissement DATE NOT NULL,
  reference_facture VARCHAR(50) NOT NULL,
  client_nom VARCHAR(255) NOT NULL,
  nature_prestation VARCHAR(500) NOT NULL,
  montant_encaisse DECIMAL(10,2) NOT NULL,
  mode_reglement VARCHAR(50) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (micro_client_id) REFERENCES micro_clients(id),
  FOREIGN KEY (paiement_id) REFERENCES micro_paiements(id)
);
```

---

## 4. Routes tRPC à créer

### Router : `microClientRouter`
```
microClient.create
microClient.update
microClient.getById
microClient.list          -- liste pour le collaborateur connecté
```

### Router : `microContactRouter`
```
microContact.create
microContact.update
microContact.delete
microContact.listByClient
```

### Router : `microPrestationRouter`
```
microPrestation.create
microPrestation.update
microPrestation.delete
microPrestation.listByClient
```

### Router : `microDevisRouter`
```
microDevis.create
microDevis.update
microDevis.delete
microDevis.getById
microDevis.listByClient
microDevis.send           -- génère PDF + envoie email + génère token signature
microDevis.getNextNumero  -- calcule prochain numéro séquentiel
microDevis.convertToFacture
microDevis.getBySignatureToken  -- page publique signature (pas d'auth)
microDevis.sign           -- enregistre signature (date + IP)
```

### Router : `microFactureRouter`
```
microFacture.create
microFacture.update
microFacture.getById
microFacture.listByClient
microFacture.send         -- génère PDF + envoie email
microFacture.getNextNumero
microFacture.enregistrerPaiement
microFacture.exportFEC    -- export CSV format FEC (art. L47 A LPF)
```

### Router : `microRelanceRouter`
```
microRelance.checkAndSend   -- cron job : vérifie les factures en retard et envoie
microRelance.listByFacture
microRelance.getConfig      -- délais J+X par niveau (configurable par micro_client)
```

### Router : `microLivreRecettesRouter`
```
microLivreRecettes.listByClient   -- avec filtres année/mois
microLivreRecettes.exportPDF
microLivreRecettes.exportCSV
```

---

## 5. Pages React à créer

### 5.1 Dans le CRM Parfi (section client)

**`/clients/:id/micro`** — Dashboard micro-entrepreneur du client
- KPIs : CA période, factures en attente, impayés, encaissé mois en cours
- Accès rapide : Nouveau devis, Nouvelle facture, Livre des recettes

**`/clients/:id/micro/devis`** — Liste des devis
- Tableau avec filtres statut, date, montant
- Actions : voir, envoyer, convertir, dupliquer, supprimer

**`/clients/:id/micro/devis/nouveau`** — Création devis
- Step 1 : Sélection contact (ou création à la volée)
- Step 2 : Lignes de prestation (catalogue ou saisie libre)
- Step 3 : Conditions (validité, paiement, notes)
- Step 4 : Aperçu PDF avant envoi
- Boutons : Sauvegarder brouillon / Envoyer par email

**`/clients/:id/micro/factures`** — Liste des factures
- Tableau avec statut coloré (payée = vert, en retard = rouge, etc.)
- Filtres : statut, période, contact
- Actions : voir, envoyer, enregistrer paiement, relancer

**`/clients/:id/micro/factures/nouvelle`** — Création facture directe
- Même logique que devis

**`/clients/:id/micro/livre-recettes`** — Livre des recettes
- Tableau chronologique des encaissements
- Filtre par année (défaut : année en cours)
- Export PDF et CSV en haut de page
- Total CA par période + par trimestre (base déclaration URSSAF future)

**`/clients/:id/micro/relances`** — Configuration et historique relances
- Paramétrage des délais (J+15, J+30, J+45 par défaut)
- Historique des relances envoyées

### 5.2 Page publique (sans auth)

**`/signature/:token`** — Page de signature du devis
- Affiche le devis en lecture seule (rendu HTML du PDF)
- Case à cocher "J'ai lu et j'accepte le devis"
- Bouton "Signer le devis"
- Enregistre : date, IP, user-agent
- Après signature : message de confirmation + email auto au cabinet

---

## 6. Génération PDF

Chaque devis/facture doit générer un PDF conforme avec :

**Mentions obligatoires facture micro-entrepreneur :**
- Numéro de facture (séquence ininterrompue et sans trou)
- Date d'émission
- Nom/adresse du vendeur (micro-entrepreneur) + SIREN
- Nom/adresse du client
- Description des prestations
- Prix unitaire HT, quantité, total HT
- **Mention franchise TVA** : "TVA non applicable, art. 293 B du CGI"
  (sauf si client assujetti à la TVA)
- Date d'échéance
- Conditions de paiement + pénalités de retard légales
- Indemnité forfaitaire recouvrement (40€) si client professionnel

**Mentions obligatoires devis :**
- Date d'émission + durée de validité
- Description détaillée des prestations
- Prix HT et TTC (ou mention franchise)
- Conditions de paiement

---

## 7. Logique Livre des Recettes

Le livre des recettes est **généré automatiquement** à chaque `enregistrerPaiement` :

```
Colonnes obligatoires (BOFiP) :
1. Date d'encaissement
2. Référence de la facture
3. Nom du client
4. Nature de la prestation
5. Montant encaissé
6. Mode de règlement
```

Règles :
- Un enregistrement par paiement (pas par facture)
- Ordre strictement chronologique
- Numérotation séquentielle par année
- Aucune suppression possible (intégrité comptable)
  → si erreur : paiement "annulé" avec écriture compensatoire

---

## 8. Relances automatiques

### Niveaux de relance (configurables par micro_client)
| Niveau | Délai défaut | Objet email | Ton |
|--------|-------------|-------------|-----|
| 1 | J+7 après échéance | Rappel amiable | Cordial |
| 2 | J+21 après échéance | Deuxième rappel | Ferme |
| 3 | J+35 après échéance | Mise en demeure | Formel |

### Cron job
- Exécution quotidienne (ex: 8h00)
- Vérifie toutes les factures `statut IN ('envoyee', 'partiellement_payee')`
- Calcule le retard depuis `date_echeance`
- Envoie la relance si le niveau n'a pas encore été envoyé
- Loge dans `micro_relances`
- Met à jour `statut = 'en_retard'` si J+1 après échéance

### Templates email Brevo (à créer)
- `MICRO_RELANCE_NIVEAU_1` : Rappel cordial avec PDF facture en pièce jointe
- `MICRO_RELANCE_NIVEAU_2` : Rappel ferme
- `MICRO_RELANCE_NIVEAU_3` : Mise en demeure avec mention des pénalités légales

---

## 9. Export FEC

Le FEC (Fichier d'Écritures Comptables) est un fichier CSV à format normé (article L47 A LPF).

Pour les micro-entrepreneurs, le FEC est simplifié mais doit contenir :

```
Colonnes FEC standard :
JournalCode | JournalLib | EcritureNum | EcritureDate | CompteNum |
CompteLib | CompAuxNum | CompAuxLib | PieceRef | PieceDate |
EcritureLib | Debit | Credit | EcritureLet | DateLet |
ValidDate | Montantdevise | Idevise
```

Logique de génération :
- 1 écriture débit compte 411xxx (client) + crédit 706xxx (prestation) par facture
- 1 écriture débit 512xxx (banque) + crédit 411xxx (client) par paiement
- Séparateur : `|` (pipe)
- Encodage : UTF-8
- Format date : YYYYMMDD

---

## 10. Numérotation des documents

### Règle impérative (conformité légale)
- Séquence **ininterrompue et sans trou** par exercice fiscal
- Format recommandé : `FAC-YYYY-NNNN` (ex: FAC-2026-0001)
- La numérotation des factures ne repart **pas à zéro** si annulation
  → une facture annulée reçoit un avoir (FAV-YYYY-NNNN)
- Les devis ont leur propre séquence (DEV-YYYY-NNNN)

### Implémentation
- La route `getNextNumero` fait un `SELECT MAX` + lock transactionnel
- Ne jamais calculer côté frontend

---

## 11. Signature électronique (devis)

### Flux
1. Collaborateur clique "Envoyer le devis"
2. Backend génère un `signature_token` (UUID v4) + PDF
3. Email envoyé au contact avec lien : `https://crm.parfi-france.fr/signature/{token}`
4. Page publique `/signature/:token` accessible sans auth
5. Le contact visualise le devis, coche et clique "Signer"
6. Backend enregistre `signature_date`, `signature_ip`, met `statut = 'signe'`
7. Email de confirmation envoyé au contact + notification au collaborateur

### Valeur juridique
La signature par clic avec horodatage + IP constitue un commencement de preuve
suffisant pour les litiges de faible valeur. Mentionner dans les CGV que
"la validation du devis en ligne vaut acceptation".

---

## 12. Permissions (rôles existants)

| Action | expert_comptable | chef_de_groupe | chef_de_mission | collaborateur |
|--------|:---:|:---:|:---:|:---:|
| Voir tous les micro-clients | ✅ | ✅ | ses groupes | ses dossiers |
| Créer devis/facture | ✅ | ✅ | ✅ | ✅ |
| Supprimer devis brouillon | ✅ | ✅ | ✅ | ❌ |
| Annuler facture | ✅ | ✅ | ❌ | ❌ |
| Configurer relances | ✅ | ✅ | ✅ | ❌ |
| Exporter FEC | ✅ | ✅ | ✅ | ❌ |

---

## 13. Ordre de développement recommandé

### Sprint 1 — Socle (priorité absolue)
1. Migration SQL (toutes les tables)
2. Routes tRPC : microClient + microContact + microPrestation
3. Page dashboard micro `/clients/:id/micro`
4. Catalogue prestations (CRUD)

### Sprint 2 — Devis
5. Route microDevis (create, update, getNextNumero, listByClient)
6. Page création devis (wizard 4 étapes)
7. Génération PDF devis
8. Envoi email + page signature publique

### Sprint 3 — Factures & Paiements
9. Route microFacture (create, update, enregistrerPaiement)
10. Page création facture + conversion depuis devis
11. Génération PDF facture (avec toutes les mentions légales)
12. Enregistrement paiement → alimentation automatique livre des recettes

### Sprint 4 — Automatisation
13. Cron relances automatiques
14. Templates Brevo (3 niveaux)
15. Page configuration relances

### Sprint 5 — Exports
16. Export FEC (CSV normé)
17. Export livre des recettes PDF + CSV
18. Dashboard KPIs avec graphique CA mensuel

---

## 14. Variables d'environnement nécessaires

```env
# Déjà présentes
BREVO_API_KEY=...
DATABASE_URL=...

# À ajouter
APP_BASE_URL=https://crm.parfi-france.fr   # pour les liens de signature
PDF_STORAGE_PATH=/var/www/pdfs             # ou S3 bucket
CRON_RELANCES_HEURE=8                      # heure d'exécution du cron
```

---

## 15. Phase 2 (hors MVP — à planifier)

- **B2Brouter** : intégration API SC pour facturation électronique conforme PA
  → Obligatoire réception septembre 2026, émission septembre 2027
- **API URSSAF Tierce Déclaration** : déclaration CA automatique
  → Habilitation éditeur à demander (procédure ~3 mois)
- **Portail client autonome** : app React séparée, auth propre, marque à définir
  → Architecture : même backend, nouveau frontend déployé sur sous-domaine
- **Paiement en ligne** : intégration Stripe ou Mollie pour paiement carte depuis facture
