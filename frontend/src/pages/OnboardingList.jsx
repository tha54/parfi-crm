import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/**
 * Chantier G — page liste /onboarding.
 *
 * Table de tous les onboardings actifs, une ligne par dossier. Progression
 * calculée sur les étapes faites (F) + non applicables (NA) / total.
 */

const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUT_STYLES = {
  en_cours:   { label: 'En cours',      bg: '#dbeafe', color: '#1e40af' },
  clos:       { label: 'Clos',          bg: '#d1fae5', color: '#065f46' },
  prolonge:   { label: 'Prolongé',      bg: '#fef3c7', color: '#92400e' },
  avenant:    { label: 'Avenant',       bg: '#ede9fe', color: '#5b21b6' },
};

export default function OnboardingList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/onboarding')
      .then(r => setRows(r.data || []))
      .catch(e => setErr(e?.response?.data?.message || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const filtered = q
    ? rows.filter(r => (r.client_nom || '').toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Onboardings</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {rows.length} onboarding{rows.length > 1 ? 's' : ''}
        </span>
        <input
          type="text"
          placeholder="Filtrer par client…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, minWidth: 240 }}
        />
      </div>

      {err && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 6, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card">
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              Aucun onboarding
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
              Les onboardings sont créés automatiquement à la signature d'une lettre de mission.
              Signez une LDM en brouillon depuis <a href="/lettres-mission" style={{ color: '#2563eb' }}>Lettres de mission</a> pour générer un premier onboarding.
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucun onboarding ne correspond à « {q} ».
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style={{ width: 110 }}>Signature</th>
                  <th style={{ width: 110 }}>Fin cible</th>
                  <th style={{ width: 100 }}>Statut</th>
                  <th style={{ width: 200 }}>Progression</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const done = Number(r.nb_faites || 0);
                  const total = Number(r.nb_etapes || 0);
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  const stat = STATUT_STYLES[r.statut] || { label: r.statut, bg: '#f1f5f9', color: '#4b5563' };
                  const retard = r.date_fin_cible && new Date(r.date_fin_cible) < new Date() && pct < 100;
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/onboarding/${r.dossier_id}`)}>
                      <td style={{ fontSize: 13 }}>
                        <div style={{ fontWeight: 600 }}>{r.client_nom}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          Dossier #{r.dossier_id}
                          {r.reprise_confrere ? <span style={{ marginLeft: 6, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>reprise</span> : null}
                        </div>
                      </td>
                      <td style={{ fontSize: 12 }}>{fmtDate(r.date_signature)}</td>
                      <td style={{ fontSize: 12 }}>
                        {fmtDate(r.date_fin_cible)}
                        {retard && (
                          <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>en retard</div>
                        )}
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                          background: stat.bg, color: stat.color,
                        }}>{stat.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${pct}%`,
                              background: pct === 100 ? '#059669' : retard ? '#dc2626' : '#2563eb',
                              transition: 'width .3s',
                            }} />
                          </div>
                          <span style={{ fontSize: 11, minWidth: 60, textAlign: 'right', color: 'var(--text-muted)' }}>
                            {done} / {total}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                                onClick={e => { e.stopPropagation(); navigate(`/onboarding/${r.dossier_id}`); }}>
                          → Voir
                        </button>
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
  );
}
