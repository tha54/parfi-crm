import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import TaskBudgetBar from './TaskBudgetBar';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtMin = (min) => {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

const fmtElapsed = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
};

const fmtDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const todayISO = () => new Date().toISOString().split('T')[0];

// ─── Shared style tokens ──────────────────────────────────────────────────────

const boxStyle = {
  background: '#f8f9fb', borderRadius: 8, padding: '12px 14px',
  border: '1px solid var(--border)',
};

const labelStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: 4,
};

const taStyle = {
  width: '100%', padding: '8px 10px', fontSize: 12, lineHeight: 1.5,
  border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 52,
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskTimePanel({ tache }) {
  const [data, setData]         = useState({ entries: [], budget: null, activeTimer: null });
  const [loading, setLoading]   = useState(true);
  const [elapsed, setElapsed]   = useState(0);
  const [stopping, setStopping] = useState(false);
  const [stopComment, setStopComment] = useState('');
  const [showManual, setShowManual]   = useState(false);
  const [manual, setManual] = useState({ hours: '', minutes: '', comment: '', date: todayISO() });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const intervalRef = useRef(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/tache-temps/tache/${tache.id}`);
      setData(d);
    } catch {
      setData({ entries: [], budget: null, activeTimer: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [tache.id]);

  // Live clock for active timer
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (data.activeTimer) {
      const start = new Date(data.activeTimer.debut).getTime();
      const tick  = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [data.activeTimer]);

  const { entries, budget, activeTimer } = data;
  const budgetExceeded = budget && budget.percent >= 100;

  // ── Timer actions ──

  const handleStart = async () => {
    setError('');
    try {
      await api.post(`/tache-temps/tache/${tache.id}/start`);
      loadData();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    }
  };

  const handleStop = async () => {
    setError('');
    if (budgetExceeded && !stopComment.trim()) {
      setError('Un commentaire est obligatoire lorsque le budget est dépassé.');
      return;
    }
    setSubmitting(true);
    try {
      await api.put(`/tache-temps/${activeTimer.id}/stop`, { commentaire: stopComment });
      setStopping(false);
      setStopComment('');
      loadData();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Manual entry ──

  const handleManual = async (e) => {
    e.preventDefault();
    setError('');
    const h = parseInt(manual.hours  || '0', 10);
    const m = parseInt(manual.minutes || '0', 10);
    const total = h * 60 + m;
    if (total <= 0) { setError('Durée invalide (minimum 1 minute)'); return; }
    if (budgetExceeded && !manual.comment.trim()) {
      setError('Un commentaire est obligatoire lorsque le budget est dépassé.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/tache-temps/tache/${tache.id}`, {
        duree_minutes: total,
        commentaire:   manual.comment.trim() || null,
        date:          manual.date || todayISO(),
      });
      setShowManual(false);
      setManual({ hours: '', minutes: '', comment: '', date: todayISO() });
      loadData();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette saisie ?')) return;
    try {
      await api.delete(`/tache-temps/${id}`);
      loadData();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Budget bar */}
      {budget && (
        <div style={boxStyle}>
          <TaskBudgetBar budgetMinutes={budget.budgetMinutes} consumedMinutes={budget.consumedMinutes} />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ padding: '8px 12px', background: '#ffebee', color: '#d63031', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── Chronomètre ── */}
      <div style={boxStyle}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 12 }}>
          ⏱ Chronomètre
        </div>

        {activeTimer ? (
          <>
            <div style={{
              fontFamily: 'monospace', fontSize: 32, fontWeight: 800, textAlign: 'center',
              color: '#0F1F4B', letterSpacing: 4, marginBottom: 6,
            }}>
              {fmtElapsed(elapsed)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>
              Démarré le {fmtDateTime(activeTimer.debut)}
            </div>

            {!stopping ? (
              <button
                className="btn btn-danger"
                style={{ width: '100%' }}
                onClick={() => { setStopping(true); setError(''); }}
              >
                ⏹ Arrêter le chronomètre
              </button>
            ) : (
              <div>
                <label style={labelStyle}>
                  Commentaire {budgetExceeded && <span style={{ color: '#d63031' }}>* obligatoire</span>}
                </label>
                <textarea
                  value={stopComment}
                  onChange={e => setStopComment(e.target.value)}
                  placeholder={budgetExceeded ? 'Obligatoire (budget dépassé)…' : 'Optionnel…'}
                  rows={2}
                  style={taStyle}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => { setStopping(false); setStopComment(''); setError(''); }}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    onClick={handleStop}
                    disabled={submitting}
                  >
                    {submitting ? 'Arrêt…' : '✓ Confirmer l\'arrêt'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleStart}
          >
            ▶ Démarrer le chronomètre
          </button>
        )}
      </div>

      {/* ── Saisie manuelle ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showManual ? 10 : 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B' }}>✏ Saisie manuelle</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowManual(v => !v); setError(''); }}
          >
            {showManual ? '✕ Fermer' : '+ Ajouter'}
          </button>
        </div>

        {showManual && (
          <form onSubmit={handleManual} style={{ ...boxStyle, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Heures</label>
                <input
                  type="number" min="0" max="23" placeholder="0"
                  className="form-control"
                  value={manual.hours}
                  onChange={e => setManual(f => ({ ...f, hours: e.target.value }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Minutes</label>
                <input
                  type="number" min="0" max="59" placeholder="30"
                  className="form-control"
                  value={manual.minutes}
                  onChange={e => setManual(f => ({ ...f, minutes: e.target.value }))}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={manual.date}
                  onChange={e => setManual(f => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>
                Commentaire {budgetExceeded && <span style={{ color: '#d63031' }}>* obligatoire</span>}
              </label>
              <textarea
                value={manual.comment}
                onChange={e => setManual(f => ({ ...f, comment: e.target.value }))}
                placeholder={budgetExceeded ? 'Obligatoire (budget dépassé)…' : 'Optionnel…'}
                rows={2}
                style={taStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ flex: 1 }}
                onClick={() => { setShowManual(false); setError(''); }}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ flex: 2 }}
                disabled={submitting}
              >
                {submitting ? 'Enregistrement…' : '+ Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Historique ── */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 10 }}>
          Historique
          {entries.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
              · {entries.length} saisie(s) · total {fmtMin(entries.filter(e => e.duree_minutes).reduce((s, e) => s + e.duree_minutes, 0))}
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Aucune saisie de temps pour cette tâche.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map(e => {
              const isActive = e.fin === null;
              return (
                <div key={e.id} style={{
                  ...boxStyle, padding: '8px 12px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  borderLeft: `3px solid ${isActive ? '#00B4D8' : '#00897b'}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: isActive ? '#00B4D8' : '#00897b',
                    color: '#fff', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, fontWeight: 700,
                  }}>
                    {isActive ? '⏱' : '✓'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1F4B' }}>
                        {isActive ? '⏱ En cours…' : fmtMin(e.duree_minutes)}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {e.type === 'chrono' ? 'Chrono' : 'Manuel'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {e.prenom} {e.user_nom} · {fmtDate(e.debut)}
                      {e.fin && ` → ${fmtDate(e.fin)}`}
                    </div>
                    {e.commentaire && (
                      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, fontStyle: 'italic', background: '#fff', padding: '4px 8px', borderRadius: 4 }}>
                        {e.commentaire}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(e.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                    title="Supprimer cette saisie"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
