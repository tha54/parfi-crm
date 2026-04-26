import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const regimeLabel = { mensuel: 'Mensuel', trimestriel: 'Trim.', annuel: 'Annuel' };
const STATUT_LABELS = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const PRIORITE_COLORS = { urgente: '#ef4444', haute: '#f59e0b', normale: '#3b82f6', basse: '#9ca3af' };

function KpiCard({ icon, value, label, sub, color, onClick }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color || 'var(--primary-light)'}`, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <span className="kpi-icon">{icon}</span>
      <div style={{ flex: 1 }}>
        <div className="kpi-value" style={{ color: color || 'var(--primary)' }}>{value}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/kpis').then(r => setKpis(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);
  const k = kpis || {};

  return (
    <>
      <div className="page-header">
        <h1>Tableau de bord</h1>
        <span className="text-muted text-sm">Bienvenue, {user?.prenom} {user?.nom}</span>
      </div>
      <div className="page-body">

        {/* KPI Row 1 — Portefeuille */}
        <div className="kpi-grid">
          <KpiCard icon="👥" value={k.clientsActifs ?? 0} label="Clients actifs" color="#0f1f4b" onClick={() => navigate('/clients')} />
          <KpiCard icon="📡" value={k.prospects ?? 0} label="Prospects" color="#5bb8e8" onClick={() => navigate('/prospects')} />
          <KpiCard icon="🎯" value={k.missionsEnCours ?? 0} label="Missions en cours" color="#00b4d8" onClick={() => navigate('/missions')} />
          {isExpertOrChef && <KpiCard icon="💰" value={fmt(k.caFacture)} label="CA facturé (année)" color="#10b981" sub={`Prévisionnel: ${fmt(k.caPrevisionnel)}`} />}
          {isExpertOrChef && k.impayesCount > 0 && (
            <KpiCard icon="⚠️" value={fmt(k.impayesMontant)} label={`${k.impayesCount} facture(s) impayée(s)`} color="#ef4444" onClick={() => navigate('/relances')} />
          )}
        </div>

        {/* KPI Row 2 — Tâches */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <KpiCard icon="🔴" value={k.tachesEnRetard ?? 0} label="Tâches en retard" color="#ef4444" onClick={() => navigate('/planning')} />
          <KpiCard icon="📋" value={k.tachesAFaire ?? 0} label="À faire" color="#6b7c93" onClick={() => navigate('/planning')} />
          <KpiCard icon="⏳" value={k.tachesEnCours ?? 0} label="En cours" color="#3b82f6" onClick={() => navigate('/planning')} />
          <KpiCard icon="✅" value={k.tachesTermineesMois ?? 0} label="Terminées ce mois" color="#10b981" />
          {isExpertOrChef && <KpiCard icon="📄" value={k.devisEnAttente ?? 0} label="Devis en attente" color="#f59e0b" onClick={() => navigate('/devis')} />}
          {isExpertOrChef && <KpiCard icon="📊" value={`${k.tauxConversion ?? 0}%`} label="Taux de conversion" color="#8b5cf6" sub={`Pipeline: ${fmt(k.totalPipeline)}`} />}
        </div>

        <div className="dash-grid">

          {/* Tâches proches */}
          <div className="card dash-grid-full">
            <div className="card-header">
              <span className="card-title">Tâches à venir (7 jours)</span>
              <span className="badge badge-en_cours">{(k.tachesProches || []).length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {(k.tachesProches || []).length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">🎉</div><p>Aucune tâche urgente</p></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Tâche</th>
                        <th>Client</th>
                        {isExpertOrChef && <th>Assigné à</th>}
                        <th>Priorité</th>
                        <th>Échéance</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(k.tachesProches || []).map(t => (
                        <tr key={t.id}>
                          <td>{t.titre || t.description}</td>
                          <td>{t.client_nom || '—'}</td>
                          {isExpertOrChef && <td>{t.utilisateur_nom || '—'}</td>}
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: PRIORITE_COLORS[t.priorite] + '22', color: PRIORITE_COLORS[t.priorite], fontWeight: 600 }}>
                              {t.priorite}
                            </span>
                          </td>
                          <td>
                            <span style={{ color: new Date(t.date_echeance) < new Date() ? '#ef4444' : 'inherit', fontWeight: new Date(t.date_echeance) < new Date() ? 600 : 400 }}>
                              {new Date(t.date_echeance).toLocaleDateString('fr-FR')}
                            </span>
                          </td>
                          <td><span className={`badge badge-${t.statut}`}>{STATUT_LABELS[t.statut] || t.statut}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Échéances fiscales proches */}
          {isExpertOrChef && (k.echeancesProches || []).length > 0 && (
            <div className="card dash-grid-full">
              <div className="card-header">
                <span className="card-title">📅 Prochaines échéances fiscales (30 jours)</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => navigate('/planning')}>Voir toutes</button>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Date</th><th>Libellé</th><th>Client</th><th>Statut</th></tr></thead>
                    <tbody>
                      {(k.echeancesProches || []).map(e => (
                        <tr key={e.id}>
                          <td style={{ fontWeight: 600 }}>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</td>
                          <td>{e.label}</td>
                          <td>{e.client_nom || '—'}</td>
                          <td><span className={`badge badge-${e.statut === 'termine' ? 'termine' : new Date(e.date_echeance) < new Date() ? 'inactif' : 'en_cours'}`}>{e.statut === 'termine' ? 'Terminé' : new Date(e.date_echeance) < new Date() ? 'En retard' : 'À faire'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Clients récents */}
          <div className="card dash-grid-full">
            <div className="card-header">
              <span className="card-title">Clients récemment ajoutés</span>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => navigate('/clients')}>Voir tous</button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {(k.recentClients || []).length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📂</div><p>Aucun client</p></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Nom</th><th>Type</th><th>Régime</th><th>Ajouté le</th></tr></thead>
                    <tbody>
                      {(k.recentClients || []).map(c => (
                        <tr key={c.id}>
                          <td><strong>{c.nom}</strong></td>
                          <td><span className={`badge badge-${c.type}`}>{c.type}</span></td>
                          <td><span className="badge badge-autre">{regimeLabel[c.regime] || c.regime}</span></td>
                          <td>{new Date(c.cree_le).toLocaleDateString('fr-FR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
