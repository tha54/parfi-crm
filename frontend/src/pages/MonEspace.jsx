import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUT_COLORS = {
  a_faire:    { color: '#6b7c93', label: 'À faire' },
  en_cours:   { color: '#00b4d8', label: 'En cours' },
  en_attente: { color: '#e67e22', label: 'En attente' },
  termine:    { color: '#00897b', label: 'Terminé' },
  reporte:    { color: '#d63031', label: 'Reporté' },
};

export default function MonEspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [taches, setTaches] = useState([]);
  const [missions, setMissions] = useState([]);
  const [factures, setFactures] = useState([]);
  const [saisies, setSaisies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saisieForm, setSaisieForm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, mRes, fRes] = await Promise.all([
        api.get(`/taches?utilisateur_id=${user.id}`),
        api.get('/missions?statut=en_cours'),
        api.get('/relances/en-retard'),
      ]);
      setTaches(tRes.data || []);
      setMissions((mRes.data || []).slice(0, 8));
      setFactures((fRes.data || []).slice(0, 5));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const tachesRetard = taches.filter(t => t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) < new Date());
  const tachesAFaire = taches.filter(t => ['a_faire', 'en_cours'].includes(t.statut));

  const handleUpdateStatut = async (id, statut) => {
    await api.put(`/taches/${id}`, { statut });
    load();
  };

  const totalImpaye = factures.reduce((s, f) => s + Number(f.resteARegler || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mon Espace</h1>
          <p className="page-subtitle">Bonjour {user?.prenom} — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {/* KPIs personnels */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 24 }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #d63031' }}>
          <div className="kpi-value" style={{ color: '#d63031' }}>{tachesRetard.length}</div>
          <div className="kpi-label">Tâches en retard</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00b4d8' }}>
          <div className="kpi-value">{tachesAFaire.length}</div>
          <div className="kpi-label">Tâches à traiter</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #0f1f4b' }}>
          <div className="kpi-value">{missions.length}</div>
          <div className="kpi-label">Missions actives</div>
        </div>
        {(user?.role === 'expert' || user?.role === 'chef_mission') && (
          <div className="kpi-card" style={{ borderLeft: '4px solid #e67e22', cursor: 'pointer' }} onClick={() => navigate('/relances')}>
            <div className="kpi-value" style={{ color: '#d63031' }}>{fmt(totalImpaye)}</div>
            <div className="kpi-label">Impayés à relancer</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Tâches urgentes / en retard */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>
              {tachesRetard.length > 0
                ? <span style={{ color: '#d63031' }}>⚠ {tachesRetard.length} tâche(s) en retard</span>
                : '✓ Mes tâches'}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/taches')}>Voir tout →</button>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', padding: 16 }}>Chargement…</p>
            ) : tachesAFaire.length === 0 ? (
              <p style={{ color: '#00897b', textAlign: 'center', padding: 24 }}>✓ Aucune tâche en attente</p>
            ) : tachesAFaire.slice(0, 8).map(t => {
              const enRetard = t.date_echeance && new Date(t.date_echeance) < new Date();
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                    <div style={{ fontSize: 12, color: enRetard ? '#d63031' : 'var(--text-muted)', marginTop: 2 }}>
                      {enRetard ? '⚠ ' : ''}Échéance : {fmtDate(t.date_echeance)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    {t.statut !== 'en_cours' && (
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => handleUpdateStatut(t.id, 'en_cours')}>▶</button>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: '#00897b' }} onClick={() => handleUpdateStatut(t.id, 'termine')}>✓</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mes missions actives */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Mes missions actives</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/missions')}>Voir tout →</button>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', padding: 16 }}>Chargement…</p>
            ) : missions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Aucune mission en cours</p>
            ) : missions.map(m => {
              const pct = m.tempsBudgeteH > 0 ? Math.min(150, Math.round((m.tempsPasseH / m.tempsBudgeteH) * 100)) : 0;
              const color = pct > 100 ? '#d63031' : '#00b4d8';
              return (
                <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{m.nom}</div>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.contactNom}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: '#eee', borderRadius: 2 }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color, fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {m.tempsPasseH || 0}h / {m.tempsBudgeteH}h
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Impayés (expert / chef uniquement) */}
        {(user?.role === 'expert' || user?.role === 'chef_mission') && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, color: factures.length > 0 ? '#d63031' : 'inherit' }}>
                {factures.length > 0 ? `⚠ ${factures.length} impayé(s)` : 'Impayés'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/relances')}>Voir tout →</button>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              {factures.length === 0 ? (
                <p style={{ color: '#00897b', textAlign: 'center', padding: 24 }}>✓ Aucun impayé</p>
              ) : factures.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{f.clientNom}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.numero} — {f.joursRetard}j de retard</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#d63031' }}>{fmt(f.resteARegler)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activité récente — saisies de temps */}
        <div className="card">
          <div className="card-header">
            <h3 style={{ margin: 0, fontSize: 15 }}>Activité récente</h3>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)', padding: 16 }}>Chargement…</p>
            ) : (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24, fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⏱</div>
                <div>Accédez à une mission pour saisir du temps.</div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/missions')}>
                  Mes missions →
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
