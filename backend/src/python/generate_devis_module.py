#!/usr/bin/env python3
"""
Générateur de devis PDF — ParFi France
4 pages : (1) couverture navy canvas, (2) qui sommes-nous + besoin,
           (3) missions + honoraires + engagements + signatures, (4) 4e de couverture navy canvas.
"""

import sys
import json
import io
import re
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, NextPageTemplate,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont

# ── Serif font registration ───────────────────────────────────────────────────
try:
    pdfmetrics.registerFont(TTFont('DejaVuSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
    pdfmetrics.registerFont(TTFont('DejaVuSerif-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
    SERIF      = 'DejaVuSerif'
    SERIF_BOLD = 'DejaVuSerif-Bold'
except Exception:
    SERIF      = 'Times-Roman'
    SERIF_BOLD = 'Times-Bold'

# ── Palette ───────────────────────────────────────────────────────────────────
NAVY   = HexColor('#1a3a5c')
BLUE   = HexColor('#4a6fa5')
LIGHT  = HexColor('#e3eaf4')
SILVER = HexColor('#9ca3af')
LGREY  = HexColor('#f5f7fa')
WHITE  = white
RED    = HexColor('#e74c3c')
NAVY2  = HexColor('#243f5e')
CYAN   = HexColor('#67e8f9')

PAGE_W, PAGE_H = A4
L_MARGIN  = 18 * mm
R_MARGIN  = 18 * mm
T_MARGIN  = 18 * mm
B_MARGIN  = 22 * mm
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

ENGAGEMENTS = [
    'Un interlocuteur dédié, joignable du lundi au vendredi 9h–18h',
    'Une réponse à toute question écrite sous 48 heures ouvrées',
    'Un entretien annuel de présentation des comptes',
    'Le respect strict des échéances déclaratives, sans exception',
    'Une note d’honoraires détaillée et lisible, sans facturation surprise',
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def fmt_eur(n):
    n = float(n or 0)
    whole = int(n)
    cents = round((n - whole) * 100)
    s = f"{whole:,}".replace(',', ' ')
    return f"{s},{cents:02d} €"


def fmt_date(d):
    if isinstance(d, str):
        try:
            d = date.fromisoformat(d)
        except Exception:
            return str(d) if d else '—'
    if not isinstance(d, date):
        return '—'
    return f"{d.day} {MONTHS_FR[d.month]} {d.year}"


def strip_ape(text):
    """Remove APE/NAF codes like '6599Z - ' from start of string."""
    if not text:
        return text or ''
    return re.sub(r'^\d{4}[A-Z]?\s*[-–]?\s*', '', text).strip()


def p(text, **kw):
    kw.setdefault('fontName', 'Helvetica')
    kw.setdefault('fontSize', 10)
    kw.setdefault('leading', kw['fontSize'] * 1.4)
    style = ParagraphStyle('_', **kw)
    return Paragraph(text or '', style)


def hr_line(color=LIGHT, thickness=0.75):
    return HRFlowable(width='100%', thickness=thickness, color=color,
                      spaceBefore=4, spaceAfter=4)


def section_bar(title, color=NAVY):
    tbl = Table(
        [[p(title, fontSize=11, fontName='Helvetica-Bold', textColor=WHITE,
            alignment=TA_CENTER)]],
        colWidths=[CONTENT_W],
    )
    tbl.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), color),
        ('TOPPADDING',    (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING',   (0, 0), (-1, -1), 12),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 12),
    ]))
    return tbl


def _draw_wrapped_centered(c, text, cx, y, max_w, font, size, color, leading):
    """Draw centered text wrapped to max_w. Returns y below last line."""
    c.setFillColor(color)
    c.setFont(font, size)
    words = text.split()
    lines = []
    current = ''
    for word in words:
        test = f'{current} {word}'.strip()
        if stringWidth(test, font, size) > max_w:
            if current:
                lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    for i, line in enumerate(lines):
        c.drawCentredString(cx, y - i * leading, line)
    return y - (len(lines)) * leading


# ── Page 1 : Couverture (canvas) ──────────────────────────────────────────────

def draw_cover_canvas(c, data):
    cab  = data.get('cabinet', {})
    pros = data.get('prospect', {})
    W, H = PAGE_W, PAGE_H

    # Navy background
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top stripe
    c.setFillColor(BLUE)
    c.rect(0, H - 30 * mm, W, 30 * mm, fill=1, stroke=0)

    # Cabinet name (top left)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 22)
    c.drawString(L_MARGIN, H - 14 * mm, 'ParFi France')
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 9)
    c.drawString(L_MARGIN, H - 21 * mm, 'Expert-Comptable & Commissaire aux Comptes')

    # Cabinet coords (top right)
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 8)
    coords_r = [
        cab.get('adresse', '5 Place Langrand'),
        f"{cab.get('codePostal', '54400')} {cab.get('ville', 'Longwy')}",
        cab.get('telephone', ''),
        cab.get('siteWeb', 'www.parfi-france.fr'),
    ]
    yr = H - 11 * mm
    for line in coords_r:
        if line:
            c.drawRightString(W - R_MARGIN, yr, line)
            yr -= 4.5 * mm

    # ── "Devis" dominant title ────────────────────────────────────────────────
    title_y = H * 0.61
    c.setFillColor(WHITE)
    c.setFont(SERIF_BOLD, 72)
    c.drawCentredString(W / 2, title_y, 'Devis')

    # Thin divider
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.2)
    c.line(L_MARGIN + 28 * mm, title_y - 11 * mm,
           W - R_MARGIN - 28 * mm, title_y - 11 * mm)

    # ── Prospect identity ─────────────────────────────────────────────────────
    raison = pros.get('raison_sociale', '')
    forme  = strip_ape(pros.get('forme', ''))
    siren  = pros.get('siren', '')

    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 22)
    c.drawCentredString(W / 2, title_y - 24 * mm, raison)

    sub_parts = [s for s in [forme, f'SIREN : {siren}' if siren else ''] if s]
    if sub_parts:
        c.setFillColor(LIGHT)
        c.setFont('Helvetica', 11)
        c.drawCentredString(W / 2, title_y - 33 * mm, '   ·   '.join(sub_parts))

    # ── Devis ref + dates ─────────────────────────────────────────────────────
    numero   = data.get('numero', '')
    date_em  = fmt_date(data.get('date_emission', date.today()))
    date_val = fmt_date(data.get('date_validite', ''))

    c.setFillColor(SILVER)
    c.setFont('Helvetica', 8)
    ref_lines = [f'Réf. {numero}', f'Émis le {date_em}']
    if date_val and date_val != '—':
        ref_lines.append(f"Valable jusqu'au {date_val}")
    for i, line in enumerate(ref_lines):
        c.drawCentredString(W / 2, 60 * mm - i * 5 * mm, line)

    # Bottom bar
    c.setFillColor(BLUE)
    c.rect(0, 0, W, 16 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica', 8)
    c.drawCentredString(W / 2, 9 * mm, 'www.parfi-france.fr')
    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 6.5)
    c.drawCentredString(W / 2, 4.5 * mm, 'Document confidentiel — établi exclusivement pour le destinataire')


