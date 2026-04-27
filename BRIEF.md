# CRM Parfi France — Brief Projet
_Mis à jour le 27 avril 2026_

---

## Contexte cabinet

Cabinet d'expertise comptable **Parfi France**, Longwy (France).
- 11 collaborateurs : Thierry (expert-comptable, associé), Valérie (manager), Audrey (chef de groupe), Coralie, Pascal, Sandy, Camille, Théo (collaborateurs), Alison (juriste), Geoffrey (collaborateur), Gaëlle (assistante RH), Natalie (responsable RH)
- Logiciel comptable principal : Tiime
- Ce CRM gère les missions, la tarification, la facturation et le suivi des équipes

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React |
| API | tRPC |
| Base de données | MySQL |
| Serveur | VPS (163.172.158.24) |
| Intégration entreprises | Pappers API (clé : `c6de9e5af964c17ddc1c1f77844b713a087e23958abf2c27`) |
| Recherche SIREN côté client | `recherche-entreprises.api.gouv.fr` (évite les problèmes CORS) |

---

## État des modules

### ✅ Module Tâches (existant)
- Vue liste, kanban, équipe
- Création / édition / suppression
- Filtres : priorité, statut, collaborateur, client
- Assignation par managers uniquement
- Budget temps par tâche (`budget_minutes`)
- Saisie temps : chronomètre + manuel
- Alertes budget : 80% (avertissement) + 100% (dépassement → commentaire obligatoire)
- **Génération automatique depuis LDM signée** (tâches issues du dimensionnement)
- Morning Briefing : à l'ouverture de session, chaque collaborateur voit ses tâches du jour / semaine / mois

### 🔧 Module LDM / Devis / Dimensionnement (À IMPLÉMENTER CE SOIR)
Voir section dédiée ci-dessous — c'est la priorité absolue de cette session.

### 📋 Modules prévus (sessions suivantes)
- Facturation (plan de facturation issu du devis)
- Tableau de bord rentabilité par dossier (temps budgété vs temps réel)
- GED (documents par dossier client)
- Hub de communication (emails, téléphone, courrier — rattachés aux dossiers)
- Notifications in-app et email (8h chaque matin)
- Assistant téléphonique IA (Vapi ou équivalent)

---

## 🎯 MODULE PRIORITAIRE CE SOIR : Dimensionnement & Tarification → LDM

### Flux général

```
1. DIMENSIONNEMENT
   Choix type d'entité (EI / Société / Association)
   + Paramètres (régime fiscal, TVA, nb établissements)
   + Volumétrie (factures achat/vente, lignes banque, immos, effectif)
   → Calcul automatique des tâches et honoraires par mission
        ↓
2. DEVIS
   Affectation à un prospect (SIREN → Pappers)
   Récapitulatif honoraires HT/TTC + remise éventuelle
   Envoi PDF au client
        ↓
3. LETTRE DE MISSION
   Acceptation devis → transformation en LDM
   Génération mandats (prélèvement banque, impôts, organismes sociaux)
   Signature papier (YouSign à venir)
        ↓
4. ACTIVATION MISSION
   Prospect → Client (automatique)
   Affectation collaborateur au dossier
   Injection automatique des tâches dans le module Tâches
   (une tâche par ligne du dimensionnement, avec budget_minutes)
```

---

### Structure de données MySQL à créer

```sql
-- Paramètres du dimensionnement
CREATE TABLE dimensionnement (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT,                          -- FK vers clients
  type_entite ENUM('ei','societe','association') NOT NULL,
  regime_fiscal ENUM('micro','reel_simplifie','reel_normal','bnc','ba') NOT NULL,
  regime_tva ENUM('mensuel','trimestriel','franchise','neant') NOT NULL,
  nb_etablissements INT DEFAULT 1,
  -- Volumétrie
  factures_achat INT DEFAULT 0,
  factures_vente INT DEFAULT 0,
  lignes_banque INT DEFAULT 0,
  immobilisations INT DEFAULT 0,
  effectif INT DEFAULT 0,
  -- Résultat
  total_ht DECIMAL(10,2),
  remise_pct DECIMAL(5,2) DEFAULT 0,
  total_ht_net DECIMAL(10,2),
  total_ttc DECIMAL(10,2),
  statut ENUM('brouillon','devis_envoye','accepte','refuse','ldm_signee') DEFAULT 'brouillon',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Lignes de tâches du dimensionnement
CREATE TABLE dimensionnement_lignes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dimensionnement_id INT NOT NULL,        -- FK vers dimensionnement
  section VARCHAR(100),                   -- ex: "Tenue comptable"
  libelle VARCHAR(255) NOT NULL,          -- ex: "Journaux d'achats"
  intervenant ENUM('Expert-comptable','Collaborateur','Collaborateur Social','Collaborateur Juridique','Aide comptable') NOT NULL,
  periodicite VARCHAR(100),
  temps_minutes INT NOT NULL,             -- temps unitaire en minutes
  tarif_ht DECIMAL(10,2) NOT NULL,
  actif BOOLEAN DEFAULT TRUE
);
```

