import { useState, useEffect } from 'react';
import api from '../services/api';

const URGENCE_COLORS = { normale: '#6b7280', elevee: '#f59e0b', critique: '#ef4444' };
const URGENCE_LABELS = { normale: 'Normale', elevee: 'Élevée', critique: 'Critique' };

function durFmt(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function Appels() {
  const [appels, setAppels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUrgence, setFilterUrgence] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get('/calls/history')
      .then(r => setAppels(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filterUrgence
    ? appels.filter(a => a.urgence === filterUrgence)
    : appels;

  const stats = {
    total: appels.length,
    critique: appels.filter(a => a.urgence === 'critique').length,
    elevee: appels.filter(a => a.urgence === 'elevee').length,
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Historique des appels IA</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Appels analysés par l'assistant vocal Vapi
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total appels', value: stats.total, color: '#6b7280' },
            { label: 'Urgents', value: stats.elevee, color: '#f59e0b' },
            { label: 'Critiques', value: stats.critique, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            className="form-control"
            style={{ width: 180 }}
            value={filterUrgence}
            onChange={e => setFilterUrgence(e.target.value)}
          >
            <option value="">Toutes les urgences</option>
            <option value="normale">Normale</option>
            <option value="elevee">Élevée</option>
            <option value="critique">Critique</option>
          </select>
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Interlocuteur</th>
                  <th>Client</th>
                  <th>Collaborateur</th>
                  <th style={{ width: 70 }}>Durée</th>
                  <th style={{ width: 90 }}>Urgence</th>
                  <th>Résumé IA</th>
                  <th style={{ width: 70 }}>Tâche</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Aucun appel enregistré
                  </td></tr>
                )}
                {filtered.map(a => (
                  <tr
                    key={a.id}
                    onClick={() => setSelected(selected?.id === a.id ? null : a)}
                    style={{ cursor: 'pointer', background: selected?.id === a.id ? '#f0f4ff' : undefined }}
                  >
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {a.cree_le ? new Date(a.cree_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>{a.nom_interlocuteur || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ fontSize: 13 }}>
                      {a.client_nom
                        ? <a href={`/clients/${a.client_id}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)' }}>{a.client_nom}</a>
                        : (a.prospect_nom || <span style={{ color: 'var(--text-muted)' }}>—</span>)
                      }
                    </td>
                    <td style={{ fontSize: 12 }}>{a.collaborateur_nom || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{durFmt(a.duration_seconds)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: URGENCE_COLORS[a.urgence] + '18', color: URGENCE_COLORS[a.urgence],
                        border: `1px solid ${URGENCE_COLORS[a.urgence]}40`,
                      }}>
                        {URGENCE_LABELS[a.urgence] || a.urgence}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 300 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.resume_ia || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {a.task_id
                        ? <a href="/taches" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--accent)' }}>#{a.task_id}</a>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transcript panel */}
        {selected && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <span className="card-title">Détail de l'appel</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕ Fermer</button>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { label: 'Interlocuteur', value: selected.nom_interlocuteur || '—' },
                  { label: 'Client', value: selected.client_nom || selected.prospect_nom || '—' },
                  { label: 'Durée', value: durFmt(selected.duration_seconds) },
                  { label: 'Collaborateur demandé', value: selected.nom_collaborateur || '—' },
                  { label: 'Urgence', value: URGENCE_LABELS[selected.urgence] || selected.urgence },
                  { label: 'Direction', value: selected.direction === 'entrant' ? '📞 Entrant' : '📤 Sortant' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>

              {selected.resume_ia && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Résumé IA</div>
                  <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }}>
                    {selected.resume_ia}
                  </div>
                </div>
              )}

              {selected.transcript && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Transcription</div>
                  <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 14px', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' }}>
                    {selected.transcript}
                  </div>
                </div>
              )}

              {selected.recording_url && (
                <div style={{ marginTop: 12 }}>
                  <a href={selected.recording_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    🎙️ Écouter l'enregistrement
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
