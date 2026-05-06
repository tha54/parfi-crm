#!/usr/bin/env python3
"""
Lettre de Mission — ParFi France
Conforme norme OEC NP 3-100

Structure :
  Page 1   — Première de couverture (canvas navy)
  Pages 2+ — CONDITIONS PARTICULIÈRES
               • Identification des parties
               • Périmètre des missions (tableau par rubrique)
               • Tableau de répartition des tâches Cabinet / Client
               • Honoraires et modalités de règlement
  Pages suivantes — CONDITIONS GÉNÉRALES (clauses OEC)
               • Art. 1  Durée et reconduction
               • Art. 2  Résiliation
               • Art. 3  Révision des honoraires
               • Art. 4  Obligations du cabinet
               • Art. 5  Obligations du client
               • Art. 6  Responsabilité et assurance RCP
               • Art. 7  Confidentialité et secret professionnel
               • Art. 8  RGPD
               • Art. 9  LCB-FT (blanchiment)
               • Art. 10 Indépendance et déontologie
               • Art. 11 Médiation
  Dernière page — Signatures (puis 4e de couverture canvas navy)
"""

import sys
import io
import re
from datetime import date, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, NextPageTemplate, KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY

# ── Palette ───────────────────────────────────────────────────────────────────
NAVY   = HexColor('#1a3a5c')
NAVY2  = HexColor('#243f5e')
BLUE   = HexColor('#4a6fa5')
LIGHT  = HexColor('#e3eaf4')
SILVER = HexColor('#9ca3af')
LGREY  = HexColor('#f5f7fa')
WHITE  = white
AMBER  = HexColor('#b45309')
GREEN  = HexColor('#166534')
GREEN_BG = HexColor('#f0fdf4')
AMBER_BG = HexColor('#fffbeb')

PAGE_W, PAGE_H = A4
L_MARGIN  = 18 * mm
R_MARGIN  = 18 * mm
CONTENT_W = PAGE_W - L_MARGIN - R_MARGIN

MONTHS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
             'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

SECTION_COLORS = {
    'Comptabilité': HexColor('#1d4ed8'),
    'Fiscalité':    HexColor('#b45309'),
    'Social':       HexColor('#15803d'),
    'Juridique':    HexColor('#7c3aed'),
    'Conseil':      HexColor('#0f766e'),
}

# Répartition tâches par section : (tâches_cabinet, docs_client, délai_client)
REPARTITION = {
    'Comptabilité': {
        'cabinet': [
            'Saisie et codification des pièces comptables',
            'Lettrage des comptes clients et fournisseurs',
            'Rapprochements bancaires',
            'Établissement des situations comptables périodiques',
            'Établissement du bilan et du compte de résultat',
            'Établissement de la liasse fiscale',
        ],
        'client': [
            'Factures d\'achats et de ventes',
            'Relevés bancaires de tous les comptes',
            'Justificatifs de caisse',
            'Notes de frais et justificatifs',
            'Contrats en cours (bail, leasing, emprunts)',
        ],
        'delai': '10 du mois suivant',
    },
    'Fiscalité': {
        'cabinet': [
            'Déclarations de TVA (CA3 / CA12)',
            'Déclaration de résultat (IS ou BIC/BNC)',
            'Liasse fiscale annuelle',
            'Déclarations CFE, CVAE, TASCOM',
            'Réponse aux demandes de l\'administration fiscale',
        ],
        'client': [
            'Éléments de chiffre d\'affaires par régime',
            'Justificatifs d\'exonérations ou de taux réduits',
            'Réponses rapides aux questions du cabinet',
            'Décisions de gestion (choix fiscaux)',
        ],
        'delai': 'Sur demande du cabinet',
    },
    'Social': {
        'cabinet': [
            'Établissement des bulletins de salaire',
            'Déclaration Sociale Nominative (DSN)',
            'Déclarations URSSAF, retraite, prévoyance',
            'DPAE (déclarations préalables à l\'embauche)',
            'Établissement des soldes de tout compte',
            'Attestations employeur',
        ],
        'client': [
            'Éléments variables de paie (heures, primes, absences)',
            'Informations embauches/départs (contrats, avenants)',
            'Arrêts maladie et attestations de salaire',
            'Planning des congés payés',
        ],
        'delai': '25 du mois précédent',
    },
    'Juridique': {
        'cabinet': [
            'Convocations et tenue de l\'assemblée générale annuelle',
            'Rédaction du procès-verbal d\'AGO / AGE',
            'Approbation des comptes et affectation du résultat',
            'Secrétariat juridique annuel',
            'Formalités au greffe du tribunal de commerce',
        ],
        'client': [
            'Décisions et informations relatives aux modifications statutaires',
            'Signatures des procès-verbaux et actes',
            'Documents d\'identité des dirigeants',
            'Informations sur les événements de la vie sociale',
        ],
        'delai': 'Selon calendrier légal',
    },
    'Conseil': {
        'cabinet': [
            'Tableaux de bord et analyses de gestion',
            'Prévisions budgétaires et business plan',
            'Accompagnement dans les décisions stratégiques',
            'Assistance lors de demandes de financement',
        ],
        'client': [
            'Données de gestion et objectifs de l\'entreprise',
            'Informations sur les projets en cours',
            'Disponibilité pour les réunions de suivi',
        ],
        'delai': 'Selon planning convenu',
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt_eur(n):
    n = float(n or 0)
    whole = int(n)
    cents = round((n - whole) * 100)
    s = f"{whole:,}".replace(',', ' ')
    return f"{s},{cents:02d} €"


def fmt_date(d):
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d[:10])
        except Exception:
            return str(d) if d else '—'
    if isinstance(d, (date, datetime)):
        return f"{d.day} {MONTHS_FR[d.month]} {d.year}"
    return '—'


def strip_ape(text):
    if not text:
        return ''
    return re.sub(r'^\d{4}[A-Z]?\s*[-–]?\s*', '', text).strip()


def p(text, **kw):
    kw.setdefault('fontName', 'Helvetica')
    kw.setdefault('fontSize', 10)
    kw.setdefault('leading',  kw['fontSize'] * 1.45)
    return Paragraph(str(text or ''), ParagraphStyle('_', **kw))


def hr(color=LIGHT, thickness=0.5):
    return HRFlowable(width='100%', thickness=thickness, color=color,
                      spaceBefore=2, spaceAfter=2)


def h2(title, color=NAVY):
    """Section heading bar."""
    tbl = Table([[p(title, fontSize=10, fontName='Helvetica-Bold',
                    textColor=WHITE, alignment=TA_CENTER)]],
                colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), color),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 10),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 10),
    ]))
    return tbl


