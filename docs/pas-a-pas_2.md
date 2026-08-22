# Pas à pas

Six séances. Chacune a un objectif unique et un critère de fin vérifiable. Ne pas
enchaîner deux objectifs dans la même séance : c'est la principale cause de code
approximatif.

---

## Petit glossaire (à lire une fois)

- **Dépôt** : le dossier du projet, suivi par un outil d'historique (git). Chez vous,
  `/opt/parfi-crm`.
- **Branche** : une copie de travail du projet. Vous y modifiez ce que vous voulez sans
  toucher à la version en service ; on fusionne plus tard, quand c'est validé. C'est le
  filet de sécurité de toute cette opération.
- **Commit** : un point de sauvegarde daté et commenté. On peut toujours y revenir.
- **Migration** : un script qui modifie la structure de la base de données (créer une
  table, ajouter une colonne), avec son inverse pour revenir en arrière.

Vous n'avez aucune de ces commandes à taper. Claude Code les exécute, vous les lui
demandez en français.

---

## Séance 0 — Préparer le terrain (30 minutes)

**Objectif :** les cinq documents sont rangés dans le projet, sur une branche de travail.

### A. Télécharger les fichiers sur votre PC

Dans la conversation, cliquer sur chacun des cinq fichiers, puis sur l'icône de
téléchargement. Ils arrivent dans `C:\Users\<vous>\Downloads` :

- `spec-moteur-cotation.md`
- `modele-cotation.md`
- `descriptions-missions.md`
- `SKILL.md`
- `pas-a-pas.md` (ce document)

### B. Ouvrir le projet dans VS Code

Ouvrir VS Code et ouvrir le projet Parfi CRM comme vous le faites d'habitude.

Vérification : en bas à gauche de la fenêtre, dans la barre bleue, doit apparaître
l'adresse du serveur (quelque chose comme `SSH: 163.172.158.24`). Si c'est le cas, vous
travaillez bien sur le serveur.

Si vous êtes au bureau et que la connexion échoue, basculer d'abord votre PC sur le
partage de connexion de votre téléphone : le port sortant utilisé par SSH est bloqué sur
le réseau du cabinet.

### C. Déposer les fichiers dans le projet

