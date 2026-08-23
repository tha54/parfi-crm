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

## 5. Enchaînement devis, lettre de mission et signature

**Deux documents distincts, deux registres, une seule signature.**

Le **devis** est commercial. Il met en avant le cabinet et ses services, en langage
client, à la maille **mission** — un paragraphe par mission, source
`descriptions-missions.md`. Il n'a aucune valeur contractuelle au sens de l'article 151
du décret 2012-432. Il n'est pas signé.

La **lettre de mission** est le document officiel, de registre austère, à la maille
**tâche**, avec ses annexes obligatoires : tableau de répartition, conditions générales,
annexe honoraires. C'est le seul document signé, via YouSign.

**Deux vues d'une même dérivation.** Le moteur produit la maille tâche ; le devis
l'agrège par mission. Les lignes de tâches ne sont jamais exposées dans le devis.

**Acceptation du devis.** Orale, tracée dans Parfi par un horodatage avec l'auteur de la
saisie et un champ libre de contexte. Ce n'est pas une preuve opposable, c'est la
traçabilité de qui a autorisé le passage en LDM et sur quelle base de prix. Statut du
devis : brouillon, envoyé, accepté, refusé, expiré.

**Verrouillage des montants.** La LDM *lit* le montant du devis accepté, elle ne le
recalcule pas. Une évolution du barème entre les deux dates ne doit jamais produire
d'écart entre le devis et l'annexe honoraires.

**Contrôle de cohérence bloquant.** Toute mission mise en avant dans le devis doit avoir
sa contrepartie en tâches dans la LDM. Un devis promettant une prestation absente du
périmètre contractuel est un risque de mise en cause.

**Tableau de répartition.** Dérivé du *même* arbre de tâches que la cotation, jamais une
annexe statique. Une tâche cotée est attribuée au cabinet ; une tâche non cotée revient
au client et apparaît explicitement dans sa colonne.

**Étape d'acceptation de mission (gate de conformité).** Bloquant, entre le devis
accepté et la LDM : identification du client et du bénéficiaire effectif, appréciation
du risque LCB-FT, vérification de la compétence disponible, absence de conflit
d'intérêts, et pour un dossier repris, lettre au confrère prédécesseur. Fondement :
articles 145 et 151 du décret 2012-432, et obligations de vigilance à l'entrée en
relation d'affaires.

**Signature de la LDM antérieure au commencement des travaux** (article 151).
Conséquences système, non contournables :

- les tâches sont générées à la signature, jamais avant ;
- aucune saisie de temps n'est possible sur un dossier dont la LDM n'est pas signée ;
- relance automatique des LDM envoyées et non signées au-delà d'un délai paramétrable,
  sans valeur par défaut.

**LDM en cours de signature et changement de prix.** Une LDM partie en signature dont
le prix change est annulée puis régénérée, jamais corrigée en place.

**Onboarding client.** Le processus d'onboarding ne démarre qu'à la signature de la LDM.
Il inclut les premiers travaux : aucun travail de mission avant signature. Ses tâches
sont générées par le même déclencheur que les tâches récurrentes — la signature — avec
leurs propres échéances, et alimentent le plan de charge du responsable de portefeuille.
L'onboarding n'est pas une checklist ouverte à la main mais une conséquence automatique
de la signature.

Frontière matérielle, non chronologique. Est un travail de mission tout acte produisant
un effet chez un tiers ou sur les comptes du client.

- *Autorisé avant signature* (gestion interne, sans effet externe) : création de la
  fiche prospect, saisie des coordonnées, dimensionnement, devis.
- *Interdit avant signature* : ouverture du dossier dans Tiime, demande de mandat SEPA
  ou d'accès bancaires, récupération des fichiers comptables du confrère, inscription à
  l'annuaire de réception de facturation électronique, toute production comptable,
  fiscale, sociale ou juridique.

La lettre au confrère prédécesseur relève du gate d'acceptation de mission (ci-dessus),
pas de l'onboarding : elle vérifie la possibilité de prendre le dossier, elle ne
l'exécute pas.

Le blocage est structurel, non déclaratif. Ces actions ne sont pas proposées dans
l'interface tant que la LDM n'est pas signée — pas d'avertissement contournable, pas de
bouton grisé avec message : absence de commande.

## 6. Structure et contenu du devis

