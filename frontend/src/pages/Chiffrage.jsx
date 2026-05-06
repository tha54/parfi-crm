import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPES_ENTITE = [
  { value: 'ei',          label: 'EI / Eurl' },
  { value: 'societe',     label: 'Société (SARL, SAS…)' },
  { value: 'association', label: 'Association' },
];
const REGIMES_FISCAUX = [
  { value: 'ir',    label: 'IR (impôt sur le revenu)' },
  { value: 'is',    label: 'IS (impôt sur les sociétés)' },
  { value: 'micro', label: 'Micro-entreprise' },
  { value: 'sci',   label: 'SCI (régime foncier)' },
];
const REGIMES_TVA = [
  { value: 'mensuel',      label: 'Mensuel (12 décl./an)' },
  { value: 'trimestriel',  label: 'Trimestriel (4 décl./an)' },
  { value: 'franchise',    label: 'Franchise en base' },
  { value: 'neant',        label: 'Néant (exonéré)' },
];
const SECTIONS_FORFAIT = ['Comptabilité','Fiscalité','Social','Juridique','Conseil','Autre'];
const PERIODICITES      = ['Mensuel','Trimestriel','Annuel','Ponctuel','Clôture'];

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

function SliderInput({ label, value, onChange, min = 0, max = 500, step = 1, unit = '' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</label>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', minWidth: 50, textAlign: 'right' }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }} />
    </div>
  );
}

function SectionBadge({ section }) {
  const colors = {
    Comptabilité: { bg: '#eff6ff', color: '#1e40af' },
    Fiscalité:    { bg: '#f0fdf4', color: '#166534' },
    Social:       { bg: '#fdf4ff', color: '#7e22ce' },
    Juridique:    { bg: '#fff7ed', color: '#9a3412' },
    Conseil:      { bg: '#f0fdfa', color: '#134e4a' },
    Forfait:      { bg: '#fef9c3', color: '#854d0e' },
    Autre:        { bg: '#f1f5f9', color: '#475569' },
  };
  const s = colors[section] || colors.Autre;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {section}
    </span>
  );
}