def art(num, title, body, accent=NAVY):
    """One contractual article."""
    block = [
        p(f'Article {num} — {title}',
          fontSize=9, fontName='Helvetica-Bold', textColor=accent, spaceAfter=2),
        p(body, fontSize=8.5, textColor=HexColor('#374151'),
          leading=13, alignment=TA_JUSTIFY),
    ]
    tbl = Table([[block]], colWidths=[CONTENT_W])
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), LGREY),
        ('LINEBEFORE',    (0, 0), (0, -1),  3, accent),
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 9),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 9),
    ]))
    return tbl


# ── Couverture (page 1) ────────────────────────────────────────────────────────

def draw_cover(c, data):
    cab    = data.get('cabinet', {})
    client = data.get('client', {})
    W, H   = PAGE_W, PAGE_H

    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Stripe
    c.setFillColor(BLUE)
    c.rect(0, H - 30 * mm, W, 30 * mm, fill=1, stroke=0)

    # Cabinet (top-left)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 22)
    c.drawString(L_MARGIN, H - 13 * mm, cab.get('nomCabinet', 'ParFi France'))
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 9)
    c.drawString(L_MARGIN, H - 20 * mm, 'Expert-Comptable & Commissaire aux Comptes')

    # Coords (top-right)
    for i, line in enumerate([
        cab.get('adresse', '5 Place Langrand'),
        f"{cab.get('codePostal','54400')} {cab.get('ville','Longwy')}",
        cab.get('telephone', ''),
        cab.get('siteWeb', 'www.parfi-france.fr'),
    ]):
        if line:
            c.setFont('Helvetica', 8)
            c.setFillColor(LIGHT)
            c.drawRightString(W - R_MARGIN, H - 11 * mm - i * 4.5 * mm, line)

    # Title
    ty = H * 0.60
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 36)
    c.drawCentredString(W / 2, ty, 'LETTRE DE MISSION')

    # Separator
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.5)
    c.line(L_MARGIN + 20 * mm, ty - 10 * mm, W - R_MARGIN - 20 * mm, ty - 10 * mm)

    # Client
    raison = client.get('raison_sociale', '')
    forme  = strip_ape(client.get('forme', ''))
    siren  = client.get('siren', '')
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 17)
    c.drawCentredString(W / 2, ty - 22 * mm, raison)
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 10)
    for i, line in enumerate([l for l in [forme, f'SIREN : {siren}' if siren else ''] if l]):
        c.drawCentredString(W / 2, ty - 32 * mm - i * 6 * mm, line)

    # Financial summary box
    ht      = float(data.get('honoraires_ht_annuel', 0))
    bw = W - 2 * L_MARGIN - 16 * mm
    bh = 26 * mm
    bx = L_MARGIN + 8 * mm
    by = 52 * mm
    c.setFillColor(NAVY2)
    c.roundRect(bx, by, bw, bh, 3 * mm, fill=1, stroke=0)
    c.setStrokeColor(HexColor('#34507a'))
    c.setLineWidth(0.5)
    for frac in [1/3, 2/3]:
        sx = bx + bw * frac
        c.line(sx, by + 4*mm, sx, by + bh - 4*mm)
    for i, (lbl, val) in enumerate([
        ('HONORAIRES / MOIS HT', fmt_eur(ht / 12)),
        ('TOTAL ANNUEL HT',      fmt_eur(ht)),
        ('TOTAL TTC',            fmt_eur(ht * 1.2)),
    ]):
        cx = bx + (bw / 3) * i + (bw / 3) / 2
        c.setFillColor(SILVER)
        c.setFont('Helvetica', 6.5)
        c.drawCentredString(cx, by + bh - 8*mm, lbl)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 13)
        c.drawCentredString(cx, by + bh - 18*mm, val)

    # Ref
    c.setFillColor(SILVER)
    c.setFont('Helvetica', 8)
    c.drawCentredString(W/2, 43*mm, f"Réf. {data.get('numero','')}")
    c.drawCentredString(W/2, 38*mm, f"Prise d'effet : {fmt_date(data.get('date_prise_effet', date.today()))}")

    # Footer
    c.setFillColor(BLUE)
    c.rect(0, 0, W, 16*mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica', 8)
    c.drawCentredString(W/2, 9*mm, 'www.parfi-france.fr')
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 6.5)
    c.drawCentredString(W/2, 4.5*mm,
        'Document confidentiel — Norme OEC NP 3-100 (14 juin 2012)')


