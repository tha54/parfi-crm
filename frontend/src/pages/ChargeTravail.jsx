import { useState, useEffect } from 'react';
import api from '../services/api';

const CAP_HEBDO = 35;

function getWeekBounds(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function fmtDate(d) { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); }
function initials(u) { return `${u.prenom?.[0]||''}${u.nom?.[0]||''}`.toUpperCase(); }

function CapBar({ heures, cap = CAP_HEBDO }) {
  const pct = cap > 0 ? Math.min(130, (heures / cap) * 100) : 0;
  const color = pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981';
  const label = pct > 100 ? 'Surchargé' : pct > 80 ? 'Proche limite' : 'OK';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#6b7c93' }}>
        <span>{heures.toFixed(1)}h / {cap}h</span>
        <span style={{ color, fontWeight: 700 }}>{Math.round(pct)}% — {label}</span>
      </div>
      <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 5, transition: 'width 0.3s ease' }} />
        <div style={{ position: 'absolute', left: `${(80/130)*100}%`, top: 0, width: 1, height: '100%', background: 'rgba(0,0,0,.15)' }} />
        <div style={{ position: 'absolute', left: `${(100/130)*100}%`, top: 0, width: 2, height: '100%', background: 'rgba(0,0,0,.3)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
        <span>0</span><span>80%</span><span>100%</span>
      </div>
    </div>
  );
}

