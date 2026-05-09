import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import ChiffrageConfig, { DEFAULT_PARAMS, TYPES_ENTITE, REGIMES_FISCAUX, REGIMES_TVA } from './ChiffrageConfig';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

const CHAPITRES = [
  { key: 'comptable_fiscal', label: 'Comptable & Fiscal', color: '#1e40af', bg: '#eff6ff' },
  { key: 'social',           label: 'Social',             color: '#7e22ce', bg: '#fdf4ff' },
  { key: 'juridique',        label: 'Juridique',          color: '#9a3412', bg: '#fff7ed' },
];
const CHAPITRE_OPTS = CHAPITRES.map(c => ({ value: c.key, label: c.label }));
const PERIODICITES = ['Mensuel', 'Trimestriel', 'Annuel', 'Ponctuel', 'Clôture'];

function sectionToChapitre(section) {
  const s = (section || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (s === 'comptabilite' || s === 'fiscalite') return 'comptable_fiscal';
  if (s === 'social') return 'social';
  if (s === 'juridique') return 'juridique';
  return null;
}

function ClientSearch({ clients, prospects, value, onSelect }) {
  const [text, setText] = useState(value?.nom || '');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setText(value?.nom || ''); }, [value?.nom]);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = text.toLowerCase().trim();
  const filteredClients   = q.length >= 1 ? clients.filter(c => c.nom.toLowerCase().includes(q)).slice(0, 6) : [];
  const filteredProspects = q.length >= 1 ? prospects.filter(p => p.nom.toLowerCase().includes(q) && p.statut !== 'converti').slice(0, 6) : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input className="form-control" placeholder="Rechercher un client ou prospect…"
          value={text}
          onChange={e => { setText(e.target.value); setOpen(true); onSelect(null, null); }}
          onFocus={() => { if (text.length >= 1) setOpen(true); }}
          autoComplete="off" />
        {value && (
          <button type="button" onClick={() => { setText(''); onSelect(null, null); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>×</button>
        )}
      </div>
      {value && !open && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            background: value.type === 'client' ? '#0f1f4b18' : '#8b5cf620',
            color: value.type === 'client' ? '#0f1f4b' : '#8b5cf6',
            border: `1px solid ${value.type === 'client' ? '#0f1f4b40' : '#8b5cf640'}` }}>
            {value.type === 'client' ? 'Client' : 'Prospect'}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500 }}>{value.nom}</span>
        </div>
      )}
      {open && text.length >= 1 && (filteredClients.length > 0 || filteredProspects.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 500, background: '#fff',
          border: '1px solid #dce6f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,31,75,0.16)',
          maxHeight: 280, overflowY: 'auto', marginTop: 2 }}>
          {filteredClients.map(c => (
            <div key={`c-${c.id}`}
              onClick={() => { setText(c.nom); setOpen(false); onSelect(c, 'client'); }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f4f8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ fontWeight: 600 }}>{c.nom}</span>
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>Client</span>
            </div>
          ))}
          {filteredProspects.map(p => (
            <div key={`p-${p.id}`}
              onClick={() => { setText(p.nom); setOpen(false); onSelect(p, 'prospect'); }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f4f8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f5f0ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ fontWeight: 600, color: '#8b5cf6' }}>{p.nom}</span>
              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>Prospect</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, badge, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>{label}</span>
        {badge && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e0e7ff', color: '#3730a3', fontWeight: 700 }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export default function HonorairesModal({ type = 'devis', initialEntity = null, initialOpportuniteId = null, initialData = null, onSaved, onClose }) {
  const [clients, setClients]     = useState([]);
  const [prospects, setProspects] = useState([]);
  const [entity, setEntity]       = useState(initialEntity);
  const [titre, setTitre]         = useState(initialData?.titre || '');
  const [dateValidite, setDateValidite] = useState(
    initialData?.dateValidite ? initialData.dateValidite.substring(0, 10) : ''
  );
  const [notesInternes, setNotesInternes] = useState(initialData?.notesInternes || '');
  const [notesClient, setNotesClient]     = useState(initialData?.notesClient || '');

  // Lignes libres (mode rapide)
  const [lignesRapides, setLignesRapides] = useState([]);
  const [newLigne, setNewLigne] = useState({ libelle: '', chapitre: 'comptable_fiscal', montant_ht: '', periodicite: 'Annuel' });

  // Mode chiffré
  const [params, setParams]           = useState(DEFAULT_PARAMS);
  const [forfaitLines, setForfaitLines]   = useState([]);
  const [calcResult, setCalcResult]       = useState(null);
  const [calcLoading, setCalcLoading]     = useState(false);
  const [calcError, setCalcError]         = useState('');
  const [activesChiffre, setActivesChiffre] = useState({});
  const debounceRef = useRef(null);

  // Chapitres remise: { comptable_fiscal: string, social: string, juridique: string }
  const [montantsAcceptes, setMontantsAcceptes] = useState({});

  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [savedId, setSavedId] = useState(initialData?.id || null);

  useEffect(() => {
    Promise.all([
      api.get('/clients').then(r => setClients(r.data || [])),
      api.get('/prospects').then(r => setProspects(r.data || [])).catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    if (!initialData) return;

    // Restaure les paramètres de chiffrage saisis lors de la création
    setParams(prev => ({
      ...prev,
      type_entite:     initialData.type_entite     || prev.type_entite,
      regime_fiscal:   initialData.regime_fiscal   || prev.regime_fiscal,
      regime_tva:      initialData.regime_tva      || prev.regime_tva,
      factures_achat:  initialData.factures_achat  ?? prev.factures_achat,
      factures_vente:  initialData.factures_vente  ?? prev.factures_vente,
      lignes_banque:   initialData.lignes_banque   ?? prev.lignes_banque,
      immobilisations: initialData.immobilisations ?? prev.immobilisations,
      effectif:        initialData.effectif        ?? prev.effectif,
    }));

    const lignes = initialData.lignes || [];
    const rapides = lignes.filter(l => l.mode_saisie === 'rapide').map(l => ({
      libelle: l.description || l.libelle || '',
      chapitre: l.chapitre || 'comptable_fiscal',
      montant_ht: String(l.tarif_ht || l.totalHT || ''),
      periodicite: l.periodicite || 'Annuel',
    }));
    setLignesRapides(rapides);

    const chiffres = lignes.filter(l => l.mode_saisie === 'chiffre');
    if (chiffres.length > 0) {
      setCalcResult({
        lignes: chiffres.map(l => ({
          libelle:       l.description || l.libelle || '',
          rubrique:      l.rubrique || '',
          section:       l.section || '',
          intervenant:   l.intervenant || null,
          periodicite:   l.periodicite || 'Annuel',
          temps_minutes: l.temps_minutes || 0,
          tarif_ht:      parseFloat(l.tarif_ht || l.totalHT || 0),
          mode_suivi:    l.mode_suivi || 'temps',
        })),
      });
      setActivesChiffre(Object.fromEntries(chiffres.map((_, i) => [i, true])));
    } else {
      setCalcResult(null);
      setActivesChiffre({});
    }

    if (initialData.chapitres) {
      const acc = {};
      initialData.chapitres.forEach(c => { acc[c.chapitre] = String(c.montant_accepte_ht); });
      setMontantsAcceptes(acc);
    }

    if (initialData.notesClient !== undefined) setNotesClient(initialData.notesClient || '');
    if (initialData.notesInternes !== undefined) setNotesInternes(initialData.notesInternes || '');
    setSavedId(initialData.id || null);
  }, [initialData?.id]);

  const doCalcul = useCallback(async (p, fl) => {
    setCalcLoading(true); setCalcError('');
    try {
      const { data } = await api.post('/chiffrage/calculer', { params: p, rubriques_forfait: fl });
      setCalcResult(data);
      setActivesChiffre(prev => {
        const next = { ...prev };
        data.lignes.forEach((l, i) => { if (next[i] === undefined) next[i] = true; });
        return next;
      });
    } catch (e) {
      setCalcError(e.response?.data?.message || 'Erreur de calcul');
    } finally { setCalcLoading(false); }
  }, []);

  const scheduleCalcul = useCallback((p, fl) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doCalcul(p, fl), 400);
  }, [doCalcul]);

  const handleParamsChange = (p) => { setParams(p); scheduleCalcul(p, forfaitLines); };
  const handleForfaitChange = (fl) => { setForfaitLines(fl); scheduleCalcul(params, fl); };

  const triggerCalcul = () => doCalcul(params, forfaitLines);

  const lignesChiffreActives = calcResult
    ? calcResult.lignes.filter((_, i) => activesChiffre[i] !== false)
    : [];

  const allEffectiveLines = [
    ...lignesChiffreActives.map(l => ({
      ...l, mode_saisie: 'chiffre', chapitre: sectionToChapitre(l.section),
    })),
    ...lignesRapides.filter(l => l.libelle && parseFloat(l.montant_ht) > 0).map(l => ({
      libelle: l.libelle, tarif_ht: parseFloat(l.montant_ht),
      chapitre: l.chapitre, periodicite: l.periodicite, mode_saisie: 'rapide',
    })),
  ];

  const chapTotauxTh = {};
  for (const l of allEffectiveLines) {
    if (l.chapitre) chapTotauxTh[l.chapitre] = (chapTotauxTh[l.chapitre] || 0) + l.tarif_ht;
  }
  const sansChapitre = allEffectiveLines.filter(l => !l.chapitre).reduce((s, l) => s + l.tarif_ht, 0);

  const totalTheorique = allEffectiveLines.reduce((s, l) => s + l.tarif_ht, 0);
  const totalAccepte = Object.entries(chapTotauxTh).reduce((s, [ch, th]) => {
    const v = montantsAcceptes[ch];
    return s + (v !== '' && v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : th);
  }, 0) + sansChapitre;
  const remiseGlobale = Math.max(0, totalTheorique - totalAccepte);
  const tva      = Math.round(totalAccepte * 0.2);
  const totalTTC = totalAccepte + tva;
  const mensualite = Math.round(totalAccepte / 12);

  const addLigneRapide = () => {
    if (!newLigne.libelle || !newLigne.montant_ht) return;
    setLignesRapides(l => [...l, { ...newLigne }]);
    setNewLigne({ libelle: '', chapitre: 'comptable_fiscal', montant_ht: '', periodicite: 'Annuel' });
  };

  const buildPayload = () => {
    const chapitres_remise = {};
    for (const [ch, th] of Object.entries(chapTotauxTh)) {
      if (th > 0) {
        const v = montantsAcceptes[ch];
        chapitres_remise[ch] = {
          montant_accepte: v !== '' && v != null && !isNaN(parseFloat(v)) ? parseFloat(v) : th,
        };
      }
    }
    // Flatten everything into one lignes_rapides array so the backend persists exactly
    // what the user sees (deselected chiffrage lines must not come back via the engine).
    const lignes_rapides = [
      ...lignesRapides
        .filter(l => l.libelle && parseFloat(l.montant_ht) > 0)
        .map(l => ({
          libelle: l.libelle, chapitre: l.chapitre,
          montant_ht: parseFloat(l.montant_ht), periodicite: l.periodicite,
          mode_saisie: 'rapide', mode_suivi: 'forfait',
        })),
      ...lignesChiffreActives.map(l => ({
        libelle: l.libelle, rubrique: l.rubrique, section: l.section,
        intervenant: l.intervenant, periodicite: l.periodicite,
        temps_minutes: l.temps_minutes, montant_ht: l.tarif_ht,
        chapitre: sectionToChapitre(l.section),
        mode_saisie: 'chiffre', mode_suivi: l.mode_suivi || 'temps',
      })),
    ];
    return {
      titre,
      ...(entity.type === 'client' ? { client_id: entity.id } : { prospect_id: entity.id }),
      ...(initialOpportuniteId ? { opportunite_id: initialOpportuniteId } : {}),
      dateValidite: dateValidite || undefined,
      notesInternes: notesInternes || undefined,
      notesClient: notesClient || undefined,
      lignes_rapides,
      rubriques_forfait: [],
      run_engine: false,
      chapitres_remise: Object.keys(chapitres_remise).length ? chapitres_remise : null,
      ...params,
    };
  };

  const persist = async (payload) => {
    let id;
    if (type === 'devis') {
      if (savedId) {
        await api.put(`/devis/${savedId}`, payload);
        id = savedId;
      } else {
        const { data } = await api.post('/devis', payload);
        id = data.id;
      }
    } else {
      const ldmPayload = { ...payload, objetMission: titre, montantHonorairesHT: totalAccepte };
      if (savedId) {
        await api.put(`/lettres-mission/${savedId}`, ldmPayload);
        id = savedId;
      } else {
        const { data } = await api.post('/lettres-mission', ldmPayload);
        id = data.id;
      }
    }
    setSavedId(id);
    return id;
  };

  const handleSave = async (statut = 'brouillon') => {
    if (!entity) { setErr('Sélectionner un client ou prospect'); return; }
    if (!titre.trim()) { setErr('Titre requis'); return; }
    setSaving(statut); setErr('');
    try {
      const id = await persist(buildPayload());
      onSaved(id);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const handleVisualiser = async () => {
    if (!entity) { setErr('Sélectionner un client ou prospect'); return; }
    if (!titre.trim()) { setErr('Titre requis'); return; }
    setSaving('visualiser'); setErr('');
    try {
      const id = await persist(buildPayload());
      const token = localStorage.getItem('parfi_token');
      const url = type === 'devis'
        ? `/api/devis/${id}/html?token=${token}`
        : `/api/lettres-mission/${id}/html?token=${token}`;
      window.open(url, '_blank');
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la visualisation');
    } finally { setSaving(false); }
  };

  const chapitreInfo = (key) => CHAPITRES.find(c => c.key === key) || { label: key, color: '#374151', bg: '#f3f4f6' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,75,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 960, boxShadow: '0 24px 64px rgba(15,31,75,0.22)', marginBottom: 24 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {initialData ? 'Modifier' : 'Nouveau'} {type === 'devis' ? 'devis' : 'lettre de mission'}
          </h2>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }} onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {err && <div className="alert alert-error" style={{ marginBottom: 12, fontSize: 13 }}>{err}</div>}

          {/* Identity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Client / Prospect *</label>
              <ClientSearch clients={clients} prospects={prospects} value={entity}
                onSelect={(item, t) => setEntity(item ? { ...item, type: t } : null)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Titre *</label>
              <input className="form-control" value={titre}
                onChange={e => setTitre(e.target.value)} placeholder="Ex. Mission comptable 2025" />
            </div>
          </div>

          {/* Régimes — s'appliquent aux deux modes (lignes libres + chiffrage) */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>
                Caractéristiques de l'entité
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Appliqué aux lignes libres et au chiffrage
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Type d'entité</label>
                <select className="form-control" value={params.type_entite}
                  onChange={e => handleParamsChange({ ...params, type_entite: e.target.value })}>
                  {TYPES_ENTITE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Régime fiscal</label>
                <select className="form-control" value={params.regime_fiscal}
                  onChange={e => handleParamsChange({ ...params, regime_fiscal: e.target.value })}>
                  {REGIMES_FISCAUX.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Régime TVA</label>
                <select className="form-control" value={params.regime_tva}
                  onChange={e => handleParamsChange({ ...params, regime_tva: e.target.value })}>
                  {REGIMES_TVA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Two blocks side by side on large screens, stacked on small */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

            {/* Block A — Lignes libres */}
            <SectionHeader label="Lignes libres" badge={lignesRapides.length > 0 ? `${lignesRapides.length} ligne${lignesRapides.length > 1 ? 's' : ''}` : null}>
              {lignesRapides.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10 }}>
                      <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Libellé</th>
                      <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 600 }}>Chapitre</th>
                      <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600 }}>HT</th>
                      <th style={{ width: 28 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesRapides.map((l, i) => {
                      const ci = chapitreInfo(l.chapitre);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px' }}>{l.libelle}</td>
                          <td style={{ padding: '6px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: ci.bg, color: ci.color }}>{ci.label}</span>
                          </td>
                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{fmt(parseFloat(l.montant_ht))}</td>
                          <td style={{ padding: '3px' }}>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '1px 5px' }}
                              onClick={() => setLignesRapides(ll => ll.filter((_, idx) => idx !== i))}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Libellé</label>
                    <input className="form-control" placeholder="Ex. Déclaration IR 2025"
                      value={newLigne.libelle} onChange={e => setNewLigne(n => ({ ...n, libelle: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Chapitre</label>
                    <select className="form-control" value={newLigne.chapitre}
                      onChange={e => setNewLigne(n => ({ ...n, chapitre: e.target.value }))}>
                      {CHAPITRE_OPTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Périodicité</label>
                    <select className="form-control" value={newLigne.periodicite}
                      onChange={e => setNewLigne(n => ({ ...n, periodicite: e.target.value }))}>
                      {PERIODICITES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Montant HT (€)</label>
                    <input type="number" className="form-control" placeholder="0" min="0" step="50"
                      value={newLigne.montant_ht} onChange={e => setNewLigne(n => ({ ...n, montant_ht: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <button className="btn btn-ghost" style={{ width: '100%' }} onClick={addLigneRapide}
                      disabled={!newLigne.libelle || !newLigne.montant_ht}>+ Ajouter la ligne</button>
                  </div>
                </div>
              </div>
            </SectionHeader>

            {/* Block B — Chiffrage */}
            <SectionHeader label="Chiffrage" badge={lignesChiffreActives.length > 0 ? `${lignesChiffreActives.length} ligne${lignesChiffreActives.length > 1 ? 's' : ''}` : null}>
              <ChiffrageConfig params={params} setParams={handleParamsChange}
                forfaitLines={forfaitLines} setForfaitLines={handleForfaitChange} />

              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }}
                onClick={triggerCalcul} disabled={calcLoading}>
                {calcLoading ? 'Calcul en cours…' : calcResult ? '↺ Recalculer' : '▶ Calculer les honoraires'}
              </button>

              {calcError && <div className="alert alert-error" style={{ marginTop: 8, fontSize: 12 }}>{calcError}</div>}

              {calcResult && !calcLoading && (
                <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 6, maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {calcResult.lignes.map((l, i) => {
                        const active = activesChiffre[i] !== false;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: active ? 1 : 0.4 }}>
                            <td style={{ padding: '5px 8px', width: 26 }}>
                              <input type="checkbox" checked={active}
                                onChange={e => setActivesChiffre(a => ({ ...a, [i]: e.target.checked }))} />
                            </td>
                            <td style={{ padding: '5px 4px' }}>
                              <span style={{ fontWeight: 500 }}>{l.libelle}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{l.section} · {l.periodicite}</span>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(l.tarif_ht)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionHeader>
          </div>

          {/* Chapitres recap + remise */}
          {totalTheorique > 0 && (
            <div style={{ marginTop: 16, borderTop: '2px solid var(--border)', paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
                Récapitulatif par chapitre
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
                {CHAPITRES.filter(ch => chapTotauxTh[ch.key] > 0).map(ch => {
                  const th = chapTotauxTh[ch.key] || 0;
                  const rawAcc = montantsAcceptes[ch.key];
                  const acc = rawAcc !== '' && rawAcc != null && !isNaN(parseFloat(rawAcc)) ? parseFloat(rawAcc) : th;
                  const remise = th - acc;
                  const remisePct = th > 0 ? Math.round((remise / th) * 100) : 0;
                  return (
                    <div key={ch.key} style={{ border: `1px solid ${ch.bg}`, borderRadius: 8, padding: 10, background: ch.bg + '40' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: ch.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        {ch.label}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, color: 'var(--text-secondary)' }}>
                        <span>Théorique</span>
                        <span style={{ fontWeight: 600 }}>{fmt(th)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Accepté</label>
                        <input type="number" min="0" max={th} step="10"
                          value={montantsAcceptes[ch.key] ?? ''}
                          placeholder={String(Math.round(th))}
                          onChange={e => setMontantsAcceptes(m => ({ ...m, [ch.key]: e.target.value }))}
                          style={{ flex: 1, padding: '3px 7px', border: `1px solid ${remise > 0 ? '#f97316' : '#d1d5db'}`, borderRadius: 6, fontSize: 13, fontWeight: 700, textAlign: 'right', outline: 'none', background: '#fff' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>€</span>
                      </div>
                      {remise > 0 && (
                        <div style={{ fontSize: 11, color: '#f97316', fontWeight: 600, textAlign: 'right' }}>
                          -{fmt(remise)} ({remisePct}%)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total théorique HT</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(totalTheorique)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Remise globale</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: remiseGlobale > 0 ? '#f97316' : 'var(--text-muted)' }}>
                    {remiseGlobale > 0 ? `-${fmt(remiseGlobale)}` : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total accepté HT</div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--primary)' }}>{fmt(totalAccepte)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TVA: {fmt(tva)} · TTC: {fmt(totalTTC)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{fmt(mensualite)}/mois HT</div>
                </div>
              </div>
            </div>
          )}

          {/* Optional fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            {type === 'devis' && (
              <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Date de validité</label>
                <input type="date" className="form-control" value={dateValidite} onChange={e => setDateValidite(e.target.value)} />
              </div>
            )}
            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label className="form-label">Commentaire spécifique au devis (visible client, page 2 du PDF)</label>
              <textarea className="form-control" rows={3} value={notesClient} onChange={e => setNotesClient(e.target.value)}
                placeholder="Texte qui remplace la « Compréhension du besoin » par défaut. Plusieurs paragraphes : sépare-les par une ligne vide." />
            </div>
            <div className="form-group" style={{ margin: 0, gridColumn: '1 / -1' }}>
              <label className="form-label">Notes internes</label>
              <textarea className="form-control" rows={2} value={notesInternes} onChange={e => setNotesInternes(e.target.value)} placeholder="Notes internes (non visibles du client)" />
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>
                {savedId ? 'Enregistre les modifications' : 'Crée le brouillon — l’envoi se fait depuis la fiche'}
              </span>
              <button className="btn btn-ghost" onClick={handleVisualiser}
                disabled={!!saving || totalTheorique === 0}
                title="Sauvegarde en brouillon et ouvre l'aperçu dans un nouvel onglet">
                {saving === 'visualiser' ? 'Ouverture…' : '👁 Visualiser'}
              </button>
              <button className="btn btn-primary" onClick={() => handleSave('brouillon')}
                disabled={!!saving || totalTheorique === 0}>
                {saving === 'brouillon'
                  ? (savedId ? 'Enregistrement…' : 'Création…')
                  : savedId
                    ? '💾 Enregistrer'
                    : (type === 'devis' ? '💾 Créer le brouillon' : '💾 Créer la LDM')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