**Format retenu :** volumes visibles + sous-totaux par mission. Les prix unitaires ne
sont **jamais** affichés. Motif à consigner : les volumes justifient le prix et rendent
la révision annuelle constatable, tandis que le barème unitaire reste couvert — actif
commercial du cabinet, et exposition directe à la comparaison confrère.

**Usage.** PDF envoyé après l'entretien de découverte. Le client le lit seul. Le
document doit donc se justifier sans présence du cabinet, ce qui commande sa structure.

**Structure en six blocs :**

1. **Restitution de la situation du client** — forme juridique, activité, régime fiscal
   et de TVA, effectif, date de clôture. Preuve que la cotation répond au dossier et
   non à un tarif de catalogue.
2. **Volumes retenus**, avec source et date : « déclarés par le client lors de
   l'entretien du JJ/MM/AAAA » ou « constatés sur pièces » en cas de reprise. La source
   est un champ du modèle, pas une mention libre.
3. **Missions**, un paragraphe chacune en langage client (source
   `descriptions-missions.md`), avec sous-total par mission.
4. **Récapitulatif honoraires** : mensuel et annuel, HT et TTC, modalités de règlement.
5. **Ce qui n'est pas compris** : exclusions explicites de périmètre.
6. **Suite du parcours** : mention que le devis n'a pas valeur de contrat et qu'une
   lettre de mission sera établie et signée avant tout travail.

En complément : durée de validité du devis (paramétrable, sans valeur par défaut) et
mention que le prix est établi sur la base des volumes annoncés.

**Règle d'agrégation.** Les composantes indissociables du socle — révision, supervision,
entretien de bilan — n'apparaissent **pas** en ligne autonome avec montant propre. Elles
sont décrites dans le paragraphe de la mission comptable et incluses dans son
sous-total. Motif : un client doit pouvoir renoncer au social, jamais à la révision.
Isoler une ligne, c'est la rendre retirable.

**Rappel.** Le devis reste à la maille **mission**. Les tâches, les temps et les coûts
de revient ne figurent jamais dans le document client.

### Gabarit de référence

Le devis PDF est validé dans la forme suivante, gabarit de référence pour la
spécification.

**En-tête.** Identité du cabinet, mention de l'inscription au tableau de l'Ordre,
numéro de devis, date d'établissement.

**Bloc 1 — Votre situation.** Société, activité, régime fiscal, effectif, date de
clôture, périodicité de TVA. Présenté en grille compacte, pas en paragraphe.

**Bloc 2 — Volumes retenus.** Un volume par ligne, avec sa périodicité. Immédiatement
suivi de la mention de source, datée et typée : « Volumes déclarés par le client lors
de l'entretien du JJ/MM/AAAA » ou « Volumes constatés sur pièces » en cas de reprise.
Cette mention est générée depuis un champ du modèle, jamais saisie librement.

**Bloc 3 — Nos prestations.** Une entrée par mission, chacune composée du libellé, du
sous-total mensuel aligné à droite, et d'un paragraphe descriptif en langage client.
Rédaction à la première personne du cabinet (« nous tenons », « nous établissons »),
pas en style catalogue : le document se lit sans présence du cabinet.

La révision, la supervision et l'entretien de bilan sont *décrits* à l'intérieur du
paragraphe de la mission comptable et n'ont ni ligne ni montant propres. Règle déjà
posée : une ligne isolée est une ligne retirable.

**Bloc 4 — Total.** Montant mensuel HT en évidence, puis en second rang le montant
annuel HT et TTC, puis les modalités de règlement.

**Bloc 5 — Ce qui n'est pas compris.** Liste des exclusions de périmètre, en corps de
texte normal, placée *avant* la conclusion et jamais en mention de bas de page. Motif à
consigner : un client qui découvre une exclusion au moment où il la subit réagit plus
mal que celui qui l'a lue d'emblée.

**Bloc 6 — La suite.** Mention que la proposition n'a pas valeur de contrat, qu'une
lettre de mission sera établie après accord, et que sa signature précède le démarrage
des travaux. Puis durée de validité du devis et rappel que les honoraires reposent sur
les volumes annoncés.

**Contraintes transverses.**

- Aucun prix unitaire, aucun temps, aucun coût de revient, aucune ligne de tâche ne
  figure dans le document client.
- Le contenu des blocs 1, 2, 3 et 4 est intégralement généré depuis les données du
  dossier. Aucune saisie libre en dehors du champ de contexte de l'entretien.
