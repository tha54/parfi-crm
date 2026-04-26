import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

// ─── Données tarifaires ───────────────────────────────────────────────────────

const CA_BRACKETS = [
  { value: 'inf_100k',  label: '< 100 000 €',             baseComptes: 600  },
  { value: '100_250k',  label: '100 000 – 250 000 €',      baseComptes: 900  },
  { value: '250_500k',  label: '250 000 – 500 000 €',      baseComptes: 1400 },
  { value: '500k_1m',   label: '500 000 – 1 000 000 €',    baseComptes: 2000 },
  { value: '1m_2m',     label: '1 000 000 – 2 000 000 €',  baseComptes: 3000 },
  { value: '2m_5m',     label: '2 000 000 – 5 000 000 €',  baseComptes: 4500 },
  { value: 'sup_5m',    label: '> 5 000 000 €',            baseComptes: 7000 },
];

const COMPLEXITE_MAP = {
  standard:      { label: 'Standard',      coeff: 1.0 },
  intermediaire: { label: 'Intermédiaire', coeff: 1.3 },
  complexe:      { label: 'Complexe',      coeff: 1.6 },
};

const LIASSE_BASE = {
  BIC: 900, BNC: 700, SCI: 600, SA: 900, Association: 450, Autre: 750,
};

const TVA_ANNUEL = { mensuel: 780, trimestriel: 340, annuel: 180 };
const TVA_NB     = { mensuel: 12,  trimestriel: 4,   annuel: 1   };

const TYPE_STRUCTURES  = ['BIC','BNC','SCI','SA','Association','Autre'];
const REGIMES_TVA_OPTS = [
  { value: 'mensuel',      label: 'Mensuel  (12 déclarations/an)' },
  { value: 'trimestriel',  label: 'Trimestriel  (4 déclarations/an)' },
  { value: 'annuel',       label: 'Annuel  (1 déclaration/an)' },
];

// Mapping mission id → type LDM
const MISSION_TO_LDM_TYPE = {
  tenue_comptable:      'tenue_comptable',
  revision_comptes:     'revision',
  declarations_tva:     'fiscal',
  liasse_fiscale:       'fiscal',
  cvae_cfe:             'fiscal',
  bulletins_paie:       'social_paie',
  dsn:                  'social_paie',
  secretariat_juridique:'juridique',
  conseil:              'conseil',
  previsionnel:         'conseil',
};

// ─── Calcul du prix tenue de comptabilité (mensuel) ──────────────────────────
function prixTenueMensuel(pieces) {
  if (pieces <= 30)  return 80;
  if (pieces <= 80)  return 80  + (pieces - 30) * 1.5;
  if (pieces <= 150) return 155 + (pieces - 80) * 2;
  return 295 + (pieces - 150) * 2.5;
}

