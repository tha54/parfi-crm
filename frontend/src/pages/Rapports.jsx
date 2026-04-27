import { useState, useEffect } from 'react';
import api from '../services/api';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

function KPICard({ icon, value, label, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color || 'var(--accent)'}` }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export default function Rapports() {
  const [activeTab, setActiveTab] = useState('weekly');
  const [weekly, setWeekly] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (tab) => {
    setLoading(true);
    try {
      if (tab === 'weekly' && !weekly) {
        const { data } = await api.get('/rapports/weekly');
        setWeekly(data);
      } else if (tab === 'monthly' && !monthly) {
        const { data } = await api.get('/rapports/monthly');
        setMonthly(data);
      } else if (tab === 'portfolio' && !portfolio) {
        const { data } = await api.get('/rapports/portfolio');
        setPortfolio(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    load(tab);
  };

  useEffect(() => { load('weekly'); }, []);

  const tabs = [
    { key: 'weekly', label: 'Rapport hebdo' },
    { key: 'monthly', label: 'Rapport mensuel' },
    { key: 'portfolio', label: 'Portefeuille & Churn' },
  ];

  return (
    <>
      <div className="page-header">
        <h1>Rapports</h1>
      </div>
      <div className="page-body">
        {/* Tab nav */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', borderRadius: 8, padding: 4, width: 'fit-content', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)} style={{
              padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: activeTab === t.key ? 'var(--primary)' : 'transparent',
              color: activeTab === t.key ? '#fff' : 'var(--text-muted)',
            }}>{t.label}</button>
          ))}
        </div>

        {loading && <div className="spinner"><div className="spinner-ring" /></div>}

        {/* Weekly Report */}
        {activeTab === 'weekly' && weekly && !loading && (
          <div>
            <h2 style={{ marginBottom: 16, fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>{weekly.periode}</h2>
            {weekly.analyse && (
              <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)' }}>
                <div className="card-body" style={{ fontStyle: 'italic', fontSize: 14, lineHeight: 1.7 }}>
                  {weekly.analyse}
                </div>
              </div>
            )}
            <div className="kpi-grid" style={{ marginBottom: 24 }}>
              <KPICard icon="✅" value={weekly.taches.terminees} label="Tâches terminées" color="#22c55e" />
              <KPICard icon="⚠️" value={weekly.taches.en_retard} label="En retard" color="#ef4444" />
              <KPICard icon="🔄" value={weekly.taches.reportees} label="Reportées" color="#f59e0b" />
              <KPICard icon="👥" value={weekly.commercial.nouveaux_clients} label="Nouveaux clients" color="#0f1f4b" />
              <KPICard icon="📡" value={weekly.commercial.nouveaux_prospects} label="Nouveaux prospects" color="#3b82f6" />
              <KPICard icon="📋" value={weekly.commercial.ldm_signees} label="LDM signées" color="#8b5cf6" />
              <KPICard icon="💶" value={fmt(weekly.commercial.ca_facture)} label="CA facturé" color="#10b981" />
            </div>
          </div>
        )}

        {/* Monthly Report */}
        {activeTab === 'monthly' && monthly && !loading && (
          <div>
            <h2 style={{ marginBottom: 16, fontSize: 15, color: 'var(--text-muted)', fontWeight: 600 }}>{monthly.periode}</h2>
            <div className="kpi-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <KPICard icon="💶" value={fmt(monthly.ca_mensuel)} label="CA mensuel" color="#10b981" />
              <KPICard icon="👥" value={monthly.entrees_portfolio} label="Nouveaux clients" color="#0f1f4b" />
            </div>

            {/* Taux de réalisation */}
            {monthly.collaborateurs?.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Taux de réalisation</span></div>
                <div className="card-body">
                  {monthly.collaborateurs.map((c, i) => {
                    const target = { expert: 45, chef_mission: 62, collaborateur: 78 }[c.role] || 78;
                    const color = c.taux_realisation >= target ? '#22c55e' : c.taux_realisation >= target * 0.8 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                          <span><strong>{c.nom}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({c.role})</span></span>
                          <span style={{ color, fontWeight: 700 }}>{c.taux_realisation}% <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ cible {target}%</span></span>
                        </div>
                        <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6 }}>
                          <div style={{ width: `${Math.min(c.taux_realisation, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top clients */}
            {monthly.top_clients?.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">Top 5 clients</span></div>
                <div className="card-body">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Client</th>
                        <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.top_clients.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '10px 0', fontWeight: 700, color: 'var(--text-muted)' }}>#{i + 1}</td>
                          <td style={{ padding: '10px 0', fontWeight: 600 }}>{c.nom}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmt(c.ca)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Portfolio Report */}
        {activeTab === 'portfolio' && portfolio && !loading && (
          <div>
            <div className="kpi-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <KPICard icon="📈" value={portfolio.entrees?.nb || 0} label={`Entrées (${fmt(portfolio.entrees?.ca || 0)})`} color="#22c55e" />
              <KPICard icon="📉" value={portfolio.sorties?.nb || 0} label={`Sorties (${fmt(portfolio.sorties?.ca || 0)})`} color="#ef4444" />
              <KPICard icon="⚖️" value={(portfolio.entrees?.nb || 0) - (portfolio.sorties?.nb || 0)} label="Solde net" color="#0f1f4b" />
            </div>

            {/* Motifs churn */}
            {portfolio.motifs_churn?.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><span className="card-title">Motifs de perte</span></div>
                <div className="card-body">
                  {portfolio.motifs_churn.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                      <span>{m.motif_fin?.replace(/_/g, ' ')}</span>
                      <strong>{m.nb}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signal faible — clients sans interaction > 60j */}
            {portfolio.signal_faible?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">⚠️ Signal faible — sans interaction depuis 60j</span>
                </div>
                <div className="card-body">
                  {portfolio.signal_faible.map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                      <strong>{c.nom}</strong>
                      <span style={{ color: 'var(--danger)' }}>
                        {c.derniere_interaction ? `Dernière interaction : ${new Date(c.derniere_interaction).toLocaleDateString('fr-FR')}` : 'Jamais contacté'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