---

### Taux horaires de référence (configurables)

| Intervenant | Taux €/h |
|---|---|
| Expert-comptable | 84 |
| Collaborateur | 42 |
| Collaborateur Social | 28 |
| Collaborateur Juridique | 60 |
| Aide comptable | 28 |

---

### Missions traditionnelles et règles de calcul

#### TENUE COMPTABLE
| Tâche | Intervenant | Temps | Condition |
|---|---|---|---|
| Journaux d'achats | Aide comptable | max(30, round(factures_achat/30×60)) min | factures_achat > 0 |
| Journaux de ventes | Aide comptable | max(30, round(factures_vente/30×60)) min | factures_vente > 0 |
| Journaux de trésorerie | Aide comptable | max(30, round(lignes_banque/60×60)) min | lignes_banque > 0 |
| Journaux d'OD | Aide comptable | 30 min | toujours |

#### DILIGENCES COMPTABLES
| Tâche | Intervenant | Temps | Périodicité |
|---|---|---|---|
| Constitution dossier permanent | Collaborateur | 30 min | Ponctuel Jan |
| Collecte éléments dossier permanent | Collaborateur | 30 min | Récurrent clôture |
| Collecte pièces contrôle annuel | Collaborateur | 60 min | Récurrent clôture |
| Constitution dossier de contrôle annuel | Collaborateur | 300 min | Récurrent clôture |
| Constitution FEC exercice clos | Collaborateur | 5 min | Ponctuel Jan |
| Constitution FEC exercice en cours | Collaborateur | 5 min | Ponctuel Jan |
| Archivage FEC | Collaborateur | 5 min | Suite clôture |
| Traitement des immobilisations | Collaborateur | max(5, immos×2) min | Récurrent clôture |
| Fournisseurs – factures non parvenues | Collaborateur | 15 min | Récurrent clôture |
| Clients – factures à établir | Collaborateur | 15 min | Récurrent clôture |
| État & organismes sociaux | Collaborateur | 15 min | Récurrent clôture |
| Divers à payer & à recevoir | Collaborateur | 10 min | Récurrent clôture |
| Charges & produits constatés d'avance | Collaborateur | 10 min | Récurrent clôture |
| Bilan, Compte de résultat, Annexe | Collaborateur | 240 min | Récurrent clôture |
| Supervision du dossier | Expert-comptable | 60 min | Récurrent clôture |
| Entretien annuel présentation comptes | Expert-comptable | 90 min | Récurrent clôture |
| Grand livre, Balance (×3) | Collaborateur | 45 min | Récurrent clôture |

#### FISCALITÉ
| Tâche | Intervenant | Temps | Condition |
|---|---|---|---|
| Liasses fiscales | Collaborateur | 120 min | regime != micro |
| Acomptes IS (×4) | Collaborateur | 60 min total | societe |
| Liquidation IS | Collaborateur | 30 min | societe |
| Détermination résultat fiscal | Collaborateur | 30 min | societe |
| Déclaration annuelle CET | Collaborateur | 30 min | !association |
| Contrôle avis CET | Collaborateur | 30 min | !association |
| Demandes dégrèvements CET | Collaborateur | 30 min | !association |
| Déclarations TVA (×nb_decl) | Collaborateur | 20 min × nb_decl | tva != franchise/neant |
| Contrôle TVA bilan | Collaborateur | 60 min | tva != franchise/neant |
| Taxe d'apprentissage | Collaborateur Social | 30 min | effectif > 0 && !association |
| Formation professionnelle | Collaborateur Social | 30 min | effectif > 0 |
| DAS2 | Collaborateur | 30 min | toujours |

#### SOCIAL
| Tâche | Intervenant | Temps | Condition |
|---|---|---|---|
| Bulletins de paie (×effectif×12) | Collaborateur Social | 5×effectif×12 min total | effectif > 0 |
| DSN mensuelle (×effectif×12) | Collaborateur Social | 10×effectif×12 min total | effectif > 0 |
| Tableaux récap. nets imposables | Collaborateur Social | 10 min | effectif > 0 |
| Calcul IFC | Collaborateur | 30 min | effectif > 0 |
| Registres légaux sociaux | Collaborateur Social | 60 min | effectif > 0 |