# ── 4e de couverture ─────────────────────────────────────────────────────────

def draw_back(c, data):
    cab = data.get('cabinet', {})
    sig = data.get('signataire', {})
    W, H = PAGE_W, PAGE_H
    cx = W / 2

    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 28)
    c.drawCentredString(cx, H/2 + 22*mm, cab.get('nomCabinet', 'ParFi France'))
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 11)
    c.drawCentredString(cx, H/2 + 13*mm, 'Expert-Comptable & Commissaire aux Comptes')
    c.setStrokeColor(BLUE)
    c.setLineWidth(1)
    c.line(cx - 35*mm, H/2 + 7*mm, cx + 35*mm, H/2 + 7*mm)

    c.setFillColor(SILVER)
    c.setFont('Helvetica', 10)
    y = H/2 - 2*mm
    for line in [
        cab.get('adresse', '5 Place Langrand'),
        f"{cab.get('codePostal','54400')} {cab.get('ville','Longwy')} — France",
        cab.get('telephone', ''),
        cab.get('email', '') or sig.get('email', ''),
        cab.get('siteWeb', 'www.parfi-france.fr'),
    ]:
        if line:
            c.drawCentredString(cx, y, line)
            y -= 6.5*mm

    c.setFillColor(BLUE)
    c.rect(0, 0, W, 20*mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica', 7.5)
    c.drawCentredString(cx, 13*mm,
        "Membre de l'Ordre des Experts-Comptables — Compagnie Régionale du ressort de la Cour d'Appel de Nancy")
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 7)
    c.drawCentredString(cx, 7*mm,
        "Norme professionnelle relative à la lettre de mission — NP 3-100 du 14 juin 2012")


# ── Header / footer pages de contenu ─────────────────────────────────────────

def draw_content_deco(c, doc, data):
    c.saveState()
    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(L_MARGIN, PAGE_H - 12*mm, data.get('cabinet', {}).get('nomCabinet', 'ParFi France'))
    c.setFillColor(SILVER)
    c.setFont('Helvetica', 7.5)
    c.drawRightString(PAGE_W - R_MARGIN, PAGE_H - 12*mm,
        f"Lettre de Mission n° {data.get('numero','')} · "
        f"{fmt_date(data.get('date_prise_effet', date.today()))}")
    c.setStrokeColor(LIGHT)
    c.setLineWidth(0.4)
    c.line(L_MARGIN, PAGE_H - 14*mm, PAGE_W - R_MARGIN, PAGE_H - 14*mm)
    c.setFillColor(SILVER)
    c.setFont('Helvetica', 7)
    c.drawCentredString(PAGE_W/2, 10*mm, str(doc.page))
    c.line(L_MARGIN, 14*mm, PAGE_W - R_MARGIN, 14*mm)
    c.restoreState()


# ── CONDITIONS PARTICULIÈRES ─────────────────────────────────────────────────

