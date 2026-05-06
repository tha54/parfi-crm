# Parfi CRM — Chantier 0 (complément)
## Refonte de l'architecture Devis / LDM / Chiffrage

> Complément à la spec `parfi-chantier-0-consolidation.md`. À traiter dans une sous-étape **C bis**, après livraison de la sous-étape C (refonte du module Chiffrage telle que rédigée initialement) et avant la sous-étape D (découplage LDM ↔ missions).
>
> Ce complément corrige une incohérence d'architecture détectée à la livraison de la C : le module Chiffrage avait été placé dans la sidebar comme un module à part, alors qu'il doit être un sous-écran appelé depuis Devis ou LDM.

---

## 1. Diagnostic

À la livraison de la sous-étape C, l'écran Chiffrage est accessible depuis la sidebar comme un onglet de premier niveau. Cette mise en avant est incohérente avec le modèle métier qu'on s'est fixé :

- **Devis et LDM sont des livrables** (documents communiqués au client ou signés par lui).
- **Chiffrage est un outil** qui sert à les configurer.

Exposer Chiffrage au même niveau que Devis et LDM dans la sidebar revient à mettre l'outil et le livrable sur un pied d'égalité, ce qui prête à confusion pour l'utilisateur et n'est pas conforme à la pratique métier. Le bon point d'entrée est **toujours le livrable**, et l'outil de chiffrage s'invoque depuis ce point d'entrée.

---

## 2. Architecture cible

### 2.1 Sidebar

- Suppression de l'onglet « Chiffrage ».
- Conservation des onglets « Devis » et « Lettres de mission » (LDM) tels qu'ils existent.

### 2.2 Création d'un devis

L'utilisateur clique sur « Nouveau devis » depuis la liste des devis. Une modale (ou un écran dédié) s'ouvre, proposant deux modes de saisie des honoraires :

- **Mode rapide** : saisie de lignes libres avec libellé + montant (ex. « Déclaration IR 2025 — 300 € »). Pas de calcul, pas de budget temps. Pour les devis simples ou ponctuels.
- **Mode chiffré** : ouverture de l'écran Chiffrage qui calcule honoraires et budgets temps à partir des caractéristiques du client et de la volumétrie. Pour les missions au temps passé (typiquement comptable et fiscale).

Les deux modes peuvent être combinés dans un même devis (cf. §3).

À la validation, le devis est créé avec ses lignes et son total.

### 2.3 Création d'une LDM

Conformément au choix Y de la phase de cadrage, la création directe d'une LDM est autorisée (sans devis préalable). L'utilisateur clique sur « Nouvelle LDM » depuis la liste des LDM. Le parcours de saisie est **identique** à celui d'un devis : modale, mode rapide ou mode chiffré, lignes libres et/ou lignes chiffrées.

À la validation, la LDM est créée et passe directement dans le workflow LDM (signature, mandats, génération des tâches).

### 2.4 Transformation devis → LDM

Depuis un devis validé, l'utilisateur peut déclencher l'action « Transformer en LDM ». Cette transformation est une **reprise stricte** :

