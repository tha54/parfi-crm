#!/usr/bin/env python3
"""
Agrège les prestations détaillées d'un devis en 3-5 missions commerciales.
"""

CATEGORIES = [
    {
        'key': 'Comptabilité',
        'label': 'Tenue et révision comptable',
        'description': (
            'Tenue de votre comptabilité dans nos outils, lettrage des comptes, traitement des '
            'immobilisations, révision annuelle. Établissement du bilan, du compte de résultat et de l’annexe.'
        ),
        'section': 'Comptabilité',
        'keywords': [
            'comptab', 'saisie', 'révision', 'bilan', 'grand livre',
            'lettrage', 'rapprochement', 'journaux', 'écritures',
            'arrêté des comptes', 'clôture', 'immobilisation',
        ],
    },
    {
        'key': 'Fiscalité',
        'label': 'Obligations fiscales',
        'description': (
            'Liasse fiscale, déclaration et paiement de l’IS (acomptes et solde), CET, DAS2, TVA. '
            'Suivi des avis et demandes éventuelles de dégrèvement.'
        ),
        'section': 'Fiscalité',
        'keywords': [
            'liasse', 'fiscal', 'tva', 'déclaration', 'impôt',
            'cfe', 'cvae', ' is ', ' ir ', 'annexe fiscal', '2072',
        ],
    },
    {
        'key': 'Social',
        'label': 'Gestion sociale et paie',
        'description': (
            'Établissement des bulletins de paie, DSN mensuelle, déclarations sociales. '
            'Gestion des entrées-sorties et soldes de tout compte.'
        ),
        'section': 'Social',
        'keywords': [
            'social', 'paie', 'bulletin', 'dsn', 'urssaf',
            'salarié', 'embauche', 'dpae', 'congé', 'rémunération',
        ],
    },
    {
        'key': 'Juridique',
        'label': 'Secrétariat juridique annuel',
        'description': (
            'Rédaction de votre assemblée générale ordinaire d’approbation des comptes, '
            'formalités de dépôt légal au greffe.'
        ),
        'section': 'Juridique',
        'keywords': [
            'juridique', 'assemblée', 'statuts', ' ag ', ' aga ',
            'procès-verbal', 'pv ', 'formalité', 'greffe', 'registre',
        ],
    },
    {
        'key': 'Conseil',
        'label': 'Accompagnement et conseil',
        'description': (
            'Réponse à vos questions ponctuelles tout au long de l’année — '
            'fiscales, sociales, organisationnelles.'
        ),
        'section': 'Conseil',
        'keywords': [
            'conseil', 'accompagnement', 'tableaux de bord', 'budget',
            'prévisionnel', 'pilotage', 'aide', 'assistance',
        ],
    },
]


def aggregate(prestations):
    """Regroupe les prestations détaillées en missions commerciales.

    Returns:
        list of mission dicts: {libelle, description, type, periodicite, montant_annuel_ht}
    """
    totals = {}

    for prest in prestations:
        text = ' '.join([
            (prest.get('libelle') or prest.get('description') or ''),
            (prest.get('rubrique') or ''),
            (prest.get('section') or ''),
        ]).lower()

        matched_key = None
        for cat in CATEGORIES:
            if any(kw in text for kw in cat['keywords']):
                matched_key = cat['key']
                break

        if not matched_key:
            matched_key = 'Conseil'

        amt = float(
            prest.get('montant_annuel_ht') or
            prest.get('tarif_ht') or
            prest.get('totalHT') or 0
        )

        if matched_key not in totals:
            cat_info = next(c for c in CATEGORIES if c['key'] == matched_key)
            totals[matched_key] = {
                'label':       cat_info['label'],
                'description': cat_info['description'],
                'section':     cat_info['section'],
                'total':       0.0,
            }
        totals[matched_key]['total'] += amt

    missions = []
    for cat in CATEGORIES:
        key = cat['key']
        if key in totals and totals[key]['total'] > 0.01:
            missions.append({
                'libelle':           totals[key]['label'],
                'description':       totals[key]['description'],
                'type':              totals[key]['section'],
                'periodicite':       'Mensuel',
                'montant_annuel_ht': round(totals[key]['total'], 2),
            })

    return missions