# ── Page 4 : 4e de couverture (canvas) ────────────────────────────────────────

def draw_back_canvas(c, data):
    cab = data.get('cabinet', {})
    sig = data.get('signataire', {})
    W, H = PAGE_W, PAGE_H
    cx = W / 2

    # Navy background
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    content_max_w = W - 2 * L_MARGIN - 12 * mm

    # ── Eyebrow ───────────────────────────────────────────────────────────────
    eyebrow_y = H * 0.70
    c.setFillColor(CYAN)
    c.setFont('Helvetica', 8.5)
    c.drawCentredString(cx, eyebrow_y, 'LA SUITE, SI VOUS NOUS FAITES CONFIANCE')

    c.setStrokeColor(BLUE)
    c.setLineWidth(0.75)
    c.line(cx - 38 * mm, eyebrow_y - 4 * mm, cx + 38 * mm, eyebrow_y - 4 * mm)

    # ── Main title ────────────────────────────────────────────────────────────
    c.setFillColor(WHITE)
    c.setFont(SERIF_BOLD, 32)
    c.drawCentredString(cx, H * 0.58, 'Parlons de votre projet.')

    # ── Body text ─────────────────────────────────────────────────────────────
    para1 = (
        'Si cette proposition vous convient, vous nous retournez ce devis signé. '
        'Nous établissons alors la lettre de mission OEC. Une fois la lettre signée, '
        'votre dossier est ouvert et nous pouvons commencer.'
    )
    para2 = (
        'Pour toute question — sur le périmètre, le tarif, les modalités, ou simplement '
        'pour creuser un point — joignez-moi directement.'
    )

    y = H * 0.47
    y = _draw_wrapped_centered(c, para1, cx, y, content_max_w,
                               'Helvetica', 9.5, LIGHT, 5.5 * mm)
    y = _draw_wrapped_centered(c, para2, cx, y - 5 * mm, content_max_w,
                               'Helvetica', 9.5, LIGHT, 5.5 * mm)

    # ── Signature block ───────────────────────────────────────────────────────
    sig_y = y - 14 * mm
    c.setStrokeColor(HexColor('#2a4f78'))
    c.setLineWidth(0.5)
    c.line(cx - 32 * mm, sig_y + 7 * mm, cx + 32 * mm, sig_y + 7 * mm)

    sig_name  = sig.get('nom_complet') or 'Thierry Alcaraz'
    sig_email = sig.get('email') or cab.get('email', 'thierry.alcaraz@parfi-france.fr')
    sig_phone = sig.get('telephone') or cab.get('telephone', '')

    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(cx, sig_y, sig_name)

    c.setFillColor(LIGHT)
    c.setFont('Helvetica', 9)
    c.drawCentredString(cx, sig_y - 5.5 * mm, 'Expert-comptable, Associé')

    contact_parts = [x for x in [sig_email, sig_phone] if x]
    if contact_parts:
        c.setFillColor(SILVER)
        c.setFont('Helvetica', 8)
        c.drawCentredString(cx, sig_y - 10.5 * mm, '  ·  '.join(contact_parts))

    # ── Bottom bar ────────────────────────────────────────────────────────────
    c.setFillColor(BLUE)
    c.rect(0, 0, W, 14 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica', 7)
    c.drawCentredString(cx, 8.5 * mm, "Membre de l'Ordre des Experts-Comptables")
    c.drawCentredString(cx, 4.5 * mm, "Compagnie Nationale des Commissaires aux Comptes")


# ── Header/footer for content pages (2 & 3) ──────────────────────────────────

def draw_content_deco(c, doc, data):
    c.saveState()

    c.setFillColor(NAVY)
    c.setFont('Helvetica-Bold', 8)
    c.drawString(L_MARGIN, PAGE_H - 12 * mm, 'ParFi France')

    c.setFillColor(SILVER)
    c.setFont('Helvetica', 7.5)
    c.drawRightString(
        PAGE_W - R_MARGIN, PAGE_H - 12 * mm,
        f"Proposition n° {data.get('numero', '')} · "
        f"{fmt_date(data.get('date_emission', date.today()))}"
    )

    c.setStrokeColor(LIGHT)
    c.setLineWidth(0.4)
    c.line(L_MARGIN, PAGE_H - 14 * mm, PAGE_W - R_MARGIN, PAGE_H - 14 * mm)

    c.setFillColor(SILVER)
    c.setFont('Helvetica', 7)
    c.drawCentredString(PAGE_W / 2, 10 * mm, str(doc.page))
    c.line(L_MARGIN, 14 * mm, PAGE_W - R_MARGIN, 14 * mm)

    c.restoreState()


# ── Page 2 : Qui sommes-nous + compréhension du besoin ───────────────────────

def build_page2(data):
    story = []
    pros   = data.get('prospect', {})
    besoin = data.get('comprehension_besoin', '')

    story.append(section_bar('QUI SOMMES-NOUS ?'))
    story.append(Spacer(1, 6 * mm))

    story.append(p(
        '<b>ParFi France</b> est un cabinet d’expertise comptable et de commissariat '
        'aux comptes implanté à Longwy, au cœur du bassin lorrain. '
        'Nous accompagnons les entreprises, associations et professionnels indépendants '
        'dans la gestion de leurs obligations comptables, fiscales, sociales et juridiques.',
        fontSize=10, textColor=HexColor('#374151'), leading=16, alignment=TA_JUSTIFY,
        spaceAfter=4,
    ))

    atouts = [
        ('Expertise locale',
         'Implantés à Longwy, nous connaissons le tissu économique '
         'du territoire et les spécificités du bassin lorrain.'),
        ('Maîtrise réglementaire',
         'Notre équipe assure une veille fiscale, sociale et juridique permanente '
         'pour vous prémunir de tout risque de non-conformité.'),
        ('Interlocuteur dédié',
         'Un chef de mission est désigné pour votre dossier, garantissant '
         'continuité de service et réactivité optimale.'),
        ('Vision globale',
         'Au-delà de la comptabilité, nous vous accompagnons dans vos '
         'décisions stratégiques : investissements, développement, '
         'transmission.'),
    ]

    for title, desc in atouts:
        row = Table([[
            p(f'<b>{title}</b>', fontSize=10, fontName='Helvetica-Bold', textColor=NAVY),
            p(desc, fontSize=9, textColor=HexColor('#374151'), leading=14),
        ]], colWidths=[52 * mm, CONTENT_W - 52 * mm])
        row.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING',    (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LINEBELOW',     (0, 0), (-1, -1), 0.4, LIGHT),
            ('LEFTPADDING',   (0, 0), (-1, -1), 2),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 2),
        ]))
        story.append(row)

    story.append(Spacer(1, 8 * mm))
    story.append(section_bar('COMPRÉHENSION DE VOTRE BESOIN'))
    story.append(Spacer(1, 6 * mm))

    raison    = pros.get('raison_sociale', 'votre structure')
    forme_raw = pros.get('forme', '')
    forme     = strip_ape(forme_raw)
    forme_txt = f'votre {forme.lower()} ' if forme else ''

    if besoin and besoin.strip():
        for line in besoin.split('\n'):
            if line.strip():
                story.append(p(line.strip(), fontSize=10,
                               textColor=HexColor('#374151'), leading=16,
                               alignment=TA_JUSTIFY))
                story.append(Spacer(1, 3 * mm))
    else:
        story.append(p(
            f'À la suite de nos échanges, nous avons analysé la situation de '
            f'<b>{raison}</b> et les besoins spécifiques liés à {forme_txt}'
            'votre activité. '
            'Cette proposition définit le cadre de notre collaboration et les missions '
            'que nous vous proposons d’assurer à vos côtés.',
            fontSize=10, textColor=HexColor('#374151'), leading=16, alignment=TA_JUSTIFY,
        ))

    return story


