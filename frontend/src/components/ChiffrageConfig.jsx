import { useState } from 'react';

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
  { value: 'mensuel',     label: 'Mensuel (12 décl./an)' },
  { value: 'trimestriel', label: 'Trimestriel (4 décl./an)' },
  { value: 'franchise',   label: 'Franchise en base' },
  { value: 'neant',       label: 'Néant (exonéré)' },
];
const SECTIONS_FORFAIT = ['Comptabilité', 'Fiscalité', 'Social', 'Juridique', 'Conseil', 'Autre'];
const PERIODICITES = ['Mensuel', 'Trimestriel', 'Annuel', 'Ponctuel', 'Clôture'];

export const DEFAULT_PARAMS = {
  type_entite: 'societe', regime_fiscal: 'is', regime_tva: 'mensuel',
  factures_achat: 30, factures_vente: 20, lignes_banque: 30, immobilisations: 5, effectif: 0,
};

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

export default function ChiffrageConfig({ params, setParams, forfaitLines, setForfaitLines }) {
  const [newForfait, setNewForfait] = useState({
    libelle: '', section: 'Juridique', montant_forfait: '', periodicite: 'Annuel',
  });

  const setParam = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const addForfaitLine = () => {
    if (!newForfait.libelle || !newForfait.montant_forfait) return;
    setForfaitLines(fl => [...fl, { ...newForfait, montant_forfait: Number(newForfait.montant_forfait) }]);
    setNewForfait({ libelle: '', section: 'Juridique', montant_forfait: '', periodicite: 'Annuel' });
  };

  const removeForfaitLine = (i) => setForfaitLines(fl => fl.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Mode temps */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: 13 }}>Mission au temps</h3>
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
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>Volumétrie mensuelle</p>
            <SliderInput label="Factures achat / mois" value={params.factures_achat} onChange={v => setParam('factures_achat', v)} max={500} />
            <SliderInput label="Factures vente / mois" value={params.factures_vente} onChange={v => setParam('factures_vente', v)} max={200} />
            <SliderInput label="Lignes de banque / mois" value={params.lignes_banque} onChange={v => setParam('lignes_banque', v)} max={300} />
            <SliderInput label="Immobilisations" value={params.immobilisations} onChange={v => setParam('immobilisations', v)} max={100} />
            <SliderInput label="Effectif (salariés)" value={params.effectif} onChange={v => setParam('effectif', v)} max={50} />
          </div>
        </div>
      </div>

      {/* Mode forfait */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ fontSize: 13 }}>Missions complémentaires (forfait)</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Montants saisis manuellement</span>
        </div>
        <div className="card-body">
          {forfaitLines.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Aucune ligne forfait.
            </p>
          )}
          {forfaitLines.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <SectionBadge section={l.section} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{l.libelle}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {l.periodicite} — {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(l.montant_forfait)}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeForfaitLine(i)}>×</button>
            </div>
          ))}
          <div style={{ marginTop: 12, borderTop: forfaitLines.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: forfaitLines.length > 0 ? 12 : 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>Ajouter une ligne</p>
            <div className="form-group">
              <input className="form-control" placeholder="Libellé"
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
                disabled={!newForfait.libelle || !newForfait.montant_forfait}>+ Ajouter</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