function TacheCard({ tache, dragging, onDragStart, onDragEnd }) {
  const PRIO_COLORS = { urgente: '#ef4444', haute: '#f59e0b', normale: '#3b82f6', basse: '#9ca3af' };
  const color = PRIO_COLORS[tache.priorite] || '#9ca3af';
  const isRetard = tache.date_echeance && new Date(tache.date_echeance) < new Date() && tache.statut !== 'termine';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: '#fff',
        border: `1px solid ${isRetard ? '#fecaca' : '#e5e7eb'}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        padding: '7px 10px',
        marginBottom: 6,
        cursor: 'grab',
        opacity: dragging ? 0.4 : 1,
        userSelect: 'none',
        boxShadow: dragging ? 'none' : '0 1px 2px rgba(0,0,0,.05)',
        background: isRetard ? '#fef2f2' : '#fff',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f1f4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tache.description || tache.titre}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: '#6b7c93' }}>{tache.client_nom || '—'}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color }}>{tache.priorite}</span>
          <span style={{ fontSize: 10, color: isRetard ? '#ef4444' : '#6b7c93', fontWeight: isRetard ? 700 : 400 }}>
            {isRetard ? '⚠ Retard' : tache.date_echeance ? fmtDate(tache.date_echeance) : ''}
          </span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>{tache.duree}h</span>
        </div>
      </div>
    </div>
  );
}

function UserColumn({ user, taches, draggingId, dragOverId, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave }) {
  const heures = taches.reduce((s, t) => s + parseFloat(t.duree || 0), 0);
  const pct = CAP_HEBDO > 0 ? Math.min(130, (heures / CAP_HEBDO) * 100) : 0;
  const borderColor = pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981';
  const isDragOver = dragOverId === user.id;

  return (
    <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,.07)', borderTop: `3px solid ${borderColor}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0f1f4b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
            {initials(user)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f4b' }}>{user.prenom} {user.nom}</div>
            <div style={{ fontSize: 11, color: '#6b7c93' }}>{user.role?.replace(/_/g, ' ')}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: borderColor }}>{taches.length}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>tâches</div>
          </div>
        </div>
        <CapBar heures={heures} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
        style={{
          flex: 1,
          minHeight: 200,
          padding: 8,
          borderRadius: 8,
          background: isDragOver ? '#eff6ff' : 'transparent',
          border: isDragOver ? '2px dashed #3b82f6' : '2px dashed transparent',
          transition: 'all 0.15s ease',
        }}
      >
        {taches.length === 0 && !isDragOver && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 12 }}>
            Glissez des tâches ici
          </div>
        )}
        {taches.map(t => (
          <TacheCard
            key={t.id}
            tache={t}
            dragging={draggingId === t.id}
            onDragStart={(e) => onDragStart(e, t.id)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChargeTravail() {
  const [users, setUsers] = useState([]);
  const [taches, setTaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverUser, setDragOverUser] = useState(null);
  const [view, setView] = useState('kanban'); // kanban | table

  const { mon, sun } = getWeekBounds(weekOffset);

  useEffect(() => {
    Promise.all([
      api.get('/utilisateurs'),
      api.get('/taches'),
    ]).then(([uRes, tRes]) => {
      setUsers((uRes.data || []).filter(u => u.actif));
      setTaches(tRes.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const tachesParUser = (userId) => taches.filter(t =>
    String(t.utilisateur_id) === String(userId) &&
    t.statut !== 'termine' &&
    t.date_echeance &&
    new Date(t.date_echeance) >= mon &&
    new Date(t.date_echeance) <= sun
  );

  const tachesSansDate = taches.filter(t => !t.date_echeance && t.statut !== 'termine');

  const handleDragStart = (e, tacheId) => {
    setDraggingId(tacheId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, targetUserId) => {
    e.preventDefault();
    if (!draggingId) return;
    const tache = taches.find(t => t.id === draggingId);
    if (!tache || String(tache.utilisateur_id) === String(targetUserId)) {
      setDraggingId(null); setDragOverUser(null); return;
    }
    // Optimistic update
    setTaches(prev => prev.map(t => t.id === draggingId ? { ...t, utilisateur_id: targetUserId } : t));
    setDraggingId(null); setDragOverUser(null);
    try {
      await api.put(`/taches/${draggingId}`, { utilisateur_id: targetUserId });
    } catch {
      // rollback
      setTaches(prev => prev.map(t => t.id === draggingId ? { ...t, utilisateur_id: tache.utilisateur_id } : t));
    }
  };

  const totalTachesRetard = taches.filter(t => t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) < new Date()).length;

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Charge de travail</h1>
          <p style={{ color: '#6b7c93', fontSize: 13, margin: '2px 0 0' }}>
            {weekOffset === 0 ? 'Semaine courante' : weekOffset < 0 ? `${Math.abs(weekOffset)} semaine${Math.abs(weekOffset)>1?'s':''} passée${Math.abs(weekOffset)>1?'s':''}` : `${weekOffset} semaine${weekOffset>1?'s':''} à venir`}
            {' '}· {fmtDate(mon)} → {fmtDate(sun)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {totalTachesRetard > 0 && (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: '#fef2f2', color: '#ef4444', fontWeight: 700 }}>
              ⚠ {totalTachesRetard} tâche(s) en retard
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(o => o - 1)}>← Préc.</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>Aujourd'hui</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setWeekOffset(o => o + 1)}>Suiv. →</button>
          <button
            className={`btn btn-sm ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('kanban')}
          >⊞ Kanban</button>
          <button
            className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setView('table')}
          >≡ Tableau</button>
        </div>
      </div>

      <div className="page-body">
        {/* KPI summary */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'Collaborateurs', value: users.length, color: '#0f1f4b' },
            { label: 'Tâches cette semaine', value: taches.filter(t => t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) >= mon && new Date(t.date_echeance) <= sun).length, color: '#00b4d8' },
            { label: 'En retard', value: totalTachesRetard, color: '#ef4444' },
            { label: 'Sans date', value: tachesSansDate.length, color: '#f59e0b' },
          ].map(k => (
            <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
              <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
              <div className="kpi-label">{k.label}</div>
            </div>
          ))}
        </div>

        {view === 'kanban' ? (
          <>
            {/* Kanban view with drag & drop */}
            <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, minWidth: 'max-content', alignItems: 'flex-start' }}>
                {users.map(u => (
                  <UserColumn
                    key={u.id}
                    user={u}
                    taches={tachesParUser(u.id)}
                    draggingId={draggingId}
                    dragOverId={dragOverUser}
                    onDragStart={handleDragStart}
                    onDragEnd={() => { setDraggingId(null); setDragOverUser(null); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverUser(u.id); }}
                    onDrop={(e) => handleDrop(e, u.id)}
                    onDragLeave={() => setDragOverUser(null)}
                  />
                ))}
                {users.length === 0 && (
                  <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                    Aucun collaborateur actif
                  </div>
                )}
              </div>
            </div>

            {tachesSansDate.length > 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h3 className="card-title">Tâches sans date ({tachesSansDate.length})</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tachesSansDate.map(t => (
                    <div key={t.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                      <strong>{t.description || t.titre}</strong>
                      <span style={{ color: '#6b7c93', marginLeft: 8 }}>{t.duree}h</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Table view */
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Collaborateur</th>
                    <th>Tâches (semaine)</th>
                    <th>Heures prévues</th>
                    <th>Capacité</th>
                    <th>Statut charge</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const ut = tachesParUser(u.id);
                    const heures = ut.reduce((s, t) => s + parseFloat(t.duree || 0), 0);
                    const pct = (heures / CAP_HEBDO) * 100;
                    const color = pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981';
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#0f1f4b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                              {initials(u)}
                            </div>
                            <span style={{ fontWeight: 500 }}>{u.prenom} {u.nom}</span>
                          </div>
                        </td>
                        <td>{ut.length}</td>
                        <td><strong>{heures.toFixed(1)}h</strong></td>
                        <td>
                          <div style={{ width: 140 }}>
                            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: color + '22', color, fontWeight: 700 }}>
                            {pct > 100 ? '🔴 Surchargé' : pct > 80 ? '🟡 Saturé' : '🟢 OK'}
                          </span>
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
    </>
  );
}