// ─── Calcul des lignes ────────────────────────────────────────────────────────
function calculerLignes(profil, actives, params) {
  const coeff = COMPLEXITE_MAP[profil.complexite]?.coeff ?? 1.0;
  const caData = CA_BRACKETS.find(b => b.value === profil.ca) ?? CA_BRACKETS[1];
  const lignes = [];

  if (actives.tenue_comptable) {
    const mensuel = Math.round(prixTenueMensuel(Number(profil.pieces)) * coeff);
    lignes.push({ id: 'tenue_comptable', description: 'Tenue de comptabilité', detail: `${profil.pieces} pièces/mois — complexité ${COMPLEXITE_MAP[profil.complexite]?.label}`, quantite: 12, prixUnitaire: mensuel, total: mensuel * 12, periodicite: 'Mensuel' });
  }
  if (actives.revision_comptes) {
    const prix = Math.round(caData.baseComptes * coeff);
    lignes.push({ id: 'revision_comptes', description: 'Révision et établissement des comptes annuels', detail: `CA ${caData.label}`, quantite: 1, prixUnitaire: prix, total: prix, periodicite: 'Annuel' });
  }
  if (actives.declarations_tva) {
    const total = TVA_ANNUEL[profil.regime] ?? 340;
    const nb    = TVA_NB[profil.regime] ?? 4;
    lignes.push({ id: 'declarations_tva', description: 'Déclarations de TVA', detail: `Régime ${profil.regime} — ${nb} déclaration${nb > 1 ? 's' : ''}/an`, quantite: nb, prixUnitaire: Math.round(total / nb), total, periodicite: profil.regime === 'mensuel' ? 'Mensuel' : profil.regime === 'trimestriel' ? 'Trimestriel' : 'Annuel' });
  }
  if (actives.liasse_fiscale) {
    const prix = Math.round((LIASSE_BASE[profil.typeStructure] ?? 750) * coeff);
    lignes.push({ id: 'liasse_fiscale', description: 'Liasse fiscale et déclaration de résultat', detail: `Structure : ${profil.typeStructure}`, quantite: 1, prixUnitaire: prix, total: prix, periodicite: 'Annuel' });
  }
  if (actives.cvae_cfe) {
    lignes.push({ id: 'cvae_cfe', description: 'Déclarations CVAE / CFE', detail: 'Contribution économique territoriale', quantite: 1, prixUnitaire: 200, total: 200, periodicite: 'Annuel' });
  }
  if (actives.bulletins_paie && Number(profil.salaries) > 0) {
    const pu = Number(params.prixBulletin) || 38;
    const nb = Number(profil.salaries);
    lignes.push({ id: 'bulletins_paie', description: 'Établissement des bulletins de paie', detail: `${nb} salarié${nb > 1 ? 's' : ''} × ${pu} €/bulletin × 12 mois`, quantite: nb * 12, prixUnitaire: pu, total: nb * pu * 12, periodicite: 'Mensuel' });
  }
  if (actives.dsn && !actives.bulletins_paie) {
    lignes.push({ id: 'dsn', description: 'Déclarations sociales (DSN, DPAE)', detail: 'Déclarations annuelles et événementielles', quantite: 1, prixUnitaire: 150, total: 150, periodicite: 'Annuel' });
  }
  if (actives.secretariat_juridique) {
    const prix = Number(params.agPrix) || 350;
    lignes.push({ id: 'secretariat_juridique', description: 'Secrétariat juridique annuel', detail: 'Assemblée générale ordinaire, approbation des comptes', quantite: 1, prixUnitaire: prix, total: prix, periodicite: 'Annuel' });
  }
  if (actives.conseil) {
    const mensuel = Number(params.conseilMensuel) || 150;
    lignes.push({ id: 'conseil', description: 'Conseil et accompagnement', detail: `Forfait mensuel ${mensuel} €`, quantite: 12, prixUnitaire: mensuel, total: mensuel * 12, periodicite: 'Mensuel' });
  }
  if (actives.previsionnel) {
    const prix = Number(params.previsionnelPrix) || 600;
    lignes.push({ id: 'previsionnel', description: 'Prévisionnel et tableaux de bord', detail: 'Business plan, reporting mensuel', quantite: 1, prixUnitaire: prix, total: prix, periodicite: 'Annuel' });
  }

  const globalCoeff = Number(profil.globalCoeff) || 1;
  return lignes.map(l => ({
    ...l,
    prixUnitaire: Math.round(l.prixUnitaire * globalCoeff),
    total:        Math.round(l.total        * globalCoeff),
  }));
}

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v ?? 0);

