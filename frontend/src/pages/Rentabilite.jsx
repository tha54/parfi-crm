import { useState, useEffect } from 'react';
import api from '../services/api';

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n) => `${n || 0}%`;

function RentaBar({ value, max = 100 }) {
  const pct = Math.min(150, value || 0);
  const color = pct > 110 ? '#00897b' : pct < 70 ? '#d63031' : '#e67e22';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: '#eee', borderRadius: 4 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 40 }}>{value?.toFixed(0) || 0}%</span>
    </div>
  );
}

export default function Rentabilite() {
  const [data, setData] = useState({ missions: [], totals: {}, parCollaborateur: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('missions');
  const [filterIntervenant, setFilterIntervenant] = useState('');
  const [intervenants, setIntervenants] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, iRes] = await Promise.all([
        api.get(`/rentabilite${filterIntervenant ? `?intervenantId=${filterIntervenant}` : ''}`),
        api.get('/intervenants?actif=true'),
      ]);
      setData(rRes.data);
      setIntervenants(iRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterIntervenant]);

  const { missions = [], totals = {}, parCollaborateur = [] } = data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rentabilité</h1>
          <p className="page-subtitle">Performance économique des missions</p>
        </div>
        <select className="form-control" style={{ width: 220 }} value={filterIntervenant} onChange={e => setFilterIntervenant(e.target.value)}>
          <option value="">Tous les intervenants</option>
          {intervenants.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
        </select>
      </div>

      {/* KPIs globaux */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 24 }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #0f1f4b' }}>
          <div className="kpi-value">{fmt(totals.totalBudget)}</div>
          <div className="kpi-label">Honoraires budgétés</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00897b' }}>
          <div className="kpi-value">{fmt(totals.totalCaFacture)}</div>
          <div className="kpi-label">CA facturé</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: `4px solid ${(totals.tauxRentabiliteGlobal || 0) >= 90 ? '#00897b' : '#d63031'}` }}>
          <div className="kpi-value">{fmtPct(totals.tauxRentabiliteGlobal)}</div>
          <div className="kpi-label">Taux de rentabilité</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00b4d8' }}>
          <div className="kpi-value">{totals.totalTempsBudgete?.toFixed(0) || 0}h</div>
          <div className="kpi-label">Temps budgété</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: `4px solid ${(totals.tauxUtilisationGlobal || 0) > 100 ? '#d63031' : '#e67e22'}` }}>
          <div className="kpi-value">{fmtPct(totals.tauxUtilisationGlobal)}</div>
          <div className="kpi-label">Taux d'utilisation</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'missions' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('missions')}>
          Par mission ({missions.length})
        </button>
        <button className={`btn btn-sm ${tab === 'collaborateurs' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('collaborateurs')}>
          Par collaborateur ({parCollaborateur.length})
        </button>
      </div>

      {tab === 'missions' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Client</th>
                  <th>Intervenant</th>
                  <th>Honoraires budg.</th>
                  <th>CA facturé</th>
                  <th>Boni/Mali</th>
                  <th>Rentabilité</th>
                  <th>Utilisation temps</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
                ) : missions.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune mission</td></tr>
                ) : missions.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.nom}</td>
                    <td>{m.contactNom || '—'}</td>
                    <td>{m.intervenantNom || '—'}</td>
                    <td>{fmt(m.honorairesBudgetes)}</td>
                    <td>{fmt(m.caFacture)}</td>
                    <td style={{ fontWeight: 600, color: Number(m.boniMali) >= 0 ? '#00897b' : '#d63031' }}>
                      {Number(m.boniMali) >= 0 ? '+' : ''}{fmt(m.boniMali)}
                    </td>
                    <td style={{ minWidth: 140 }}><RentaBar value={Number(m.tauxRentabilite)} /></td>
                    <td style={{ minWidth: 140 }}><RentaBar value={Number(m.tauxUtilisation)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'collaborateurs' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Profil</th>
                  <th>Missions actives</th>
                  <th>Budget honoraires</th>
                  <th>Temps budgété</th>
                  <th>Temps saisi</th>
                  <th>Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>Chargement…</td></tr>
                ) : parCollaborateur.map(c => {
                  const taux = c.totalTempsBudgete > 0 ? Math.round((c.totalTempsPasse / c.totalTempsBudgete) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.nom}</td>
                      <td><span style={{ fontSize: 12, background: '#e0f6fc', color: '#0f1f4b', padding: '2px 8px', borderRadius: 12 }}>{c.categorie?.replace(/_/g, ' ')}</span></td>
                      <td>{c.nbMissions}</td>
                      <td>{fmt(c.totalBudget)}</td>
                      <td>{Number(c.totalTempsBudgete).toFixed(0)}h</td>
                      <td>{Number(c.totalTempsPasse).toFixed(1)}h</td>
                      <td style={{ minWidth: 140 }}><RentaBar value={taux} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
