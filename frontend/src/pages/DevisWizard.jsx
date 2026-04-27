import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const emptyLigne = () => ({ description: '', quantite: 1, prixUnitaireHT: 0, remisePct: 0, totalHT: 0 });
const calcLigne  = l => {
  const t = Number(l.quantite || 0) * Number(l.prixUnitaireHT || 0) * (1 - Number(l.remisePct || 0) / 100);
  return { ...l, totalHT: Math.round(t * 100) / 100 };
};

// ── Autocomplete client + prospect ────────────────────────────────────────────
function EntitySearch({ clients, prospects, value, onSelect, onCreateProspect }) {
  const [text, setText] = useState(value?.nom || '');
  const [open, setOpen] = useState(false);

  useEffect(() => { setText(value?.nom || ''); }, [value?.nom]);

  const q = text.toLowerCase();
  const filtCl = q.length >= 1 ? clients.filter(c => c.nom.toLowerCase().includes(q)).slice(0, 6) : [];
  const filtPr = q.length >= 1 ? prospects.filter(p => p.nom.toLowerCase().includes(q) && p.statut !== 'converti').slice(0, 6) : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="form-control"
        placeholder="Nom du client ou prospect…"
        value={text}
        onChange={e => { setText(e.target.value); setOpen(true); }}
        onFocus={() => { if (text.length >= 1) setOpen(true); }}
        autoComplete="off"
      />
      {value && <div style={{ marginTop: 4, fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: value.type === 'client' ? '#0f1f4b' : '#8b5cf6' }}>
          {value.type === 'client' ? '👥 Client' : '📡 Prospect'} :
        </span> {value.nom}
        <button type="button" onClick={() => { setText(''); onSelect(null, null); }} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>×</button>
      </div>}
      {open && text.length >= 1 && (filtCl.length > 0 || filtPr.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 280, overflowY: 'auto', marginTop: 2 }}
          onMouseDown={e => e.preventDefault()}>
          {filtCl.length > 0 && <>
            <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', background: '#f8fafc' }}>Clients</div>
            {filtCl.map(c => <div key={c.id} onClick={() => { onSelect(c, 'client'); setText(c.nom); setOpen(false); }} style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background='#f0f4f8'} onMouseLeave={e => e.currentTarget.style.background=''}><strong>{c.nom}</strong></div>)}
          </>}
          {filtPr.length > 0 && <>
            <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', background: '#faf8ff' }}>Prospects</div>
            {filtPr.map(p => <div key={p.id} onClick={() => { onSelect(p, 'prospect'); setText(p.nom); setOpen(false); }} style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background='#f5f0ff'} onMouseLeave={e => e.currentTarget.style.background=''}><strong style={{ color: '#8b5cf6' }}>{p.nom}</strong></div>)}
          </>}
          {filtCl.length === 0 && filtPr.length === 0 && (
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>Aucun résultat pour « {text} »</div>
              <button type="button" onClick={() => { setOpen(false); onCreateProspect(text); }} style={{ fontSize: 13, color: '#5bb8e8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                + Créer le prospect « {text} »
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 1 — Identification ────────────────────────────────────────────────────
function Step1({ data, onChange, clients, prospects, onCreateProspect }) {
  const defaultValidite = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 1 — Identification</h3>

      <div className="form-group">
        <label className="form-label">Client ou prospect *</label>
        <EntitySearch
          clients={clients} prospects={prospects}
          value={data.selectedEntity}
          onSelect={(item, type) => {
            if (!item) { onChange({ selectedEntity: null, client_id: null, prospect_id: null }); return; }
            onChange({
              selectedEntity: { id: item.id, nom: item.nom, type },
              client_id:   type === 'client'   ? item.id : null,
              prospect_id: type === 'prospect' ? item.id : null,
            });
          }}
          onCreateProspect={onCreateProspect}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Titre du devis *</label>
        <input
          className="form-control"
          placeholder="Proposition d'honoraires — exercice 2025"
          value={data.titre}
          onChange={e => onChange({ titre: e.target.value })}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date de validité</label>
          <input type="date" className="form-control"
            value={data.dateValidite || defaultValidite}
            onChange={e => onChange({ dateValidite: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Taux TVA (%)</label>
          <input type="number" className="form-control" style={{ maxWidth: 120 }}
            value={data.tauxTVA} min={0} max={100}
            onChange={e => onChange({ tauxTVA: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 2 — Lignes (dimensionnement ou manuel) ────────────────────────────────
function Step2({ data, onChange, entityId, entityType }) {
  const [dimensionnements, setDimensionnements] = useState([]);
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    if (!entityId) return;
    const param = entityType === 'client' ? `client_id=${entityId}` : `prospect_id=${entityId}`;
    api.get(`/dimensionnement?${param}`).then(r => setDimensionnements(r.data)).catch(() => {});
  }, [entityId, entityType]);

  const importDimensionnement = async (dimId) => {
    if (!dimId) return;
    try {
      const { data: dim } = await api.get(`/dimensionnement/${dimId}`);
      const lignesActives = (dim.lignes || []).filter(l => l.actif);
      const nouvelles = lignesActives.map(l => calcLigne({
        description: `${l.section} — ${l.libelle} (${l.periodicite || ''})`,
        quantite: 1,
        prixUnitaireHT: Number(l.tarif_ht) || 0,
        remisePct: Number(dim.remise_pct) || 0,
        totalHT: 0,
      }));
      onChange({ lignes: nouvelles.length > 0 ? nouvelles : [emptyLigne()], importedDimId: dimId });
      setImportMsg(`✓ ${nouvelles.length} lignes importées depuis le dimensionnement`);
    } catch { setImportMsg('Erreur lors de l\'import'); }
  };

  const setLigne = (i, field, val) => {
    const updated = data.lignes.map((l, idx) => idx === i ? calcLigne({ ...l, [field]: val }) : l);
    onChange({ lignes: updated });
  };
  const addLigne    = () => onChange({ lignes: [...data.lignes, emptyLigne()] });
  const removeLigne = i  => onChange({ lignes: data.lignes.filter((_, idx) => idx !== i) });

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 2 — Prestations</h3>

      {/* Import dimensionnement */}
      {dimensionnements.length > 0 && (
        <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-hover)', marginBottom: 10 }}>
            📐 Importer depuis un dimensionnement existant
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="form-control"
              style={{ flex: 1 }}
              defaultValue=""
              onChange={e => importDimensionnement(e.target.value)}
            >
              <option value="">— Choisir un dimensionnement —</option>
              {dimensionnements.map(d => (
                <option key={d.id} value={d.id}>
                  #{d.id} · {d.type_entite} · {d.statut} · {fmt(d.total_ht_net || d.total_ht)} HT
                </option>
              ))}
            </select>
          </div>
          {importMsg && <div style={{ fontSize: 12, color: 'var(--accent-hover)', marginTop: 8, fontWeight: 500 }}>{importMsg}</div>}
        </div>
      )}

      {!entityId && (
        <div style={{ fontSize: 12, color: '#e67e22', marginBottom: 12 }}>
          ⚠ Sélectionnez d'abord un client ou prospect (étape 1) pour importer un dimensionnement.
        </div>
      )}

      {/* Lignes manuelles */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>Description</th>
              <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 60, textAlign: 'center' }}>Qté</th>
              <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 100, textAlign: 'right' }}>PU HT (€)</th>
              <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 65, textAlign: 'center' }}>Rem %</th>
              <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 100, textAlign: 'right' }}>Total HT</th>
              <th style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {data.lignes.map((l, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 10px' }}>
                  <input className="form-control" style={{ padding: '4px 8px' }} value={l.description}
                    onChange={e => setLigne(i, 'description', e.target.value)} placeholder="Prestation…" />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" className="form-control" style={{ padding: '4px 6px', textAlign: 'center' }}
                    value={l.quantite} min={0} step={0.5} onChange={e => setLigne(i, 'quantite', e.target.value)} />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" className="form-control" style={{ padding: '4px 6px', textAlign: 'right' }}
                    value={l.prixUnitaireHT} min={0} step={1} onChange={e => setLigne(i, 'prixUnitaireHT', e.target.value)} />
                </td>
                <td style={{ padding: '6px 6px' }}>
                  <input type="number" className="form-control" style={{ padding: '4px 6px', textAlign: 'center' }}
                    value={l.remisePct} min={0} max={100} onChange={e => setLigne(i, 'remisePct', e.target.value)} />
                </td>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--primary)', textAlign: 'right', fontSize: 13 }}>
                  {fmt(l.totalHT)}
                </td>
                <td style={{ padding: '6px 6px', textAlign: 'center' }}>
                  {data.lignes.length > 1 && (
                    <button type="button" onClick={() => removeLigne(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={addLigne}>+ Ajouter une ligne</button>
    </div>
  );
}

// ── Step 3 — Récapitulatif ────────────────────────────────────────────────────
function Step3({ data, onChange, totaux, onSave, saving }) {
  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 3 — Récapitulatif</h3>

      {data.selectedEntity && (
        <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          <strong>{data.selectedEntity.type === 'client' ? '👥 Client' : '📡 Prospect'} :</strong> {data.selectedEntity.nom}
          &nbsp;&nbsp;·&nbsp;&nbsp;<strong>Titre :</strong> {data.titre || '—'}
          &nbsp;&nbsp;·&nbsp;&nbsp;<strong>Validité :</strong> {data.dateValidite ? new Date(data.dateValidite).toLocaleDateString('fr-FR') : '—'}
        </div>
      )}

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Description</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', width: 80, fontWeight: 600, color: 'var(--text-muted)' }}>Qté</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', width: 100, fontWeight: 600, color: 'var(--text-muted)' }}>PU HT</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', width: 110, fontWeight: 600, color: 'var(--text-muted)' }}>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {data.lignes.filter(l => l.description || l.prixUnitaireHT > 0).map((l, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px' }}>{l.description || '—'}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{l.quantite}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(l.prixUnitaireHT)}</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(l.totalHT)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totaux */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
        <div style={{ width: 280, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="text-muted">Total HT</span><strong>{fmt(totaux.totalHT)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="text-muted">TVA {data.tauxTVA}%</span><span>{fmt(totaux.totalTVA)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 700 }}>
            <span>Total TTC</span><span>{fmt(totaux.totalTTC)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 14px', background: 'var(--accent-light)', fontSize: 12, color: 'var(--accent-hover)' }}>
            <span>Équivalent mensuel TTC</span><strong>{fmt(totaux.totalTTC / 12)}</strong>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Notes client</label>
          <textarea className="form-control" rows={3} value={data.notesClient}
            onChange={e => onChange({ notesClient: e.target.value })}
            placeholder="Conditions de paiement, mentions légales…"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Notes internes</label>
          <textarea className="form-control" rows={3} value={data.notesInternes}
            onChange={e => onChange({ notesInternes: e.target.value })}
            placeholder="Contexte, négociation, remarques…"
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={() => onSave('brouillon')} disabled={!!saving} style={{ justifyContent: 'center', padding: 11 }}>
          {saving === 'brouillon' ? 'Enregistrement…' : '💾 Enregistrer comme brouillon'}
        </button>
        <button className="btn btn-primary" onClick={() => onSave('envoye')} disabled={!!saving} style={{ justifyContent: 'center', padding: 11 }}>
          {saving === 'envoye' ? 'Envoi en cours…' : '📤 Enregistrer + Marquer comme envoyé'}
        </button>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function DevisWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(1);
  const [clients, setClients] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState('');

  // Pre-fill from URL params (from Pipeline "Créer un devis")
  const urlProspectId = searchParams.get('prospect_id') || '';
  const urlNom        = searchParams.get('nom') || '';
  const urlOppId      = searchParams.get('opp_id') || '';

  const [data, setData] = useState({
    selectedEntity:  urlProspectId ? { id: urlProspectId, nom: urlNom, type: 'prospect' } : null,
    client_id:       null,
    prospect_id:     urlProspectId || null,
    opportunite_id:  urlOppId || null,
    titre:           '',
    dateValidite:    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    tauxTVA:         '20',
    notesClient:     'Honoraires payables mensuellement par prélèvement automatique.\nProposition valable 30 jours.',
    notesInternes:   '',
    lignes:          [emptyLigne()],
    importedDimId:   null,
  });

  useEffect(() => {
    Promise.all([
      api.get('/clients').then(r => setClients(r.data)).catch(() => {}),
      api.get('/prospects').then(r => setProspects(r.data)).catch(() => {}),
    ]);
  }, []);

  const updateData = (partial) => setData(d => ({ ...d, ...partial }));

  const totaux = (() => {
    const ht  = data.lignes.reduce((s, l) => s + Number(l.totalHT || 0), 0);
    const tva = Math.round(ht * (Number(data.tauxTVA) / 100) * 100) / 100;
    return { totalHT: Math.round(ht * 100) / 100, totalTVA: tva, totalTTC: Math.round((ht + tva) * 100) / 100 };
  })();

  const validate = () => {
    if (!data.client_id && !data.prospect_id) return 'Client ou prospect requis';
    if (!data.titre.trim()) return 'Titre requis';
    if (data.lignes.every(l => !l.description && !l.prixUnitaireHT)) return 'Au moins une ligne requise';
    return null;
  };

  const handleSave = async (statut) => {
    const errMsg = validate();
    if (errMsg) { setErr(errMsg); return; }
    setSaving(statut); setErr('');
    try {
      const payload = {
        client_id:      data.client_id    || null,
        prospect_id:    data.prospect_id  || null,
        opportunite_id: data.opportunite_id || null,
        titre:          data.titre,
        dateValidite:   data.dateValidite,
        tauxTVA:        data.tauxTVA,
        notesClient:    data.notesClient,
        notesInternes:  data.notesInternes,
        lignes:         data.lignes.filter(l => l.description || l.prixUnitaireHT > 0),
        ...totaux,
      };
      const { data: created } = await api.post('/devis', payload);
      if (statut === 'envoye') {
        await api.put(`/devis/${created.id}`, { statut: 'envoye' });
      }
      navigate(`/devis/${created.id}`);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la création');
    } finally { setSaving(null); }
  };

  const handleCreateProspect = async (nom) => {
    try {
      const { data: p } = await api.post('/prospects', { nom });
      setProspects(prev => [p, ...prev]);
      updateData({ selectedEntity: { id: p.id, nom: p.nom, type: 'prospect' }, prospect_id: p.id, client_id: null });
    } catch { setErr('Impossible de créer le prospect'); }
  };

  const STEPS = [{ n: 1, label: 'Identification' }, { n: 2, label: 'Prestations' }, { n: 3, label: 'Récapitulatif' }];

  return (
    <>
      <div className="page-header">
        <h1>Nouveau devis</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/devis')}>← Retour aux devis</button>
      </div>

      <div className="page-body">
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div
                  onClick={() => s.n < step && setStep(s.n)}
                  style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, cursor: s.n < step ? 'pointer' : 'default', background: step === s.n ? 'var(--primary)' : step > s.n ? 'var(--accent)' : 'var(--border)', color: step >= s.n ? '#fff' : 'var(--text-muted)', flexShrink: 0 }}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: step === s.n ? 700 : 400, color: step === s.n ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: step > s.n ? 'var(--accent)' : 'var(--border)', margin: '0 14px' }} />}
              </div>
            ))}
          </div>

          {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>{err}<button onClick={() => setErr('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button></div>}

          <div className="card">
            <div className="card-body">
              {step === 1 && <Step1 data={data} onChange={updateData} clients={clients} prospects={prospects} onCreateProspect={handleCreateProspect} />}
              {step === 2 && <Step2 data={data} onChange={updateData} entityId={data.client_id || data.prospect_id} entityType={data.client_id ? 'client' : 'prospect'} />}
              {step === 3 && <Step3 data={data} onChange={updateData} totaux={totaux} onSave={handleSave} saving={saving} />}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)} disabled={step === 1} style={{ visibility: step === 1 ? 'hidden' : 'visible' }}>
                ← Précédent
              </button>
              {step < 3 ? (
                <button className="btn btn-primary" onClick={() => {
                  if (step === 1 && !data.client_id && !data.prospect_id) { setErr('Client ou prospect requis'); return; }
                  if (step === 1 && !data.titre.trim()) { setErr('Titre requis'); return; }
                  setErr('');
                  setStep(s => s + 1);
                }}>Suivant →</button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