#### JURIDIQUE
| Tâche | Intervenant | Temps | Condition |
|---|---|---|---|
| Rédaction AGO | Collaborateur Juridique | 240 min | societe ou association |
| Formalités AGO | Collaborateur Juridique | 60 min | societe ou association |

---

### Routes tRPC à créer

```typescript
// dimensionnement.router.ts
dimensionnement.create(input)           // créer un dimensionnement
dimensionnement.getById(id)             // récupérer avec ses lignes
dimensionnement.update(id, input)       // modifier params ou volumétrie
dimensionnement.listByClient(clientId)  // historique par client
dimensionnement.sendDevis(id)           // changer statut → devis_envoye, générer PDF
dimensionnement.acceptDevis(id)         // statut → accepte
dimensionnement.signLDM(id)             // statut → ldm_signee → déclenche injection tâches
dimensionnement.injectTaches(id)        // injection des lignes → module tâches (budget_minutes)
```

---

### Composants React à créer

1. **`DimensionnementWizard`** — formulaire en 3 étapes :
   - Étape 1 : Type d'entité + recherche SIREN (Pappers/API gouvernement)
   - Étape 2 : Paramètres (régime fiscal, TVA, nb établissements) + Volumétrie (curseurs)
   - Étape 3 : Résultat — tableau des missions avec temps et tarifs, total HT/TTC, remise

2. **`DevisRecap`** — récapitulatif PDF-ready avec logo Parfi, coordonnées client, tableau honoraires, conditions

3. **`LDMViewer`** — affichage de la lettre de mission générée (OEC-conforme)

4. **`DimensionnementList`** — liste des devis/LDM par client avec statuts et pipeline

---

### Règle d'injection des tâches (après signature LDM)

Quand `dimensionnement.signLDM(id)` est appelé :
1. Pour chaque ligne active de `dimensionnement_lignes` :
   - Créer une entrée dans `tasks` avec :
     - `title` = libelle de la ligne
     - `client_id` = client du dimensionnement
     - `assigned_to` = collaborateur du type intervenant (mapping à configurer)
     - `budget_minutes` = temps_minutes de la ligne
     - `periodicite` = periodicite de la ligne
     - `source` = 'ldm'
     - `dimensionnement_ligne_id` = FK vers la ligne
2. Passer le client de statut `prospect` à `client`
3. Affecter le collaborateur principal au dossier

---

## Équipe et rôles

| Nom | Rôle | Type intervenant |
|---|---|---|
| Thierry | Expert-comptable / Associé | Expert-comptable |
| Valérie | Manager | Collaborateur |
| Audrey | Chef de groupe | Collaborateur |
| Coralie | Collaboratrice | Collaborateur |
| Pascal | Collaborateur | Collaborateur |
| Sandy | Collaboratrice | Collaborateur |
| Camille | Collaboratrice | Collaborateur |
| Théo | Collaborateur | Collaborateur |
| Alison | Juriste | Collaborateur Juridique |
| Geoffrey | Collaborateur | Collaborateur |
| Gaëlle | Assistante RH | Collaborateur Social |
| Natalie | Responsable RH | Collaborateur Social |

---

## Instructions pour Claude Code

### Session ce soir — priorité absolue

```
Read this BRIEF.md carefully, then implement the following in order:

1. Create MySQL tables: `dimensionnement` and `dimensionnement_lignes` (schema above)

2. Create tRPC router `dimensionnement.router.ts` with all routes listed above

3. Create React component `DimensionnementWizard` with 3 steps:
   - Step 1: entity type selector (EI/Société/Association) + SIREN search via recherche-entreprises.api.gouv.fr
   - Step 2: fiscal params + volumetry sliders (factures_achat, factures_vente, lignes_banque, immobilisations, effectif)
   - Step 3: auto-calculated missions table (all sections: Tenue comptable, Diligences, Fiscalité, Social, Juridique) with tarifs, total HT/TTC, remise slider

4. Implement `dimensionnement.signLDM` route that injects tasks into the tasks module (one task per active line, with budget_minutes)

5. Add a "Devis & LDM" entry in the sidebar navigation

After completing, update CLAUDE.md with what was done and what remains.
```

### Règles de code à respecter
- Ne jamais réécrire un module existant complet — modifier uniquement ce qui est nécessaire
- Toujours vérifier que les FK existent avant d'insérer
- Les calculs de tarification se font côté frontend (React) à partir des taux horaires configurés
- La persistance se fait via tRPC → MySQL
- Mettre à jour `CLAUDE.md` en fin de session
