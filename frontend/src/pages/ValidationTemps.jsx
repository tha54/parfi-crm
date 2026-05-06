import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(m) {
  if (!m && m !== 0) return '—';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h === 0) return `${mn}min`;
  if (mn === 0) return `${h}h`;
  return `${h}h${String(mn).padStart(2, '0')}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(String(d).split('T')[0] + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function fmtDateLong(d) {
  if (!d) return '—';
  return new Date(String(d).split('T')[0] + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function semaineLabel(debut) {
  const mon = new Date(debut + 'T12:00:00');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const wk = getISOWeek(debut);
  const d1 = mon.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const d2 = sun.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `S${wk} · ${d1} – ${d2}`;
}

const STATUT_CONFIG = {
  brouillon: { label: 'Brouillon', color: '#0369a1', bg: '#e0f2fe' },
  figee:     { label: 'Figée',     color: '#7c3aed', bg: '#ede9fe' },
  validee:   { label: 'Validée',   color: '#15803d', bg: '#dcfce7' },
  rejetee:   { label: 'Rejetée',   color: '#be123c', bg: '#ffe4e6' },
};

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({ entry, onConfirm, onClose }) {
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!motif.trim()) return;
    setSaving(true);
    await onConfirm(entry.id, motif.trim());
    setSaving(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 299 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: '#fff', borderRadius: 12, padding: 24, width: 400, zIndex: 300,
        boxShadow: '0 8px 32px rgba(0,0,0,.2)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#0F1F4B' }}>
          Rejeter la saisie
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          {entry.tache_titre} · {fmtDate(entry.date_travail)} · {fmtMin(entry.duree_minutes)}
        </div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>
          Motif du rejet <span style={{ color: '#d63031' }}>*</span>
        </label>
        <textarea
          value={motif}
          onChange={e => setMotif(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Expliquer pourquoi cette saisie est rejetée…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-danger" style={{ flex: 2 }} onClick={submit} disabled={saving || !motif.trim()}>
            {saving ? 'Rejet…' : '✗ Rejeter'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onValidateAll, onValidate, onReject }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ marginBottom: 12, padding: 0 }}>
      {/* Header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: '#0F1F4B', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
          }}>
            {group.collab.prenom?.[0]}{group.collab.nom?.[0]}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0F1F4B' }}>
              {group.collab.prenom} {group.collab.nom}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {semaineLabel(group.semaine_debut)} · {fmtMin(group.total_minutes)} · {group.entries.length} saisie(s)
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={e => { e.stopPropagation(); onValidateAll(group); }}
          >
            ✓ Tout valider
          </button>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Entries */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {group.entries.map(e => {
            const sc = STATUT_CONFIG[e.statut] || STATUT_CONFIG.brouillon;
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0F1F4B' }}>
                      {fmtMin(e.duree_minutes)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: sc.bg, color: sc.color,
                    }}>
                      {sc.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {fmtDateLong(e.date_travail)}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                    {e.tache_titre}
                    {e.client_nom && <span style={{ color: 'var(--text-muted)' }}> · {e.client_nom}</span>}
                  </div>
                  {e.commentaire && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                      {e.commentaire}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: 12 }}
                    onClick={() => onValidate(e.id)}
                  >
                    ✓
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3', fontSize: 12 }}
                    onClick={() => onReject(e)}
                  >
                    ✗
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ValidationTemps() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rejectEntry, setRejectEntry] = useState(null);
  const [filterCollab, setFilterCollab] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tache-temps/a-valider');
      setGroups(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleValidate = async (id) => {
    try {
      await api.post(`/tache-temps/${id}/valider`);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    }
  };

  const handleValidateAll = async (group) => {
    const ids = group.entries.map(e => e.id);
    try {
      await api.post('/tache-temps/valider-lot', { ids });
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    }
  };

  const handleReject = async (id, motif) => {
    try {
      await api.post(`/tache-temps/${id}/rejeter`, { motif });
      setRejectEntry(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    }
  };

  const collabs = [...new Set(groups.map(g => `${g.collab.prenom} ${g.collab.nom}`))];

  const filteredGroups = filterCollab
    ? groups.filter(g => `${g.collab.prenom} ${g.collab.nom}` === filterCollab)
    : groups;

  const totalSaisies = groups.reduce((s, g) => s + g.entries.length, 0);
  const totalMinutes = groups.reduce((s, g) => s + g.total_minutes, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">✅ Validation des temps</h1>
          <p className="page-subtitle">
            {loading ? 'Chargement…' : `${totalSaisies} saisie(s) en attente · ${fmtMin(totalMinutes)} total`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-control" style={{ width: 200 }} value={filterCollab} onChange={e => setFilterCollab(e.target.value)}>
            <option value="">Tous les collaborateurs</option>
            {collabs.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load}>↺ Actualiser</button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '0 0 12px', padding: '8px 14px', background: '#ffebee', color: '#d63031', borderRadius: 8, fontSize: 13 }}>
          {error} <button style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#d63031' }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div className="spinner"><div className="spinner-ring" /></div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F1F4B', marginBottom: 8 }}>
            Tout est à jour !
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Aucune saisie en attente de validation.
          </div>
        </div>
      ) : (
        filteredGroups.map((group, i) => (
          <GroupCard
            key={`${group.collab.id}_${group.semaine_debut}`}
            group={group}
            onValidate={handleValidate}
            onValidateAll={handleValidateAll}
            onReject={setRejectEntry}
          />
        ))
      )}

      {rejectEntry && (
        <RejectModal
          entry={rejectEntry}
          onConfirm={handleReject}
          onClose={() => setRejectEntry(null)}
        />
      )}
    </div>
  );
}
