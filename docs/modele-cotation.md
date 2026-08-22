# Modèle de dérivation : profil de dossier → obligations → tâches → cotation → affectation

Un seul modèle alimente quatre sorties : le texte de la lettre de mission, le tableau de
répartition des travaux, la cotation des honoraires, et le plan de charge (tâches
planifiées, affectées, budgétées). Toute règle vit à un seul endroit, jamais dupliquée
entre le devis et la lettre.

```
Profil de dossier  →  Variables dérivées  →  Obligations  →  Tâches  →  Temps  →  Prix
                                                    ↓            ↓         ↓
                                              Textes LDM   Affectation  Répartition
```

---

## 1. Profil de dossier (données saisies)

| Champ | Valeurs |
|---|---|
| `forme_juridique` | EI, EURL, SARL, SAS, SASU, SNC, SCI, SCM, SCP, association |
| `nature_activite` | BIC, BNC, BA, civile immobilière, autre |
| `regime_benefice` | IR, IS |
| `regime_reel` | micro, réel simplifié, réel normal |
| `regime_tva` | non assujetti, franchise en base, réel simplifié, réel normal mensuel, réel normal trimestriel |
| `type_tva` | à la facturation, sur les encaissements |
| `dirigeant_type` | exploitant, gérant majoritaire, gérant minoritaire ou égalitaire, président, cogérance |
| `dirigeant_statut_social` | dérivé (§ 2), jamais saisi |
| `nb_dirigeants` | entier |
| `nb_salaries` | entier |
| `convention_collective` | code IDCC |
| `adhesion_oga` | oui / non |
| `option_ecf` | oui / non |
| `commissaire_aux_comptes` | oui / non |
| `operations_intracom` | aucune, biens, services, les deux |
| `nb_etablissements` | entier (CFE par établissement) |
| `premiere_annee` | oui / non (déclenche le forfait de mise en place) |
| `date_cloture` | date |
| `volumetrie` | lignes achats, ventes, trésorerie, caisse, OD ; nb de bulletins ; nb de comptes bancaires ; nb d'immobilisations |
| `particularites` | stocks, comptes courants d'associés, immobilier, dimension transfrontalière |
| `profil_accompagnement` | complet, allégé (§ 4) |

## 2. Variables dérivées

### 2.1 Statut social du dirigeant

| Forme | Fonction | Statut social | Conséquences |
|---|---|---|---|
| EI | exploitant | TNS | cotisations sur le résultat ou la rémunération selon régime, pas de bulletin |
| EURL | associé unique gérant personne physique | TNS | idem |
| EURL | gérant non associé | assimilé salarié | bulletin + DSN |
| SARL | gérant majoritaire (ou collège majoritaire) | TNS | pas de bulletin |
| SARL | gérant minoritaire ou égalitaire rémunéré | assimilé salarié | bulletin + DSN |
| SAS / SASU | président rémunéré | assimilé salarié | bulletin + DSN |
| SAS / SASU | président non rémunéré | aucun | ni bulletin ni cotisation |
| SNC | associé | TNS | pas de bulletin |
| SCI | gérant rémunéré | selon associé / non associé | à trancher au cas par cas, signaler |

Règle : `statut_social = TNS` déclenche le volet social personnel du dirigeant côté
fiscal, jamais le module paie. `statut_social = assimilé salarié` déclenche le module
paie même pour un unique mandataire, avec sa DSN.

### 2.2 Obligations déclaratives de résultat

| `regime_benefice` | `nature_activite` | Déclaration | Tâches induites |
|---|---|---|---|
| IR | BIC réel | déclaration de résultat BIC | liasse, report sur la déclaration de revenus du foyer |
| IR | BNC réel | déclaration de résultat BNC | liasse, report |
| IR | civile immobilière | déclaration de résultat des sociétés immobilières | répartition entre associés |
| IR | micro | néant | report direct, pas de liasse |
| IS | toutes | déclaration de résultat IS | liasse, acomptes, solde |

### 2.3 Obligations de TVA