def build_conditions_particulieres(data):
    story = []
    cab    = data.get('cabinet', {})
    client = data.get('client', {})
    sig    = data.get('signataire', {})
    missions = data.get('missions', [])
    ht      = float(data.get('honoraires_ht_annuel', 0))
    ht_brut = float(data.get('honoraires_ht_brut', ht))
    remise  = float(data.get('remise_pct', 0))
    tva     = round(ht * 0.20, 2)
    ttc     = round(ht + tva, 2)
    mensuel = round(ht / 12, 2)
    preavis = int(data.get('duree_preavis', 3))
    modalites = data.get('modalites_paiement',
                         'Mensuellement par prélèvement automatique SEPA.')
    objet   = data.get('objet_mission', '')

    # ─── Titre de la partie ───────────────────────────────────────────────────
    story.append(p('CONDITIONS PARTICULIÈRES',
                   fontSize=13, fontName='Helvetica-Bold', textColor=NAVY,
                   alignment=TA_CENTER, spaceAfter=2))
    story.append(p(
        'Les présentes conditions particulières définissent les modalités spécifiques '
        'convenues entre les parties et complètent les conditions générales.',
        fontSize=9, textColor=SILVER, alignment=TA_CENTER, leading=13,
    ))
    story.append(Spacer(1, 5*mm))

    # ─── 1. Identification des parties ───────────────────────────────────────
    story.append(h2('1. IDENTIFICATION DES PARTIES'))
    story.append(Spacer(1, 3*mm))

    BW = (CONTENT_W - 5*mm) / 2

    def party_box(title, rows, color):
        hdr = Table([[p(title, fontSize=8.5, fontName='Helvetica-Bold',
                        textColor=WHITE, alignment=TA_CENTER)]],
                    colWidths=[BW])
        hdr.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), color),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        tdata = [[p(lbl, fontSize=7.5, fontName='Helvetica-Bold', textColor=SILVER),
                  p(val or '—', fontSize=8.5, textColor=HexColor('#111827'))]
                 for lbl, val in rows]
        body = Table(tdata, colWidths=[28*mm, BW - 28*mm])
        body.setStyle(TableStyle([
            ('TOPPADDING',    (0,0),(-1,-1), 2.5),
            ('BOTTOMPADDING', (0,0),(-1,-1), 2.5),
            ('LEFTPADDING',   (0,0),(-1,-1), 6),
            ('RIGHTPADDING',  (0,0),(-1,-1), 4),
            ('LINEBELOW',     (0,0),(-1,-2), 0.25, LIGHT),
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ]))
        outer = Table([[hdr],[body]], colWidths=[BW])
        outer.setStyle(TableStyle([
            ('BOX',           (0,0),(-1,-1), 0.5, LIGHT),
            ('TOPPADDING',    (0,0),(-1,-1), 0),
            ('BOTTOMPADDING', (0,0),(-1,-1), 0),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ]))
        return outer

    cab_rows = [
        ('Dénomination', cab.get('nomCabinet', 'ParFi France')),
        ('Qualité',      'Expert-Comptable Diplômé'),
        ('SIREN',        cab.get('siren', '—')),
        ('N° Ordre',     cab.get('numeroOrdre', '—')),
        ('Adresse',
         f"{cab.get('adresse','5 Place Langrand')}, "
         f"{cab.get('codePostal','54400')} {cab.get('ville','Longwy')}"),
        ('Signataire',   sig.get('nom_complet', '—')),
        ('Qualité',      sig.get('fonction', 'Expert-Comptable')),
    ]
    cli_addr = (
        f"{client.get('adresse', '')}, {client.get('cp_ville', '')}"
        .strip(', ') or '—'
    )
    cli_rows = [
        ('Dénomination', client.get('raison_sociale', '—')),
        ('Forme jur.',   strip_ape(client.get('forme', '')) or '—'),
        ('SIREN',        client.get('siren', '—')),
        ('Adresse',      cli_addr),
        ('Interlocuteur',client.get('interlocuteur', '—')),
        ('Email',        client.get('email', '—')),
    ]

    parties = Table([[
        party_box('LE CABINET', cab_rows, NAVY),
        Spacer(5*mm, 1),
        party_box('LE CLIENT', cli_rows, BLUE),
    ]], colWidths=[BW, 5*mm, BW])
    parties.setStyle(TableStyle([
        ('VALIGN', (0,0),(-1,-1), 'TOP'),
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
    ]))
    story.append(parties)
    story.append(Spacer(1, 5*mm))

    # ─── 2. Objet de la mission ───────────────────────────────────────────────
    story.append(h2('2. OBJET DE LA MISSION'))
    story.append(Spacer(1, 3*mm))
    story.append(p(
        objet or
        f'Le cabinet <b>{cab.get("nomCabinet","ParFi France")}</b> est mandaté par '
        f'<b>{client.get("raison_sociale","le client")}</b> pour '
        'la réalisation des missions décrites ci-après. '
        'La présente lettre de mission est établie conformément à la norme professionnelle '
        'relative à la lettre de mission (NP 3-100) de l\'Ordre des Experts-Comptables.',
        fontSize=9.5, textColor=HexColor('#374151'), leading=14.5, alignment=TA_JUSTIFY,
    ))
    story.append(Spacer(1, 4*mm))

    # ─── 3. Périmètre des missions ────────────────────────────────────────────
    if missions:
        story.append(h2('3. PÉRIMÈTRE DES MISSIONS CONFIÉES'))
        story.append(Spacer(1, 3*mm))

        col_w = [CONTENT_W - 48*mm - 42*mm, 48*mm, 42*mm]
        tdata = [[
            p('Mission', fontSize=8, fontName='Helvetica-Bold', textColor=WHITE),
            p('Périodicité', fontSize=8, fontName='Helvetica-Bold',
              textColor=WHITE, alignment=TA_CENTER),
            p('Honoraires HT/an', fontSize=8, fontName='Helvetica-Bold',
              textColor=WHITE, alignment=TA_RIGHT),
        ]]
        tstyle = [
            ('BACKGROUND', (0,0),(-1,0), NAVY),
            ('TOPPADDING',    (0,0),(-1,0), 7),
            ('BOTTOMPADDING', (0,0),(-1,0), 7),
            ('LEFTPADDING',   (0,0),(-1,-1), 8),
            ('RIGHTPADDING',  (0,0),(-1,-1), 8),
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ]
        for i, m in enumerate(missions):
            sc  = SECTION_COLORS.get(m.get('type', ''), BLUE)
            bg  = LGREY if i % 2 == 0 else WHITE
            ri  = i + 1
            tdata.append([
                p(m.get('libelle', ''), fontSize=9.5, fontName='Helvetica-Bold',
                  textColor=HexColor('#111827'), leading=13),
                p(m.get('periodicite', 'Mensuel'), fontSize=9,
                  textColor=HexColor('#6b7280'), alignment=TA_CENTER),
                p(fmt_eur(m.get('montant_annuel_ht', 0)), fontSize=9.5,
                  fontName='Helvetica-Bold', textColor=NAVY, alignment=TA_RIGHT),
            ])
            tstyle += [
                ('BACKGROUND',    (0, ri),(-1, ri), bg),
                ('TOPPADDING',    (0, ri),(-1, ri), 8),
                ('BOTTOMPADDING', (0, ri),(-1, ri), 8),
                ('LINEBELOW',     (0, ri),(-1, ri), 0.3, LIGHT),
                ('LINEBEFORE',    (0, ri),(0,  ri), 4,   sc),
            ]
        tbl = Table(tdata, colWidths=col_w)
        tbl.setStyle(TableStyle(tstyle))
        story.append(tbl)
        story.append(Spacer(1, 5*mm))

    # ─── 4. Tableau de répartition des tâches ────────────────────────────────
    story.append(h2('4. RÉPARTITION DES TÂCHES ENTRE LE CABINET ET LE CLIENT'))
    story.append(Spacer(1, 3*mm))
    story.append(p(
        'Le tableau ci-dessous précise, pour chaque mission, les travaux pris en charge '
        'par le cabinet et les obligations d\'information incombant au client.',
        fontSize=9, textColor=HexColor('#374151'), leading=13, spaceAfter=3,
    ))
    story.append(Spacer(1, 2*mm))

    # Determine which sections are active
    active_sections = [m.get('type', '') for m in missions if m.get('type')]
    if not active_sections:
        active_sections = list(REPARTITION.keys())

    CW1 = 35*mm  # section
    CW2 = (CONTENT_W - CW1 - 32*mm) / 2  # cabinet
    CW3 = CW2    # client
    CW4 = 32*mm  # délai

    rep_hdr = [[
        p('Section',        fontSize=7.5, fontName='Helvetica-Bold', textColor=WHITE),
        p('Travaux du cabinet', fontSize=7.5, fontName='Helvetica-Bold', textColor=WHITE),
        p('Documents fournis par le client', fontSize=7.5, fontName='Helvetica-Bold', textColor=WHITE),
        p('Délai client', fontSize=7.5, fontName='Helvetica-Bold',
          textColor=WHITE, alignment=TA_CENTER),
    ]]
    rep_style = [
        ('BACKGROUND', (0,0),(-1,0), NAVY),
        ('TOPPADDING',    (0,0),(-1,0), 6),
        ('BOTTOMPADDING', (0,0),(-1,0), 6),
        ('LEFTPADDING',   (0,0),(-1,-1), 6),
        ('RIGHTPADDING',  (0,0),(-1,-1), 6),
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
        ('GRID',          (0,1),(-1,-1), 0.3, LIGHT),
    ]

    def bullet_list(items):
        return [p(f'• {it}', fontSize=7.5, textColor=HexColor('#374151'), leading=11)
                for it in items]

    for i, sec in enumerate(active_sections):
        rep = REPARTITION.get(sec, {})
        if not rep:
            continue
        ri = i + 1
        bg = LGREY if i % 2 == 0 else WHITE
        sc = SECTION_COLORS.get(sec, BLUE)
        rep_hdr.append([
            p(sec, fontSize=8.5, fontName='Helvetica-Bold', textColor=sc),
            bullet_list(rep.get('cabinet', [])),
            bullet_list(rep.get('client', [])),
            p(rep.get('delai', '—'), fontSize=7.5, textColor=HexColor('#374151'),
              alignment=TA_CENTER),
        ])
        rep_style += [
            ('BACKGROUND', (0, ri),(-1, ri), bg),
            ('TOPPADDING',    (0, ri),(-1, ri), 5),
            ('BOTTOMPADDING', (0, ri),(-1, ri), 5),
            ('LINEBEFORE',    (0, ri),(0,  ri), 3, sc),
        ]

    rep_tbl = Table(rep_hdr, colWidths=[CW1, CW2, CW3, CW4])
    rep_tbl.setStyle(TableStyle(rep_style))
    story.append(rep_tbl)
    story.append(Spacer(1, 5*mm))

    # ─── 5. Honoraires ───────────────────────────────────────────────────────
    story.append(h2('5. HONORAIRES ET MODALITÉS DE RÈGLEMENT'))
    story.append(Spacer(1, 3*mm))

    hon_rows = []
    if remise > 0 and abs(ht_brut - ht) > 0.01:
        hon_rows += [
            ('Honoraires HT brut',                    fmt_eur(ht_brut)),
            (f'Remise commerciale ({remise:.1f} %)', f'− {fmt_eur(ht_brut - ht)}'),
        ]
    ttc_idx = len(hon_rows) + 2
    hon_rows += [
        ('Total annuel HT net',   fmt_eur(ht)),
        ('TVA 20 %',          fmt_eur(tva)),
        ('Total annuel TTC',      fmt_eur(ttc)),
        ('Mensualité HT',         fmt_eur(mensuel)),
        ('Mensualité TTC',        fmt_eur(round(mensuel * 1.2, 2))),
    ]

    hon_tdata = [[
        p(lbl, fontSize=9, textColor=HexColor('#374151')),
        p(val, fontSize=9.5, fontName='Helvetica-Bold', textColor=NAVY, alignment=TA_RIGHT),
    ] for lbl, val in hon_rows]

    hon_t = Table(hon_tdata, colWidths=[CONTENT_W * 0.65, CONTENT_W * 0.35])
    hon_ts = [
        ('TOPPADDING',    (0,0),(-1,-1), 5),
        ('BOTTOMPADDING', (0,0),(-1,-1), 5),
        ('LEFTPADDING',   (0,0),(-1,-1), 8),
        ('RIGHTPADDING',  (0,0),(-1,-1), 8),
        ('LINEBELOW',     (0,0),(-1,-2), 0.35, LIGHT),
        ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ('BACKGROUND',    (0, ttc_idx),(-1, ttc_idx), NAVY),
        ('TEXTCOLOR',     (0, ttc_idx),(-1, ttc_idx), WHITE),
    ]
    hon_t.setStyle(TableStyle(hon_ts))
    story.append(hon_t)
    story.append(Spacer(1, 3*mm))

    story.append(p('Modalités de règlement :', fontSize=8.5, fontName='Helvetica-Bold',
                   textColor=NAVY, spaceAfter=2))
    for line in modalites.split('\n'):
        if line.strip():
            story.append(p(f'• {line.strip()}', fontSize=9,
                           textColor=HexColor('#374151'), leading=13.5))

    return story