- Toutes les lignes du devis sont reprises sans modification.
- Le total du devis (incluant l'éventuelle remise commerciale) est repris à l'identique.
- Aucune saisie n'est demandée à ce moment-là.

Si l'utilisateur souhaite modifier quelque chose après acceptation orale du client, il **annule le devis et en crée un nouveau**. La LDM ne porte jamais d'écart par rapport au devis dont elle est issue. Le devis porte seul la trace de la négociation commerciale (cf. §4).

L'inverse n'existe pas : on ne transforme pas une LDM en devis. Une LDM créée directement reste une LDM ; elle n'a pas besoin d'un devis amont.

---

## 3. Mode de saisie

### 3.1 Mode rapide — saisie de lignes libres

Chaque ligne contient :

- **Libellé** : texte libre (ex. « Déclaration IR 2025 », « Audit contractuel », « Conseil ponctuel »).
- **Chapitre** : sélection parmi `Comptable & fiscal`, `Social`, `Juridique`. Champ obligatoire pour permettre les agrégations (portefeuille, rentabilité par chapitre).
- **Montant HT** : valeur numérique en euros.

L'utilisateur peut ajouter autant de lignes qu'il le souhaite. Les lignes sont en mode forfait par défaut (`mode_suivi = forfait`) — pas de budget temps, pas de calcul automatique.

### 3.2 Mode chiffré — chiffrage complet

Mode existant après livraison de la sous-étape C : sélection des rubriques, saisie de la volumétrie, calcul automatique des honoraires et des budgets temps par profil.

Les lignes générées sont en mode `temps` ou `forfait` selon la rubrique (la mission C&F est au temps, le social et le juridique sont au forfait, conformément au Chantier 1 cadré).

### 3.3 Combinaison des deux modes

Dans un même devis (ou une même LDM), l'utilisateur peut combiner :

- Des lignes saisies en mode rapide (ex. déclaration IR du dirigeant, 300 €)
- Des lignes générées par le mode chiffré (ex. tenue comptable annuelle dimensionnée)

Le devis affiche les deux blocs distinctement (cf. §5.1 du Chantier 1 sur les sections « Missions au temps passé » et « Missions au forfait »).

---

## 4. Remise commerciale

### 4.1 Principe

À la fin du chiffrage, l'utilisateur peut consulter le total et constater que le client souhaite négocier (par exemple, total théorique = 325,40 €, client demande 300 €). La règle métier est :

- **On accepte de baisser le tarif** mais on ne ment pas sur le temps qui sera réellement passé.
- **Les budgets temps restent inchangés** — ils continuent à refléter la charge attendue.
- **La différence est enregistrée comme une « remise commerciale »** au niveau du **chapitre**.

### 4.2 Mécanisme

L'utilisateur saisit, pour chaque chapitre concerné, le montant final qu'il accepte. Le système calcule automatiquement la remise = total théorique du chapitre − montant accepté, et l'enregistre comme une ligne dédiée.

Exemple :

```
Chapitre Comptable & fiscal — théorique : 325,40 €
                              accepté   : 300,00 €
                              remise    : -25,40 €
```

La remise est portée au niveau du chapitre (Q3a = B), pas au niveau global ni au niveau de chaque ligne.

### 4.3 Visibilité

Sur le devis communiqué au client (PDF), la remise commerciale est **affichée explicitement** :

- Le **total théorique par chapitre** apparaît, barré (style typographique de type prix barré).
- Le **tarif accepté** apparaît à côté ou en dessous, comme tarif retenu.
- Une mention « Remise commerciale » avec le montant correspondant peut figurer en récapitulatif.

L'objectif est de **valoriser la concession commerciale consentie** : le client voit que le tarif facturé est inférieur à ce qui aurait été appliqué selon les barèmes du cabinet.

Sur la **LDM** issue d'un devis avec remise, le même affichage est conservé : le théorique barré, l'accepté retenu, la remise mentionnée. La LDM reflète strictement le devis (cf. §2.4 — reprise stricte).

En interne, dans la fiche détail du devis et de la LDM, le théorique, l'accepté et la remise sont également consultables pour le pilotage cabinet (rentabilité par dossier, taux de remise consenti par EC, par client).

### 4.4 Données stockées

Pour chaque devis (et chaque LDM si créée directement), le système conserve :

- Le total théorique par chapitre (avant remise)
- Le montant accepté par chapitre (après remise)
- La remise par chapitre (différence, négative)
- Le total théorique global, le total accepté global, la remise globale (somme des remises par chapitre)

Ces données sont utiles pour :

- Le pilotage de la rentabilité (suivi entre temps budgété et facturé réel, qui doit s'appuyer sur le tarif accepté pas sur le théorique)
- Le pilotage commercial (taux de remise moyen consenti par le cabinet, par associé, par client)

---

## 5. Modifications base de données

À ajouter à la table `devis` (et de manière équivalente à la table `lettres_mission`) :

| Champ | Type | Rôle |
|---|---|---|
| `total_theorique_ht` | DECIMAL(10,2) | Total HT calculé avant remise |
| `remise_commerciale_ht` | DECIMAL(10,2) | Montant total de la remise (≥ 0, retranché du théorique) |
| `total_accepte_ht` | DECIMAL(10,2) | Total HT après remise (= théorique − remise) |

À ajouter à la table `lignes_devis` (champ déjà partiellement prévu au Chantier 0 sous-étape C) :

| Champ | Type | Rôle |
|---|---|---|
| `mode_saisie` | ENUM('rapide', 'chiffre') | Distingue les lignes saisies librement des lignes générées par chiffrage |

Le champ `mode_suivi` ENUM('temps', 'forfait') existant au Chantier 0 sous-étape C reste tel quel et garde son sens (mode de calcul du budget temps).

Pour le détail théorique/accepté par chapitre, créer une table d'agrégat `devis_chapitres` (ou équivalent à choisir par Claude Code) :

| Champ | Type | Rôle |
|---|---|---|
| `devis_id` | FK | — |
| `chapitre` | ENUM('comptable_fiscal', 'social', 'juridique') | — |
| `total_theorique_ht` | DECIMAL(10,2) | — |
| `montant_accepte_ht` | DECIMAL(10,2) | — |
| `remise_ht` | DECIMAL(10,2) | — |

Idem pour `lettres_mission_chapitres`.

---

## 6. Modifications frontend

### 6.1 Pages à modifier

- `Devis.jsx` (ou équivalent) : enrichir le bouton « Nouveau devis » pour qu'il ouvre la modale unifiée à deux modes (au lieu d'envoyer vers le module Chiffrage).
- `Lettres.jsx` (ou équivalent) : créer (ou enrichir) le bouton « Nouvelle LDM » sur le même modèle.
- `App.jsx` : retirer l'entrée « Chiffrage » de la sidebar et la route associée.

### 6.2 Nouveau composant à créer

- Un composant **modale de création** unifié, partagé entre Devis et LDM. Nom suggéré : `<CreationDevisModale>` ou `<NouvelleSaisieHonoraires>`. Il contient :
  - L'onglet « Mode rapide » avec saisie de lignes libres (libellé + chapitre + montant)
  - L'onglet « Mode chiffré » qui rend l'écran Chiffrage existant comme sous-composant
  - Une zone récapitulative en bas qui consolide les lignes des deux modes et présente la remise commerciale par chapitre
  - Un bouton de validation final

### 6.3 Suppression à effectuer

- Le composant `Chiffrage.jsx` (ou nom équivalent issu de la sous-étape C) reste, mais il n'est plus une page autonome — il devient un sous-composant utilisé uniquement à l'intérieur de la modale de création de devis ou de LDM.
- L'entrée correspondante de la sidebar et la route correspondante sont supprimées.

### 6.4 Page d'édition d'un devis ou d'une LDM existante

Quand l'utilisateur ouvre un devis (ou une LDM) déjà créé pour le modifier, il **retombe sur la modale d'origine** avec les valeurs pré-remplies, et peut modifier ce qui doit l'être (ajout / suppression de lignes en mode rapide, modification de la volumétrie en mode chiffré, ajustement de la remise commerciale).

---

## 7. Critères d'acceptation

Le complément est livré quand :

1. L'entrée « Chiffrage » de la sidebar est supprimée. La route correspondante n'existe plus.
2. Le bouton « Nouveau devis » ouvre la modale unifiée à deux modes.
3. Le bouton « Nouvelle LDM » ouvre la même modale unifiée.
4. Un utilisateur peut créer un devis 100 % mode rapide (par exemple : déclaration IR à 300 €).
5. Un utilisateur peut créer un devis 100 % mode chiffré (cas existant après sous-étape C).
6. Un utilisateur peut créer un devis mixte (mode rapide + mode chiffré combinés).
7. La saisie d'un montant accepté < total théorique génère automatiquement une ligne de remise commerciale au niveau du chapitre concerné.
8. La remise commerciale apparaît sur le PDF du devis et de la LDM (théorique barré + accepté retenu + mention de la remise). Elle est consultable également sur la fiche interne.
9. Le total théorique, le total accepté et la remise sont consultables sur la fiche interne du devis.
10. La transformation d'un devis validé en LDM crée une LDM avec exactement les mêmes lignes, le même total accepté et la même remise.
11. La modification d'un devis existant rouvre la modale d'origine avec les valeurs pré-remplies.
12. Tous les tests de la sous-étape C continuent à passer (les 13 + 6 tests).
13. Au moins un test automatique est ajouté pour vérifier le calcul de la remise commerciale par chapitre.

---

## 8. Points ouverts à valider en cours d'implémentation

1. **Nom du composant modale** : `CreationDevisModale`, `NouvelleSaisieHonoraires`, ou autre ? Pas critique, à choisir au moment de l'implémentation.

2. **Comportement si l'utilisateur ajuste le montant accepté en dessous du coût analytique du temps budgété** (par exemple : 200 € pour un chapitre dont le coût analytique en heures × taux est de 250 €) : afficher un avertissement non bloquant à la saisie. L'EC reste maître de sa décision commerciale mais il a la donnée sous les yeux. Le format suggéré : un bandeau d'avertissement qui apparaît sous le champ de saisie quand la condition est détectée, avec le montant du coût analytique calculé et l'écart.
