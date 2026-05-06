# Concepts métier — Lettres de mission

## Révision annuelle des honoraires

**Concept** : chaque année, le cabinet peut proposer au client une révision du montant des honoraires prévus dans sa lettre de mission. Le client accepte ou refuse la proposition.

**Historique** : ce concept était implémenté dans la table `mission_revisions` (liée à la table `contrats`, supprimée en Chantier 0). La table `mission_revisions` stockait :
- `contrat_id` — lien vers le contrat d'origine
- `annee` — exercice concerné
- `ancien_montant` — honoraires avant révision
- `nouveau_montant` — honoraires proposés
- `statut` — en_attente / acceptee / refusee
- `commentaire`

**À porter dans un futur chantier** : implémenter un historique de révisions annuelles directement sur `lettres_mission`, avec :
- Déclenchement automatique ou manuel à date anniversaire
- Notification collaborateur et client (portail)
- Acceptation / refus tracé avec horodatage
- Impact sur le plan de facturation en cours