# ── CONDITIONS GÉNÉRALES ──────────────────────────────────────────────────────

def build_conditions_generales(data):
    story = []
    preavis = int(data.get('duree_preavis', 3))

    story.append(p('CONDITIONS GÉNÉRALES',
                   fontSize=13, fontName='Helvetica-Bold', textColor=NAVY,
                   alignment=TA_CENTER, spaceAfter=2))
    story.append(p(
        'Conformément à la norme professionnelle NP 3-100 de l\'Ordre des Experts-Comptables.',
        fontSize=9, textColor=SILVER, alignment=TA_CENTER, leading=13,
    ))
    story.append(Spacer(1, 5*mm))

    clauses = [
        (1, 'Durée et reconduction',
         'La présente lettre de mission prend effet à la date indiquée aux conditions '
         'particulières et est conclue pour une durée indéterminée. '
         'Elle se renouvelle tacitement chaque année civile, sauf dénonciation dans les '
         'conditions prévues à l\'article relatif à la résiliation.',
         NAVY),

        (2, 'Résiliation',
         f'Chaque partie peut mettre fin à la présente lettre de mission par lettre '
         f'recommandée avec avis de réception, moyennant un préavis de '
         f'{preavis} mois. '
         f'La résiliation peut être immédiate en cas de faute grave ou de manquement '
         f'caractérisé aux obligations essentielles. '
         f'À la date d\'effet de la résiliation, le cabinet remet au client l\'intégralité '
         f'des documents, pièces et données lui appartenant.',
         NAVY),

        (3, 'Révision des honoraires',
         'Les honoraires sont révisés chaque année au 1er janvier selon la variation de '
         'l\'indice Syntec. À défaut, la révision est calculée selon l\'indice INSEE des '
         'prix à la consommation. '
         'Toute modification du périmètre de la mission fait l\'objet d\'un avenant '
         'écrit signé par les deux parties.',
         NAVY),

        (4, 'Obligations du cabinet',
         'Le cabinet s\'engage à exécuter les travaux confiés avec le soin, la compétence '
         'et la diligence conformes aux normes professionnelles de l\'Ordre des '
         'Experts-Comptables (NEP, NP). '
         'Un responsable de dossier est désigné comme interlocuteur principal du client. '
         'Le cabinet informe le client de toute difficulté rencontrée dans l\'exécution '
         'de la mission dans les meilleurs délais.',
         NAVY),

        (5, 'Obligations du client',
         'Le client s\'engage à fournir au cabinet, dans les délais convenus au tableau '
         'de répartition des tâches, l\'intégralité des documents et informations '
         'nécessaires à l\'exécution de la mission. '
         'Il désigne un interlocuteur unique habilité à répondre aux demandes du cabinet. '
         'Tout retard dans la fourniture des éléments nécessaires, susceptible d\'engendrer '
         'des pénalités fiscales ou sociales, relève de la seule responsabilité du client.',
         NAVY),

        (6, 'Responsabilité et assurance RCP',
         'Le cabinet est assuré pour sa responsabilité civile professionnelle auprès d\'un '
         'organisme d\'assurance agréé. '
         'Sa responsabilité est limitée aux préjudices directs et certains résultant d\'une '
         'faute établie dans l\'exécution de sa mission, dans la limite du montant annuel '
         'des honoraires de la mission concernée, sauf faute intentionnelle ou dolosive. '
         'Le cabinet ne saurait être tenu responsable des inexactitudes ou omissions '
         'imputables aux informations fournies par le client.',
         NAVY),

        (7, 'Confidentialité et secret professionnel',
         'Le cabinet est astreint au secret professionnel prévu à l\'article 226-13 du '
         'Code pénal et aux dispositions du Code de déontologie des experts-comptables. '
         'Il s\'engage à la confidentialité absolue sur toutes les informations '
         'communiquées par le client dans le cadre de la mission. '
         'Cette obligation ne cède qu\'en cas d\'obligation légale expresse '
         '(administration fiscale, autorité judiciaire, TRACFIN).',
         NAVY),

        (8, 'Protection des données personnelles (RGPD)',
         'Les données personnelles collectées dans le cadre de la mission sont traitées '
         'conformément au Règlement (UE) 2016/679 relatif à la protection des données '
         '(RGPD) et à la loi n° 78-17 du 6 janvier 1978 modifiée. '
         'Le cabinet agit en qualité de responsable de traitement. '
         'Le client dispose d\'un droit d\'accès, de rectification, d\'effacement, de '
         'limitation et de portabilité de ses données, exercé par écrit auprès du cabinet. '
         'Les données sont conservées pour la durée légale applicable à chaque type de '
         'document (10 ans pour les pièces comptables).',
         NAVY),

        (9, 'Lutte contre le blanchiment de capitaux et le financement du terrorisme (LCB-FT)',
         'En application des articles L. 561-2 et suivants du Code monétaire et financier '
         '(ordonnance n° 2009-104 du 30 janvier 2009 modifiée), le cabinet est soumis '
         'aux obligations de vigilance, d\'identification et de déclaration de soupçon '
         'auprès de TRACFIN. '
         'Le client s\'engage à fournir tout document permettant d\'établir son identité, '
         'celle de ses bénéficiaires effectifs, et l\'origine des fonds. '
         'En cas de situation incompatible avec ces obligations, le cabinet se réserve le '
         'droit de mettre fin à la mission sans délai.',
         AMBER),

        (10, 'Indépendance et déontologie',
         'Le cabinet exerce sa mission dans le strict respect du Code de déontologie des '
         'experts-comptables (décret n° 2012-432 du 30 mars 2012) et des normes de '
         'l\'Ordre des Experts-Comptables. '
         'Il garantit son indépendance à l\'égard du client et s\'abstient de tout acte '
         'susceptible de compromettre son objectivité, son impartialité et son intégrité '
         'professionnelle.',
         NAVY),

        (11, 'Médiation',
         'Conformément aux articles L. 611-1 et suivants du Code de la consommation et '
         'à la directive européenne 2013/11/UE, en cas de litige non résolu à l\'amiable, '
         'chaque partie peut recourir gratuitement à la médiation de l\'Ordre des '
         'Experts-Comptables. '
         'Les coordonnées du médiateur sont disponibles sur www.oec-paris.fr. '
         'Cette clause ne fait pas obstacle au recours devant les juridictions compétentes.',
         NAVY),
    ]

    for num, title, body, color in clauses:
        story.append(KeepTogether([art(num, title, body, color), Spacer(1, 3*mm)]))

    return story


