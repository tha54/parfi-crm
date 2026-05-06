# Audit CRM Parfi — 2026-04-28

## Résumé exécutif

- **40 routes backend** enregistrées, **37 pages frontend**
- **51 tables** en base de données
- API opérationnelle (pm2 `parfi-crm-api`, 0% CPU, 80 MB RAM, 24 redémarrages)
- ANTHROPIC_API_KEY **vide** → toutes les fonctionnalités IA (résumé appel, extraction tâches) tombent en mode fallback

---

## Tableau par module

| Module | Statut | Implémenté et fonctionnel | Partiel / cassé | DB sans UI | Planifié non fait |
|--------|--------|--------------------------|-----------------|------------|-------------------|
| **Auth / Utilisateurs** | ✅ Complet | Login JWT, rôles (`expert`, `chef_mission`, `collaborateur`), `role_metier` ENUM dans JWT, gestion CRUD collabs | — | Table `users` (legacy OpenID, inutilisée) | — |
| **Dashboard** | ✅ Complet | KPIs : clients actifs, prospects, missions, CA facturé, tâches, échéances fiscales 30j, taux conversion | Bug préexistant `dateEcheance` (dashboard.js) — **ne pas toucher** | — | — |
| **Clients** | ✅ Complet | Liste, fiche CRUD, coefficients complexité, `GET /cabinet` pour vue portefeuille | — | — | Lien depuis ClientCockpit → wizard Devis avec client pré-sélectionné |
| **ClientCockpit** | ✅ Complet | Tabs : overview, équipe, travaux, tâches, timeline (interactions), facturation, documents, notes, contrats & LDM, devis, contacts | Tab `contacts` présent dans l'UI mais `TabContacts` est défini ; vérifier affichage personnes de contact | — | — |
| **Prospects / Pipeline** | ✅ Complet | CRUD prospects, pipeline 6 colonnes Kanban, conversion prospect → client, modal création depuis pipeline | — | — | — |
| **Tâches** | ✅ Complet | Liste + Kanban, filtres, dépendances, badge `📞 Appel`, chrono temps (`tache-temps`), `budget_minutes`, `periodicite`, `origine`, `source` | — | `tache_dependances` (0 lignes) | — |
| **Planning** | ✅ Complet | Vue calendrier tâches + échéances fiscales, stats, génération écheances | — | — | — |
| **Missions** | ✅ Complet | CRUD missions, tâches par mission, saisies temps, alertes | — | `mission_lignes`, `mission_revisions`, `taches_mission` (toutes vides) — relations non exposées dans l'UI principale | — |
| **Travaux** | ✅ Complet | Gantt missions, suivi temps passé/budgété par mission, vue charge collaborateurs | — | — | — |
| **Dimensionnement** | ✅ Complet | Wizard 3 étapes (SIREN API gouv + client, volumétrie, rubriques calculées), ancien outil conservé, 8 rubriques × 5 intervenants, remise 0-30%, send-devis, sign-LDM, to-devis, to-ldm | Doublon partiel : `dimensionnement.js` (ancien) ET `devis.js` (nouveau) ont tous deux un moteur de calcul — s'assurer que les deux utilisent `dimensionnement.js` utilitaire | — | — |
| **Devis** | ✅ Complet | Liste, wizard (Step1 SIREN+client, Step2 volumétrie, Step3 rubriques), détail, statuts, envoyer/accepter/refuser/dupliquer/convertir-LDM, aperçu HTML, grille tarifaire | — | `pricing_simulations` (0 lignes, table vide) | Facturation depuis devis (plan de facturation mensuel automatique) |
| **Lettres de Mission (LDM)** | ✅ Complet | Liste, détail (rubriques expandables), signature + injection tâches + création 3 mandats, résiliation, duplication, aperçu HTML, PDF généré dans GED | `ldmPdf.js` génère un PDF via pdfkit et l'enregistre en GED — vérifier que `pdfkit` est installé | `plan_facturation` (1 ligne) — génération factures depuis LDM implémentée côté backend (`facturation.js`) mais non déclenchée depuis l'UI | — |
| **Factures** | ⚠️ Partiel | Liste, création manuelle, statuts, PDF (route `/pdf`), XML Factur-X (route `/facturx-xml`) | `facturx.js` utilitaire existe mais non testé ; PDF et XML ouverts via `window.open` — pas de prévisualisation in-app | `lignes_facture` (24 lignes), `plan_facturation` (1 ligne sans UI) | Envoi email facture, paiement en ligne, export comptable |
| **Relances** | ⚠️ Partiel | Liste factures en retard, création relance manuelle | Pas d'automatisation des relances depuis l'UI ; `config_relances_auto` existe en DB (0 lignes) | `config_relances_auto` (0 lignes) | Relances automatiques planifiées (J+30/60/90) |
| **Paiements** | ⚠️ Partiel | Backend CRUD (`/api/paiements`) | Aucune page frontend dédiée — paiements accessibles uniquement via onglet Facturation du ClientCockpit | `prelevements_sepa` (0 lignes) | Page paiements dédiée, export SEPA |
| **Contrats** | ⚠️ Partiel | 17 routes backend complètes (CRUD, signer, activer, mandats, lignes, révisions), accessible depuis onglet "Contrats & LDM" du ClientCockpit | Pas de page `/contrats` dédiée ; accès uniquement via ClientCockpit | `contrats` (0 lignes), `mandats` (0 lignes) | Page contrats dédiée avec liste globale |
| **Attributions** | ✅ Complet | CRUD attributions collaborateur ↔ client, filtres par user/client | Chargement inefficace : N requêtes pour N clients (à optimiser) | — | — |
| **Cabinet / Portefeuille** | ✅ Complet | Vue portefeuille global (clients + LDM active + honoraires + collaborateur), filtres | — | — | — |
| **Charge de travail** | ✅ Complet | Vue charge par collaborateur, tâches filtrables | — | — | — |
| **Absences** | ✅ Complet | Création, validation (chef/expert), jours fériés (algo Gauss), vue calendrier | — | `absences` (0 lignes) | — |
| **Rentabilité** | ⚠️ Partiel | KPIs globaux, taux rentabilité par mission, filtre par intervenant | Données nécessitent des missions + saisies temps réelles (tables vides) — page affiche des zéros | `saisies_temps` (0 lignes) | Graphiques historiques, benchmark cabinet |
| **Rapports** | ✅ Complet | Rapports hebdo, mensuel, portefeuille (3 endpoints backend) | — | — | Export PDF/Excel des rapports |
| **Morning Briefing** | ✅ Complet | Vue IA résumé du jour (tâches urgentes + échéances + pipeline) | Dépend de données réelles pour être utile | — | — |
| **Appels IA (Vapi)** | ⚠️ Partiel | Webhook `/api/calls/webhook` (x-vapi-secret ✅), analyse Claude haiku, création tâche auto, badge `📞 Appel` dans Taches, transcription dans TaskCommentDrawer | **ANTHROPIC_API_KEY vide** → fallback résumé générique ; pas de page historique des appels dans l'UI | `appels` (5 lignes) | Page "Historique des appels" (route backend `/api/calls/history` existe, UI manquante) |
| **Hub Communication** | ✅ Complet | Timeline interactions, création (appel/email/réunion/note), résumé IA (`/interactions/ai/summarize`), extraction tâches IA (`/interactions/ai/extract-tasks`), urgence, filtres | Résumé/extraction IA non fonctionnels si ANTHROPIC_API_KEY vide | `emails_inbox` (0 lignes) | Réception emails entrants automatique, intégration calendrier |
| **GED (Documents)** | ✅ Complet | Upload, liste, téléchargement, recherche full-text, partage par lien token, suppression | — | — | OCR, versioning |
| **Wiki interne** | ✅ Complet | CRUD articles, catégories, recherche | — | — | — |
| **Automations** | ⚠️ Partiel | CRUD règles (`ldm_signee`, `tache_retard`, `facture_impayee_30j`, `nouveau_client`, `devis_accepte`), exécution manuelle | Exécution automatique non planifiée (pas de cron) ; `automation_logs` vide | `automation_logs` (0 lignes) | Scheduler cron pour les déclencheurs |
| **Paramètres** | ✅ Complet | Paramètres cabinet, grille tarifaire (CRUD), clauses bibliothèque (`GET` seul) | `clauses_bibliotheque` (0 lignes) — lecture seule dans les paramètres | `modele_missions` (0 lignes) | CRUD clauses, modèles de mission |
| **Tiime Import** | ✅ Complet | Upload CSV ou analyse fichier serveur, import saisies temps, analyse colonnes, rapport d'import | — | — | — |
| **Portail client** | ✅ Complet | Login portail, dashboard client (factures, documents, missions), messagerie client, signature électronique | `POST /portal/admin/create-access` n'a pas d'UI dans le CRM — accès créé en CLI seulement | — | Notification email au client, historique des échanges |
| **Formulaire prospect (Intake)** | ✅ Complet | Formulaire public (token), soumission, liste prospects entrants, traitement | — | — | — |
| **Recherche globale** | ✅ Complet | Ctrl+K, recherche clients/prospects/tâches, navigation rapide | — | — | — |
| **Notifications** | ✅ Complet | Bell avec badge non-lus, marquer lu, supprimer, envoi interne | — | `notifications` (17 lignes) | Notifications email/SMS externes |
| **Intervenants** | ✅ Complet | CRUD intervenants (table séparée des utilisateurs) | — | `intervenants` (0 lignes) — table vide | — |
| **Mon Espace** | ✅ Complet | Tâches personnelles, missions en cours, factures en retard, saisie temps | — | — | — |

