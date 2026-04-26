import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIORITE_COLORS = { urgente: '#ef4444', haute: '#f59e0b', normale: '#3b82f6', basse: '#9ca3af' };
const STATUT_NEXT = { a_faire: 'en_cours', en_cours: 'termine' };
const STATUT_LABELS = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé' };

function TacheRow({ tache, onUpdate, today }) {
  const [loading, setLoading] = useState(false);
  const isLate = tache.date_echeance < today && tache.statut !== 'termine';

  const advance = async () => {
    if (!STATUT_NEXT[tache.statut]) return;
    setLoading(true);
    await api.put(`/briefing/taches/${tache.id}`, { statut: STATUT_NEXT[tache.statut] }).catch(() => {});
    setLoading(false);
    onUpdate();
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px',
      background: isLate ? '#fef2f2' : tache.statut === 'termine' ? '#f9fafb' : '#fff',
      borderRadius: 8, marginBottom: 8,
      borderLeft: `4px solid ${isLate ? '#ef4444' : PRIORITE_COLORS[tache.priorite] || '#3b82f6'}`,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      opacity: tache.statut === 'termine' ? 0.6 : 1,
    }}>
      <button onClick={advance} disabled={loading || tache.statut === 'termine'} style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${PRIORITE_COLORS[tache.priorite] || '#3b82f6'}`,
        background: tache.statut === 'termine' ? PRIORITE_COLORS[tache.priorite] || '#3b82f6' : 'transparent',
        cursor: tache.statut === 'termine' ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {tache.statut === 'termine' && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
        {tache.statut === 'en_cours' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITE_COLORS[tache.priorite] }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13, textDecoration: tache.statut === 'termine' ? 'line-through' : 'none' }}>
          {isLate && '⚠️ '}{tache.titre}
        </div>
        <div style={{ fontSize: 11, color: '#6b7c93', display: 'flex', gap: 8 }}>
          {tache.client_nom && <span>{tache.client_nom}</span>}
          {tache.duree && <span>· {tache.duree}h</span>}
          {tache.date_echeance && <span style={{ color: isLate ? '#ef4444' : '#6b7c93' }}>
            · {new Date(tache.date_echeance).toLocaleDateString('fr-FR')}
          </span>}
        </div>
      </div>
      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4,
        background: PRIORITE_COLORS[tache.priorite] + '22', color: PRIORITE_COLORS[tache.priorite] }}>
        {tache.statut !== 'a_faire' ? STATUT_LABELS[tache.statut] : tache.priorite}
      </span>
    </div>
  );
}

export default function MorningBriefing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => api.get('/briefing').then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const today = data?.date || new Date().toISOString().substring(0,10);
  const taches = data?.tachesAujourdhui || [];
  const retard = taches.filter(t => t.date_echeance < today);
  const duJour = taches.filter(t => t.date_echeance === today);
  const sem = data?.semaine || {};
  const mois = data?.mois || {};

  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Bonjour, {user?.prenom} 👋</h1>
          <div style={{ color: '#6b7c93', fontSize: 13, marginTop: 2, textTransform: 'capitalize' }}>{dateStr}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>→ Tableau de bord</button>
      </div>

      <div className="page-body">
        {/* Phrase IA */}
        {data?.phraseIA && (
          <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #0f1f4b, #00b4d8)', borderRadius: 12, marginBottom: 24, color: '#fff' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', opacity: 0.7, marginBottom: 6, textTransform: 'uppercase' }}>✨ IA — Priorité du jour</div>
            <div style={{ fontSize: 15, fontStyle: 'italic', lineHeight: 1.6 }}>{data.phraseIA}</div>
          </div>
        )}

        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card" style={{ borderTop: '3px solid #ef4444' }}>
            <div><div className="kpi-value" style={{ color: '#ef4444' }}>{retard.length}</div><div className="kpi-label">En retard</div></div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #3b82f6' }}>
            <div><div className="kpi-value" style={{ color: '#3b82f6' }}>{duJour.length}</div><div className="kpi-label">Aujourd'hui</div></div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #f59e0b' }}>
            <div><div className="kpi-value" style={{ color: '#f59e0b' }}>{sem.total || 0}</div><div className="kpi-label">Cette semaine</div></div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #10b981' }}>
            <div><div className="kpi-value" style={{ color: '#10b981' }}>{mois.taux_completion || 0}%</div><div className="kpi-label">Completion mois</div></div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #0f1f4b' }}>
            <div><div className="kpi-value" style={{ color: '#0f1f4b' }}>{data?.missions_actives || 0}</div><div className="kpi-label">Missions actives</div></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Tâches du jour */}
          <div>
            {retard.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ En retard ({retard.length})
                </div>
                {retard.map(t => <TacheRow key={t.id} tache={t} onUpdate={load} today={today} />)}
              </div>
            )}

            <div>
              <div style={{ fontWeight: 700, color: '#0f1f4b', marginBottom: 10, fontSize: 13 }}>
                📋 Aujourd'hui ({duJour.length})
              </div>
              {duJour.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  🎉 Aucune tâche prévue aujourd'hui
                </div>
              ) : (
                duJour.map(t => <TacheRow key={t.id} tache={t} onUpdate={load} today={today} />)
              )}
            </div>
          </div>

          {/* Stats semaine + échéances */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">Cette semaine</span></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>Tâches</span>
                    <strong>{sem.total || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>En retard</span>
                    <strong style={{ color: '#ef4444' }}>{sem.en_retard || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>Heures planifiées</span>
                    <strong>{parseFloat(sem.heures_planifiees || 0).toFixed(1)}h</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">Ce mois</span></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>Total tâches</span>
                    <strong>{mois.total || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>Terminées</span>
                    <strong style={{ color: '#10b981' }}>{mois.terminees || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#6b7c93' }}>Taux</span>
                    <strong style={{ color: '#0f1f4b' }}>{mois.taux_completion || 0}%</strong>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${mois.taux_completion || 0}%`, background: '#10b981', borderRadius: 3, transition: 'width .5s' }} />
                  </div>
                </div>
              </div>
            </div>

            {(data?.echeances || []).length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">📅 Prochaines échéances</span></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {(data.echeances || []).map((e, i) => (
                    <div key={i} style={{ padding: '10px 16px', borderBottom: i < data.echeances.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f1f4b' }}>{e.label}</div>
                      <div style={{ fontSize: 11, color: '#6b7c93', marginTop: 2 }}>
                        {e.client_nom} · {new Date(e.date_echeance).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