# ── Page de signatures ────────────────────────────────────────────────────────

def build_signatures(data):
    story = []
    client = data.get('client', {})
    sig    = data.get('signataire', {})
    cab    = data.get('cabinet', {})

    story.append(h2('SIGNATURES — BON POUR ACCORD'))
    story.append(Spacer(1, 4*mm))
    story.append(p(
        'Les soussignés reconnaissent avoir pris connaissance et acceptent l\'intégralité '
        'des présentes conditions particulières et conditions générales.',
        fontSize=9.5, textColor=HexColor('#374151'), alignment=TA_JUSTIFY, leading=14,
    ))
    story.append(Spacer(1, 6*mm))

    BW = (CONTENT_W - 6*mm) / 2
    client_name = client.get('interlocuteur') or client.get('raison_sociale', '')
    sig_name    = sig.get('nom_complet', cab.get('nomCabinet', 'ParFi France'))

    def sig_box(title, name, qual=''):
        inner = Table([
            [p(title, fontSize=7.5, fontName='Helvetica-Bold', textColor=SILVER)],
            [p(name, fontSize=11, textColor=NAVY, fontName='Helvetica-Bold')],
            [p(qual, fontSize=8.5, textColor=HexColor('#6b7280')) if qual else Spacer(1, 2)],
            [Spacer(1, 14*mm)],
            [HRFlowable(width='88%', thickness=0.5, color=SILVER, spaceBefore=0, spaceAfter=2)],
            [p('Signature et date', fontSize=8, textColor=SILVER)],
        ], colWidths=[BW - 18*mm])
        inner.setStyle(TableStyle([
            ('TOPPADDING',    (0,0),(-1,-1), 2),
            ('BOTTOMPADDING', (0,0),(-1,-1), 2),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
        ]))
        outer = Table([[inner]], colWidths=[BW])
        outer.setStyle(TableStyle([
            ('BOX',           (0,0),(-1,-1), 0.75, LIGHT),
            ('BACKGROUND',    (0,0),(-1,-1), LGREY),
            ('TOPPADDING',    (0,0),(-1,-1), 10),
            ('BOTTOMPADDING', (0,0),(-1,-1), 10),
            ('LEFTPADDING',   (0,0),(-1,-1), 10),
            ('RIGHTPADDING',  (0,0),(-1,-1), 10),
        ]))
        return outer

    sigs = Table([[
        sig_box('POUR LE CABINET', sig_name, sig.get('fonction', 'Expert-Comptable')),
        Spacer(6*mm, 1),
        sig_box('LE CLIENT — BON POUR ACCORD', client_name, client.get('raison_sociale', '')),
    ]], colWidths=[BW, 6*mm, BW])
    sigs.setStyle(TableStyle([
        ('VALIGN',        (0,0),(-1,-1), 'TOP'),
        ('TOPPADDING',    (0,0),(-1,-1), 0),
        ('BOTTOMPADDING', (0,0),(-1,-1), 0),
        ('LEFTPADDING',   (0,0),(-1,-1), 0),
        ('RIGHTPADDING',  (0,0),(-1,-1), 0),
    ]))
    story.append(sigs)
    story.append(Spacer(1, 5*mm))
    story.append(hr())
    story.append(p(
        f'Document établi conformément à la norme NP 3-100 de l\'Ordre des Experts-Comptables '
        f'(14 juin 2012). Un exemplaire signé est remis à chaque partie.',
        fontSize=8, textColor=SILVER, alignment=TA_JUSTIFY, leading=12,
    ))
    return story


