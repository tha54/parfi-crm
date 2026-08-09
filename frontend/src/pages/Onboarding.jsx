import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Chantier G — page /onboarding/:dossierId.
 *
 * Consulter et piloter le parcours d'entrée en relation client :
 *   - suivi des 27 étapes E01..E27 (statut N/EC/F/NA + motif_na)
 *   - mandats du dossier en annexes (créer, marquer signé, IBAN SEPA)
 */

const PHASES_ORDRE = ['prealable', 'declenchement', 'reprise', 'collecte', 'demarrage', 'parametrage', 'production', 'cloture'];
const PHASES_LABEL = {
  prealable:     'Préalables',
  declenchement: 'Déclenchement',
  reprise:       'Reprise (si confrère)',
  collecte:      'Collecte',
  demarrage:     'Démarrage',
  parametrage:   'Paramétrage',
  production:    'Production',
  cloture:       'Clôture',
};
const STATUTS_ETAPE = [
  { code: 'N',  label: 'À faire',    color: '#64748b', bg: '#f1f5f9' },
  { code: 'EC', label: 'En cours',   color: '#0369a1', bg: '#e0f2fe' },
  { code: 'F',  label: 'Fait',       color: '#065f46', bg: '#d1fae5' },
  { code: 'NA', label: 'Non applic.', color: '#7c3aed', bg: '#ede9fe' },
];
const TYPES_MANDAT = [
  { code: 'prelevement', label: 'Prélèvement SEPA' },
  { code: 'impots',      label: 'Fiscal (impôts)' },
  { code: 'urssaf',      label: 'Social (URSSAF)' },
  { code: 'autre',       label: 'Autre mandat' },
];

const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