Dans la colonne de gauche de VS Code (l'explorateur, la liste des fichiers du projet),
sélectionner le nom du projet tout en haut, puis faire glisser les cinq fichiers depuis
votre dossier Téléchargements vers la zone vide en bas de cette liste.

VS Code peut demander de confirmer la copie vers le serveur : accepter.

Vérification : les cinq noms de fichiers apparaissent dans la liste, au même niveau que
les dossiers existants du projet.

### D. Ouvrir Claude Code

Ouvrir Claude Code dans VS Code, comme vous le faites pour vos autres sessions.

### E. Coller ce texte, tel quel

```
Les cinq fichiers suivants viennent d'être déposés à la racine du projet :
spec-moteur-cotation.md, modele-cotation.md, descriptions-missions.md,
SKILL.md, pas-a-pas.md.

Range-les et prépare le terrain, sans rien modifier d'autre :

1. Crée une branche de travail nommée feat/moteur-cotation et bascule dessus.
2. Crée les dossiers docs/ et .claude/skills/lettre-de-mission-parfi/.
3. Déplace dans docs/ les fichiers spec-moteur-cotation.md,
   modele-cotation.md, descriptions-missions.md et pas-a-pas.md.
4. Déplace SKILL.md dans .claude/skills/lettre-de-mission-parfi/.
5. Ajoute à la fin du fichier CLAUDE.md à la racine (crée-le s'il n'existe
   pas) la section suivante :

## Module devis et lettres de mission
Toute évolution du moteur de cotation, des devis ou des lettres de mission
suit docs/spec-moteur-cotation.md. Ne pas improviser de règle métier : si la
spécification ne couvre pas le cas, s'arrêter et le signaler.

6. Fais un commit de l'ensemble, message : "docs: spécification du moteur de
   cotation et skill lettre de mission".
7. Affiche-moi l'arborescence obtenue et confirme le nom de la branche active.
```

Si Claude Code demande l'autorisation d'exécuter des commandes, accepter.

### F. Vérifier que c'est fait

Trois choses à contrôler dans la colonne de gauche de VS Code :

1. Un dossier `docs` contenant quatre fichiers.
2. Un dossier `.claude` contenant `skills/lettre-de-mission-parfi/SKILL.md`. Si `.claude`
   n'apparaît pas, c'est normal : VS Code masque parfois les dossiers commençant par un
   point. Demander alors à Claude Code : « affiche-moi le contenu du dossier .claude ».
3. Plus aucun des cinq fichiers à la racine du projet.

Et dans la barre bleue en bas de VS Code, le nom de la branche affichée doit être
`feat/moteur-cotation` et non `main` ou `master`.

**Si quelque chose bloque :** décrire le blocage à Claude Code en français, littéralement
(« je ne vois pas le dossier docs », « il me dit que la branche existe déjà »). C'est plus
rapide que de chercher la commande.

**Critère de fin :** Claude Code vous a affiché l'arborescence, avec `docs/` et
`.claude/skills/`, et confirme travailler sur la branche `feat/moteur-cotation`.

---

## Séance 1 — Vos décisions (20 minutes, sans machine)

**Objectif :** les quatre points bloquants sont tranchés et écrits.

Créer `docs/decisions.md` et le remplir :

```markdown
# Décisions du cabinet

## 1. Profil d'accompagnement allégé
Cas ouvrant droit (liste fermée) :
- ...
Effet : retire l'entretien de bilan. La révision et la supervision sont conservées.

## 2. Gérant de SCI rémunéré
Position retenue : ...

## 3. Cotation à la ligne et cotation au volume
Cumul autorisé : oui / non. Si oui, dans quels cas : ...

## 4. Niveaux d'intervenant
Liste retenue : ...
Taux horaire de chacun : renvoyé à la table des paramètres.
```

**Critère de fin :** aucune ligne du fichier ne commence par « à voir ».

---

## Séance 2 — Mesurer (Claude Code, environ une heure)

**Objectif :** disposer de coefficients et de temps mesurés, pas hérités.

Prompt à coller :

```
Lis docs/spec-moteur-cotation.md, section 2.3.

Écris deux scripts d'analyse, dans scripts/mesures/ :

1. volumetrie.js : à partir d'un ou plusieurs fichiers d'écritures comptables
   (FEC, format normalisé), compte le nombre de lignes par journal, le nombre
   de pièces distinctes et le nombre de mouvements de trésorerie. Sortie :
   lignes par pièce et lignes par mouvement, par dossier et en médiane.

2. temps.js : à partir de l'export CSV des temps réels (point-virgule, UTF-8,
   colonnes Collaborateur, Date, Dossier, Code tâche, Tâche, Catégorie,
   Libellé, Durée HH:MM, Exercice, Facturation), calcule par code de tâche la
   médiane, le premier et le troisième quartile, et le nombre d'observations.

Les deux scripts écrivent leur résultat dans docs/mesures.md, en tableaux
markdown. Ils ne modifient rien d'autre.

Propose ton plan avant de coder.
```

Puis lancer les scripts sur un échantillon d'une dizaine de dossiers représentatifs.

**Critère de fin :** `docs/mesures.md` contient deux tableaux chiffrés. Vous regardez les
médianes et vous dites si elles vous paraissent plausibles : c'est votre contrôle, pas
celui de la machine.

---

## Séance 3 — Les tables et la volumétrie (Claude Code)

**Objectif :** le schéma existe et le calcul de volumétrie retombe sur vos chiffres.

Prompt à coller :

```
Lis docs/spec-moteur-cotation.md en entier, puis docs/decisions.md.

Objectif de cette séance, rien d'autre :

1. Migrations MySQL des tables de la section 2, une par table, réversibles.
2. Seed de la table parametre à partir des valeurs de docs/mesures.md.
3. Implémentation du calcul de volumétrie de la section 2.3, dans un module
   isolé, sans dépendance à Express. Les coefficients sont lus dans la table
   parametre, jamais écrits dans le code.
4. Tests unitaires : le jeu d'essai de la section 2.3 (30 factures d'achats
   par mois, 2 imputations, hors exonération, doit donner 1440 lignes ;
   608 mouvements de trésorerie doivent donner 2432 lignes).

Ne touche ni au frontend, ni au moteur de dérivation, ni aux documents.

Propose ton plan avant de coder.
```

**Critère de fin :** les tests passent, et une migration inverse rejouée laisse la base
dans son état initial.

---

## Séance 4 — Le moteur, sur un seul cas (Claude Code)

**Objectif :** un profil en entrée, un devis chiffré en sortie, sur un dossier réel.

Prompt à coller :

```
Lis docs/spec-moteur-cotation.md, sections 2, 3 et 4.

Objectif de cette séance : le moteur de dérivation, limité au cas de test n° 1
(entreprise individuelle, BIC réel simplifié, TVA réel simplifié, un salarié,
exploitant TNS).

1. Module de dérivation isolé : entrée = profil, sortie = lignes de tâches
   avec quantité, temps, montant, affectation. Aucune dépendance à Express.
2. Seed du catalogue : quinze à vingt tâches suffisantes pour ce cas, avec
   leurs déclencheurs, leurs modes de cotation et leurs affectations.
3. Les quatre modes de cotation de la section 3 sont implémentés.
4. Tests : le profil du cas n° 1 produit exactement la liste de tâches
   attendue, et le total chiffré est stable.

Ne touche ni au frontend, ni aux textes de lettre de mission.

Propose ton plan avant de coder.
```

**Critère de fin :** vous comparez le total obtenu au devis réel de ce dossier. Un écart
est normal ; ce qui compte est que vous sachiez l'expliquer ligne à ligne.

---

## Séance 5 — Étendre le catalogue (plusieurs séances courtes)

**Objectif :** un cas de test supplémentaire par séance, jamais deux.

Pour chaque cas de la section 4 de la spécification, un prompt de la même forme : ajouter
les tâches manquantes, écrire les déclencheurs, ajouter le test. Vous validez le résultat
métier à chaque fois.

**Critère de fin :** les six cas passent, et une modification de profil sur un dossier
change bien la liste des tâches sans qu'aucune case n'ait été cochée à la main.

---

## Séance 6 — Les documents (lot 2)

**Objectif :** le devis et la lettre de mission sortent du même jeu de lignes.

Prompt à coller :

```
Lis docs/spec-moteur-cotation.md, docs/descriptions-missions.md et
.claude/skills/lettre-de-mission-parfi/SKILL.md.

Objectif : la génération documentaire.

1. Table bloc_texte et seed à partir de docs/descriptions-missions.md, plus
   les huit mentions normatives obligatoires de la Skill.
2. Assemblage de la lettre de mission selon l'architecture en sept pages
   décrite dans la Skill, à partir de l'instantané du devis. Aucun recalcul.
3. Tableau de répartition des travaux dérivé des mêmes lignes.
4. Les contrôles bloquants de la section 3 de la spécification, avant émission.
5. Rendu PDF à la maquette du cabinet.

Propose ton plan avant de coder.
```

**Critère de fin :** la lettre générée pour le dossier du cas n° 1 passe la liste de
contrôle du § 8 de la Skill, mentions normatives comprises.

---

## Règles de conduite valables pour toutes les séances

- Un objectif par séance. Si Claude Code propose d'en faire plus, refuser.
- Toujours exiger le plan avant le code, et le lire.
- Repartir d'un contexte propre entre deux séances.
- Commit à la fin de chaque séance, même incomplet, avec un message décrivant l'état réel.
- Si la spécification ne couvre pas un cas : ne pas laisser trancher par la machine.
  C'est une décision métier, elle remonte dans `docs/decisions.md`.
