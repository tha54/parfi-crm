# Décisions du cabinet

Ce document prévaut sur toute autre indication de `docs/`. En cas de divergence avec la
spécification, c'est la spécification qui est corrigée, pas l'inverse.

---

## 1. Profil d'accompagnement allégé

**Critères cumulatifs :** aucun salarié, aucune activité commerciale, et un résultat formé
de flux récurrents sans décision de gestion (loyers, dividendes).

**Cas visés :** SCI patrimoniale, société en sommeil, holding passive.

**Effet :** retire l'entretien de bilan du dimensionnement. La révision et la supervision
sont conservées dans tous les cas et ne peuvent jamais être retirées.

Une entité présentant une exploitation, même modeste, reste en profil complet.

## 2. Gérant de SCI rémunéré

**Le moteur ne tranche pas.**

Valeur par défaut : gérant non rémunéré, donc aucun statut social et aucun module paie.

Si la rémunération est renseignée, le statut social passe en saisie manuelle, avec un
signalement à l'écran : la qualification dépend de la qualité d'associé du gérant et
relève d'une analyse au cas par cas. Aucune règle automatique n'est écrite sur ce point.

## 3. Valorisation et charge : deux calculs indépendants

**Principe retenu :** le prix ne dérive plus du temps.

La facturation électronique et la numérisation réduisent le temps passé, et cette
réduction est déjà constatée. Une valorisation au temps reviendrait à restituer aux
clients la totalité des gains de productivité. Le cabinet retient donc une valorisation à
la ligne pour les travaux de tenue.

Chaque tâche du catalogue porte deux attributs distincts :

- **un mode de valorisation**, qui détermine le prix : à la ligne, au forfait unitaire, ou
  au temps pour les seuls travaux non industrialisables (révision, supervision, entretien
  de bilan, points sensibles) ;
- **un mode de charge**, qui détermine le temps prévisionnel : ce temps est calculé dans
  tous les cas, y compris sur les lignes valorisées à la ligne, car il sert à affecter le
  travail au collaborateur, à construire le plan de charge, et à suivre ensuite l'écart
  entre prévu et réalisé.

Non-cumul : une même écriture n'est jamais valorisée deux fois, ni à la ligne et au
volume, ni à la ligne et au temps.

**Conséquences à surveiller**, sans quoi le mécanisme se retourne :

- le taux horaire implicite (prix facturé rapporté au temps réellement passé) devient
  l'indicateur central du dossier. Il monte quand l'automatisation produit ses effets ;
  il doit être suivi dossier par dossier ;
- un plancher d'honoraires par dossier reste nécessaire, un dossier à faible volume ne
  devant pas descendre sous le coût de sa révision et de sa supervision ;
- inversement, un dossier à fort volume mais très automatisé peut devenir cher au regard
  du marché. Le prix à la ligne se révise donc au même rythme que les temps standards.

## 4. Niveaux d'intervenant

Huit niveaux :

| Code | Libellé |
|---|---|
| `COLLAB_JUNIOR` | collaborateur junior |
| `COLLAB_MEDIOR` | collaborateur médior |
| `COLLAB_SENIOR` | collaborateur sénior |
| `CHEF_MISSION` | chef de mission |
| `CHEF_GROUPE` | chef de groupe |
| `COLLAB_SOCIAL` | collaborateur social |
| `COLLAB_JURIDIQUE` | collaborateur juridique |
| `EXPERT_COMPTABLE` | expert-comptable |

Chacun porte un taux horaire, logé dans la table des paramètres.

**Conséquence sur les temps standards :** un même travail ne prend pas le même temps
selon le niveau. Le temps standard est donc porté par le couple tâche et niveau, non par
la tâche seule. La table des affectations le permet déjà.

**Conséquence sur le calibrage :** les médianes de temps réels se calculent par tâche et
par niveau. Un volume d'observations insuffisant sur un couple donné se signale plutôt
que de produire un standard faux.

---

## Reste ouvert

- Plancher d'honoraires par dossier : montant à fixer.
- Règle d'affectation par défaut entre junior, médior et sénior selon la complexité du
  dossier.