| `regime_tva` | Déclarations | Nombre de tâches par an |
|---|---|---|
| non assujetti / exonéré | aucune | 0 |
| franchise en base | aucune | surveillance du seuil |
| réel simplifié | annuelle + acomptes | 1 + acomptes |
| réel normal trimestriel | trimestrielle | 4 |
| réel normal mensuel | mensuelle | 12 |

Un contrôle de cohérence TVA à la clôture est déclenché dans tous les cas où l'entité est
assujettie. `operations_intracom` ajoute les états statistiques et récapitulatifs.

### 2.4 Obligations sociales et juridiques

- `nb_salaries > 0` ou dirigeant assimilé salarié : module paie, DSN, taxes assises sur
  les salaires, registres du personnel, affiliation aux caisses.
- `forme_juridique != EI` : approbation annuelle des comptes, procès-verbal, registres,
  dépôt au greffe.
- `commissaire_aux_comptes = oui` : compte rendu de travaux au lieu de l'attestation.

---

## 3. Catalogue de tâches

| Colonne | Rôle |
|---|---|
| `code` | identifiant stable, aligné sur la nomenclature de suivi des temps |
| `libelle_interne` | intitulé métier, jamais affiché au client |
| `mission` | comptabilité, fiscalité, social, juridique, accompagnement |
| `declencheur` | expression booléenne sur le profil (ex. `regime_tva = réel normal mensuel`) |
| `mode_valorisation` | au temps, à la ligne, au forfait unitaire — détermine le prix |
| `mode_charge` | temps standard, ou cadence — détermine le temps prévisionnel |
| `cadence` | lignes traitées par heure ; source du temps quand `mode_charge = cadence` |
| `quantite` | fixe, ou formule sur la volumétrie |
| `periodicite` | mensuelle, trimestrielle, annuelle, à la clôture, date légale, ponctuelle |
| `temps_standard` | en minutes, calibré (§ 6). Renseigné pour toutes les tâches, y compris celles valorisées à la ligne ou au forfait unitaire, car il alimente le plan de charge |
| `prix_unitaire` | pour les modes de valorisation « à la ligne » et « au forfait unitaire » |
| `niveau_intervenant` | huit niveaux (§ 3.1) |
| `repartition` | cabinet, client, sans objet |
| `affichage` | interne (valorisation) ou client (répartition des travaux) |
| `bloc_texte` | bloc de la lettre de mission auquel la tâche se rattache |

Chaque tâche porte deux axes distincts (decisions.md §3). Le mode de valorisation
détermine le prix ; le mode de charge détermine le temps prévisionnel. Le temps est
calculé dans tous les cas, y compris pour les tâches valorisées à la ligne ou au forfait
unitaire, car il alimente le plan de charge et le taux horaire implicite (§ 5.1).

**Modes de valorisation** (déterminent le prix) :
- **au temps** : montant = temps × taux, réservé aux travaux non industrialisables
  (révision, supervision, entretien de bilan, points sensibles) ;
- **à la ligne** : prix unitaire par écriture, mode retenu pour les travaux de tenue ;
- **au forfait unitaire** : prix par occurrence (bulletin de paie, acte juridique).

Le mode « au volume » (`quantité / cadence × taux`) n'est **pas** un mode de
valorisation. Motif : il produit un temps puis le convertit en prix, c'est donc une
valorisation au temps déguisée, qui restitue automatiquement les gains de cadence au
client — précisément ce que decisions.md §3 écarte. Les modes `à la ligne` et
`au forfait unitaire` sont conservés distincts malgré leur mécanique commune
(`quantité × prix unitaire`), pour la lisibilité du catalogue.

**Modes de charge** (déterminent le temps prévisionnel, calculé dans tous les cas) :
- **temps standard** : temps = `temps_standard` × quantité, réparti selon les
  affectations ;
- **cadence** : temps = quantité / `cadence`, réparti selon les affectations. Utilisé
  pour les travaux de tenue valorisés à la ligne. Le champ `cadence` reste actif ici,
  pour alimenter le temps prévisionnel et le taux horaire implicite.