- Les paragraphes de mission proviennent de `descriptions-missions.md`.
- Les exclusions du bloc 5 sont déduites des missions non retenues dans la cotation,
  plus une liste fixe d'exclusions permanentes. Cette liste fixe reste à établir (cf.
  « Reste ouvert »).

## 7. Missions ponctuelles, avenants et révision des honoraires

**Prestations hors périmètre.** Une prestation hors du périmètre de la mission
récurrente déclenche un devis complémentaire, *puis* une lettre de mission distincte
pour cette prestation. **Jamais un avenant.** Motif à consigner : une prestation hors
périmètre est une autre mission, avec sa nature propre, ses obligations
professionnelles et ses clauses de responsabilité. La loger dans un avenant à la
mission récurrente lui ferait hériter de clauses inadaptées.

Aucun taux horaire n'est affiché dans la LDM récurrente : le barème reste fermé,
cohérent avec la règle posée pour le devis (§6).

**Rôle de l'avenant.** Restreint et distinct : modifier la mission existante — variation
de volumes, ajout ou retrait d'une mission au périmètre, changement de périodicité.
Deux objets, deux mécanismes, à ne jamais confondre dans le modèle.

**Conséquence de modélisation : plusieurs LDM actives par dossier.** Un client porte
une LDM récurrente et zéro à n LDM ponctuelles, simultanément actives. À répercuter
sur :

- la **facturation** : une LDM ponctuelle se facture à son propre rythme,
  indépendamment de l'échéancier du récurrent ;
- les **tâches** : générées par LDM, chacune avec son budget de temps ;
- le **suivi de rentabilité** : celui d'une mission ponctuelle se juge séparément,
  sans être agrégé au récurrent qu'elle masquerait ou dégraderait.

**Révision annuelle des honoraires : clause de révision notifiée, jamais une clause
d'indexation.** Mécanisme : le cabinet notifie le nouveau montant avant une date de
référence, avec préavis. Le client dispose d'un délai pour refuser ; le refus ouvre
une négociation ou la résiliation à l'échéance. À défaut de réponse dans le délai, le
nouveau montant s'applique à la période suivante.

Motif juridique à consigner : l'article L112-2 du code monétaire et financier
interdit les indexations fondées sur le niveau général des prix ou des salaires ; une
clause indexée sur l'inflation serait réputée non écrite, de même qu'une clause ne
jouant qu'à la hausse (la réciprocité est exigée). Le mécanisme de notification
n'étant pas automatique, il échappe à ce texte.

La clause peut mentionner que la révision tient compte de l'évolution des charges du
cabinet, sans renvoyer à aucun indice ni à aucun calcul automatique. Préavis et délai
de réponse du client : paramètres nommés, sans valeur par défaut.

**Clause distincte pour l'écart de volumes**, sur le même mécanisme de notification.
Ne pas fusionner avec la précédente : l'une couvre l'évolution des charges du cabinet,
l'autre l'évolution du périmètre réel. Seuil de déclenchement : paramètre sans valeur
par défaut.

---

## Reste ouvert

- Plancher d'honoraires par dossier : montant à fixer.
- Règle d'affectation par défaut entre junior, médior et sénior selon la complexité du
  dossier.
- Position exacte du gate de conformité (§5) : avant génération de la LDM, ou avant
  envoi en signature.
- Délai de relance des LDM envoyées et non signées (§5).
- Seuil d'écart de volumes déclenchant un avenant au renouvellement annuel.
- Durée de validité du devis (§6) : nombre de jours à fixer.
- Liste fixe d'exclusions permanentes du devis (§6, gabarit de référence) : à établir.
  Aucune source existante aujourd'hui, ni dans `descriptions-missions.md`, ni en base,
  ni en code.
- Préavis et délai de réponse du client sur la révision notifiée (§7) : nombre de
  jours à fixer, pour chacun des deux mécanismes (charges cabinet, écart de volumes).
- Seuil d'écart de volumes déclenchant la clause de révision (§7) : à fixer.
- Portée du gate de conformité (§5) pour une LDM ponctuelle sur client déjà connu :
  contrôle intégral ou forme allégée. La vigilance LCB-FT étant continue, un contrôle
  nul est exclu, mais la nature d'une mission exceptionnelle peut modifier
  l'appréciation du risque.