---

## Tables DB sans UI dédiée

| Table | Lignes | Situation |
|-------|--------|-----------|
| `users` | 0 | Legacy table OpenID — remplacée par `utilisateurs`, peut être supprimée |
| `plan_facturation` | 1 | Backend implémenté (`facturation.js`), non déclenché depuis l'UI |
| `prelevements_sepa` | 0 | Route absente, table prête pour export SEPA |
| `pricing_simulations` | 0 | Table vide, probablement vestiges d'une ancienne version |
| `emails_inbox` | 0 | Schéma prêt pour réception emails, aucune route backend |
| `config_relances_auto` | 0 | Structure en place, non utilisée (relances manuelles seulement) |
| `automation_logs` | 0 | Table prête, exécution automatique non planifiée |
| `modele_missions` | 0 | Lecture seule dans Paramètres, pas d'édition UI |
| `clauses_bibliotheque` | 0 | Lecture seule dans Paramètres, pas d'édition UI |
| `saisies_temps` | 0 | Utilisé par Missions mais aucune donnée saisie |
| `taches_mission` | 0 | Relation missions↔tâches non exploitée dans l'UI |
| `mission_lignes` | 0 | Utilisé par `contrats.js` activerMission(), non visible en UI |
| `mission_revisions` | 0 | Backend complet (`/revisions`), accessible uniquement via ClientCockpit |
| `mandats` | 0 | Backend complet, accessibles via ClientCockpit onglet Contrats |
| `intervenants` | 0 | CRUD complet, table vide en production |

