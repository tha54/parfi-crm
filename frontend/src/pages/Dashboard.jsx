import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const statuts = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const regimeLabel = { mensuel: 'Mensuel', trimestriel: 'Trim.', annuel: 'Annuel' };

function StatutBadge({ s }) {
  return <span className={`badge badge-${s}`}>{statuts[s] || s}</span>;
}

function KpiCard({ icon, value, label, sub, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color || 'var(--primary-light)'}` }}>
      <span className="kpi-icon">{icon}</span>
      <div style={{ flex: 1 }}>
        <div className="kpi-value" style={{ color: color || 'var(--primary)' }}>{value}</div>
        <div className="kpi-label">{label}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

function ProgressBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress-row">
      <div className="progress-label-row">
        <span>{label}</span>
        <span className="progress-count">{value} <span className="progress-pct">({pct}%)</span></span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color || 'var(--primary-light)' }} />
      </div>
    </div>
  );
}

function MiniBarChart({ data, total, colorMap }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map(item => {
        const pct = total > 0 ? Math.round((item.nb / total) * 100) : 0;
        const key = item.type || item.regime;
        return (
          <div key={key} className="chart-row">
            <span className="chart-label">{item.label || key}</span>
            <div className="chart-bar-wrap">
              <div className="chart-bar" style={{ width: `${pct}%`, background: colorMap?.[key] || 'var(--primary-light)' }} />
            </div>
            <span className="chart-value">{item.nb}</span>
          </div>
        );
      })}
    </div>
  );
}

const TYPE_COLORS = { BIC: '#3182ce', BNC: '#6b46c1', SCI: '#d69e2e', SA: '#38a169', Association: '#e53e3e', Autre: '#718096' };
const REGIME_COLORS = { mensuel: '#d69e2e', trimestriel: '#3182ce', annuel: '#38a169' };

export default function Dashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [extraKpis, setExtraKpis] = useState({ devis: 0, factures: 0, caTotal: 0, lettres: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/kpis'),
      api.get('/devis').catch(() => ({ data: [] })),
      api.get('/factures').catch(() => ({ data: [] })),
      api.get('/lettres-mission').catch(() => ({ data: [] })),
    ]).then(([r, rd, rf, rl]) => {
      setKpis(r.data);
      const devisEnAttente = (rd.data || []).filter(d => d.statut === 'envoye').length;
      const facturesRetard = (rf.data || []).filter(f => f.statut === 'retard').length;
      const caTotal = (rf.data || [])
        .filter(f => f.statut === 'payee')
        .reduce((sum, f) => sum + parseFloat(f.totalTTC || 0), 0);
      const lettresSignees = (rl.data || []).filter(l => l.statut === 'signee').length;
      setExtraKpis({ devisEnAttente, facturesRetard, caTotal, lettresSignees });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const tachesMap = {};
  (kpis?.tachesStats || []).forEach(t => { tachesMap[t.statut] = parseInt(t.nb); });
  const totalTaches = Object.values(tachesMap).reduce((a, b) => a + b, 0);
  const totalClients = (kpis?.clientsParType || []).reduce((s, i) => s + parseInt(i.nb), 0);

  const formatEur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  return (
    <>
      <div className="page-header">
        <h1>Tableau de bord</h1>
        <span className="text-muted text-sm">Bienvenue, {user?.prenom} {user?.nom}</span>
      </div>
      <div className="page-body">

        {/* KPI row 1 — clients & équipe */}
        <div className="kpi-grid">
          <KpiCard icon="👥" value={kpis?.totalClients ?? 0} label="Clients actifs" color="#2a5298" />
          {kpis?.collaborateurs != null && (
            <KpiCard icon="👤" value={kpis.collaborateurs} label="Collaborateurs" color="#6b46c1" />
          )}
          <KpiCard icon="📄" value={extraKpis.devisEnAttente} label="Devis en attente" color="#d69e2e" />
          <KpiCard icon="💰" value={formatEur(extraKpis.caTotal)} label="CA encaissé" color="#38a169" />
          {extraKpis.facturesRetard > 0 && (
            <KpiCard icon="⚠️" value={extraKpis.facturesRetard} label="Factures en retard" color="#e53e3e" />
          )}
        </div>

        {/* KPI row 2 — tâches */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
          <KpiCard icon="📋" value={tachesMap['a_faire'] || 0} label="À faire" color="#718096" />
          <KpiCard icon="⏳" value={tachesMap['en_cours'] || 0} label="En cours" color="#3182ce" />
          <KpiCard icon="✅" value={tachesMap['termine'] || 0} label="Terminées" color="#38a169" />
          <KpiCard icon="📅" value={tachesMap['reporte'] || 0} label="Reportées" color="#d69e2e" />
        </div>

        <div className="dash-grid">

          {/* Avancement des tâches */}
          <div className="card">
            <div className="card-header"><span className="card-title">Avancement des tâches</span>
              <span className="text-muted text-sm">{totalTaches} total</span>
            </div>
            <div className="card-body">
              {totalTaches === 0 ? <p className="text-muted">Aucune tâche</p> : (
                <>
                  <ProgressBar label="À faire" value={tachesMap['a_faire'] || 0} max={totalTaches} color="#718096" />
                  <ProgressBar label="En cours" value={tachesMap['en_cours'] || 0} max={totalTaches} color="#3182ce" />
                  <ProgressBar label="Terminées" value={tachesMap['termine'] || 0} max={totalTaches} color="#38a169" />
                  <ProgressBar label="Reportées" value={tachesMap['reporte'] || 0} max={totalTaches} color="#d69e2e" />
                  <div className="completion-ring-wrap">
                    <div className="completion-label">
                      <strong>{totalTaches > 0 ? Math.round(((tachesMap['termine'] || 0) / totalTaches) * 100) : 0}%</strong>
                      <span>complété</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Répartition clients */}
          <div className="card">
            <div className="card-header"><span className="card-title">Répartition clients</span></div>
            <div className="card-body">
              {(kpis?.clientsParType || []).length === 0 ? (
                <p className="text-muted">Aucune donnée</p>
              ) : (
                <>
                  <MiniBarChart
                    data={(kpis?.clientsParType || []).map(i => ({ ...i, label: i.type }))}
                    total={totalClients}
                    colorMap={TYPE_COLORS}
                  />
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 12 }}>
                    <div className="card-title" style={{ fontSize: 13, marginBottom: 10 }}>Régimes TVA</div>
                    <MiniBarChart
                      data={(kpis?.clientsParRegime || []).map(i => ({ ...i, label: regimeLabel[i.regime] || i.regime }))}
                      total={totalClients}
                      colorMap={REGIME_COLORS}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tâches imminentes */}
          <div className="card dash-grid-full">
            <div className="card-header">
              <span className="card-title">Tâches à échéance (7 jours)</span>
              <span className="badge badge-en_cours">{(kpis?.tachesProches || []).length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {(kpis?.tachesProches || []).length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">🎉</div><p>Aucune tâche urgente</p></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Client</th>
                        {['expert', 'chef_mission'].includes(user?.role) && <th>Assigné à</th>}
                        <th>Échéance</th>
                        <th>Durée</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kpis?.tachesProches || []).map(t => (
                        <tr key={t.id}>
                          <td>{t.description}</td>
                          <td>{t.client_nom || '—'}</td>
                          {['expert', 'chef_mission'].includes(user?.role) && (
                            <td>{t.prenom} {t.user_nom}</td>
                          )}
                          <td>
                            <span style={{ color: new Date(t.date_echeance) < new Date() ? 'var(--danger)' : 'inherit', fontWeight: new Date(t.date_echeance) < new Date() ? 600 : 400 }}>
                              {new Date(t.date_echeance).toLocaleDateString('fr-FR')}
                            </span>
                          </td>
                          <td>{t.duree}h</td>
                          <td><StatutBadge s={t.statut} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Clients récents */}
          <div className="card dash-grid-full">
            <div className="card-header"><span className="card-title">Clients récemment ajoutés</span></div>
            <div className="card-body" style={{ padding: 0 }}>
              {(kpis?.recentClients || []).length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">📂</div><p>Aucun client</p></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Nom</th><th>Type</th><th>Régime</th><th>Ajouté le</th></tr></thead>
                    <tbody>
                      {(kpis?.recentClients || []).map(c => (
                        <tr key={c.id}>
                          <td><strong>{c.nom}</strong></td>
                          <td><span className={`badge badge-${c.type.toLowerCase()}`}>{c.type}</span></td>
                          <td><span className={`badge badge-${c.regime === 'trimestriel' ? 'trim' : c.regime}`}>{regimeLabel[c.regime]}</span></td>
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
