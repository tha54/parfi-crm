import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

/**
 * Chantier F — édition des budget_ligne d'une LDM.
 *
 * Un accordéon par mission (ldm_missions). Pour chaque mission ouverte :
 *   - table des budget_ligne existantes
 *   - formulaire d'ajout inline
 *   - édition/suppression ligne à ligne
 *
 * Écriture verrouillée si LDM signée/active/résiliée/etc. (aligné avec la
 * route backend qui refuse alors avec 409).
 */

const STATUTS_LDM_LOCKED = ['signee', 'active', 'resiliee', 'echue', 'annulee', 'archivee'];

const PERIODICITES = [
  { value: 'mensuelle',     label: 'Mensuelle',     n: 12 },
  { value: 'trimestrielle', label: 'Trimestrielle', n: 4 },
  { value: 'semestrielle',  label: 'Semestrielle',  n: 2 },
  { value: 'annuelle',      label: 'Annuelle',      n: 1 },
  { value: 'ponctuelle',    label: 'Ponctuelle',    n: 1 },
];

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  .format(Number(v || 0));

const fmtMin = min => {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
};

export default function BudgetLignesSection({ ldm, missions }) {
  const locked = STATUTS_LDM_LOCKED.includes(ldm?.statut);
  const [openMissionId, setOpenMissionId] = useState(null);
  const [tauxGrade, setTauxGrade] = useState([]);
  const [codeTemps, setCodeTemps] = useState([]);

  // Référentiels : chargés une fois pour toutes les missions
  useEffect(() => {
    api.get('/budget-ligne/referentiel/taux-grade').then(r => setTauxGrade(r.data || [])).catch(() => {});
    api.get('/budget-ligne/referentiel/code-temps').then(r => setCodeTemps(r.data || [])).catch(() => {});
  }, []);

  if (!missions || missions.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Budget par mission</span>
        <span className="text-muted text-sm">
          {missions.length} mission{missions.length > 1 ? 's' : ''}
          {locked && ' · lecture seule (LDM verrouillée)'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {missions.map(m => (
          <MissionBudget
            key={m.id}
            mission={m}
            isOpen={openMissionId === m.id}
            onToggle={() => setOpenMissionId(openMissionId === m.id ? null : m.id)}
            tauxGrade={tauxGrade}
            codeTemps={codeTemps}
            locked={locked}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Accordéon mission ──────────────────────────────────────────────────────

function MissionBudget({ mission, isOpen, onToggle, tauxGrade, codeTemps, locked }) {
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/budget-ligne?mission_id=${mission.id}`);
      setLignes(data || []);
      setErr(null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [mission.id]);

  useEffect(() => { if (isOpen) reload(); }, [isOpen, reload]);

  const total = lignes.reduce((s, l) => s + parseFloat(l.montant_ht || 0), 0);
  const totalMinutes = lignes.reduce((s, l) => s + Number(l.minutes_annuelles || 0), 0);

  return (
    <div style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
      {/* En-tête cliquable */}
      <div
        onClick={onToggle}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          background: isOpen ? 'var(--bg-muted, #f6f8fb)' : 'transparent',
        }}
      >
        <span style={{
          display: 'inline-block',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform .15s',
          color: 'var(--text-muted)',
        }}>▶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{mission.libelle}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {mission.type_mission?.replace(/_/g, ' ')}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13 }}>
          <div style={{ fontWeight: 700 }}>{fmt(mission.honoraires_ht)}</div>
          {mission.honoraires_ht > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              honoraires cache
            </div>
          )}
        </div>
      </div>

      {/* Corps déplié */}
      {isOpen && (
        <div style={{ padding: '4px 16px 16px 16px' }}>
          {err && (
            <div style={{ padding: 8, background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
              {err}
            </div>
          )}
          {loading ? (
            <div style={{ padding: 8, color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</div>
          ) : (
            <>
              <LignesTable
                lignes={lignes}
                tauxGrade={tauxGrade}
                codeTemps={codeTemps}
                locked={locked}
                onChange={reload}
              />
              {lignes.length > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '8px 8px 0 8px', fontSize: 12, color: 'var(--text-muted)',
                }}>
                  <span>Total minutes annuelles : {totalMinutes.toLocaleString('fr-FR')}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                    Somme lignes : {fmt(total)}
                  </span>
                </div>
              )}
              {!locked && (
                <AjoutLigne
                  missionId={mission.id}
                  tauxGrade={tauxGrade}
                  codeTemps={codeTemps}
                  onCreated={reload}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Table des lignes existantes ────────────────────────────────────────────

function LignesTable({ lignes, tauxGrade, codeTemps, locked, onChange }) {
  if (lignes.length === 0) {
    return (
      <div style={{
        padding: '16px 8px', color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic',
      }}>
        Aucune ligne de budget saisie pour cette mission.
      </div>
    );
  }
  return (
    <div className="table-wrapper" style={{ marginTop: 4 }}>
      <table>
        <thead>
          <tr>
            <th style={{ fontSize: 11 }}>Code</th>
            <th style={{ fontSize: 11 }}>Grade</th>
            <th style={{ fontSize: 11, textAlign: 'right', width: 90 }}>Qté (min)</th>
            <th style={{ fontSize: 11, width: 130 }}>Périodicité</th>
            <th style={{ fontSize: 11, textAlign: 'right', width: 90 }}>Min. année</th>
            <th style={{ fontSize: 11, textAlign: 'right', width: 90 }}>Taux</th>
            <th style={{ fontSize: 11, textAlign: 'right', width: 110 }}>Montant HT</th>
            {!locked && <th style={{ width: 90 }}></th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => (
            <LigneRow
              key={l.id}
              ligne={l}
              tauxGrade={tauxGrade}
              codeTemps={codeTemps}
              locked={locked}
              onChange={onChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LigneRow({ ligne, tauxGrade, codeTemps, locked, onChange }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    quantite_minutes: ligne.quantite_minutes,
    periodicite: ligne.periodicite,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const codeInfo = codeTemps.find(c => c.code === ligne.code_temps);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/budget-ligne/${ligne.id}`, {
        quantite_minutes: Number(form.quantite_minutes),
        periodicite: form.periodicite,
      });
      setEditing(false);
      onChange();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally { setSaving(false); }
  };

  const supprimer = async () => {
    if (!window.confirm('Supprimer cette ligne ?')) return;
    setSaving(true);
    try {
      await api.delete(`/budget-ligne/${ligne.id}`);
      onChange();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
      setSaving(false);
    }
  };

  const gradeLibelle = tauxGrade.find(g => g.grade === ligne.grade)?.libelle || ligne.grade;

  return (
    <>
      <tr>
        <td style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>{ligne.code_temps}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {codeInfo?.libelle || ligne.code_temps_libelle || ''}
          </div>
        </td>
        <td style={{ fontSize: 12 }}>{gradeLibelle}</td>
        <td style={{ textAlign: 'right', fontSize: 12 }}>
          {editing ? (
            <input
              type="number" step={15} min={15} max={720}
              value={form.quantite_minutes}
              onChange={e => setForm(f => ({ ...f, quantite_minutes: e.target.value }))}
              style={{ width: 80, padding: 4, fontSize: 12 }}
              disabled={saving}
            />
          ) : ligne.quantite_minutes}
        </td>
        <td style={{ fontSize: 12 }}>
          {editing ? (
            <select
              value={form.periodicite}
              onChange={e => setForm(f => ({ ...f, periodicite: e.target.value }))}
              style={{ width: '100%', padding: 4, fontSize: 12 }}
              disabled={saving}
            >
              {PERIODICITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          ) : PERIODICITES.find(p => p.value === ligne.periodicite)?.label || ligne.periodicite}
        </td>
        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
          {ligne.minutes_annuelles}
        </td>
        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
          {fmt(ligne.taux_horaire_applique)}/h
        </td>
        <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700 }}>
          {fmt(ligne.montant_ht)}
        </td>
        {!locked && (
          <td>
            {editing ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-sm btn-primary" onClick={save} disabled={saving}
                        style={{ fontSize: 11, padding: '2px 8px' }}>✓</button>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)} disabled={saving}
                        style={{ fontSize: 11, padding: '2px 8px' }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}
                        style={{ fontSize: 11, padding: '2px 8px' }}>✏️</button>
                <button className="btn btn-sm btn-ghost" onClick={supprimer} disabled={saving}
                        style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}>🗑</button>
              </div>
            )}
          </td>
        )}
      </tr>
      {err && (
        <tr>
          <td colSpan={locked ? 7 : 8} style={{ padding: 4 }}>
            <div style={{ padding: 6, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 11 }}>
              {err}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Formulaire d'ajout ─────────────────────────────────────────────────────

function AjoutLigne({ missionId, tauxGrade, codeTemps, onCreated }) {
  const [form, setForm] = useState({
    code_temps: '',
    grade: 'medior',
    quantite_minutes: 60,
    periodicite: 'mensuelle',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const create = async () => {
    if (!form.code_temps) { setErr('Choisir un code temps'); return; }
    setSaving(true); setErr(null);
    try {
      await api.post('/budget-ligne', {
        mission_id: missionId,
        code_temps: form.code_temps,
        grade: form.grade,
        quantite_minutes: Number(form.quantite_minutes),
        periodicite: form.periodicite,
      });
      setForm(f => ({ ...f, code_temps: '', quantite_minutes: 60 }));
      onCreated();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally { setSaving(false); }
  };

  const grade = tauxGrade.find(g => g.grade === form.grade);
  const periode = PERIODICITES.find(p => p.value === form.periodicite);
  const qteN = Number(form.quantite_minutes || 0);
  const minAnn = qteN * (periode?.n || 1);
  const taux = grade ? Number(grade.taux_horaire_cible_eur) : 0;
  const previewMontant = Math.round((minAnn / 60) * taux * 100) / 100;

  // Regroupement des codes par famille pour l'optgroup
  const familles = codeTemps.reduce((acc, c) => {
    (acc[c.famille_libelle] = acc[c.famille_libelle] || []).push(c);
    return acc;
  }, {});

  return (
    <div style={{
      marginTop: 12, padding: 12, background: 'var(--bg-muted, #f6f8fb)',
      borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        + Ajouter une ligne
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px 130px 110px auto', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Code temps</label>
          <select
            value={form.code_temps}
            onChange={e => setForm(f => ({ ...f, code_temps: e.target.value }))}
            style={{ width: '100%', padding: 6, fontSize: 12 }}
            disabled={saving}
          >
            <option value="">— choisir —</option>
            {Object.entries(familles).map(([fam, codes]) => (
              <optgroup key={fam} label={fam}>
                {codes.map(c => (
                  <option key={c.code} value={c.code}>{c.code} — {c.libelle}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Grade</label>
          <select
            value={form.grade}
            onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
            style={{ width: '100%', padding: 6, fontSize: 12 }}
            disabled={saving}
          >
            {tauxGrade.map(g => (
              <option key={g.grade} value={g.grade}>
                {g.libelle} ({fmt(g.taux_horaire_cible_eur)}/h)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Qté (min)</label>
          <input
            type="number" step={15} min={15} max={720}
            value={form.quantite_minutes}
            onChange={e => setForm(f => ({ ...f, quantite_minutes: e.target.value }))}
            style={{ width: '100%', padding: 6, fontSize: 12 }}
            disabled={saving}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Périodicité</label>
          <select
            value={form.periodicite}
            onChange={e => setForm(f => ({ ...f, periodicite: e.target.value }))}
            style={{ width: '100%', padding: 6, fontSize: 12 }}
            disabled={saving}
          >
            {PERIODICITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Aperçu</div>
          <div style={{ fontWeight: 700 }}>{fmt(previewMontant)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtMin(minAnn)}/an</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={create} disabled={saving || !form.code_temps}
                style={{ fontSize: 12, padding: '6px 12px' }}>
          {saving ? '…' : 'Ajouter'}
        </button>
      </div>
      {err && (
        <div style={{ padding: 6, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 11 }}>
          {err}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        Quantité en minutes, multiple de 15 (min 15, max 720). Le taux est figé à la création.
      </div>
    </div>
  );
}
