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
| `mode_cotation` | au temps, au volume, à la ligne, au forfait unitaire |
| `cadence` | pour le mode au volume : nombre de lignes traitées par heure |
| `quantite` | fixe, ou formule sur la volumétrie |
| `periodicite` | mensuelle, trimestrielle, annuelle, à la clôture, date légale, ponctuelle |
| `temps_standard` | en minutes, calibré (§ 6) |
| `prix_unitaire` | pour le mode au forfait unitaire (bulletin, acte, ligne) |
| `niveau_intervenant` | assistant, collaborateur, collaborateur social, chef de mission, expert-comptable |
| `repartition` | cabinet, client, sans objet |
| `affichage` | interne (valorisation) ou client (répartition des travaux) |
| `bloc_texte` | bloc de la lettre de mission auquel la tâche se rattache |

Les quatre modes de cotation couvrent tous les cas :
- **au temps** : durée fixe, indépendante du volume (révision, supervision, entretien) ;
- **au volume** : durée = quantité / cadence (saisie des journaux) ;
- **à la ligne** : prix unitaire par écriture (traitement informatisé) ;
- **au forfait unitaire** : prix par occurrence (bulletin de paie, acte juridique).

Une même prestation peut mobiliser plusieurs niveaux d'intervenant. Elle reste **une
ligne de catalogue** portant plusieurs affectations, et non quatre lignes distinctes :
l'entretien de bilan, c'est une prestation, avec une préparation et une présence pour le
chef de mission et pour l'expert-comptable.

Règles d'affectation par niveau :
- saisie et tenue : assistant ;
- cadrages, déclarations périodiques, travaux de bilan : collaborateur ;
- paie et déclarations sociales : collaborateur social ;
- révision, entretien de bilan, points sensibles : chef de mission ;
- supervision et signature : expert-comptable, systématiquement.

---

## 4. L'accompagnement fait partie du socle

Tous les dossiers sont révisés et supervisés, et la quasi-totalité donne lieu à un
entretien de bilan. Ces travaux ne sont donc pas des options de conseil : ce sont des
composantes du socle, à dimensionner et à coter dès le devis. Les traiter comme un module
facultatif conduit mécaniquement à sous-coter la mission réelle.

Conséquences :
- la mission `accompagnement` (révision, supervision, préparation et tenue de l'entretien
  de bilan) est cochée par défaut et ne peut être décochée que par exception motivée ;
- `profil_accompagnement = allégé` est l'exception, réservée aux dossiers sans
  exploitation ni décisions de gestion (SCI simple, société en sommeil, structure
  patrimoniale sans salarié ni activité commerciale). Il retire l'entretien de bilan mais
  conserve la révision et la supervision, qui ne se retirent jamais ;
- côté document, l'entretien de bilan apparaît dans les inclus du forfait, pas dans une
  liste d'options. C'est un argument commercial, pas une ligne à négocier.

---

## 5. Cotation

```
honoraires = Σ (lignes au temps      : temps_standard × quantité × taux[niveau])
           + Σ (lignes au volume     : quantité / cadence × taux[niveau])
           + Σ (lignes à la ligne    : quantité × prix_unitaire)
           + Σ (lignes au forfait    : nombre × prix_unitaire)
           + abonnements et frais de dossier
           − prestations offertes
           + forfait de mise en place si premiere_annee
```

Les lignes de valorisation restent internes, les lignes affichées sont regroupées par
mission. Le devis et la lettre de mission consomment le même calcul : un écart entre les
deux documents est un défaut bloquant.

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

- Dossiers mixtes : une entité, plusieurs activités ou établissements.
- Changement de régime en cours d'exercice : avenant automatique ou révision manuelle.
- Rémunération du dirigeant TNS : quelle part de conseil est incluse au forfait.
- Dossiers à dimension transfrontalière : bloc de texte et tâches spécifiques, à écrire.
- Liste fermée des cas ouvrant droit au `profil_accompagnement = allégé`.
