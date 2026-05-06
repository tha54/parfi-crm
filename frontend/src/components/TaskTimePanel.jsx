import { useState, useEffect, useRef, useCallback } from 'react';
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

const fmtDate = (d) => d ? new Date(String(d).split('T')[0] + 'T12:00:00').toLocaleDateString('fr-FR') : '—';
const todayISO = () => new Date().toISOString().split('T')[0];

const STATUT_COLORS = {
  brouillon: { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  figee:     { bg: '#faf5ff', border: '#e9d5ff', text: '#7c3aed' },
  validee:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  rejetee:   { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
};
const STATUT_LABEL = { brouillon: 'Brouillon', figee: 'Figée', validee: 'Validée', rejetee: 'Rejetée' };
const SOURCE_LABEL = { chrono: 'Chrono', feuille_temps: 'Feuille', correction: 'Correction' };

const boxStyle = {
  background: '#f8f9fb', borderRadius: 8, padding: '12px 14px',
  border: '1px solid var(--border)',
};
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };
const taStyle = {
  width: '100%', padding: '8px 10px', fontSize: 12, lineHeight: 1.5,
  border: '1px solid var(--border)', borderRadius: 6, resize: 'vertical',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 52,
};

// ─── Chrono helpers ───────────────────────────────────────────────────────────

function getChronoState(tacheId) {
  const storedId = localStorage.getItem('chrono_task_id');
  const start    = parseInt(localStorage.getItem('chrono_start') || '0', 10);
  if (storedId === String(tacheId) && start > 0) return { active: true, start };
  return { active: false, start: 0 };
}

function minsToHM(mins) {
  return { hours: String(Math.floor(mins / 60)), minutes: String(mins % 60) };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskTimePanel({ tache }) {
  const [data, setData]         = useState({ entries: [], budget: null });
  const [loading, setLoading]   = useState(true);
  const [chrono, setChrono]     = useState(() => getChronoState(tache.id));
  const [elapsed, setElapsed]   = useState(0);
  const [showModal, setShowModal]   = useState(false);
  const [modalSource, setModalSource] = useState('chrono');
  const [manual, setManual] = useState({ hours: '', minutes: '', comment: '', date: todayISO() });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const intervalRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/tache-temps/tache/${tache.id}`);
      setData(d);
    } catch {
      setData({ entries: [], budget: null });
    } finally {
      setLoading(false);
    }
  }, [tache.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Live chrono tick
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (chrono.active && chrono.start > 0) {
      const tick = () => setElapsed(Math.floor((Date.now() - chrono.start) / 1000));
      tick();
      intervalRef.current = setInterval(tick, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [chrono]);

  const { entries, budget } = data;

  // ── Chrono ──

  const handleStart = () => {
    // Warn if another task has active chrono
    const existingId = localStorage.getItem('chrono_task_id');
    if (existingId && existingId !== String(tache.id)) {
      if (!confirm('Un chronomètre est en cours sur une autre tâche. Voulez-vous le remplacer ?')) return;
    }
    const start = Date.now();
    localStorage.setItem('chrono_task_id', String(tache.id));
    localStorage.setItem('chrono_start', String(start));
    setChrono({ active: true, start });
    setError('');
  };

  const handleStop = () => {
    const start = parseInt(localStorage.getItem('chrono_start') || '0', 10);
    const durationMs = Date.now() - start;
    const durationMin = Math.max(1, Math.round(durationMs / 60000));
    localStorage.removeItem('chrono_task_id');
    localStorage.removeItem('chrono_start');
    setChrono({ active: false, start: 0 });
    clearInterval(intervalRef.current);
    const hm = minsToHM(durationMin);
    setManual({ hours: hm.hours, minutes: hm.minutes, comment: '', date: todayISO() });
    setModalSource('chrono');
    setShowModal(true);
  };

  // ── Submit (chrono stop or manual) ──

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const h = parseInt(manual.hours  || '0', 10);
    const m = parseInt(manual.minutes || '0', 10);
    const total = h * 60 + m;
    if (total <= 0) { setError('Durée invalide (minimum 1 minute)'); return; }
    setSubmitting(true);
    try {
      await api.post(`/tache-temps/tache/${tache.id}`, {
        duree_minutes: total,
        commentaire:   manual.comment.trim() || null,
        date_travail:  manual.date || todayISO(),
        source:        modalSource,
      });
      setShowModal(false);
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

      {error && (
        <div style={{ padding: '8px 12px', background: '#ffebee', color: '#d63031', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── Chronomètre ── */}
      <div style={boxStyle}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 12 }}>⏱ Chronomètre</div>

        {chrono.active ? (
          <>
            <div style={{
              fontFamily: 'monospace', fontSize: 32, fontWeight: 800, textAlign: 'center',
              color: '#0F1F4B', letterSpacing: 4, marginBottom: 6,
            }}>
              {fmtElapsed(elapsed)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 14 }}>
              En cours…
            </div>
            <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleStop}>
              ⏹ Arrêter et saisir
            </button>
          </>
        ) : (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleStart}>
            ▶ Démarrer le chronomètre
          </button>
        )}
      </div>

      {/* ── Saisie manuelle ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showModal && modalSource === 'feuille_temps' ? 10 : 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B' }}>✏ Saisie manuelle</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (showModal && modalSource === 'feuille_temps') {
                setShowModal(false);
              } else {
                setManual({ hours: '', minutes: '', comment: '', date: todayISO() });
                setModalSource('feuille_temps');
                setShowModal(true);
              }
              setError('');
            }}
          >
            {showModal && modalSource === 'feuille_temps' ? '✕ Fermer' : '+ Ajouter'}
          </button>
        </div>
      </div>

      {/* ── Entry form (modal / stop / manual) ── */}
      {showModal && (
        <form onSubmit={handleSubmit} style={{ ...boxStyle, background: '#fff', border: '1px solid #c7d2fe' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#4338ca', marginBottom: 10 }}>
            {modalSource === 'chrono' ? '⏱ Saisie chrono' : '✏ Saisie manuelle'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Heures</label>
              <input type="number" min="0" max="23" placeholder="0" className="form-control"
                value={manual.hours} onChange={e => setManual(f => ({ ...f, hours: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Minutes</label>
              <input type="number" min="0" max="59" placeholder="30" className="form-control"
                value={manual.minutes} onChange={e => setManual(f => ({ ...f, minutes: e.target.value }))} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" className="form-control"
                value={manual.date} onChange={e => setManual(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Commentaire</label>
            <textarea value={manual.comment} rows={2} style={taStyle} placeholder="Optionnel…"
              onChange={e => setManual(f => ({ ...f, comment: e.target.value }))} />
          </div>
          {error && <div style={{ fontSize: 12, color: '#d63031', marginBottom: 8, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }}
              onClick={() => { setShowModal(false); setError(''); }}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 2 }} disabled={submitting}>
              {submitting ? 'Enregistrement…' : '✓ Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {/* ── Historique ── */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 10 }}>
          Historique
          {entries.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
              · {entries.length} saisie(s) · {fmtMin(entries.filter(e => e.statut !== 'rejetee').reduce((s, e) => s + (e.duree_minutes || 0), 0))}
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
              const sc = STATUT_COLORS[e.statut] || STATUT_COLORS.brouillon;
              return (
                <div key={e.id} style={{
                  ...boxStyle, padding: '8px 12px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  borderLeft: `3px solid ${sc.border}`,
                  background: sc.bg,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0F1F4B' }}>
                        {fmtMin(e.duree_minutes)}
                      </span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                          background: sc.border, color: sc.text,
                        }}>
                          {STATUT_LABEL[e.statut] || e.statut}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {SOURCE_LABEL[e.source] || e.source}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {e.prenom} {e.user_nom} · {fmtDate(e.date_travail)}
                    </div>
                    {e.commentaire && (
                      <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4, fontStyle: 'italic', background: '#fff', padding: '4px 8px', borderRadius: 4 }}>
                        {e.commentaire}
                      </div>
                    )}
                    {e.statut === 'rejetee' && e.motif_rejet && (
                      <div style={{ fontSize: 11, color: '#be123c', marginTop: 4, background: '#fff1f2', padding: '4px 8px', borderRadius: 4 }}>
                        ✗ {e.motif_rejet}
                      </div>
                    )}
                  </div>
                  {e.statut === 'brouillon' && (
                    <button onClick={() => handleDelete(e.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
                      title="Supprimer cette saisie">×</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
