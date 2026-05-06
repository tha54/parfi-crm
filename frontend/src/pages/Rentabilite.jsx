import { useState, useEffect } from 'react';
import api from '../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtH = (m) => {
  if (!m && m !== 0) return '—';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  return mn === 0 ? `${h}h` : `${h}h${String(mn).padStart(2, '0')}`;
};

const ROLE_METIER_LABEL = {
  expert_comptable:        'Expert-Comptable',
  chef_de_groupe:          'Chef de Groupe',
  chef_de_mission:         'Chef de Mission',
  collaborateur:           'Collaborateur',
  collaborateur_social:    'Collab. Social',
  collaborateur_juridique: 'Collab. Juridique',
};

// Fiabilité = % saisies validées / (validées + figées)
function FiabiliteIcon({ fiabilite }) {
  if (fiabilite === null || fiabilite === undefined) return <span style={{ color: '#94a3b8' }}>—</span>;
  if (fiabilite >= 80) return <span title={`Fiabilité ${fiabilite}%`}>🟢 {fiabilite}%</span>;
  if (fiabilite >= 50) return <span title={`Fiabilité ${fiabilite}%`}>🟡 {fiabilite}%</span>;
  return <span title={`Fiabilité ${fiabilite}%`}>🟠 {fiabilite}%</span>;
}

function UtilBar({ taux }) {
  const v = Math.min(150, taux || 0);
  const color = v > 100 ? '#d63031' : v >= 85 ? '#e67e22' : '#00897b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4, minWidth: 60 }}>
        <div style={{ width: `${Math.min(100, v)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 42 }}>{(taux || 0).toFixed(0)}%</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Rentabilite() {
  const [data, setData] = useState({ clients: [], collaborateurs: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('clients');
  const [filterCollabId, setFilterCollabId] = useState('');
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [annee, setAnnee] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCollabId) params.set('collaborateurId', filterCollabId);
      if (annee) params.set('annee', annee);
      const [rRes, uRes] = await Promise.all([
        api.get(`/rentabilite${params.toString() ? '?' + params : ''}`),
        api.get('/utilisateurs'),
      ]);
      setData(rRes.data);
      setUtilisateurs(uRes.data.filter(u => u.role !== 'client'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterCollabId, annee]);

  const { clients = [], collaborateurs = [], totals = {} } = data;

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2023; y--) years.push(y);

  return (
    <div className="page">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Rentabilité</h1>
          <p className="page-subtitle">Budget vs temps saisi (tâches validées)</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-control" style={{ width: 180 }} value={filterCollabId} onChange={e => setFilterCollabId(e.target.value)}>
            <option value="">Tous les collaborateurs</option>
            {utilisateurs.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
          <select className="form-control" style={{ width: 120 }} value={annee} onChange={e => setAnnee(e.target.value)}>
            <option value="">Toutes années</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs globaux */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 24 }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #0f1f4b' }}>
          <div className="kpi-value">{fmtH(totals.budget_minutes)}</div>
          <div className="kpi-label">Budget total</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00897b' }}>
          <div className="kpi-value">{fmtH(totals.temps_realise_minutes)}</div>
          <div className="kpi-label">Temps saisi</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div className="kpi-value">{fmtH(totals.temps_valide_minutes)}</div>
          <div className="kpi-label">Temps validé</div>
        </div>
        <div className="kpi-card" style={{
          borderLeft: `4px solid ${(totals.taux_utilisation_global || 0) > 100 ? '#d63031' : (totals.taux_utilisation_global || 0) >= 85 ? '#e67e22' : '#00897b'}`,
        }}>
          <div className="kpi-value">{(totals.taux_utilisation_global || 0).toFixed(0)}%</div>
          <div className="kpi-label">Taux d'utilisation</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'clients' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('clients')}>
          Par client ({clients.length})
        </button>
        <button className={`btn btn-sm ${tab === 'collaborateurs' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('collaborateurs')}>
          Par collaborateur ({collaborateurs.length})
        </button>
      </div>

      {/* By client */}
      {tab === 'clients' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th style={{ textAlign: 'right' }}>Tâches</th>
                  <th style={{ textAlign: 'right' }}>Budget</th>
                  <th style={{ textAlign: 'right' }}>Réalisé</th>
                  <th style={{ textAlign: 'right' }}>Validé</th>
                  <th style={{ minWidth: 160 }}>Utilisation</th>
                  <th style={{ textAlign: 'center' }}>Fiabilité</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
                ) : clients.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune donnée</td></tr>
                ) : clients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nom}</td>
                    <td style={{ textAlign: 'right' }}>{c.nb_taches}</td>
                    <td style={{ textAlign: 'right' }}>{fmtH(c.budget_minutes)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtH(c.temps_realise_minutes)}</td>
                    <td style={{ textAlign: 'right', color: '#15803d' }}>{fmtH(c.temps_valide_minutes)}</td>
                    <td style={{ minWidth: 160 }}><UtilBar taux={c.taux_utilisation} /></td>
                    <td style={{ textAlign: 'center', fontSize: 13 }}><FiabiliteIcon fiabilite={c.fiabilite} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By collaborateur */}
      {tab === 'collaborateurs' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Profil</th>
                  <th style={{ textAlign: 'right' }}>Tâches</th>
                  <th style={{ textAlign: 'right' }}>Budget</th>
                  <th style={{ textAlign: 'right' }}>Réalisé</th>
                  <th style={{ textAlign: 'right' }}>Validé</th>
                  <th style={{ minWidth: 160 }}>Utilisation</th>
                  <th style={{ textAlign: 'center' }}>Fiabilité</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
                ) : collaborateurs.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune donnée</td></tr>
                ) : collaborateurs.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.prenom} {c.nom}</td>
                    <td>
                      <span style={{ fontSize: 11, background: '#e0f6fc', color: '#0f1f4b', padding: '2px 8px', borderRadius: 12 }}>
                        {ROLE_METIER_LABEL[c.role_metier] || c.role_metier || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{c.nb_taches}</td>
                    <td style={{ textAlign: 'right' }}>{fmtH(c.budget_minutes)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtH(c.temps_realise_minutes)}</td>
                    <td style={{ textAlign: 'right', color: '#15803d' }}>{fmtH(c.temps_valide_minutes)}</td>
                    <td style={{ minWidth: 160 }}><UtilBar taux={c.taux_utilisation} /></td>
                    <td style={{ textAlign: 'center', fontSize: 13 }}><FiabiliteIcon fiabilite={c.fiabilite} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fiabilité legend */}
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>Fiabilité = saisies validées / (validées + figées)</span>
        <span>🟢 ≥ 80% · 🟡 50–79% · 🟠 &lt; 50%</span>
      </div>
    </div>
  );
}