**Non-cumul**, à deux niveaux :
- *Principe métier (decisions.md §3)* : une même écriture n'est jamais valorisée deux
  fois, ni à la ligne et au volume, ni à la ligne et au temps ;
- *Règle d'implémentation* : un même journal ne porte qu'un seul mode de valorisation.
  Plus strict que le principe, retenu pour la vérifiabilité et la lisibilité du devis.

Une même prestation peut mobiliser plusieurs niveaux d'intervenant. Elle reste **une
ligne de catalogue** portant plusieurs affectations, et non plusieurs lignes distinctes :
l'entretien de bilan, c'est une prestation, avec une préparation et une présence pour le
chef de mission et pour l'expert-comptable.

### 3.1 Niveaux d'intervenant

Huit niveaux (decisions.md §4). Chaque niveau porte un taux horaire, logé dans les
paramètres millésimés (§ 8). Le temps standard d'un même travail dépend du niveau qui
l'exécute : il est donc porté par le couple tâche × niveau, non par la tâche seule.

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

Règles d'affectation par nature de travail :
- saisie et tenue : `COLLAB_JUNIOR`, `COLLAB_MEDIOR` ou `COLLAB_SENIOR` selon la
  complexité (règle d'affectation par défaut à préciser, § 9) ;
- cadrages, déclarations périodiques, travaux préparatoires de bilan : `COLLAB_MEDIOR`
  ou `COLLAB_SENIOR` ;
- paie, DSN, déclarations sociales : `COLLAB_SOCIAL` ;
- actes, assemblées, formalités juridiques : `COLLAB_JURIDIQUE` ;
- révision, entretien de bilan, points sensibles : `CHEF_MISSION` ;
- pilotage transverse, arbitrages inter-missions : `CHEF_GROUPE` ;
- supervision et signature : `EXPERT_COMPTABLE`, systématiquement.

---

## 4. L'accompagnement fait partie du socle

Tous les dossiers sont révisés et supervisés, et la quasi-totalité donne lieu à un
entretien de bilan. Ces travaux ne sont donc pas des options de conseil : ce sont des
composantes du socle, à dimensionner et à coter dès le devis. Les traiter comme un module
facultatif conduit mécaniquement à sous-coter la mission réelle.

Conséquences :
- la mission `accompagnement` (révision, supervision, préparation et tenue de l'entretien
  de bilan) est cochée par défaut et ne peut être décochée que par exception motivée ;
- `profil_accompagnement = allégé` est l'exception (decisions.md §1). Il est ouvert aux
  dossiers réunissant **cumulativement** les trois critères suivants : aucun salarié,
  aucune activité commerciale, résultat formé de flux récurrents sans décision de gestion
  (loyers, dividendes). Cas visés : SCI patrimoniale, société en sommeil, holding
  passive. Une entité présentant une exploitation, même modeste, reste en profil complet.
  Le profil allégé retire l'entretien de bilan mais conserve la révision et la
  supervision, qui ne se retirent jamais ;
- côté document, l'entretien de bilan apparaît dans les inclus du forfait, pas dans une
  liste d'options. C'est un argument commercial, pas une ligne à négocier.

---

## 5. Cotation

Deux calculs **indépendants** (decisions.md §3), à mener sur chaque tâche du dossier :
le temps prévisionnel selon le mode de charge, puis les honoraires selon le mode de
valorisation.

**Temps prévisionnel** (mode de charge, calculé pour toutes les tâches, alimente le plan
de charge et le taux horaire implicite) :

```
temps = Σ (tâches charge « temps standard » : temps_standard × quantité)
      + Σ (tâches charge « cadence »        : quantité / cadence)
```

**Honoraires** (mode de valorisation) :

```
honoraires = Σ (tâches valorisation « au temps »       : temps × taux[niveau])
           + Σ (tâches valorisation « à la ligne »      : quantité × prix_unitaire)
           + Σ (tâches valorisation « au forfait »      : nombre × prix_unitaire)
           + abonnements et frais de dossier
           − prestations offertes
           + forfait de mise en place si premiere_annee
```

Les lignes de valorisation restent internes, les lignes affichées sont regroupées par
mission. Le devis et la lettre de mission consomment le même calcul : un écart entre les
deux documents est un défaut bloquant.

### 5.1 Garde-fous économiques

Conséquence directe de la séparation valorisation / charge (decisions.md §3), deux
garde-fous à intégrer au devis et au suivi de dossier.

**Taux horaire implicite** :

```
taux_horaire_implicite = honoraires / temps
```

Ratio calculé au niveau du dossier, affiché sur le devis, suivi ensuite dossier par
dossier à l'aune des temps réellement passés. Indicateur central du dossier : il monte
quand l'automatisation produit ses effets ; sa baisse durable signale qu'il faut réviser
le prix à la ligne ou les cadences. C'est ce ratio, et non plus le temps facturé, qui
mesure la rentabilité de la mission.

**Plancher d'honoraires par dossier** : un dossier à faible volume ne doit pas descendre
sous le coût de sa révision et de sa supervision. Un paramètre nommé
`PLANCHER_HONORAIRES_DOSSIER` porte ce plancher dans la table des paramètres millésimés
(§ 8). Sa valeur reste à décider (§ 9) : aucun montant n'est fixé à ce stade.

Si le paramètre est renseigné, l'émission du devis est bloquée dès lors que les
honoraires totaux HT passent sous ce seuil, jusqu'à révision de la cotation ou dérogation
motivée et tracée.

---

## 6. Calibrage des temps

Ne pas fixer les temps standards à dire d'expert. Ils se calibrent sur les temps réels
déjà saisis par les collaborateurs, par code de tâche et par dossier, en retenant la
médiane plutôt que la moyenne et en segmentant par tranche de volumétrie. Les cadences du
mode « au volume » se calibrent de la même façon, en lignes par heure et par type de
journal.

Boucle : temps standard du devis → temps réel constaté → écart par dossier et par tâche →
révision annuelle du standard et, le cas échéant, de l'honoraire à l'échéance de
reconduction.

---

## 7. Principes de simplification

Le catalogue de référence du marché comporte plusieurs centaines de lignes, dont
l'immense majorité reste décochée sur un dossier donné. Quatre principes pour réduire
sans perdre :

1. **Déclencher, ne pas cocher.** Une ligne apparaît parce que le profil la rend
   applicable, pas parce qu'un opérateur y a pensé. La case à cocher devient une
   exception à la règle, pas le mode de saisie normal.
2. **Une prestation, une ligne.** Les décompositions par intervenant relèvent des
   affectations de la ligne, pas de lignes séparées.
3. **Élaguer l'obsolète.** Toute ligne dont le dispositif a disparu ou fusionné sort du
   catalogue au lieu d'y rester décochée. Le catalogue se relit à chaque loi de finances.
4. **Seuil d'existence.** Une ligne qui n'a été cochée sur aucun dossier depuis deux
   exercices est supprimée ou fusionnée. Le catalogue se mesure à son taux d'utilisation.

Cible raisonnable : quarante à soixante lignes réellement vivantes, contre plusieurs
centaines dormantes.

---

## 8. Paramètres millésimés

Les seuils et taux (franchise en base, bascule entre régimes réels, périodicité de TVA,
taux de cotisations, plafonds sociaux, taux horaires du cabinet, cadences) ne sont jamais
écrits dans les règles. Ils vivent dans une table paramétrée par exercice, avec date
d'effet, et sont vérifiés à chaque loi de finances. Une règle référence un paramètre,
jamais une valeur.

---

## 9. Points à trancher

- **Montant du plancher d'honoraires par dossier** (paramètre
  `PLANCHER_HONORAIRES_DOSSIER`, § 5.1). Le paramètre est créé sans valeur ; aucun
  montant n'est proposé dans ce modèle.
- **Règle d'affectation par défaut entre `COLLAB_JUNIOR`, `COLLAB_MEDIOR` et
  `COLLAB_SENIOR`** selon la complexité du dossier (decisions.md, section « Reste
  ouvert »).
