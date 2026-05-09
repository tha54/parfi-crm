import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

const STATUTS = {
  brouillon:        'Brouillon',
  a_valider:        'À valider',
  validee_interne:  'Validée en interne',
  envoyee:          'Envoyée pour signature',
  signee:           'Signée',
  active:           'Active',
  resiliee:         'Résiliée',
  echue:            'Échue',
  annulee:          'Annulée',
  archivee:         'Archivée',
};
const STATUT_COLORS = {
  brouillon:        '#6b7c93',
  a_valider:        '#d97706',
  validee_interne:  '#2563eb',
  envoyee:          '#f59e0b',
  signee:           '#00897b',
  active:           '#059669',
  resiliee:         '#dc2626',
  echue:            '#9ca3af',
  annulee:          '#9ca3af',
  archivee:         '#9ca3af',
};
const STATUT_TERMINAL = ['active','resiliee','echue','annulee','archivee'];
const PIPELINE_STEPS = [
  { key: 'preparation', label: 'Préparation',  statuts: ['brouillon', 'a_valider'] },
  { key: 'validation',  label: 'Validation',   statuts: ['validee_interne'] },
  { key: 'envoi',       label: 'Envoi',        statuts: ['envoyee', 'signee'] },
  { key: 'active',      label: 'Active',       statuts: ['active'] },
];

const TYPES_MISSION = {
  tenue_comptable: 'Tenue comptable', revision: 'Révision',
  etablissement_comptes: 'Établissement des comptes', fiscal: 'Fiscal',
  social_paie: 'Social / Paie', conseil: 'Conseil', juridique: 'Juridique', autre: 'Autre',
};