---

## Problèmes bloquants / bugs connus

| Priorité | Problème | Impact |
|----------|----------|--------|
| 🔴 Critique | `ANTHROPIC_API_KEY` vide | Résumé appels Vapi = fallback générique, résumé interactions IA = erreur silencieuse |
| 🟠 Majeur | Bug `dateEcheance` dans `dashboard.js` | KPI dashboard potentiellement incorrect (connu, non toucher) |
| 🟡 Moyen | Portail client : `create-access` sans UI | Création accès client impossible sans CLI |
| 🟡 Moyen | Automations sans scheduler | Les règles ne s'exécutent jamais automatiquement |
| 🟡 Moyen | Historique appels Vapi sans page UI | Route `/api/calls/history` opérationnelle, aucune page frontend |
| 🟢 Mineur | Attributions : N requêtes pour N clients | Performance dégradée si portefeuille > 100 clients |
| 🟢 Mineur | `pdfkit` doit être installé | `ldmPdf.js` utilisé mais dépendance non vérifiée |

---

## Ce qui reste à construire (priorité suggérée)

1. **ANTHROPIC_API_KEY** — renseigner la clé dans `.env` (5 min, impact immédiat sur IA)
2. **Page historique appels** — `GET /api/calls/history` est prête, créer `Appels.jsx`
3. **Plan de facturation depuis LDM** — `facturation.js` est complet, ajouter bouton "Générer échéancier" dans `LDMDetail.jsx`
4. **Accès portail client depuis UI** — ajouter formulaire `create-access` dans Paramètres ou ClientCockpit
5. **Scheduler automations** — cron node-cron ou agenda.js pour déclencher les règles automatiques
6. **Relances automatiques** — activer `config_relances_auto` depuis la page Relances
7. **Lien ClientCockpit → Devis wizard** — passer `clientId` en paramètre URL `/devis/new?client_id=X`
8. **Page /contrats** — vue globale tous contrats (actuellement uniquement par client)
9. **Clause et modèles de mission** — CRUD dans Paramètres (backend prêt)
10. **Export SEPA** — table `prelevements_sepa` prête, route à créer