# ── Entrée principale ─────────────────────────────────────────────────────────

def generate_ldm_pdf(data):
    buf = io.BytesIO()

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H,
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0)
    content_frame = Frame(
        L_MARGIN, 14*mm,
        CONTENT_W, PAGE_H - 16*mm - 14*mm,
        leftPadding=0, rightPadding=0,
        topPadding=0, bottomPadding=0,
    )

    def on_cover(c, doc):    draw_cover(c, data)
    def on_content(c, doc):  draw_content_deco(c, doc, data)
    def on_back(c, doc):     draw_back(c, data)

    doc = BaseDocTemplate(
        buf, pagesize=A4,
        pageTemplates=[
            PageTemplate(id='Cover',   frames=[cover_frame],   onPage=on_cover),
            PageTemplate(id='Content', frames=[content_frame], onPage=on_content),
            PageTemplate(id='Back',    frames=[cover_frame],   onPage=on_back),
        ],
        title=f"Lettre de Mission {data.get('numero','')}",
        author=data.get('cabinet', {}).get('nomCabinet', 'ParFi France'),
        subject='Lettre de Mission — Norme OEC NP 3-100',
    )

    story = []

    # Page 1 : couverture
    story.append(Spacer(1, 1))
    story.append(NextPageTemplate('Content'))
    story.append(PageBreak())

    # Conditions particulières (peut s'étendre sur plusieurs pages)
    story.extend(build_conditions_particulieres(data))
    story.append(PageBreak())

    # Conditions générales OEC
    story.extend(build_conditions_generales(data))
    story.append(PageBreak())

    # Signatures
    story.extend(build_signatures(data))

    # 4e de couverture
    story.append(NextPageTemplate('Back'))
    story.append(PageBreak())
    story.append(Spacer(1, 1))

    doc.build(story)
    return buf.getvalue()


if __name__ == '__main__':
    import json
    payload = json.loads(sys.stdin.read())
    sys.stdout.buffer.write(generate_ldm_pdf(payload))