export default function Onboarding() {
  const { dossierId } = useParams();
  const { user } = useAuth();
  const canEdit = ['expert', 'chef_mission', 'collaborateur'].includes(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { data } = await api.get(`/onboarding/${dossierId}`);
      setData(data);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally { setLoading(false); }
  }, [dossierId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (err) return (
    <div className="page">
      <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 6 }}>
        {err}
      </div>
    </div>
  );
  if (!data) return null;

  const { onboarding, etapes, mandats } = data;
  const nbFait = etapes.filter(e => e.statut === 'F' || e.statut === 'NA').length;
  const pct = etapes.length ? Math.round((nbFait / etapes.length) * 100) : 0;

  // Group étapes by phase
  const etapesParPhase = {};
  for (const e of etapes) {
    (etapesParPhase[e.phase] = etapesParPhase[e.phase] || []).push(e);
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Onboarding</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
              <Link to={`/clients/${onboarding.client_id}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                {onboarding.client_nom}
              </Link>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Dossier #{onboarding.dossier_id} · SIREN {onboarding.client_siren || '—'}
              {onboarding.reprise_confrere ? <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4 }}>reprise confrère</span> : null}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Signature</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(onboarding.date_signature)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Fin cible</div>
            <div style={{ fontWeight: 600 }}>{fmtDate(onboarding.date_fin_cible)}</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            <span>Avancement : {nbFait} / {etapes.length} étape(s)</span>
            <span style={{ fontWeight: 700, color: pct === 100 ? '#065f46' : 'var(--text)' }}>{pct} %</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : '#2563eb', transition: 'width .3s' }} />
          </div>
        </div>
      </div>

      {/* Étapes */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Étapes</span>
          <span className="text-muted text-sm">{etapes.length} étape(s) applicables</span>
        </div>
        {PHASES_ORDRE.map(phase => {
          const list = etapesParPhase[phase];
          if (!list || list.length === 0) return null;
          return (
            <div key={phase}>
              <div style={{
                padding: '10px 16px', background: 'var(--bg-muted, #f6f8fb)',
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: .5, borderTop: '1px solid var(--border)',
              }}>{PHASES_LABEL[phase] || phase}</div>
              <div>
                {list.map(e => (
                  <EtapeRow key={e.id} etape={e} canEdit={canEdit} onChange={load} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mandats en annexes */}
      <MandatsSection
        mandats={mandats}
        onboardingId={onboarding.id}
        etapes={etapes}
        canEdit={canEdit}
        canDelete={['expert', 'chef_mission'].includes(user?.role)}
        onChange={load}
      />
    </div>
  );
}

// ── Ligne d'étape ──────────────────────────────────────────────────────────

function EtapeRow({ etape, canEdit, onChange }) {
  const [saving, setSaving] = useState(false);
  const [naModal, setNaModal] = useState(false);
  const [motifNa, setMotifNa] = useState('');
  const [err, setErr] = useState(null);

  const setStatut = async (statut) => {
    if (statut === 'NA') { setMotifNa(etape.motif_na || ''); setNaModal(true); return; }
    setSaving(true); setErr(null);
    try {
      await api.put(`/onboarding/etapes/${etape.id}`, { statut });
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  const validerNa = async () => {
    if (!motifNa.trim()) { setErr('Motif requis'); return; }
    setSaving(true); setErr(null);
    try {
      await api.put(`/onboarding/etapes/${etape.id}`, { statut: 'NA', motif_na: motifNa });
      setNaModal(false);
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  const stat = STATUTS_ETAPE.find(s => s.code === etape.statut);
  const enRetard = etape.statut !== 'F' && etape.statut !== 'NA' && etape.date_echeance
    && new Date(etape.date_echeance) < new Date();

  return (
    <div style={{
      padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
      borderTop: '1px solid var(--border)',
      opacity: etape.statut === 'NA' ? .6 : 1,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, background: '#e5e7eb', color: '#4b5563',
        padding: '2px 6px', borderRadius: 3, minWidth: 34, textAlign: 'center',
      }}>{etape.code_modele}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{etape.libelle}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {etape.responsable?.replace(/_/g, ' ')} · échéance {fmtDate(etape.date_echeance)}
          {enRetard && <span style={{ marginLeft: 6, color: '#dc2626', fontWeight: 600 }}>· en retard</span>}
          {etape.bloquant ? <span style={{ marginLeft: 6, color: '#b45309' }}>· bloquant</span> : null}
          {etape.statut === 'F' && etape.fait_par_prenom && (
            <span style={{ marginLeft: 6 }}>· fait par {etape.fait_par_prenom} le {fmtDate(etape.fait_le)}</span>
          )}
          {etape.statut === 'NA' && etape.motif_na && (
            <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· NA : {etape.motif_na}</span>
          )}
        </div>
      </div>
      {canEdit ? (
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUTS_ETAPE.map(s => (
            <button
              key={s.code}
              onClick={() => setStatut(s.code)}
              disabled={saving || etape.statut === s.code}
              title={s.label}
              style={{
                fontSize: 11, padding: '4px 8px', borderRadius: 4,
                background: etape.statut === s.code ? s.bg : 'transparent',
                color: etape.statut === s.code ? s.color : 'var(--text-muted)',
                border: `1px solid ${etape.statut === s.code ? s.color : 'var(--border)'}`,
                fontWeight: etape.statut === s.code ? 700 : 500,
                cursor: saving || etape.statut === s.code ? 'default' : 'pointer',
              }}
            >{s.code}</button>
          ))}
        </div>
      ) : (
        <span style={{
          fontSize: 11, padding: '4px 10px', borderRadius: 4,
          background: stat?.bg, color: stat?.color, fontWeight: 600,
        }}>{stat?.label}</span>
      )}
      {err && <div style={{ fontSize: 11, color: '#991b1b' }}>{err}</div>}

      {naModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setNaModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Motif « non applicable »</span>
              <button className="modal-close" onClick={() => setNaModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                Étape {etape.code_modele} — {etape.libelle}
              </div>
              <textarea
                className="form-control"
                rows={3}
                value={motifNa}
                onChange={e => setMotifNa(e.target.value)}
                placeholder="Motif obligatoire (audit trail)"
              />
              {err && <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>{err}</div>}
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setNaModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={validerNa} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Valider'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section mandats ────────────────────────────────────────────────────────

function MandatsSection({ mandats, onboardingId, etapes, canEdit, canDelete, onChange }) {
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ type: 'impots', libelle: '', onboarding_etape_id: '' });
  const [err, setErr] = useState(null);

  const create = async () => {
    setErr(null);
    try {
      await api.post('/mandats', {
        onboarding_id: onboardingId,
        type: newForm.type,
        libelle: newForm.libelle || null,
        onboarding_etape_id: newForm.onboarding_etape_id || null,
      });
      setCreating(false);
      setNewForm({ type: 'impots', libelle: '', onboarding_etape_id: '' });
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mandats — annexes</span>
        <span className="text-muted text-sm">
          {mandats.length} mandat(s)
          {canEdit && !creating && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}
                    style={{ marginLeft: 12, fontSize: 12, padding: '4px 10px' }}>
              + Ajouter
            </button>
          )}
        </span>
      </div>

      {creating && (
        <div style={{ padding: 12, background: 'var(--bg-muted, #f6f8fb)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr auto auto', gap: 8, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Type</label>
              <select value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}
                      style={{ width: '100%', padding: 6, fontSize: 12 }}>
                {TYPES_MANDAT.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Libellé (optionnel)</label>
              <input value={newForm.libelle}
                     onChange={e => setNewForm(f => ({ ...f, libelle: e.target.value }))}
                     style={{ width: '100%', padding: 6, fontSize: 12 }}
                     placeholder="Ex : Mandat plateforme EDI" />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Étape liée (optionnel)</label>
              <select value={newForm.onboarding_etape_id}
                      onChange={e => setNewForm(f => ({ ...f, onboarding_etape_id: e.target.value }))}
                      style={{ width: '100%', padding: 6, fontSize: 12 }}>
                <option value="">— aucune —</option>
                {etapes.filter(e => /mandat/i.test(e.libelle)).map(e => (
                  <option key={e.id} value={e.id}>{e.code_modele} — {e.libelle}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={create}
                    style={{ fontSize: 12, padding: '6px 12px' }}>Créer</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCreating(false); setErr(null); }}
                    style={{ fontSize: 12 }}>Annuler</button>
          </div>
          {err && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 6 }}>{err}</div>}
        </div>
      )}

      {mandats.length === 0 && !creating ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p style={{ fontSize: 13 }}>Aucun mandat rattaché à cet onboarding.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ fontSize: 11, width: 130 }}>Type</th>
                <th style={{ fontSize: 11 }}>Libellé / RUM</th>
                <th style={{ fontSize: 11, width: 160 }}>IBAN</th>
                <th style={{ fontSize: 11, width: 100 }}>Statut</th>
                <th style={{ fontSize: 11, width: 120 }}>Signature</th>
                {canEdit && <th style={{ width: 180 }}></th>}
              </tr>
            </thead>
            <tbody>
              {mandats.map(m => (
                <MandatRow key={m.id} mandat={m} canEdit={canEdit} canDelete={canDelete} onChange={onChange} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MandatRow({ mandat, canEdit, canDelete, onChange }) {
  const [ibanForm, setIbanForm] = useState(false);
  const [iban, setIban] = useState(mandat.iban || '');
  const [bic, setBic] = useState(mandat.bic || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const typeLabel = TYPES_MANDAT.find(t => t.code === mandat.type)?.label || mandat.type;

  const marquerSigne = async () => {
    setSaving(true); setErr(null);
    try {
      await api.put(`/mandats/${mandat.id}`, {
        signe: true,
        date_signature: new Date().toISOString().slice(0, 10),
      });
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  const saveIban = async () => {
    setSaving(true); setErr(null);
    try {
      await api.put(`/mandats/${mandat.id}/rib`, { iban, bic: bic || null });
      setIbanForm(false);
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  const supprimer = async () => {
    if (!window.confirm('Supprimer ce mandat ?')) return;
    setSaving(true); setErr(null);
    try {
      await api.delete(`/mandats/${mandat.id}`);
      onChange();
    } catch (e) { setErr(e?.response?.data?.message || e.message); setSaving(false); }
  };

  return (
    <>
      <tr>
        <td style={{ fontSize: 12, fontWeight: 600 }}>{typeLabel}</td>
        <td style={{ fontSize: 12 }}>
          <div>{mandat.libelle || '—'}</div>
          {mandat.rum && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>RUM : {mandat.rum}</div>}
        </td>
        <td style={{ fontSize: 11, fontFamily: 'monospace' }}>
          {mandat.iban ? (
            <>{mandat.iban.slice(0, 4)}…{mandat.iban.slice(-4)}</>
          ) : mandat.type === 'prelevement' ? (
            <span style={{ color: '#b45309', fontStyle: 'italic' }}>à collecter</span>
          ) : '—'}
        </td>
        <td style={{ fontSize: 11 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 3, fontWeight: 600,
            background: mandat.statut === 'actif' ? '#d1fae5'
                      : mandat.statut === 'en_attente_rib' ? '#fef3c7'
                      : mandat.statut === 'revoque' ? '#fee2e2' : '#f1f5f9',
            color:     mandat.statut === 'actif' ? '#065f46'
                      : mandat.statut === 'en_attente_rib' ? '#92400e'
                      : mandat.statut === 'revoque' ? '#991b1b' : '#4b5563',
          }}>{mandat.statut}</span>
        </td>
        <td style={{ fontSize: 12 }}>
          {mandat.signe ? (
            <span style={{ color: '#065f46', fontWeight: 600 }}>✓ {fmtDate(mandat.date_signature)}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>non signé</span>
          )}
        </td>
        {canEdit && (
          <td>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              {mandat.type === 'prelevement' && !mandat.iban && (
                <button className="btn btn-sm btn-ghost" onClick={() => setIbanForm(v => !v)}
                        style={{ fontSize: 11, padding: '2px 8px' }}>IBAN</button>
              )}
              {!mandat.signe && (
                <button className="btn btn-sm btn-primary" onClick={marquerSigne} disabled={saving}
                        style={{ fontSize: 11, padding: '2px 8px' }}>Signé</button>
              )}
              {canDelete && !mandat.signe && (
                <button className="btn btn-sm btn-ghost" onClick={supprimer} disabled={saving}
                        style={{ fontSize: 11, padding: '2px 8px', color: '#dc2626' }}>🗑</button>
              )}
            </div>
          </td>
        )}
      </tr>
      {ibanForm && (
        <tr>
          <td colSpan={canEdit ? 6 : 5} style={{ padding: 10, background: 'var(--bg-muted, #f6f8fb)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>IBAN</label>
                <input value={iban} onChange={e => setIban(e.target.value.toUpperCase())}
                       style={{ width: '100%', padding: 6, fontSize: 12, fontFamily: 'monospace' }}
                       placeholder="FR76 …" />
              </div>
              <div style={{ width: 140 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>BIC (optionnel)</label>
                <input value={bic} onChange={e => setBic(e.target.value.toUpperCase())}
                       style={{ width: '100%', padding: 6, fontSize: 12, fontFamily: 'monospace' }} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveIban} disabled={saving}
                      style={{ fontSize: 12, padding: '6px 12px' }}>
                {saving ? '…' : 'Valider'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setIbanForm(false)}>Annuler</button>
            </div>
          </td>
        </tr>
      )}
      {err && (
        <tr>
          <td colSpan={canEdit ? 6 : 5} style={{ padding: 6 }}>
            <div style={{ background: '#fee2e2', color: '#991b1b', padding: 6, borderRadius: 4, fontSize: 11 }}>{err}</div>
          </td>
        </tr>
      )}
    </>
  );
}