// ─── Génération HTML pour PDF ─────────────────────────────────────────────────
function generateHTML({ profil, lignes, totaux, clients }) {
  const client = clients.find(c => String(c.id) === String(profil.client_id));
  const clientNom = client?.nom || profil.clientNomLibre || 'Client';
  const today = new Date().toLocaleDateString('fr-FR');
  const validite = new Date(Date.now() + 30 * 86400000).toLocaleDateString('fr-FR');
  const propNum = `PROP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

  const lignesHTML = lignes.map(l => `
    <tr>
      <td><strong>${l.description}</strong><div class="detail">${l.detail}</div></td>
      <td class="center">${l.periodicite}</td>
      <td class="right">${l.quantite}</td>
      <td class="right">${fmt(l.prixUnitaire)}</td>
      <td class="right bold">${fmt(l.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Proposition d'honoraires — ${clientNom}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Roboto, Arial, sans-serif; color: #1a2a3a; font-size: 13px; background: #fff; }
  .no-print { background: #f0f4f8; padding: 16px; text-align: center; border-bottom: 2px solid #0f1f4b; }
  .btn-print { padding: 10px 28px; background: #0f1f4b; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .page { max-width: 210mm; margin: 0 auto; padding: 18mm 20mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
  .brand-name { font-size: 26px; font-weight: 800; color: #0f1f4b; }
  .brand-dot { color: #00b4d8; }
  .brand-sub { font-size: 11px; font-weight: 500; color: #00b4d8; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 4px; }
  .doc-meta { text-align: right; }
  .doc-num { font-size: 13px; font-weight: 700; color: #0f1f4b; }
  .doc-date { font-size: 12px; color: #6b7c93; margin-top: 4px; }
  .divider { height: 3px; background: linear-gradient(90deg, #0f1f4b 0%, #00b4d8 100%); border-radius: 2px; margin-bottom: 28px; }
  .title-block { margin-bottom: 28px; }
  .title-label { font-size: 20px; font-weight: 800; color: #0f1f4b; margin-bottom: 4px; }
  .title-sub { font-size: 12px; color: #6b7c93; }
  .two-col { display: flex; gap: 40px; margin-bottom: 32px; }
  .block-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #00b4d8; margin-bottom: 8px; border-bottom: 1px solid #e5eaf0; padding-bottom: 4px; }
  .block-value { font-size: 14px; font-weight: 700; color: #0f1f4b; }
  .block-sub { font-size: 12px; color: #6b7c93; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { padding: 10px 12px; background: #0f1f4b; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  thead th.right { text-align: right; }
  thead th.center { text-align: center; }
  tbody tr { border-bottom: 1px solid #e5eaf0; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 11px 12px; vertical-align: top; }
  .detail { font-size: 11px; color: #6b7c93; margin-top: 3px; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: 700; }
  .totaux-wrap { display: flex; justify-content: flex-end; margin-bottom: 32px; }
  .totaux { width: 300px; }
  .totaux-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #e5eaf0; font-size: 13px; }
  .totaux-row.ttc { background: #0f1f4b; color: #fff; border-radius: 6px; font-size: 15px; font-weight: 700; margin-top: 6px; }
  .totaux-mensuel { margin-top: 14px; padding: 14px; background: #e0f6fc; border-radius: 6px; text-align: center; }
  .totaux-mensuel-label { font-size: 11px; color: #006f94; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .totaux-mensuel-value { font-size: 22px; font-weight: 800; color: #006f94; margin-top: 4px; }
  .totaux-mensuel-sub { font-size: 11px; color: #006f94; }
  .conditions { margin-bottom: 28px; padding: 14px 16px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #00b4d8; }
  .conditions h4 { font-size: 12px; font-weight: 700; color: #0f1f4b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .conditions p { font-size: 11px; color: #6b7c93; line-height: 1.6; margin-bottom: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5eaf0; display: flex; justify-content: space-between; font-size: 10px; color: #6b7c93; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .no-print { display: none !important; } .page { padding: 10mm 14mm; } @page { margin: 10mm; } }
</style></head><body>
<div class="no-print"><button class="btn-print" onclick="window.print()">🖨️&nbsp; Imprimer / Exporter en PDF</button></div>
<div class="page">
  <div class="header">
    <div><div class="brand-name">ParFi<span class="brand-dot">.</span></div><div class="brand-sub">Expert-comptable</div></div>
    <div class="doc-meta"><div class="doc-num">Réf. ${propNum}</div><div class="doc-date">Émis le ${today}</div><div class="doc-date" style="margin-top:2px">Valable jusqu'au <strong>${validite}</strong></div></div>
  </div>
  <div class="divider"></div>
  <div class="title-block"><div class="title-label">Proposition d'honoraires</div><div class="title-sub">Missions de l'exercice — honoraires annuels HT</div></div>
  <div class="two-col">
    <div style="flex:1"><div class="block-label">Client</div><div class="block-value">${clientNom}</div>${client?.siren ? `<div class="block-sub">SIREN : ${client.siren}</div>` : ''}</div>
    <div style="flex:1"><div class="block-label">Profil</div><div class="block-sub">CA : ${CA_BRACKETS.find(b => b.value === profil.ca)?.label || '—'}</div><div class="block-sub">Structure : ${profil.typeStructure} — Régime TVA : ${profil.regime}</div><div class="block-sub">Complexité : ${COMPLEXITE_MAP[profil.complexite]?.label || '—'}</div></div>
  </div>
  <table>
    <thead><tr><th style="width:42%">Mission</th><th class="center" style="width:13%">Périodicité</th><th class="right" style="width:8%">Qté</th><th class="right" style="width:16%">PU HT</th><th class="right" style="width:16%">Montant HT</th></tr></thead>
    <tbody>${lignesHTML}</tbody>
  </table>
  <div class="totaux-wrap">
    <div class="totaux">
      <div class="totaux-row"><span>Total HT</span><span>${fmt(totaux.ht)}</span></div>
      <div class="totaux-row"><span>TVA ${profil.tauxTVA} %</span><span>${fmt(totaux.tva)}</span></div>
      <div class="totaux-row ttc"><span>Total TTC</span><span>${fmt(totaux.ttc)}</span></div>
      <div class="totaux-mensuel"><div class="totaux-mensuel-label">Équivalent mensuel</div><div class="totaux-mensuel-value">${fmt(totaux.ttc / 12)}</div><div class="totaux-mensuel-sub">TTC / mois</div></div>
    </div>
  </div>
  <div class="conditions">
    <h4>Conditions</h4>
    <p>• Honoraires payables mensuellement par virement ou prélèvement automatique.</p>
    <p>• Proposition valable 30 jours à compter de la date d'émission.</p>
    <p>• Les honoraires sont révisables annuellement selon l'évolution de l'activité et de l'indice des prix à la consommation.</p>
    <p>• Une lettre de mission précisant les détails de chaque prestation sera établie avant le commencement des travaux.</p>
  </div>
  <div class="footer"><span>ParFi Group — Expert-comptable</span><span>Proposition confidentielle — ${today}</span><span>Réf. ${propNum}</span></div>
</div></body></html>`;
}

// ─── Missions définies ────────────────────────────────────────────────────────
const MISSIONS_DEF = [
  { id: 'tenue_comptable',      label: 'Tenue de comptabilité',                       groupe: 'Comptabilité', defaultOn: true  },
  { id: 'revision_comptes',     label: 'Révision et établissement des comptes annuels', groupe: 'Comptabilité', defaultOn: true  },
  { id: 'declarations_tva',     label: 'Déclarations de TVA',                          groupe: 'Fiscal',       defaultOn: true  },
  { id: 'liasse_fiscale',       label: 'Liasse fiscale et déclaration de résultat',    groupe: 'Fiscal',       defaultOn: true  },
  { id: 'cvae_cfe',             label: 'Déclarations CVAE / CFE',                      groupe: 'Fiscal',       defaultOn: false },
  { id: 'bulletins_paie',       label: 'Bulletins de paie',                            groupe: 'Social',       defaultOn: false },
  { id: 'dsn',                  label: 'Déclarations sociales (DSN)',                  groupe: 'Social',       defaultOn: false },
  { id: 'secretariat_juridique',label: 'Secrétariat juridique (AG ordinaire)',         groupe: 'Juridique',    defaultOn: false },
  { id: 'conseil',              label: 'Conseil et accompagnement',                    groupe: 'Conseil',      defaultOn: false },
  { id: 'previsionnel',         label: 'Prévisionnel et tableaux de bord',             groupe: 'Conseil',      defaultOn: false },
];

const GROUPES = [...new Set(MISSIONS_DEF.map(m => m.groupe))];

// ─── Composant principal ──────────────────────────────────────────────────────
export default function Dimensionnement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo  = searchParams.get('returnTo');   // 'devis' | 'ldm' | null
  const urlClientId = searchParams.get('clientId'); // pre-filled client

  const [clients, setClients] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  const [profil, setProfil] = useState({
    client_id: urlClientId || '',
    clientNomLibre: '',
    ca: '100_250k',
    pieces: 50,
    salaries: 0,
    regime: 'mensuel',
    typeStructure: 'BIC',
    complexite: 'standard',
    tauxTVA: 20,
    globalCoeff: 1.0,
  });

  const [actives, setActives] = useState(
    Object.fromEntries(MISSIONS_DEF.map(m => [m.id, m.defaultOn]))
  );

  const [params, setParams] = useState({
    prixBulletin: 38, agPrix: 350, conseilMensuel: 150, previsionnelPrix: 600,
  });

  useEffect(() => {
    api.get('/clients').then(r => {
      setClients(r.data);
      // Si un client est passé en URL, pré-remplir le profil depuis ses données
      if (urlClientId) {
        const client = r.data.find(c => String(c.id) === String(urlClientId));
        if (client) {
          setProfil(p => ({
            ...p,
            client_id: urlClientId,
            typeStructure: client.type || 'BIC',
            regime: client.regime || 'mensuel',
          }));
        }
      }
    }).catch(() => {});
  }, [urlClientId]);

  const lignes = useMemo(() => calculerLignes(profil, actives, params), [profil, actives, params]);

  const totaux = useMemo(() => {
    const ht  = lignes.reduce((s, l) => s + l.total, 0);
    const tva = Math.round(ht * (Number(profil.tauxTVA) / 100));
    return { ht, tva, ttc: ht + tva };
  }, [lignes, profil.tauxTVA]);

  const setP = k => e => setProfil(p => ({ ...p, [k]: e.target.value }));
  const setParam = k => e => setParams(p => ({ ...p, [k]: e.target.value }));
  const toggleMission = id => setActives(a => ({ ...a, [id]: !a[id] }));

  const selectedClient = clients.find(c => String(c.id) === String(profil.client_id));
  const clientNom = selectedClient?.nom || profil.clientNomLibre || null;

  const handleGeneratePDF = () => {
    const html = generateHTML({ profil, lignes, totaux, clients });
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  };

  // ── Créer un devis ────────────────────────────────────────────────────────
  const handleSaveDevis = async () => {
    if (!clientNom) { alert('Veuillez sélectionner un client ou saisir un nom.'); return; }
    if (lignes.length === 0) { alert('Aucune mission sélectionnée.'); return; }
    setSaving('devis'); setSaveMsg(null);
    try {
      const dateValidite = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const payload = {
        client_id:     selectedClient?.id || null,
        titre:         `Proposition d'honoraires — ${clientNom}`,
        dateValidite,
        tauxTVA:       Number(profil.tauxTVA),
        totalHT:       totaux.ht,
        totalTVA:      totaux.tva,
        totalTTC:      totaux.ttc,
        notesClient:   'Honoraires annuels détaillés ci-dessus. Payables mensuellement.',
        notesInternes: `CA: ${CA_BRACKETS.find(b => b.value === profil.ca)?.label} | Complexité: ${COMPLEXITE_MAP[profil.complexite]?.label} | Généré depuis Dimensionnement`,
        lignes: lignes.map((l, i) => ({
          ordre:          i + 1,
          description:    `${l.description} — ${l.detail}`,
          quantite:       l.quantite,
          prixUnitaireHT: l.prixUnitaire,
          remisePct:      0,
          totalHT:        l.total,
        })),
      };
      const { data } = await api.post('/devis', payload);
      setSaveMsg({ type: 'ok', text: `✓ Devis ${data.numero} créé avec succès !`, action: 'devis' });
      setTimeout(() => navigate('/devis'), 1800);
    } catch (err) {
      setSaveMsg({ type: 'err', text: err.response?.data?.message || 'Erreur lors de la création du devis' });
    } finally { setSaving(false); }
  };

  // ── Créer une lettre de mission ───────────────────────────────────────────
  const handleSaveLDM = async () => {
    if (!selectedClient) { alert('Veuillez sélectionner un client du CRM pour créer une lettre de mission.'); return; }
    if (lignes.length === 0) { alert('Aucune mission sélectionnée.'); return; }
    setSaving('ldm'); setSaveMsg(null);
    try {
      // Déterminer le type de mission dominant
      const activeMissionIds = MISSIONS_DEF.filter(m => actives[m.id]).map(m => m.id);
      const ldmTypes = activeMissionIds.map(id => MISSION_TO_LDM_TYPE[id]).filter(Boolean);
      const typeMission = ldmTypes[0] || 'tenue_comptable'; // premier type actif

      // Générer l'objet de la mission à partir des lignes sélectionnées
      const objetMission = lignes.map(l => `- ${l.description} : ${fmt(l.total)} HT/an (${l.periodicite})`).join('\n');

      // Tableau de répartition des tâches pour la LDM
      const repartitionTaches = lignes.map(l => ({
        mission:    l.description,
        detail:     l.detail,
        total:      l.total,
        periodicite:l.periodicite,
      }));

      const today = new Date().toISOString().split('T')[0];
      const payload = {
        client_id:             selectedClient.id,
        typeMission,
        objetMission:          `Missions confiées par ${selectedClient.nom} :\n\n${objetMission}`,
        montantHonorairesHT:   totaux.ht,
        dateDebut:             today,
        repartitionTaches:     JSON.stringify(repartitionTaches),
        notesInternes:         `Généré depuis Dimensionnement — CA: ${CA_BRACKETS.find(b => b.value === profil.ca)?.label} | Complexité: ${COMPLEXITE_MAP[profil.complexite]?.label}`,
      };
      const { data } = await api.post('/lettres-mission', payload);
      setSaveMsg({ type: 'ok', text: `✓ Lettre de mission ${data.numero} créée avec succès !`, action: 'ldm' });
      setTimeout(() => navigate('/lettres-mission'), 1800);
    } catch (err) {
      setSaveMsg({ type: 'err', text: err.response?.data?.message || 'Erreur lors de la création de la LDM' });
    } finally { setSaving(false); }
  };

  // Bandeau contextuel si vient de Devis ou LDM
  const contextBanner = returnTo ? (
    <div style={{ background: '#e0f6fc', border: '1px solid #00b4d8', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
      <span>
        {returnTo === 'devis' ? '📄 Mode devis' : '📋 Mode lettre de mission'}
        {clientNom ? ` — ${clientNom}` : ' — sélectionnez un client'}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate(returnTo === 'devis' ? '/devis' : '/lettres-mission')}>
        ← Retour {returnTo === 'devis' ? 'aux devis' : 'aux lettres de mission'}
      </button>
    </div>
  ) : null;

  return (
    <>
      <div className="page-header">
        <h1>Dimensionnement des honoraires</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={handleGeneratePDF} disabled={lignes.length === 0}>
            🖨️ Aperçu PDF
          </button>
          <button className="btn btn-ghost" style={{ borderColor: '#0f1f4b', color: '#0f1f4b' }} onClick={handleSaveLDM}
            disabled={saving !== false || lignes.length === 0}>
            {saving === 'ldm' ? 'Création…' : '📋 Créer une lettre de mission'}
          </button>
          <button className="btn btn-primary" onClick={handleSaveDevis}
            disabled={saving !== false || lignes.length === 0}>
            {saving === 'devis' ? 'Création…' : '📄 Créer un devis'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {contextBanner}

        {saveMsg && (
          <div className={`alert ${saveMsg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{saveMsg.text}</span>
            {saveMsg.type === 'ok' && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(saveMsg.action === 'ldm' ? '/lettres-mission' : '/devis')}>
                Voir →
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* ── Colonne gauche : Profil + Missions ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Profil client */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Profil de l'entreprise</span>
              </div>
              <div className="card-body">

                <div className="form-group">
                  <label className="form-label">Client CRM</label>
                  <select className="form-control" value={profil.client_id} onChange={setP('client_id')}>
                    <option value="">— Saisir un nom libre —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  {selectedClient && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {selectedClient.type} · {selectedClient.regime}
                      {selectedClient.siren && ` · SIREN : ${selectedClient.siren}`}
                    </div>
                  )}
                </div>

                {!profil.client_id && (
                  <div className="form-group">
                    <label className="form-label">Nom du client (libre — aperçu PDF uniquement)</label>
                    <input className="form-control" value={profil.clientNomLibre} onChange={setP('clientNomLibre')} placeholder="SARL Exemple…" />
                    <div style={{ fontSize: 11, color: '#e67e22', marginTop: 3 }}>
                      ⚠ La création d'un devis ou d'une LDM nécessite un client CRM sélectionné.
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Chiffre d'affaires</label>
                    <select className="form-control" value={profil.ca} onChange={setP('ca')}>
                      {CA_BRACKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Pièces comptables / mois</label>
                    <input type="number" className="form-control" min={1} max={999} value={profil.pieces} onChange={setP('pieces')} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Nombre de salariés</label>
                    <input type="number" className="form-control" min={0} value={profil.salaries} onChange={setP('salaries')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Régime de TVA</label>
                    <select className="form-control" value={profil.regime} onChange={setP('regime')}>
                      {REGIMES_TVA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type de structure</label>
                    <select className="form-control" value={profil.typeStructure} onChange={setP('typeStructure')}>
                      {TYPE_STRUCTURES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Complexité du dossier</label>
                    <select className="form-control" value={profil.complexite} onChange={setP('complexite')}>
                      {Object.entries(COMPLEXITE_MAP).map(([k, v]) => (
                        <option key={k} value={k}>{v.label} (×{v.coeff})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Taux TVA (%)</label>
                    <input type="number" className="form-control" min={0} max={100} value={profil.tauxTVA} onChange={setP('tauxTVA')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" title="Ajustez le tarif global à la hausse ou à la baisse">
                      Coefficient d'ajustement
                    </label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="range" min={0.7} max={1.5} step={0.05} value={profil.globalCoeff} onChange={setP('globalCoeff')} style={{ flex: 1 }} />
                      <span style={{ fontWeight: 700, minWidth: 36, color: 'var(--primary)' }}>
                        ×{Number(profil.globalCoeff).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Sélection des missions */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Sélection des missions</span>
                <span className="text-muted text-sm">{lignes.length} mission{lignes.length !== 1 ? 's' : ''} sélectionnée{lignes.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="card-body" style={{ padding: '8px 20px 16px' }}>
                {GROUPES.map(groupe => (
                  <div key={groupe} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hover)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '12px 0 6px', borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                      {groupe}
                    </div>
                    {MISSIONS_DEF.filter(m => m.groupe === groupe).map(m => (
                      <div key={m.id}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={actives[m.id]} onChange={() => toggleMission(m.id)} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                          <span style={{ fontSize: 13, color: actives[m.id] ? 'var(--text)' : 'var(--text-muted)' }}>
                            {m.label}
                          </span>
                          {actives[m.id] && (
                            <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 12, color: 'var(--primary)' }}>
                              {fmt(lignes.find(l => l.id === m.id)?.total ?? 0)}
                            </span>
                          )}
                        </label>

                        {actives[m.id] && m.id === 'bulletins_paie' && (
                          <div style={{ marginLeft: 26, marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span className="form-label" style={{ marginBottom: 0 }}>Prix / bulletin</span>
                            <input type="number" className="form-control" style={{ width: 90 }} min={20} value={params.prixBulletin} onChange={setParam('prixBulletin')} />
                            <span className="text-muted text-sm">€ HT</span>
                          </div>
                        )}
                        {actives[m.id] && m.id === 'secretariat_juridique' && (
                          <div style={{ marginLeft: 26, marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span className="form-label" style={{ marginBottom: 0 }}>Forfait AG</span>
                            <input type="number" className="form-control" style={{ width: 90 }} min={100} value={params.agPrix} onChange={setParam('agPrix')} />
                            <span className="text-muted text-sm">€ HT</span>
                          </div>
                        )}
                        {actives[m.id] && m.id === 'conseil' && (
                          <div style={{ marginLeft: 26, marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span className="form-label" style={{ marginBottom: 0 }}>Mensuel</span>
                            <input type="number" className="form-control" style={{ width: 90 }} min={50} value={params.conseilMensuel} onChange={setParam('conseilMensuel')} />
                            <span className="text-muted text-sm">€ HT / mois</span>
                          </div>
                        )}
                        {actives[m.id] && m.id === 'previsionnel' && (
                          <div style={{ marginLeft: 26, marginBottom: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span className="form-label" style={{ marginBottom: 0 }}>Forfait annuel</span>
                            <input type="number" className="form-control" style={{ width: 90 }} min={200} value={params.previsionnelPrix} onChange={setParam('previsionnelPrix')} />
                            <span className="text-muted text-sm">€ HT</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Colonne droite : Récapitulatif ── */}
          <div style={{ position: 'sticky', top: 70 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Récapitulatif des honoraires</span>
                {clientNom && <span style={{ fontSize: 12, color: 'var(--accent-hover)', fontWeight: 600 }}>{clientNom}</span>}
              </div>

              {lignes.length === 0 ? (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-icon">📋</div>
                  <p>Sélectionnez des missions à gauche</p>
                </div>
              ) : (
                <>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Mission</th>
                          <th style={{ textAlign: 'center', width: 90 }}>Périodicité</th>
                          <th style={{ textAlign: 'right', width: 110 }}>Montant HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(l => (
                          <tr key={l.id}>
                            <td>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{l.description}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.detail}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent-hover)', fontSize: 10 }}>
                                {l.periodicite}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Totaux */}
                  <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                      <span className="text-muted">Total HT</span>
                      <strong>{fmt(totaux.ht)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 13 }}>
                      <span className="text-muted">TVA {profil.tauxTVA} %</span>
                      <span>{fmt(totaux.tva)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--primary)', color: '#fff', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 15, fontWeight: 700 }}>
                      <span>Total TTC</span>
                      <span>{fmt(totaux.ttc)}</span>
                    </div>

                    <div style={{ marginTop: 14, background: 'var(--accent-light)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hover)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Équivalent mensuel
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent-hover)', marginTop: 4 }}>
                        {fmt(totaux.ttc / 12)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--accent-hover)' }}>TTC / mois</div>
                    </div>
                  </div>

                  {/* Boutons d'action */}
                  <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="btn btn-ghost" style={{ justifyContent: 'center', padding: 10 }} onClick={handleGeneratePDF}>
                      🖨️ Aperçu / Export PDF
                    </button>
                    <button className="btn btn-primary" style={{ justifyContent: 'center', padding: 11 }} onClick={handleSaveDevis} disabled={saving !== false}>
                      {saving === 'devis' ? 'Création en cours…' : '📄 Créer un devis'}
                    </button>
                    <button
                      className="btn"
                      style={{ justifyContent: 'center', padding: 11, background: '#0f1f4b', color: '#fff', border: 'none' }}
                      onClick={handleSaveLDM}
                      disabled={saving !== false}
                      title={!selectedClient ? 'Sélectionnez un client CRM pour créer une LDM' : ''}
                    >
                      {saving === 'ldm' ? 'Création en cours…' : '📋 Créer une lettre de mission'}
                    </button>

                    {/* Liens rapides */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => navigate('/devis')}>
                        Voir les devis →
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }} onClick={() => navigate('/lettres-mission')}>
                        Voir les LDM →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