export default function Chiffrage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const debounceRef = useRef(null);

  const [step, setStep] = useState(1);

  // ── Step 1 : identification ──────────────────────────────────────────────────
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [sirenInput, setSirenInput] = useState('');
  const [sirenResult, setSirenResult] = useState(null);
  const [sirenLoading, setSirenLoading] = useState(false);

  useEffect(() => {
    api.get('/clients').then(r => {
      setClients(r.data || []);
      const preId = searchParams.get('client_id');
      if (preId) {
        const found = (r.data || []).find(c => String(c.id) === preId);
        if (found) setSelectedClient(found);
      }
    }).catch(() => {});
  }, []);

  const clientsFiltered = clients.filter(c =>
    !clientSearch || c.nom?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.siren?.includes(clientSearch)
  ).slice(0, 8);

  const lookupSiren = async () => {
    if (sirenInput.length < 9) return;
    setSirenLoading(true); setSirenResult(null);
    try {
      const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${sirenInput}&per_page=1`);
      const d = await r.json();
      const ent = d.results?.[0];
      if (ent) setSirenResult({ nom: ent.nom_complet || ent.nom_raison_sociale, siren: sirenInput });
    } catch { setSirenResult({ error: true }); }
    finally { setSirenLoading(false); }
  };

  // ── Step 2 : configuration ───────────────────────────────────────────────────
  const [params, setParams] = useState({
    type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
    factures_achat: 30, factures_vente: 20, lignes_banque: 30,
    immobilisations: 5, effectif: 0,
  });
  const [forfaitLines, setForfaitLines] = useState([]);
  const [newForfait, setNewForfait] = useState({ libelle: '', section: 'Juridique', montant_forfait: '', periodicite: 'Annuel' });

  // ── Step 3 : résultats ───────────────────────────────────────────────────────
  const [calcResult, setCalcResult]   = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError]     = useState('');
  const [remise, setRemise]           = useState(0);
  const [actives, setActives]         = useState({});
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');

  const doCalcul = useCallback(async (p, fl) => {
    setCalcLoading(true); setCalcError('');
    try {
      const { data } = await api.post('/chiffrage/calculer', { params: p, rubriques_forfait: fl });
      setCalcResult(data);
      // Initialiser actives à true pour toutes les lignes
      setActives(prev => {
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

  useEffect(() => {
    if (step === 3) doCalcul(params, forfaitLines);
  }, [step]);

  const setParam = (key, val) => {
    const next = { ...params, [key]: val };
    setParams(next);
    if (step === 3) scheduleCalcul(next, forfaitLines);
  };

  const addForfaitLine = () => {
    if (!newForfait.libelle || !newForfait.montant_forfait) return;
    const next = [...forfaitLines, { ...newForfait, montant_forfait: Number(newForfait.montant_forfait) }];
    setForfaitLines(next);
    setNewForfait({ libelle: '', section: 'Juridique', montant_forfait: '', periodicite: 'Annuel' });
    if (step === 3) scheduleCalcul(params, next);
  };

  const removeForfaitLine = (i) => {
    const next = forfaitLines.filter((_, idx) => idx !== i);
    setForfaitLines(next);
    if (step === 3) scheduleCalcul(params, next);
  };

  // Totaux nets (actives uniquement)
  const lignesActives = calcResult ? calcResult.lignes.filter((_, i) => actives[i] !== false) : [];
  const totalTempsNet   = lignesActives.filter(l => l.mode_suivi === 'temps').reduce((s, l) => s + l.tarif_ht, 0);
  const totalForfaitNet = lignesActives.filter(l => l.mode_suivi === 'forfait').reduce((s, l) => s + l.tarif_ht, 0);
  const sousTotal       = totalTempsNet + totalForfaitNet;
  const remiseMontant   = Math.round(sousTotal * remise / 100);
  const totalNet        = sousTotal - remiseMontant;
  const tva             = Math.round(totalNet * 0.20);
  const totalTTC        = totalNet + tva;
  const mensualite      = Math.round(totalNet / 12);

  const handleSave = async (action = 'save') => {
    if (!selectedClient) { setSaveError('Sélectionner un client'); return; }
    setSaving(action); setSaveError('');
    try {
      const lignesPayload = lignesActives.map(l => ({
        libelle: l.libelle,
        rubrique: l.rubrique,
        section: l.section,
        intervenant: l.intervenant,
        periodicite: l.periodicite,
        temps_minutes: l.temps_minutes,
        tarif_ht: l.tarif_ht,
        mode_suivi: l.mode_suivi,
      }));

      const payload = {
        client_id: selectedClient.id,
        ...params,
        remise_pct: remise,
        total_ht_net: totalNet,
        lignes: lignesPayload,
        cree_par: user?.id,
      };

      const { data } = await api.post('/dimensionnement', payload);
      const dimId = data.id;

      if (action === 'devis') {
        const { data: dv } = await api.post('/devis', {
          client_id: selectedClient.id,
          dimensionnement_id: dimId,
          ...params,
          remise_pct: remise,
          total_ht_net: totalNet,
          lignes: lignesPayload,
          titre: `Chiffrage ${selectedClient.nom} — ${new Date().toLocaleDateString('fr-FR')}`,
          cree_par: user?.id,
        });
        navigate(`/devis/${dv.id}`);
      } else if (action === 'ldm') {
        navigate(`/dimensionnement/${dimId}?action=ldm`);
      } else {
        navigate(`/dimensionnement/${dimId}`);
      }
    } catch (e) {
      setSaveError(e.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setSaving(false); }
  };

  // ── Rendu ────────────────────────────────────────────────────────────────────

  const stepLabels = ['Identification', 'Configuration', 'Résultats'];

  return (
    <>
      <div className="page-header">
        <h1>Chiffrage</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
          {stepLabels.map((label, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: 'var(--border)', margin: '0 2px' }}>›</span>}
              <span style={{
                fontWeight: step === i + 1 ? 700 : 400,
                color: step === i + 1 ? 'var(--primary)' : step > i + 1 ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: step > i + 1 ? 'pointer' : 'default',
              }} onClick={() => step > i + 1 && setStep(i + 1)}>
                {i + 1}. {label}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="page-body">

        {/* ── Step 1 : Identification ── */}
        {step === 1 && (
          <div style={{ maxWidth: 640 }}>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3 className="card-title">Client ou prospect</h3></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Rechercher un client existant</label>
                  <input className="form-control" placeholder="Nom ou SIREN…"
                    value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                </div>
                {clientSearch && clientsFiltered.length > 0 && (
                  <div className="card" style={{ marginTop: 4, padding: 0, maxHeight: 220, overflowY: 'auto' }}>
                    {clientsFiltered.map(c => (
                      <div key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                          background: selectedClient?.id === c.id ? 'var(--primary-light)' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = selectedClient?.id === c.id ? 'var(--primary-light)' : 'transparent'}>
                        <strong style={{ fontSize: 13 }}>{c.nom}</strong>
                        {c.siren && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>SIREN {c.siren}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {selectedClient && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 8,
                    border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{selectedClient.nom}</strong>
                      {selectedClient.siren && <span style={{ fontSize: 11, color: '#3b82f6', marginLeft: 8 }}>SIREN {selectedClient.siren}</span>}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelectedClient(null)}>×</button>
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><h3 className="card-title">Ou rechercher par SIREN</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-control" placeholder="SIREN (9 chiffres)" maxLength={9}
                    value={sirenInput} onChange={e => setSirenInput(e.target.value.replace(/\D/g, ''))} />
                  <button className="btn btn-ghost" onClick={lookupSiren} disabled={sirenLoading || sirenInput.length < 9}>
                    {sirenLoading ? '…' : 'Rechercher'}
                  </button>
                </div>
                {sirenResult && !sirenResult.error && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8,
                    border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{sirenResult.nom}</strong>
                      <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 8 }}>SIREN {sirenResult.siren}</span>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => setSelectedClient({ id: null, nom: sirenResult.nom, siren: sirenResult.siren, _nouveau: true })}>
                      Utiliser
                    </button>
                  </div>
                )}
                {sirenResult?.error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>Entreprise non trouvée</p>}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!selectedClient}>
                Suivant → Configuration
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 : Configuration ── */}
        {step === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            {/* Colonne gauche : mode temps */}
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <h3 className="card-title">Mission au temps</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Calculé par le moteur</span>
                </div>
                <div className="card-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Type d'entité</label>
                      <select className="form-control" value={params.type_entite}
                        onChange={e => setParam('type_entite', e.target.value)}>
                        {TYPES_ENTITE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Régime fiscal</label>
                      <select className="form-control" value={params.regime_fiscal}
                        onChange={e => setParam('regime_fiscal', e.target.value)}>
                        {REGIMES_FISCAUX.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Régime TVA</label>
                    <select className="form-control" value={params.regime_tva}
                      onChange={e => setParam('regime_tva', e.target.value)}>
                      {REGIMES_TVA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-muted)', marginBottom: 12 }}>Volumétrie mensuelle</p>
                    <SliderInput label="Factures achat / mois" value={params.factures_achat}
                      onChange={v => setParam('factures_achat', v)} max={500} />
                    <SliderInput label="Factures vente / mois" value={params.factures_vente}
                      onChange={v => setParam('factures_vente', v)} max={200} />
                    <SliderInput label="Lignes de banque / mois" value={params.lignes_banque}
                      onChange={v => setParam('lignes_banque', v)} max={300} />
                    <SliderInput label="Immobilisations" value={params.immobilisations}
                      onChange={v => setParam('immobilisations', v)} max={100} />
                    <SliderInput label="Effectif (salariés)" value={params.effectif}
                      onChange={v => setParam('effectif', v)} max={50} />
                  </div>
                </div>
              </div>
            </div>

            {/* Colonne droite : mode forfait */}
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <h3 className="card-title">Missions au forfait</h3>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Montants saisis manuellement</span>
                </div>
                <div className="card-body">
                  {forfaitLines.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                      Aucune ligne forfait. Ajoutez des missions à montant fixe (juridique ponctuel, conseil, etc.).
                    </p>
                  )}
                  {forfaitLines.map((l, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                      borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <SectionBadge section={l.section} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{l.libelle}</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.periodicite} — {fmt(l.montant_forfait)}</span>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={() => removeForfaitLine(i)}>×</button>
                    </div>
                  ))}

                  <div style={{ marginTop: 14, borderTop: forfaitLines.length > 0 ? '1px solid var(--border)' : 'none',
                    paddingTop: forfaitLines.length > 0 ? 14 : 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-muted)', marginBottom: 10 }}>Ajouter une ligne forfait</p>
                    <div className="form-group">
                      <input className="form-control" placeholder="Libellé (ex. AGO + formalités)"
                        value={newForfait.libelle} onChange={e => setNewForfait(n => ({ ...n, libelle: e.target.value }))} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <select className="form-control" value={newForfait.section}
                          onChange={e => setNewForfait(n => ({ ...n, section: e.target.value }))}>
                          {SECTIONS_FORFAIT.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <select className="form-control" value={newForfait.periodicite}
                          onChange={e => setNewForfait(n => ({ ...n, periodicite: e.target.value }))}>
                          {PERIODICITES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div className="form-group" style={{ flex: 1, margin: 0 }}>
                        <input type="number" className="form-control" placeholder="Montant HT (€)"
                          value={newForfait.montant_forfait}
                          onChange={e => setNewForfait(n => ({ ...n, montant_forfait: e.target.value }))}
                          min="0" step="50" />
                      </div>
                      <button className="btn btn-ghost" onClick={addForfaitLine}
                        disabled={!newForfait.libelle || !newForfait.montant_forfait}>
                        + Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Identification</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>
                Calculer et voir les résultats →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 : Résultats ── */}
        {step === 3 && (
          <div>
            {calcLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                <div className="spinner" style={{ width: 18, height: 18 }}><div className="spinner-ring" /></div>
                Calcul en cours…
              </div>
            )}
            {calcError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{calcError}</div>}

            {calcResult && !calcLoading && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

                {/* Lignes détaillées */}
                <div>
                  {/* Lignes mode temps */}
                  {['Comptabilité','Fiscalité','Social','Juridique','Autre'].map(section => {
                    const lignesSection = calcResult.lignes.filter((l, i) => l.section === section && l.mode_suivi === 'temps');
                    if (!lignesSection.length) return null;
                    const globalIdx = calcResult.lignes;
                    return (
                      <div key={section} className="card" style={{ marginBottom: 12 }}>
                        <div className="card-header" style={{ padding: '10px 14px' }}>
                          <SectionBadge section={section} />
                        </div>
                        <div className="card-body" style={{ padding: 0 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {calcResult.lignes.map((l, i) => {
                                if (l.section !== section || l.mode_suivi !== 'temps') return null;
                                const active = actives[i] !== false;
                                return (
                                  <tr key={i} style={{ borderTop: '1px solid var(--border)',
                                    opacity: active ? 1 : 0.4, background: active ? 'transparent' : 'var(--bg)' }}>
                                    <td style={{ padding: '8px 14px', width: 28 }}>
                                      <input type="checkbox" checked={active}
                                        onChange={e => setActives(a => ({ ...a, [i]: e.target.checked }))} />
                                    </td>
                                    <td style={{ padding: '8px 0' }}>
                                      <div style={{ fontSize: 13 }}>{l.libelle}</div>
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {l.intervenant} · {l.periodicite} · {l.temps_minutes} min
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                      {fmt(l.tarif_ht)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* Lignes mode forfait */}
                  {calcResult.lignes_forfait.length > 0 && (
                    <div className="card" style={{ marginBottom: 12 }}>
                      <div className="card-header" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SectionBadge section="Forfait" />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Missions à montant fixe</span>
                      </div>
                      <div className="card-body" style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {calcResult.lignes.map((l, i) => {
                              if (l.mode_suivi !== 'forfait') return null;
                              const active = actives[i] !== false;
                              return (
                                <tr key={i} style={{ borderTop: '1px solid var(--border)',
                                  opacity: active ? 1 : 0.4, background: active ? 'transparent' : 'var(--bg)' }}>
                                  <td style={{ padding: '8px 14px', width: 28 }}>
                                    <input type="checkbox" checked={active}
                                      onChange={e => setActives(a => ({ ...a, [i]: e.target.checked }))} />
                                  </td>
                                  <td style={{ padding: '8px 0' }}>
                                    <div style={{ fontSize: 13 }}>{l.libelle}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                      <SectionBadge section={l.section} /> · {l.periodicite}
                                    </div>
                                  </td>
                                  <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {fmt(l.tarif_ht)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel récap + actions */}
                <div>
                  <div className="card" style={{ position: 'sticky', top: 80 }}>
                    <div className="card-header"><h3 className="card-title">Récapitulatif</h3></div>
                    <div className="card-body">
                      {selectedClient && (
                        <div style={{ marginBottom: 14, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 13 }}>
                          <strong>{selectedClient.nom}</strong>
                          {selectedClient.siren && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SIREN {selectedClient.siren}</div>}
                        </div>
                      )}

                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mode temps</div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{fmt(totalTempsNet)}</div>

                      {totalForfaitNet > 0 && <>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Mode forfait</div>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{fmt(totalForfaitNet)}</div>
                      </>}

                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span>Sous-total HT</span><strong>{fmt(sousTotal)}</strong>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                            color: 'var(--text-muted)', marginBottom: 4 }}>
                            <label>Remise</label><span>{remise}%</span>
                          </div>
                          <input type="range" min={0} max={30} step={1} value={remise}
                            onChange={e => setRemise(Number(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--primary)' }} />
                          {remise > 0 && (
                            <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--danger)' }}>- {fmt(remiseMontant)}</div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14,
                          fontWeight: 700, marginBottom: 4, color: 'var(--primary)' }}>
                          <span>Total HT net</span><span>{fmt(totalNet)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                          color: 'var(--text-muted)', marginBottom: 4 }}>
                          <span>TVA 20%</span><span>{fmt(tva)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
                          fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          <span>Total TTC</span><span>{fmt(totalTTC)}</span>
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 12, padding: '10px',
                          background: 'var(--bg)', borderRadius: 8 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
                            letterSpacing: '0.06em' }}>Mensualité</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{fmt(mensualite)}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>/ mois HT</div>
                        </div>
                      </div>

                      {saveError && <div className="alert alert-error" style={{ marginTop: 10, fontSize: 12 }}>{saveError}</div>}

                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setStep(2)}>← Modifier</button>
                        <button className="btn btn-ghost" onClick={() => handleSave('save')}
                          disabled={!!saving || totalNet === 0}>
                          {saving === 'save' ? 'Enregistrement…' : '💾 Enregistrer le chiffrage'}
                        </button>
                        <button className="btn btn-primary" onClick={() => handleSave('devis')}
                          disabled={!!saving || totalNet === 0}>
                          {saving === 'devis' ? 'Création…' : '📄 Générer le devis'}
                        </button>
                        <button className="btn btn-ghost" style={{ borderColor: '#0f1f4b', color: '#0f1f4b' }}
                          onClick={() => handleSave('ldm')} disabled={!!saving || totalNet === 0}>
                          {saving === 'ldm' ? 'Création…' : '📋 Créer la LDM directement'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