/** Bandeau "Prochaine étape" — guide le workflow LDM. */
function NextStepCard({ title, subtitle, description, primary, secondaries = [], color = 'var(--accent)' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 18,
      padding: '16px 20px', marginBottom: 20,
      borderRadius: 10, border: `1px solid ${color}40`,
      background: `${color}0d`, borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color, padding: '2px 8px', background: `${color}1a`, borderRadius: 10 }}>
            {subtitle}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {secondaries.map((b, i) => (
          <button key={i} className="btn btn-ghost btn-sm" onClick={b.onClick} disabled={b.disabled}
            style={b.color ? { borderColor: b.color, color: b.color } : undefined}>
            {b.label}
          </button>
        ))}
        {primary && (
          <button className="btn btn-primary" onClick={primary.onClick} disabled={primary.disabled} title={primary.title}
            style={{ background: primary.color || color, borderColor: primary.color || color }}>
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}

function printLDM(ldm, mandats) {
  const nom     = ldm.client_nom || '—';
  const today   = new Date().toLocaleDateString('fr-FR');
  const debut   = ldm.dateDebut   ? new Date(ldm.dateDebut).toLocaleDateString('fr-FR')  : '—';
  const typeLbl = TYPES_MISSION[ldm.typeMission] || ldm.typeMission;
  const isSigned = ldm.statut === 'signee';
  const signDate = ldm.dateSignatureClient ? new Date(ldm.dateSignatureClient).toLocaleDateString('fr-FR') : '';

  const mandatsHTML = mandats.length > 0 ? `
    <div class="section-title">Mandats</div>
    <table><thead><tr><th>Mandat</th><th class="center" style="width:120px">Signé</th><th class="right" style="width:130px">Date signature</th></tr></thead>
    <tbody>${mandats.map(m => `<tr><td>${m.libelle || m.type}</td><td class="center">${m.signe ? '✓ Oui' : 'Non'}</td><td class="right">${m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</td></tr>`).join('')}</tbody>
    </table>` : '';

  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Lettre de mission ${ldm.numero}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;color:#1a2a3a;font-size:13px;background:#fff}
.no-print{background:#f0f4f8;padding:14px;text-align:center;border-bottom:2px solid #0f1f4b}
.btn-print{padding:9px 26px;background:#0f1f4b;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
.page{max-width:210mm;margin:0 auto;padding:16mm 18mm}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
.brand{font-size:26px;font-weight:800;color:#0f1f4b}.brand span{color:#00b4d8}
.brand-sub{font-size:11px;color:#00b4d8;letter-spacing:.1em;text-transform:uppercase;margin-top:3px}
.doc-meta{text-align:right;font-size:12px;color:#6b7c93}
.doc-num{font-size:14px;font-weight:700;color:#0f1f4b}
.divider{height:3px;background:linear-gradient(90deg,#0f1f4b,#00b4d8);border-radius:2px;margin-bottom:24px}
.title{font-size:20px;font-weight:800;color:#0f1f4b;margin-bottom:4px}
.title-sub{font-size:12px;color:#6b7c93;margin-bottom:22px}
.two-col{display:flex;gap:40px;margin-bottom:24px}
.block-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#00b4d8;margin-bottom:5px;border-bottom:1px solid #e5eaf0;padding-bottom:3px}
.block-value{font-size:14px;font-weight:700;color:#0f1f4b}
.block-sub{font-size:12px;color:#6b7c93;margin-top:2px}
.section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0f1f4b;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #0f1f4b}
.objet{background:#f8fafc;border-left:3px solid #00b4d8;padding:12px 14px;border-radius:0 6px 6px 0;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
thead th{padding:8px 10px;background:#0f1f4b;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase}
thead th.right{text-align:right}thead th.center{text-align:center}
tbody tr{border-bottom:1px solid #e5eaf0}tbody td{padding:9px 10px}
.right{text-align:right}.center{text-align:center}
.honoraires{display:flex;justify-content:flex-end;margin-bottom:20px}
.honoraires-inner{width:260px;border:1px solid #e5eaf0;border-radius:6px;overflow:hidden}
.h-row{display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e5eaf0;font-size:13px}
.h-ttc{background:#0f1f4b;color:#fff;font-weight:700;font-size:14px;padding:10px 12px}
.clause{font-size:11px;color:#6b7c93;line-height:1.7;margin-bottom:16px}
.clause strong{color:#1a2a3a}
.signatures{display:flex;gap:40px;margin-top:28px;margin-bottom:24px}
.sig-box{flex:1;padding:14px;border:1px solid #e5eaf0;border-radius:6px}
.sig-label{font-size:10px;font-weight:700;color:#00b4d8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.sig-area{height:56px;border-bottom:1px solid #1a2a3a;margin-bottom:6px}
.sig-nom{font-size:11px;color:#6b7c93}
.footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5eaf0;display:flex;justify-content:space-between;font-size:10px;color:#6b7c93}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.no-print{display:none!important}.page{padding:10mm 14mm}@page{margin:8mm}}
</style></head><body>
<div class="no-print"><button class="btn-print" onclick="window.print()">🖨️ Imprimer / Exporter en PDF</button></div>
<div class="page">
  <div class="header">
    <div><div class="brand">ParFi<span>.</span></div><div class="brand-sub">Expert-comptable</div></div>
    <div class="doc-meta"><div class="doc-num">${ldm.numero}</div><div style="margin-top:4px">Établie le ${today}</div>${isSigned ? `<div style="color:#00897b;font-weight:600;margin-top:4px">✓ Signée le ${signDate}</div>` : ''}</div>
  </div>
  <div class="divider"></div>
  <div class="title">Lettre de mission</div>
  <div class="title-sub">${typeLbl}</div>

  <div class="two-col">
    <div style="flex:1">
      <div class="block-label">Cabinet</div>
      <div class="block-value">ParFi France</div>
      <div class="block-sub">Expert-comptable · Membre de l'OEC</div>
    </div>
    <div style="flex:1">
      <div class="block-label">Client</div>
      <div class="block-value">${nom}</div>
      ${ldm.client_siren ? `<div class="block-sub">SIREN : ${ldm.client_siren}</div>` : ''}
    </div>
  </div>

  <div class="section-title">Objet de la mission</div>
  <div class="objet">${ldm.objetMission || typeLbl}</div>

  <div class="honoraires"><div class="honoraires-inner">
    <div class="h-row"><span style="color:#6b7c93">Honoraires HT</span><strong>${fmt(ldm.montantHonorairesHT)}</strong></div>
    <div class="h-row"><span style="color:#6b7c93">TVA 20%</span><span>${fmt(Number(ldm.montantHonorairesHT) * 0.20)}</span></div>
    <div class="h-row h-ttc"><span>Total TTC</span><span>${fmt(Number(ldm.montantHonorairesHT) * 1.20)}</span></div>
    <div style="padding:8px 12px;background:#e0f6fc;text-align:center;font-size:12px;color:#006f94;font-weight:600">
      ${fmt(Number(ldm.montantHonorairesHT) * 1.20 / 12)} / mois TTC
    </div>
  </div></div>

  ${mandatsHTML}

  <div class="section-title">Conditions générales</div>
  <div class="clause">
    <strong>Modalités de paiement :</strong> Les honoraires sont payables mensuellement par prélèvement automatique ou virement bancaire, à réception de facture.<br>
    <strong>Révision des honoraires :</strong> Les honoraires sont révisables annuellement selon l'évolution de l'activité du client et de l'indice des prix à la consommation.<br>
    <strong>Durée :</strong> La présente lettre de mission est conclue pour une durée indéterminée à compter du ${debut}, avec reconduction tacite annuelle.<br>
    <strong>Résiliation :</strong> Chaque partie peut mettre fin à la mission avec un préavis de 3 mois par lettre recommandée avec accusé de réception.<br>
    <strong>Responsabilité :</strong> Le cabinet est assuré en responsabilité civile professionnelle. Sa responsabilité ne peut être engagée qu'en cas de faute prouvée.<br>
    <strong>RGPD :</strong> Les données personnelles collectées sont traitées conformément au RGPD et à la politique de confidentialité du cabinet.
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-label">Le cabinet — ParFi France</div>
      <div class="sig-area">${isSigned ? '<div style="font-style:italic;color:#00897b;padding-top:18px">Signé électroniquement</div>' : ''}</div>
      <div class="sig-nom">Expert-comptable</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">Le client — ${nom}</div>
      <div class="sig-area">${isSigned ? `<div style="font-style:italic;color:#00897b;padding-top:18px">Signé le ${signDate}</div>` : '<div style="font-size:11px;color:#9ca3af;padding-top:16px">Lu et approuvé</div>'}</div>
      <div class="sig-nom">${nom}</div>
    </div>
  </div>

  <div class="footer"><span>ParFi France — Expert-comptable</span><span>Document confidentiel</span><span>${ldm.numero} · ${today}</span></div>
</div></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

const MANDAT_ICONS = { prelevement: '🏦', impots: '🏛️', urssaf: '👷', autre: '📄' };
const MANDAT_LABELS = { prelevement: 'Prélèvement bancaire', impots: 'Mandat fiscal (impôts)', urssaf: 'Organismes sociaux (URSSAF)', autre: 'Autre mandat' };

const SECTION_COLORS_LDM = { Comptabilité: '#1d4ed8', Fiscalité: '#b45309', Social: '#15803d', Juridique: '#7c3aed' };

function RubriqueRowLDM({ rub }) {
  const [open, setOpen] = useState(false);
  const color = SECTION_COLORS_LDM[rub.section] || '#6b7280';
  const total = rub.total || rub.lignes.reduce((s, l) => s + parseFloat(l.tarif_ht || l.totalHT || 0), 0);
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', background: '#f8fafc' }}>
        <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13 }}>
          <span style={{ display: 'inline-block', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : '', marginRight: 8, color: 'var(--text-muted)', fontSize: 10 }}>▶</span>
          {rub.rubrique}
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, background: color + '15', color, padding: '2px 8px', borderRadius: 10 }}>{rub.section}</span>
        </td>
        <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>{rub.lignes.length}</td>
        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(total)}</td>
      </tr>
      {open && rub.lignes.map((l, i) => (
        <tr key={i} style={{ background: '#fff', borderTop: '1px solid #f0f4f8' }}>
          <td style={{ padding: '7px 14px 7px 38px', fontSize: 12, color: '#4b5563' }}>{l.libelle || l.description}</td>
          <td style={{ padding: '7px 14px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{l.periodicite || '—'}</td>
          <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, color: '#4b5563' }}>{fmt(l.tarif_ht || l.totalHT)}</td>
        </tr>
      ))}
    </>
  );
}

export default function LDMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromDevis = searchParams.get('fromDevis') === '1';
  const { user } = useAuth();

  const [ldm, setLdm] = useState(null);
  const [mandats, setMandats] = useState([]);
  const [taches, setTaches] = useState([]);
  const [users, setUsers] = useState([]);
  const [rubriques, setRubriques] = useState([]);
  const [evenements, setEvenements] = useState([]);
  const [missionsDetail, setMissionsDetail] = useState([]);
  const [recueilForm, setRecueilForm] = useState({ activite: '', effectif: '', enjeux: '', contraintes: '' });
  const [recueilSaved, setRecueilSaved] = useState(false);
  const [savingRecueil, setSavingRecueil] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [generatingEcheancier, setGeneratingEcheancier] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [msg, setMsg] = useState(null);
  const [signModal, setSignModal] = useState(false);
  const [injecterModal, setInjecterModal] = useState(false);
  const [selectedCollab, setSelectedCollab] = useState('');
  const [selectedChef, setSelectedChef] = useState('');
  const [emailModal, setEmailModal] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [resilierModal, setResilierModal] = useState(false);
  const [resilierForm, setResilierForm] = useState({ motif: '', dateResiliation: '' });
  const [annulerModal, setAnnulerModal] = useState(false);
  const [editMission, setEditMission] = useState(false);
  const [missionForm, setMissionForm] = useState({ objetMission: '', montantHonorairesHT: '', dateDebut: '', periodicite_facturation: '', date_premiere_facture: '' });
  const [savingMission, setSavingMission] = useState(false);

  const isExpert = user?.role === 'expert';
  const canPrepare = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    try {
      const [{ data: l }, { data: m }] = await Promise.all([
        api.get(`/lettres-mission/${id}`),
        api.get(`/lettres-mission/${id}/mandats`).catch(() => ({ data: [] })),
      ]);
      setLdm(l);
      setMandats(m);
      // Initialise recueil form from stored JSON
      if (l.recueil_besoin_json) {
        try {
          const r = typeof l.recueil_besoin_json === 'string' ? JSON.parse(l.recueil_besoin_json) : l.recueil_besoin_json;
          if (r) setRecueilForm({ activite: r.activite || '', effectif: r.effectif || '', enjeux: r.enjeux || '', contraintes: r.contraintes || '' });
        } catch {}
      }
      if (l.collaborateur_id && !selectedCollab) setSelectedCollab(String(l.collaborateur_id));
      else if (l.intervenantId && !selectedCollab) setSelectedCollab(String(l.intervenantId));
      if (l.chef_mission_id && !selectedChef) setSelectedChef(String(l.chef_mission_id));
      if (l.client_id) {
        api.get(`/taches?client_id=${l.client_id}`).then(r => {
          setTaches((r.data || []).filter(t => t.origine === 'ldm'));
        }).catch(() => {});
      }
      if (l.devis_id) {
        api.get(`/devis/${l.devis_id}`).then(r => {
          setRubriques(r.data.lignes_grouped || []);
        }).catch(() => {});
      }
      api.get(`/lettres-mission/evenements/${id}`).then(r => setEvenements(r.data || [])).catch(() => {});
      api.get(`/lettres-mission/${id}/missions`).then(r => setMissionsDetail(r.data || [])).catch(() => {});
    } catch { navigate('/lettres-mission'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    api.get('/utilisateurs').then(r => setUsers(r.data || [])).catch(() => {});
  }, [id]);

  // Auto-generate OEC PDF on first view
  useEffect(() => {
    if (!ldm) return;
    if (ldm.pdf_path) { setPdfReady(true); return; }
    api.post(`/lettres-mission/${id}/generer-pdf`)
      .then(() => setPdfReady(true))
      .catch(() => {});
  }, [ldm?.id]);

  const genererPdf = async () => {
    setGeneratingPdf(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/generer-pdf`);
      setPdfReady(true);
      setMsg({ type: 'ok', text: '✓ PDF OEC généré' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur génération PDF' });
    } finally { setGeneratingPdf(false); }
  };

  const voirPdf = () => {
    const token = localStorage.getItem('parfi_token');
    window.open(`/api/lettres-mission/${id}/pdf?token=${token}`, '_blank');
  };

  const askEmail = (nomContact) => new Promise(resolve => {
    setEmailInput('');
    setEmailModal({ nomContact, resolve });
  });

  const envoyerLDM = async (emailOverride) => {
    setSigning(true); setMsg(null);
    try {
      const { data } = await api.post(`/lettres-mission/${id}/envoyer`, emailOverride ? { emailOverride } : {});
      if (data.missingEmail) {
        setSigning(false);
        const email = await askEmail(data.nomContact);
        if (!email) return;
        return envoyerLDM(email);
      }
      if (data.emailError) {
        setMsg({ type: 'warn', text: `Statut mis à jour, mais l'email n'a pas pu être envoyé : ${data.emailError}` });
      } else if (data.email) {
        setMsg({ type: 'ok', text: `✓ LDM envoyée par email à ${data.email}` });
      } else {
        setMsg({ type: 'ok', text: data.message || 'LDM envoyée pour signature' });
      }
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur lors de l\'envoi' });
    } finally { setSigning(false); }
  };

  const openSignModal = () => { setSignModal(true); };

  const signLDM = async () => {
    setSigning(true); setMsg(null); setSignModal(false);
    try {
      const payload = {
        collaborateur_id: Number(selectedCollab),
        chef_mission_id:  Number(selectedChef),
      };
      const { data: result } = await api.post(`/lettres-mission/${id}/signer`, payload);
      const collabName = users.find(u => String(u.id) === String(selectedCollab));
      const chefName   = users.find(u => String(u.id) === String(selectedChef));
      const who = [
        collabName && `collaborateur : ${collabName.prenom} ${collabName.nom}`,
        chefName   && `chef : ${chefName.prenom} ${chefName.nom}`,
      ].filter(Boolean).join(', ');
      setMsg({ type: 'ok', text: `✓ LDM signée — ${result.tachesCreees} tâche(s) planifiées (${who})` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur lors de la signature' });
    } finally { setSigning(false); }
  };

  const injecterTaches = async () => {
    setSigning(true); setMsg(null);
    try {
      const payload = {
        ...(selectedCollab && { collaborateur_id: Number(selectedCollab) }),
        ...(selectedChef   && { chef_mission_id: Number(selectedChef) }),
      };
      const { data: result } = await api.post(`/lettres-mission/${id}/injecter-taches`, payload);
      const collabName = selectedCollab ? users.find(u => String(u.id) === String(selectedCollab)) : null;
      const who = collabName ? ` — planifiées pour ${collabName.prenom} ${collabName.nom}` : '';
      setMsg({ type: 'ok', text: `✓ ${result.tachesCreees} tâche(s) planifiées${who}` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur injection des tâches' });
    } finally { setSigning(false); }
  };

  const genererEcheancier = async () => {
    setGeneratingEcheancier(true); setMsg(null);
    try {
      const { data } = await api.post(`/lettres-mission/${id}/generer-echeancier`);
      setMsg({ type: 'ok', text: `✓ ${data.message}` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur génération échéancier' });
    } finally { setGeneratingEcheancier(false); }
  };

  const changeStatut = async (statut) => {
    try {
      await api.put(`/lettres-mission/${id}`, { statut });
      setLdm(d => ({ ...d, statut }));
    } catch { setMsg({ type: 'err', text: 'Erreur statut' }); }
  };

  const resilierLDM = async () => {
    if (!resilierForm.motif || resilierForm.motif.length < 10) {
      setMsg({ type: 'err', text: 'Motif obligatoire (minimum 10 caractères)' });
      return;
    }
    if (!resilierForm.dateResiliation) {
      setMsg({ type: 'err', text: 'Date de résiliation obligatoire' });
      return;
    }
    setSigning(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/resilier`, resilierForm);
      setResilierModal(false);
      setMsg({ type: 'ok', text: 'LDM résiliée' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur résiliation' });
    } finally { setSigning(false); }
  };

  const annulerLDM = async () => {
    setSigning(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/annuler`);
      setAnnulerModal(false);
      setMsg({ type: 'ok', text: 'LDM annulée — devis déverrouillé' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur annulation' });
    } finally { setSigning(false); }
  };

  const soumettreLDM = async () => {
    setSigning(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/soumettre`);
      setMsg({ type: 'ok', text: 'LDM soumise pour validation interne' });
      await load();
    } catch (e) {
      const d = e.response?.data;
      if (d?.missingFields) {
        const missing = [d.missingFields.activite && 'Activité', d.missingFields.enjeux && 'Enjeux'].filter(Boolean).join(', ');
        setMsg({ type: 'err', text: `Recueil du besoin incomplet — champs obligatoires manquants : ${missing}` });
      } else {
        setMsg({ type: 'err', text: d?.message || 'Erreur soumission' });
      }
    } finally { setSigning(false); }
  };

  const validerInterne = async () => {
    setSigning(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/valider-interne`);
      setMsg({ type: 'ok', text: 'LDM validée en interne — prête à envoyer' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur validation' });
    } finally { setSigning(false); }
  };

  const rollbackLDM = async () => {
    setSigning(true); setMsg(null);
    try {
      await api.post(`/lettres-mission/${id}/rollback`);
      setMsg({ type: 'ok', text: 'LDM renvoyée en brouillon' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur rollback' });
    } finally { setSigning(false); }
  };

  const openEditMission = () => {
    setMissionForm({
      objetMission: ldm.objetMission || '',
      montantHonorairesHT: ldm.montantHonorairesHT || '',
      dateDebut: ldm.dateDebut ? ldm.dateDebut.slice(0, 10) : '',
      periodicite_facturation: ldm.periodicite_facturation || '',
      date_premiere_facture: ldm.date_premiere_facture ? ldm.date_premiere_facture.slice(0, 10) : '',
    });
    setEditMission(true);
  };

  const saveMission = async () => {
    setSavingMission(true); setMsg(null);
    try {
      await api.put(`/lettres-mission/${id}`, {
        objetMission: missionForm.objetMission || null,
        montantHonorairesHT: Number(missionForm.montantHonorairesHT) || 0,
        dateDebut: missionForm.dateDebut || null,
        periodicite_facturation: missionForm.periodicite_facturation || null,
        date_premiere_facture: missionForm.date_premiere_facture || null,
      });
      setEditMission(false);
      setMsg({ type: 'ok', text: '✓ Mission mise à jour' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur mise à jour mission' });
    } finally { setSavingMission(false); }
  };

  const saveRecueilBesoin = async () => {
    setSavingRecueil(true); setMsg(null);
    try {
      await api.put(`/lettres-mission/${id}/recueil-besoin`, recueilForm);
      setRecueilSaved(true);
      setMsg({ type: 'ok', text: '✓ Recueil du besoin sauvegardé' });
      setTimeout(() => setRecueilSaved(false), 3000);
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur sauvegarde' });
    } finally { setSavingRecueil(false); }
  };

  const toggleMandat = async (m) => {
    try {
      await api.put(`/lettres-mission/${id}/mandats/${m.id}`, {
        signe: !m.signe,
        date_signature: !m.signe ? new Date().toISOString().slice(0, 10) : null,
      });
      setMandats(prev => prev.map(x => x.id === m.id ? { ...x, signe: !m.signe, date_signature: !m.signe ? new Date().toISOString().slice(0, 10) : null } : x));
    } catch { setMsg({ type: 'err', text: 'Erreur mandat' }); }
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!ldm) return null;

  const isSigned = ldm.statut === 'signee';
  const canEditRecueil = ['brouillon','a_valider'].includes(ldm.statut);
  const recueilOk = recueilForm.activite?.trim().length > 0 && recueilForm.enjeux?.trim().length > 0;
  const currentStepIdx = PIPELINE_STEPS.findIndex(s => s.statuts.includes(ldm.statut));

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lettres-mission')}>← LDM</button>
            <h1 style={{ margin: 0 }}>{ldm.numero}</h1>
            <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: STATUT_COLORS[ldm.statut] + '18', color: STATUT_COLORS[ldm.statut], border: `1px solid ${STATUT_COLORS[ldm.statut]}40` }}>
              {STATUTS[ldm.statut] || ldm.statut}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {ldm.client_nom || '—'} · {TYPES_MISSION[ldm.typeMission] || ldm.typeMission}
            {ldm.dateDebut && ` · À partir du ${new Date(ldm.dateDebut).toLocaleDateString('fr-FR')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pdfReady
            ? <button className="btn btn-ghost btn-sm" onClick={voirPdf} style={{ borderColor: '#1a3a5c', color: '#1a3a5c' }}>📑 Voir le PDF OEC</button>
            : <button className="btn btn-ghost btn-sm" disabled style={{ borderColor: '#1a3a5c', color: '#1a3a5c' }}>⏳ PDF…</button>
          }
          {pdfReady && canPrepare && (
            <button className="btn btn-ghost btn-sm" onClick={genererPdf} disabled={generatingPdf} style={{ fontSize: 12 }}>
              {generatingPdf ? '⏳' : '↺ PDF'}
            </button>
          )}
          {/* Expert : annuler (depuis brouillon, a_valider, validee_interne, envoyée) */}
          {isExpert && ['brouillon','a_valider','validee_interne','envoyee'].includes(ldm.statut) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setAnnulerModal(true)}
              style={{ borderColor: '#9ca3af', color: '#6b7280', fontSize: 11 }}>
              Annuler
            </button>
          )}
          {/* Badge date signature */}
          {(isSigned || ldm.statut === 'active') && ldm.dateSignatureClient && (
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, alignSelf: 'center' }}>
              ✓ Signée le {new Date(ldm.dateSignatureClient).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      <div className="page-body">
        {msg && (
          <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20 }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Bandeau "Prochaine étape" — guide le workflow LDM */}
        {ldm.statut === 'brouillon' && isExpert && (
          <NextStepCard
            subtitle="Brouillon"
            title="LDM prête à envoyer au client"
            description="La LDM a été générée depuis le devis. Vérifiez les informations, modifiez si nécessaire, puis envoyez-la au client pour signature."
            primary={{
              label: signing ? 'Envoi…' : '📤 Envoyer pour signature',
              onClick: () => envoyerLDM(),
              disabled: signing,
              color: '#2563eb',
            }}
            color="#2563eb"
          />
        )}
        {ldm.statut === 'brouillon' && !isExpert && canPrepare && (
          <NextStepCard
            subtitle="Étape 1 / 4"
            title="Brouillon — recueil du besoin à finaliser"
            description={recueilOk
              ? "Le recueil du besoin est complet. Soumets la LDM pour validation par l'expert-comptable."
              : "Renseigne au minimum l'activité et les enjeux dans le recueil du besoin avant de soumettre pour validation."}
            primary={{
              label: signing ? '…' : '📨 Soumettre pour validation',
              onClick: soumettreLDM,
              disabled: signing || !recueilOk,
              title: recueilOk ? '' : 'Recueil incomplet — remplir Activité + Enjeux',
              color: '#d97706',
            }}
            color="#6b7c93"
          />
        )}
        {ldm.statut === 'a_valider' && (
          <NextStepCard
            subtitle="Étape 2 / 4"
            title={isExpert ? "À valider en interne" : "En attente de validation expert"}
            description={isExpert
              ? "L'expert-comptable doit valider cette LDM avant qu'elle puisse être envoyée au client."
              : "L'expert-comptable doit valider cette LDM. En attendant, tu peux toujours la modifier en la renvoyant en brouillon."}
            primary={isExpert ? {
              label: signing ? '…' : '✅ Valider en interne',
              onClick: validerInterne,
              disabled: signing,
              color: '#2563eb',
            } : null}
            secondaries={canPrepare ? [
              { label: '↩ Renvoyer en brouillon', onClick: rollbackLDM, disabled: signing },
            ] : []}
            color="#d97706"
          />
        )}
        {ldm.statut === 'validee_interne' && (
          <NextStepCard
            subtitle="Étape 3 / 4"
            title="Validée — prête à envoyer au client"
            description="La LDM a été validée en interne. Cliquer « Envoyer pour signature » envoie automatiquement le document par email au client."
            primary={{
              label: signing ? 'Envoi…' : '📤 Envoyer pour signature',
              onClick: () => envoyerLDM(),
              disabled: signing,
              color: '#2563eb',
            }}
            secondaries={canPrepare ? [
              { label: '↩ Renvoyer en brouillon', onClick: rollbackLDM, disabled: signing },
            ] : []}
            color="#2563eb"
          />
        )}
        {ldm.statut === 'envoyee' && canPrepare && (
          <NextStepCard
            subtitle="Étape 4 / 4"
            title={ldm.yousign_request_id
              ? '✍️ Signature électronique en cours (Yousign)'
              : 'Envoyée — en attente de signature client'}
            description={ldm.yousign_request_id
              ? "La LDM a été envoyée via Yousign pour signature électronique. La mission s'activera automatiquement dès que le client aura signé. Vous recevrez une notification."
              : "La LDM a été envoyée par email au client. Quand tu reçois la confirmation de signature, marque-la comme signée pour activer la mission."}
            primary={ldm.yousign_request_id ? null : {
              label: signing ? 'Signature…' : '✍️ Marquer comme signée',
              onClick: openSignModal,
              disabled: signing,
              color: '#0f1f4b',
            }}
            secondaries={[
              ...(ldm.yousign_request_id ? [] : [{ label: signing ? '…' : '↻ Renvoyer par email', onClick: () => envoyerLDM(), disabled: signing }]),
            ]}
            color="#f59e0b"
          />
        )}
        {ldm.statut === 'active' && canPrepare && (
          <NextStepCard
            subtitle="Mission active"
            title="LDM active — mission en cours"
            description="La lettre de mission est signée et active. Génère l'échéancier de factures pour automatiser la facturation, ou affecte les tâches aux collaborateurs."
            primary={{
              label: generatingEcheancier ? '…' : '💳 Générer échéancier de factures',
              onClick: genererEcheancier,
              disabled: generatingEcheancier,
              color: '#059669',
            }}
            secondaries={[
              { label: '📋 Affecter les tâches', onClick: () => setInjecterModal(true), disabled: signing },
              ...(isExpert ? [{ label: 'Résilier', onClick: () => setResilierModal(true), color: '#dc2626' }] : []),
            ]}
            color="#059669"
          />
        )}

        {/* Pipeline statut visuel */}
        {STATUT_TERMINAL.includes(ldm.statut) && ldm.statut !== 'active' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '12px 18px', background: STATUT_COLORS[ldm.statut] + '12', borderRadius: 8, border: `1px solid ${STATUT_COLORS[ldm.statut]}40` }}>
            <span style={{ fontSize: 18 }}>{ldm.statut === 'resiliee' ? '🔴' : ldm.statut === 'echue' ? '⏰' : '⛔'}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: STATUT_COLORS[ldm.statut] }}>{STATUTS[ldm.statut]}</div>
              {ldm.date_resiliation && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Résiliation effective le {new Date(ldm.date_resiliation).toLocaleDateString('fr-FR')}</div>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
            {PIPELINE_STEPS.map((step, i, arr) => {
              const done = i <= currentStepIdx;
              const current = i === currentStepIdx;
              const stepColor = current ? STATUT_COLORS[ldm.statut] : (done ? 'var(--accent)' : undefined);
              return (
                <React.Fragment key={step.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? (stepColor || 'var(--accent)') : 'var(--border)', color: done ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {done && !current ? '✓' : i + 1}
                    </div>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: done ? 700 : 400, color: done ? (stepColor || 'var(--primary)') : 'var(--text-muted)' }}>{step.label}</span>
                      {current && (
                        <div style={{ fontSize: 10, color: stepColor || 'var(--text-muted)', marginTop: 0 }}>{STATUTS[ldm.statut]}</div>
                      )}
                    </div>
                  </div>
                  {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: i < currentStepIdx ? 'var(--accent)' : 'var(--border)', margin: '0 10px' }} />}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

          {/* Colonne principale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Recueil du besoin */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Recueil du besoin</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {recueilOk
                    ? <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ Complet</span>
                    : <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>⚠ Incomplet</span>
                  }
                  {canEditRecueil && (
                    <button className="btn btn-ghost btn-sm" onClick={saveRecueilBesoin} disabled={savingRecueil} style={{ fontSize: 12 }}>
                      {savingRecueil ? 'Sauvegarde…' : recueilSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
                    </button>
                  )}
                </div>
              </div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {/* Activité — obligatoire */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>
                      Activité principale
                      {recueilForm.activite?.trim() ? <span style={{ color: '#059669', marginLeft: 4 }}>✓</span> : <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
                    </label>
                    {canEditRecueil
                      ? <input className="form-control" style={{ fontSize: 13 }} value={recueilForm.activite} onChange={e => setRecueilForm(f => ({ ...f, activite: e.target.value }))} placeholder="Ex: Commerce de détail alimentaire…" />
                      : <div style={{ fontSize: 13, padding: '8px 0', color: recueilForm.activite ? 'var(--text)' : 'var(--text-muted)', fontStyle: recueilForm.activite ? 'normal' : 'italic' }}>{recueilForm.activite || '—'}</div>
                    }
                  </div>
                  {/* Effectif */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Effectif</label>
                    {canEditRecueil
                      ? <input className="form-control" style={{ fontSize: 13 }} value={recueilForm.effectif} onChange={e => setRecueilForm(f => ({ ...f, effectif: e.target.value }))} placeholder="Ex: 3 salariés" />
                      : <div style={{ fontSize: 13, padding: '8px 0', color: recueilForm.effectif ? 'var(--text)' : 'var(--text-muted)', fontStyle: recueilForm.effectif ? 'normal' : 'italic' }}>{recueilForm.effectif || '—'}</div>
                    }
                  </div>
                  {/* Enjeux — obligatoire */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>
                      Enjeux et attentes
                      {recueilForm.enjeux?.trim() ? <span style={{ color: '#059669', marginLeft: 4 }}>✓</span> : <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
                    </label>
                    {canEditRecueil
                      ? <textarea className="form-control" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={recueilForm.enjeux} onChange={e => setRecueilForm(f => ({ ...f, enjeux: e.target.value }))} placeholder="Ex: Optimisation fiscale, accompagnement création…" />
                      : <div style={{ fontSize: 13, padding: '8px 0', whiteSpace: 'pre-wrap', color: recueilForm.enjeux ? 'var(--text)' : 'var(--text-muted)', fontStyle: recueilForm.enjeux ? 'normal' : 'italic' }}>{recueilForm.enjeux || '—'}</div>
                    }
                  </div>
                  {/* Contraintes */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Contraintes particulières</label>
                    {canEditRecueil
                      ? <textarea className="form-control" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={recueilForm.contraintes} onChange={e => setRecueilForm(f => ({ ...f, contraintes: e.target.value }))} placeholder="Ex: Bilans en retard, contentieux en cours…" />
                      : <div style={{ fontSize: 13, padding: '8px 0', whiteSpace: 'pre-wrap', color: recueilForm.contraintes ? 'var(--text)' : 'var(--text-muted)', fontStyle: recueilForm.contraintes ? 'normal' : 'italic' }}>{recueilForm.contraintes || '—'}</div>
                    }
                  </div>
                </div>
                {!recueilOk && ldm.statut === 'brouillon' && (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#d97706', background: '#fef3c7', borderRadius: 6, padding: '8px 12px' }}>
                    ⚠ Les champs <strong>Activité</strong> et <strong>Enjeux</strong> sont obligatoires pour soumettre la LDM à validation.
                  </div>
                )}
              </div>
            </div>

            {/* Missions détaillées (ldm_missions) */}
            {missionsDetail.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Missions détaillées</span>
                  <span className="text-muted text-sm">{missionsDetail.length} mission{missionsDetail.length > 1 ? 's' : ''}</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr>
                      <th>Mission</th>
                      <th style={{ textAlign: 'center', width: 70, fontSize: 11 }}>Expert</th>
                      <th style={{ textAlign: 'center', width: 70, fontSize: 11 }}>Chef miss.</th>
                      <th style={{ textAlign: 'center', width: 70, fontSize: 11 }}>Collab.</th>
                      <th style={{ textAlign: 'center', width: 70, fontSize: 11 }}>Assistant</th>
                      <th style={{ textAlign: 'right', width: 110 }}>Montant HT</th>
                    </tr></thead>
                    <tbody>
                      {missionsDetail.map((m, i) => {
                        const h = m.nombre_heures_par_profil || {};
                        const fmtH = v => {
                          const n = parseFloat(v || 0);
                          if (n <= 0) return '—';
                          const mins = Math.round(n % 1 * 60);
                          return `${Math.floor(n)}h${mins > 0 ? String(mins).padStart(2,'0') : ''}`;
                        };
                        const totalH = Object.values(h).reduce((s, v) => s + parseFloat(v || 0), 0);
                        return (
                          <tr key={m.id || i}>
                            <td style={{ fontSize: 13 }}>
                              <div style={{ fontWeight: 500 }}>{m.libelle}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.type_mission?.replace(/_/g, ' ')}</div>
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{fmtH(h.expert)}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{fmtH(h.chef_mission)}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{fmtH(h.collaborateur)}</td>
                            <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{fmtH(h.assistant)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>
                              {parseFloat(m.honoraires_ht || 0) > 0 ? fmt(m.honoraires_ht) : (totalH > 0 ? `${Math.round(totalH * 10) / 10}h` : '—')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rubriques issues du devis */}
            {rubriques.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Prestations par rubrique</span>
                  <span className="text-muted text-sm" style={{ fontSize: 12 }}>Cliquer pour détailler</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr>
                      <th>Rubrique</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Nb</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Montant HT</th>
                    </tr></thead>
                    <tbody>
                      {rubriques.map((rub, i) => <RubriqueRowLDM key={i} rub={rub} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Mission */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Objet de la mission</span>
                {canEditRecueil && canPrepare && !editMission && (
                  <button className="btn btn-ghost btn-sm" onClick={openEditMission} style={{ fontSize: 12 }}>
                    ✏️ Modifier
                  </button>
                )}
              </div>
              <div className="card-body">
                {editMission ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 12 }}>Honoraires HT annuels (€)</label>
                        <input type="number" className="form-control" min="0" step="100"
                          value={missionForm.montantHonorairesHT}
                          onChange={e => setMissionForm(f => ({ ...f, montantHonorairesHT: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 12 }}>Date de début</label>
                        <input type="date" className="form-control"
                          value={missionForm.dateDebut}
                          onChange={e => setMissionForm(f => ({ ...f, dateDebut: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 12 }}>Périodicité de facturation</label>
                        <select className="form-control"
                          value={missionForm.periodicite_facturation}
                          onChange={e => setMissionForm(f => ({ ...f, periodicite_facturation: e.target.value }))}>
                          <option value="">— Non définie —</option>
                          <option value="mensuelle">Mensuelle (12×/an)</option>
                          <option value="trimestrielle">Trimestrielle (4×/an)</option>
                          <option value="semestrielle">Semestrielle (2×/an)</option>
                          <option value="annuelle">Annuelle (1×/an)</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: 12 }}>Date de la 1ère facture</label>
                        <input type="date" className="form-control"
                          value={missionForm.date_premiere_facture}
                          onChange={e => setMissionForm(f => ({ ...f, date_premiere_facture: e.target.value }))} />
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: 12 }}>Objet de la mission</label>
                      <textarea className="form-control" rows={3} style={{ resize: 'vertical', fontSize: 13 }}
                        value={missionForm.objetMission}
                        onChange={e => setMissionForm(f => ({ ...f, objetMission: e.target.value }))}
                        placeholder="Décrivez l'objet de la mission…" />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditMission(false)}>Annuler</button>
                      <button className="btn btn-primary btn-sm" onClick={saveMission} disabled={savingMission}>
                        {savingMission ? 'Sauvegarde…' : '✓ Enregistrer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const PERIO_COUNT = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
                      const PERIO_LABEL = { mensuelle: '/mois', trimestrielle: '/trimestre', semestrielle: '/semestre', annuelle: '/an' };
                      const nb = PERIO_COUNT[ldm.periodicite_facturation] || 12;
                      const label = PERIO_LABEL[ldm.periodicite_facturation] || '/mois';
                      const montantHT = Number(ldm.montantHonorairesHT) || 0;
                      const parPeriode = montantHT / nb;
                      return (
                        <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Type</div>
                            <div style={{ fontWeight: 600 }}>{TYPES_MISSION[ldm.typeMission] || ldm.typeMission}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Honoraires HT</div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary)' }}>{fmt(montantHT)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Périodicité</div>
                            <div style={{ fontWeight: 600 }}>{ldm.periodicite_facturation || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>non définie</span>}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Par période HT</div>
                            <div style={{ fontWeight: 600, color: 'var(--accent-hover)' }}>{fmt(parPeriode)}{label}</div>
                          </div>
                          {ldm.date_premiere_facture && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>1ère facture</div>
                              <div style={{ fontWeight: 600 }}>{new Date(ldm.date_premiere_facture).toLocaleDateString('fr-FR')}</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {ldm.objetMission && (
                      <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                        {ldm.objetMission}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Mandats */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Mandats</span>
                {mandats.length > 0 && (
                  <span style={{ fontSize: 12, color: mandats.filter(m => m.signe).length === mandats.length ? '#00897b' : 'var(--text-muted)' }}>
                    {mandats.filter(m => m.signe).length}/{mandats.length} signés
                  </span>
                )}
              </div>
              {mandats.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <p style={{ fontSize: 13 }}>Les mandats seront créés automatiquement à la signature de la LDM</p>
                </div>
              ) : (
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  {mandats.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 20 }}>{MANDAT_ICONS[m.type] || '📄'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.libelle || MANDAT_LABELS[m.type]}</div>
                        {m.date_signature && (
                          <div style={{ fontSize: 11, color: '#00897b' }}>
                            Signé le {new Date(m.date_signature).toLocaleDateString('fr-FR')}
                          </div>
                        )}
                      </div>
                      {canPrepare && (
                        <button
                          className={`btn btn-sm ${m.signe ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => toggleMandat(m)}
                          style={{ fontSize: 12, padding: '4px 12px', background: m.signe ? '' : '#00897b', borderColor: m.signe ? '' : '#00897b' }}
                        >
                          {m.signe ? '✓ Signé' : 'Marquer signé'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tâches injectées */}
            {taches.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Tâches injectées</span>
                  <span className="text-muted text-sm">{taches.length} tâche{taches.length > 1 ? 's' : ''}</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Tâche</th>
                        <th style={{ width: 90 }}>Statut</th>
                        <th style={{ width: 90, textAlign: 'right' }}>Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taches.slice(0, 20).map(t => (
                        <tr key={t.id}>
                          <td style={{ fontSize: 13 }}>
                            {t.titre || t.description}
                            {t.periodicite && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {t.periodicite}</span>}
                          </td>
                          <td>
                            <span className={`badge badge-${t.statut === 'termine' ? 'termine' : t.statut === 'en_cours' ? 'en_cours' : 'autre'}`} style={{ fontSize: 11 }}>
                              {t.statut}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                            {t.budget_minutes ? `${Math.floor(t.budget_minutes / 60)}h${t.budget_minutes % 60 > 0 ? String(t.budget_minutes % 60).padStart(2, '0') : ''}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Journal des événements (audit trail) */}
            {evenements.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Journal des événements</span>
                  <span className="text-muted text-sm">{evenements.length} événement{evenements.length > 1 ? 's' : ''}</span>
                </div>
                <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                  {evenements.map((ev, i) => {
                    const evColors = {
                      creation: '#6b7280', envoi_client: '#f59e0b', signature: '#059669',
                      activation: '#2563eb', resiliation: '#dc2626', echeance: '#9ca3af',
                      annulation: '#9ca3af', modification: '#6b7280',
                    };
                    const evIcons = {
                      creation: '📝', envoi_client: '📤', signature: '✍️',
                      activation: '✅', resiliation: '🔴', echeance: '⏰',
                      annulation: '⛔', modification: '✏️',
                    };
                    const color = evColors[ev.type] || '#6b7280';
                    return (
                      <div key={ev.id || i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < evenements.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: color + '18', border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {evIcons[ev.type] || '•'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color }}>{ev.type?.replace(/_/g, ' ')}</span>
                              {ev.acteur_nom && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>par {ev.acteur_nom}</span>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {new Date(ev.created_at || ev.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {ev.commentaire && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ev.commentaire}</div>}
                          {ev.statut_avant && ev.statut_apres && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              <span style={{ color: STATUT_COLORS[ev.statut_avant] }}>{STATUTS[ev.statut_avant] || ev.statut_avant}</span>
                              <span style={{ margin: '0 4px' }}>→</span>
                              <span style={{ color: STATUT_COLORS[ev.statut_apres], fontWeight: 600 }}>{STATUTS[ev.statut_apres] || ev.statut_apres}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Infos */}
            <div className="card">
              <div className="card-header"><span className="card-title">Informations</span></div>
              <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                {[
                  { label: 'Référence', value: <code style={{ fontSize: 12 }}>{ldm.numero}</code> },
                  { label: 'Client', value: ldm.client_id ? <Link to={`/clients/${ldm.client_id}`} style={{ color: 'var(--accent)' }}>{ldm.client_nom}</Link> : (ldm.client_nom || '—') },
                  { label: 'Collaborateur', value: ldm.collab_prenom ? <span style={{ fontWeight: 600, color: 'var(--accent)' }}>👤 {ldm.collab_prenom} {ldm.collab_nom}</span> : <span className="text-muted">Non affecté</span> },
                  { label: 'Chef de mission', value: ldm.chef_prenom ? <span style={{ fontWeight: 600, color: '#7c3aed' }}>👥 {ldm.chef_prenom} {ldm.chef_nom}</span> : <span className="text-muted">Non affecté</span> },
                  { label: 'Statut', value: <span style={{ color: STATUT_COLORS[ldm.statut] }}>{STATUTS[ldm.statut]}</span> },
                  { label: 'Créée le', value: new Date(ldm.createdAt).toLocaleDateString('fr-FR') },
                  { label: 'Date de début', value: ldm.dateDebut ? new Date(ldm.dateDebut).toLocaleDateString('fr-FR') : '—' },
                  ldm.devis_id && { label: 'Devis lié', value: <Link to={`/devis/${ldm.devis_id}`} style={{ color: 'var(--accent)' }}>Voir le devis →</Link> },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span className="text-muted">{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Snapshot client figé */}
            {ldm.snapshot_client && (() => {
              try {
                const snap = typeof ldm.snapshot_client === 'string' ? JSON.parse(ldm.snapshot_client) : ldm.snapshot_client;
                return snap ? (
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Données client (figées)</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#f0f4f8', padding: '2px 7px', borderRadius: 10 }}>Snapshot</span>
                    </div>
                    <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                      {[
                        { label: 'Raison sociale', value: snap.nom },
                        snap.siren && { label: 'SIREN', value: snap.siren },
                        snap.formeJuridique && { label: 'Forme juridique', value: snap.formeJuridique },
                        (snap.adresse || snap.ville) && { label: 'Adresse', value: [snap.adresse, snap.codePostal, snap.ville].filter(Boolean).join(' ') },
                        snap.email && { label: 'Email', value: snap.email },
                        snap.telephone && { label: 'Téléphone', value: snap.telephone },
                      ].filter(Boolean).map(({ label, value }) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: 8 }}>{label}</span>
                          <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                        Ces données ont été figées à la création de la LDM.
                      </div>
                    </div>
                  </div>
                ) : null;
              } catch { return null; }
            })()}

            {/* Notes internes */}
            {ldm.notesInternes && (
              <div className="card">
                <div className="card-header"><span className="card-title">Notes internes</span></div>
                <div className="card-body">
                  <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', margin: 0 }}>{ldm.notesInternes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF OEC inline preview */}
      {pdfReady && (
        <div className="page-body" style={{ paddingTop: 0 }}>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="card-title">📑 Lettre de Mission OEC — {ldm.numero}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={voirPdf}>Ouvrir dans un onglet ↗</button>
                <a href={`/api/lettres-mission/${id}/pdf?token=${localStorage.getItem('parfi_token')}`}
                   download={`${ldm.numero}.pdf`} className="btn btn-ghost btn-sm">
                  ⬇ Télécharger
                </a>
              </div>
            </div>
            <div style={{ padding: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              <iframe
                src={`/api/lettres-mission/${id}/pdf?token=${localStorage.getItem('parfi_token')}`}
                style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
                title={`LDM ${ldm.numero}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal signature + affectation collaborateur */}
      {injecterModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setInjecterModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">📋 Injecter les tâches</span>
              <button className="modal-close" onClick={() => setInjecterModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>
                Les tâches de la mission seront créées depuis les lignes de dimensionnement et affectées au collaborateur choisi.
                Si aucun collaborateur n'est sélectionné, les tâches sont réparties selon le type d'intervenant.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Collaborateur</label>
                  <select className="form-control" value={selectedCollab} onChange={e => setSelectedCollab(e.target.value)}>
                    <option value="">— Répartition par intervenant —</option>
                    {users.filter(u => u.actif !== 0).sort((a, b) => a.prenom.localeCompare(b.prenom)).map(u => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Chef de mission / groupe</label>
                  <select className="form-control" value={selectedChef} onChange={e => setSelectedChef(e.target.value)}>
                    <option value="">— Inchangé —</option>
                    {users.filter(u => u.actif !== 0 && (
                      ['expert','chef_mission'].includes(u.role) ||
                      ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(u.role_metier)
                    )).sort((a, b) => a.prenom.localeCompare(b.prenom)).map(u => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setInjecterModal(false)}>Annuler</button>
                <button
                  className="btn btn-primary"
                  onClick={() => { setInjecterModal(false); injecterTaches(); }}
                  style={{ background: '#0f1f4b' }}
                >
                  📋 Planifier les tâches
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {signModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSignModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">✍️ Signer la lettre de mission</span>
              <button className="modal-close" onClick={() => setSignModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* Résumé des effets */}
              <div style={{ background: '#f0f9f4', border: '1px solid #a7f3d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#065f46', marginBottom: 6 }}>À la signature, les actions suivantes seront déclenchées :</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#064e3b', lineHeight: 1.9 }}>
                  <li>Le dossier <strong>{ldm.client_nom}</strong> sera affecté au collaborateur sélectionné</li>
                  <li>Les tâches de la mission seront planifiées dans son planning{ldm.dateDebut ? ` à partir du ${new Date(ldm.dateDebut).toLocaleDateString('fr-FR')}` : ''}</li>
                  <li>Les tâches périodiques (mensuelles, trimestrielles…) génèrent une occurrence par échéance sur 12 mois</li>
                  <li>Les mandats seront créés et l'échéancier de facturation initialisé</li>
                </ul>
              </div>

              {/* Récapitulatif plan de facturation */}
              {(() => {
                const PERIO_COUNT = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
                const PERIO_LABEL = { mensuelle: '/mois', trimestrielle: '/trimestre', semestrielle: '/semestre', annuelle: '/an' };
                const nb = PERIO_COUNT[ldm.periodicite_facturation];
                const label = PERIO_LABEL[ldm.periodicite_facturation];
                const montantHT = Number(ldm.montantHonorairesHT) || 0;
                if (!ldm.periodicite_facturation || !ldm.date_premiere_facture) {
                  return (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                      ⚠️ <strong>Plan de facturation incomplet</strong> — pensez à renseigner la périodicité et la date de 1ère facture sur la LDM avant de signer.
                    </div>
                  );
                }
                return (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>Plan de facturation</div>
                    <div style={{ color: '#1e3a8a', lineHeight: 1.8 }}>
                      <span style={{ marginRight: 20 }}>📅 <strong>{nb} facture{nb > 1 ? 's' : ''}</strong> {ldm.periodicite_facturation}</span>
                      <span style={{ marginRight: 20 }}>💶 <strong>{fmt(montantHT / nb)} €</strong> HT{label}</span>
                      <span>🗓 1ère facture le <strong>{new Date(ldm.date_premiere_facture).toLocaleDateString('fr-FR')}</strong></span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Collaborateur */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">
                    Collaborateur <span style={{ color: '#dc2626' }}>*</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>fait le travail</span>
                  </label>
                  <select
                    className="form-control"
                    value={selectedCollab}
                    onChange={e => setSelectedCollab(e.target.value)}
                    autoFocus
                  >
                    <option value="">— Choisir —</option>
                    {users
                      .filter(u => u.actif !== 0)
                      .sort((a, b) => a.prenom.localeCompare(b.prenom))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.prenom} {u.nom}{u.role_metier ? ` (${u.role_metier.replace(/_/g, ' ')})` : ''}
                        </option>
                      ))
                    }
                  </select>
                </div>

                {/* Chef de mission / Chef de groupe */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">
                    Chef de mission / groupe <span style={{ color: '#dc2626' }}>*</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>supervise</span>
                  </label>
                  <select
                    className="form-control"
                    value={selectedChef}
                    onChange={e => setSelectedChef(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {users
                      .filter(u => u.actif !== 0 && (
                        ['expert', 'chef_mission'].includes(u.role) ||
                        ['expert_comptable', 'chef_de_groupe', 'chef_de_mission'].includes(u.role_metier)
                      ))
                      .sort((a, b) => a.prenom.localeCompare(b.prenom))
                      .map(u => (
                        <option key={u.id} value={u.id}>
                          {u.prenom} {u.nom}{u.role_metier ? ` (${u.role_metier.replace(/_/g, ' ')})` : ''}
                        </option>
                      ))
                    }
                  </select>
                </div>
              </div>

              {(!selectedCollab || !selectedChef) && (
                <div style={{ fontSize: 12, color: '#d97706', marginTop: 10 }}>
                  ⚠ Le collaborateur et le chef de mission sont tous les deux obligatoires.
                </div>
              )}

              <div className="form-actions" style={{ marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setSignModal(false)}>Annuler</button>
                <button
                  className="btn btn-primary"
                  onClick={signLDM}
                  disabled={!selectedCollab || !selectedChef || signing}
                  style={{ background: '#0f1f4b' }}
                >
                  {signing ? 'Signature en cours…' : '✍️ Confirmer la signature'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal résiliation */}
      {resilierModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setResilierModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">🔴 Résilier la lettre de mission</span>
              <button className="modal-close" onClick={() => setResilierModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#dc2626', marginBottom: 20, fontWeight: 500 }}>
                Cette action est irréversible. La LDM sera résiliée et les honoraires ne seront plus facturés.
              </p>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Motif de résiliation <span style={{ color: '#dc2626' }}>*</span></label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Décrire le motif de résiliation (minimum 10 caractères)..."
                  value={resilierForm.motif}
                  onChange={e => setResilierForm(f => ({ ...f, motif: e.target.value }))}
                  style={{ resize: 'vertical' }}
                />
                {resilierForm.motif.length > 0 && resilierForm.motif.length < 10 && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{10 - resilierForm.motif.length} caractères minimum restants</div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Date de résiliation effective <span style={{ color: '#dc2626' }}>*</span></label>
                <input
                  type="date"
                  className="form-control"
                  value={resilierForm.dateResiliation}
                  onChange={e => setResilierForm(f => ({ ...f, dateResiliation: e.target.value }))}
                />
              </div>
              <div className="form-actions" style={{ marginTop: 24 }}>
                <button className="btn btn-ghost" onClick={() => setResilierModal(false)}>Annuler</button>
                <button
                  className="btn btn-primary"
                  onClick={resilierLDM}
                  disabled={signing || resilierForm.motif.length < 10 || !resilierForm.dateResiliation}
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                >
                  {signing ? 'Résiliation…' : '🔴 Confirmer la résiliation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal annulation */}
      {annulerModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAnnulerModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">⛔ Annuler la lettre de mission</span>
              <button className="modal-close" onClick={() => setAnnulerModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text)', marginBottom: 12 }}>
                Annuler cette LDM va :
              </p>
              <ul style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 20, marginBottom: 20, lineHeight: 1.8 }}>
                <li>Passer la LDM en statut <strong>Annulée</strong></li>
                {ldm.devis_id && <li>Déverrouiller le devis associé (il pourra être modifié)</li>}
              </ul>
              <p style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>Cette action est irréversible.</p>
              <div className="form-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-ghost" onClick={() => setAnnulerModal(false)}>Retour</button>
                <button
                  className="btn btn-primary"
                  onClick={annulerLDM}
                  disabled={signing}
                  style={{ background: '#6b7280', borderColor: '#6b7280' }}
                >
                  {signing ? 'Annulation…' : '⛔ Confirmer l\'annulation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal email manquant */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1a3a5c' }}>Email du destinataire</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Aucun email renseigné pour <strong>{emailModal.nomContact || 'ce contact'}</strong>.<br />
              Saisissez l'adresse pour envoyer la lettre de mission.
            </p>
            <input
              type="email"
              className="form-control"
              placeholder="contact@exemple.fr"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && emailInput) { const r = emailModal.resolve; setEmailModal(null); r(emailInput); } }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { const r = emailModal.resolve; setEmailModal(null); r(null); }}>Annuler</button>
              <button className="btn btn-primary" disabled={!emailInput} onClick={() => { const r = emailModal.resolve; setEmailModal(null); r(emailInput); }}>
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