# ── Page 3 : Missions + honoraires + engagements + signatures ─────────────────

def build_page3(data):
    story = []
    pros     = data.get('prospect', {})
    sig      = data.get('signataire', {})
    missions = data.get('missions', [])

    # ── Client recap ──────────────────────────────────────────────────────────
    story.append(section_bar('RÉCAPITULATIF CLIENT'))
    story.append(Spacer(1, 4 * mm))

    ci_items = [
        ('Raison sociale',  pros.get('raison_sociale', '—')),
        ('Forme juridique', strip_ape(pros.get('forme', '')) or '—'),
        ('SIREN',           pros.get('siren', '—')),
    ]
    addr = pros.get('adresse', '') or pros.get('cp_ville', '')
    if addr:
        ci_items.append(('Adresse', addr))
    if pros.get('interlocuteur'):
        ci_items.append(('Interlocuteur', pros['interlocuteur']))

    ci_rows = [
        [p(lbl, fontSize=8.5, fontName='Helvetica-Bold', textColor=SILVER),
         p(val, fontSize=9.5, textColor=HexColor('#111827'))]
        for lbl, val in ci_items
    ]
    ci_tbl = Table(ci_rows, colWidths=[44 * mm, CONTENT_W - 44 * mm])
    ci_tbl.setStyle(TableStyle([
        ('TOPPADDING',    (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING',   (0, 0), (-1, -1), 4),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ('LINEBELOW',     (0, 0), (-1, -2), 0.3, LIGHT),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(ci_tbl)
    story.append(Spacer(1, 5 * mm))

    # ── Missions table ─────────────────────────────────────────────────────────
    story.append(section_bar('DÉTAIL DES MISSIONS PROPOSÉES'))
    story.append(Spacer(1, 3 * mm))

    M_COL_W = CONTENT_W - 44 * mm - 40 * mm
    col_w   = [M_COL_W, 44 * mm, 40 * mm]

    if missions:
        tdata = [[
            p('Mission', fontSize=8.5, fontName='Helvetica-Bold', textColor=WHITE),
            p('Périodicité', fontSize=8.5, fontName='Helvetica-Bold',
              textColor=WHITE, alignment=TA_CENTER),
            p('Montant HT/an', fontSize=8.5, fontName='Helvetica-Bold',
              textColor=WHITE, alignment=TA_RIGHT),
        ]]
        tstyle = [
            ('BACKGROUND',    (0, 0), (-1, 0), NAVY),
            ('TOPPADDING',    (0, 0), (-1, 0), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
            ('LEFTPADDING',   (0, 0), (-1, -1), 10),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 10),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ]

        for i, m in enumerate(missions):
            sc     = SECTION_COLORS.get(m.get('type', ''), BLUE)
            row_bg = LGREY if i % 2 == 0 else WHITE
            ri     = i + 1
            desc   = m.get('description', '')

            libelle_cell = [
                p(m.get('libelle', ''), fontSize=10, fontName='Helvetica-Bold',
                  textColor=HexColor('#111827'), leading=14),
            ]
            if desc:
                libelle_cell.append(
                    p(desc, fontSize=7.5, fontName='Helvetica-Oblique',
                      textColor=HexColor('#6b7280'), leading=10.5, spaceAfter=2)
                )

            tdata.append([
                libelle_cell,
                p(m.get('periodicite', '—'), fontSize=9,
                  textColor=HexColor('#6b7280'), alignment=TA_CENTER),
                p(fmt_eur(m.get('montant_annuel_ht', 0)), fontSize=10,
                  fontName='Helvetica-Bold', textColor=NAVY, alignment=TA_RIGHT),
            ])
            tstyle += [
                ('BACKGROUND',    (0, ri), (-1, ri), row_bg),
                ('TOPPADDING',    (0, ri), (-1, ri), 7),
                ('BOTTOMPADDING', (0, ri), (-1, ri), 7),
                ('LINEBELOW',     (0, ri), (-1, ri), 0.4, LIGHT),
                ('LINEBEFORE',    (0, ri), (0, ri),  4, sc),
            ]

        t = Table(tdata, colWidths=col_w)
        t.setStyle(TableStyle(tstyle))
        story.append(t)
    else:
        story.append(p('Aucune prestation définie.', fontSize=10, textColor=SILVER))

    story.append(Spacer(1, 5 * mm))

    # ── Honoraires banner ──────────────────────────────────────────────────────
    ht_net  = float(data.get('honoraires_total_ht_annuel', 0))
    ht_brut = float(data.get('honoraires_ht_brut', ht_net))
    remise  = float(data.get('remise_pct', 0))
    tva     = round(ht_net * 0.20, 2)
    ttc     = round(ht_net + tva, 2)
    mensuel = round(ht_net / 12, 2)

    banner_rows = []
    if remise > 0 and abs(ht_brut - ht_net) > 0.01:
        banner_rows.append(
            p(f'Remise {remise:.0f} % appliquée sur {fmt_eur(ht_brut)}',
              fontSize=8, fontName='Helvetica-Oblique', textColor=SILVER,
              alignment=TA_CENTER)
        )
    banner_rows += [
        p(fmt_eur(ht_net),
          fontName=SERIF_BOLD, fontSize=26, textColor=WHITE,
          alignment=TA_CENTER, leading=30),
        p('HT / an',
          fontSize=9, textColor=SILVER, alignment=TA_CENTER),
        Spacer(1, 3 * mm),
        p(f'Soit {fmt_eur(mensuel)} HT / mois'
          f' · TVA 20 % : {fmt_eur(tva)}'
          f' · Total TTC : {fmt_eur(ttc)}',
          fontSize=8.5, textColor=LIGHT, alignment=TA_CENTER),
    ]

    banner = Table([[banner_rows]], colWidths=[CONTENT_W])
    banner.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), NAVY),
        ('TOPPADDING',    (0, 0), (-1, -1), 13),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 13),
        ('LEFTPADDING',   (0, 0), (-1, -1), 18),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 18),
    ]))
    story.append(banner)
    story.append(Spacer(1, 5 * mm))

    # ── Nos engagements ────────────────────────────────────────────────────────
    story.append(section_bar('NOS ENGAGEMENTS'))
    story.append(Spacer(1, 3 * mm))

    for eng in ENGAGEMENTS:
        eng_row = Table([[
            p('✓', fontSize=10, fontName='Helvetica-Bold', textColor=BLUE,
              alignment=TA_CENTER),
            p(eng, fontSize=9, textColor=HexColor('#374151'), leading=13),
        ]], colWidths=[11 * mm, CONTENT_W - 11 * mm])
        eng_row.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING',    (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW',     (0, 0), (-1, -1), 0.3, LIGHT),
            ('LEFTPADDING',   (0, 0), (-1, -1), 4),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
        ]))
        story.append(eng_row)

    story.append(Spacer(1, 5 * mm))

    # ── Signatures ─────────────────────────────────────────────────────────────
    story.append(hr_line())
    story.append(p('Signatures', fontSize=10, fontName='Helvetica-Bold',
                   textColor=NAVY, spaceBefore=3, spaceAfter=3))
    story.append(Spacer(1, 2 * mm))

    client_name = pros.get('interlocuteur') or pros.get('raison_sociale', '')
    sig_name    = sig.get('nom_complet', 'ParFi France')
    BW = (CONTENT_W - 6 * mm) / 2

    def sig_block(who, name):
        inner = Table([
            [p(who, fontSize=8, fontName='Helvetica-Bold', textColor=SILVER)],
            [p(name, fontSize=10, textColor=HexColor('#111827'))],
            [Spacer(1, 10 * mm)],
            [HRFlowable(width='90%', thickness=0.5, color=SILVER, spaceBefore=0, spaceAfter=2)],
            [p('Date et signature', fontSize=8, textColor=SILVER)],
        ], colWidths=[BW - 20 * mm])
        inner.setStyle(TableStyle([
            ('TOPPADDING',    (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING',   (0, 0), (-1, -1), 0),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
        ]))
        outer = Table([[inner]], colWidths=[BW])
        outer.setStyle(TableStyle([
            ('BOX',           (0, 0), (-1, -1), 0.75, LIGHT),
            ('BACKGROUND',    (0, 0), (-1, -1), LGREY),
            ('TOPPADDING',    (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING',   (0, 0), (-1, -1), 8),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        ]))
        return outer

    sigs = Table([[
        sig_block('BON POUR ACCORD — LE CLIENT', client_name),
        Spacer(6 * mm, 1),
        sig_block('POUR LE CABINET PARFI FRANCE', sig_name),
    ]], colWidths=[BW, 6 * mm, BW])
    sigs.setStyle(TableStyle([
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING',    (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING',   (0, 0), (-1, -1), 0),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 0),
    ]))
    story.append(sigs)

    return story


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_devis_pdf(data):
    """Generate a 4-page PDF proposition d'honoraires.

    Returns:
        bytes: Raw PDF content.
    """
    buf = io.BytesIO()

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H,
                        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    content_frame = Frame(
        L_MARGIN, 14 * mm,
        CONTENT_W, PAGE_H - 16 * mm - 14 * mm,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
    )

    def on_cover(c, doc):
        draw_cover_canvas(c, data)

    def on_content(c, doc):
        draw_content_deco(c, doc, data)

    def on_back(c, doc):
        draw_back_canvas(c, data)

    cover_tpl   = PageTemplate(id='Cover',   frames=[cover_frame],   onPage=on_cover)
    content_tpl = PageTemplate(id='Content', frames=[content_frame], onPage=on_content)
    back_tpl    = PageTemplate(id='Back',    frames=[cover_frame],   onPage=on_back)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        pageTemplates=[cover_tpl, content_tpl, back_tpl],
        title=f"Proposition d'honoraires {data.get('numero', '')}",
        author='ParFi France',
        subject="Proposition d'honoraires",
    )

    story = []

    # Page 1: cover (canvas only)
    story.append(Spacer(1, 1))
    story.append(NextPageTemplate('Content'))
    story.append(PageBreak())

    # Page 2: Qui sommes-nous + comprehension
    story.extend(build_page2(data))
    story.append(PageBreak())

    # Page 3: missions + honoraires + engagements + signatures
    story.extend(build_page3(data))
    story.append(NextPageTemplate('Back'))
    story.append(PageBreak())

    # Page 4: back cover (canvas only)
    story.append(Spacer(1, 1))

    doc.build(story)
    return buf.getvalue()


if __name__ == '__main__':
    payload = json.loads(sys.stdin.read())
    for k in ('date_emission', 'date_validite'):
        if isinstance(payload.get(k), str) and payload[k]:
            try:
                payload[k] = date.fromisoformat(payload[k])
            except Exception:
                pass
    sys.stdout.buffer.write(generate_devis_pdf(payload))
