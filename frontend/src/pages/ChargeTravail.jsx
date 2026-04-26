import { useState, useEffect } from 'react';
import api from '../services/api';

const CAP_HEBDO = 35; // heures de travail par semaine par défaut

function CapaciteBar({ charge, capacite = CAP_HEBDO }) {
  const pct = Math.min(150, Math.round((charge / capacite) * 100));
  const color = pct > 100 ? '#d63031' : pct > 80 ? '#e67e22' : '#00897b';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: 'var(--text-muted)' }}>{Number(charge).toFixed(1)}h / {capacite}h cap.</span>
        <span style={{ fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#eee', borderRadius: 4 }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      {pct > 100 && (
        <div style={{ fontSize: 11, color: '#d63031', marginTop: 2 }}>⚠ Surcharge de {(charge - capacite).toFixed(1)}h</div>
      )}
    </div>
  );
}

export default function ChargeTravail() {
  const [intervenants, setIntervenants] = useState([]);
  const [missions, setMissions] = useState([]);
  const [taches, setTaches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/rentabilite/charge-travail'),
      api.get('/missions?statut=en_cours'),
      api.get('/taches?statut=a_faire'),
    ]).then(([iRes, mRes, tRes]) => {
      setIntervenants(iRes.data || []);
      setMissions(mRes.data || []);
      setTaches(tRes.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Charge de travail</h1>
          <p className="page-subtitle">
            Semaine du {weekStart.toLocaleDateString('fr-FR')} au {weekEnd.toLocaleDateString('fr-FR')}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : (
        <>
          {/* Vue par collaborateur */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
            {intervenants.length === 0 ? (
              <div className="card" style={{ padding: 24, color: 'var(--text-muted)' }}>Aucun intervenant actif</div>
            ) : intervenants.map(iv => {
              const ivMissions = missions.filter(m => String(m.intervenantId) === String(iv.id));
              const chargeHebdo = ivMissions.reduce((s, m) => s + (Number(m.tempsBudgeteH || 0) / 4), 0); // approximation mensuelle / 4

              return (
                <div key={iv.id} className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{iv.nom}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {iv.categorie?.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{iv.nbMissions || 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>missions</div>
                    </div>
                  </div>

                  <CapaciteBar charge={chargeHebdo} />

                  {ivMissions.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>MISSIONS EN COURS</div>
                      {ivMissions.slice(0, 4).map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{m.nom}</span>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{m.tempsBudgeteH}h</span>
                        </div>
                      ))}
                      {ivMissions.length > 4 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}>+{ivMissions.length - 4} autres…</div>
                      )}
                    </div>
                  )}

                  {iv.tachesSemaine > 0 && (
                    <div style={{ marginTop: 10, padding: '6px 10px', background: '#fff3e0', borderRadius: 6, fontSize: 13 }}>
                      📋 {iv.tachesSemaine} tâche(s) cette semaine
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tableau récapitulatif */}
          <div className="card">
            <div className="card-header">
              <h3 style={{ margin: 0, fontSize: 15 }}>Récapitulatif des missions actives ({missions.length})</h3>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Client</th>
                    <th>Intervenant</th>
                    <th>Temps budgété</th>
                    <th>Temps passé</th>
                    <th>Avancement</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Aucune mission en cours</td></tr>
                  ) : missions.map(m => {
                    const pct = m.tempsBudgeteH > 0 ? Math.min(150, Math.round((m.tempsPasseH / m.tempsBudgeteH) * 100)) : 0;
                    const color = pct > 100 ? '#d63031' : pct > 80 ? '#e67e22' : '#00897b';
                    return (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 500 }}>{m.nom}</td>
                        <td>{m.contactNom || '—'}</td>
                        <td>{m.intervenantNom || '—'}</td>
                        <td>{m.tempsBudgeteH}h</td>
                        <td>{m.tempsPasseH || 0}h</td>
                        <td style={{ minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#eee', borderRadius: 3 }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, color, fontWeight: 600 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
