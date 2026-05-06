import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const STATUTS = {
  prospect: 'Prospect', devis_envoye: 'Devis envoyé', devis_accepte: 'Devis accepté',
  ldm_generee: 'LDM générée', ldm_signee: 'LDM signée', mission_active: 'Mission active',
};
const STATUT_COLORS = {
  prospect: '#6b7280', devis_envoye: '#f59e0b', devis_accepte: '#3b82f6',
  ldm_generee: '#8b5cf6', ldm_signee: '#00897b', mission_active: '#059669',
};

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

export default function Contrats() {
  const navigate = useNavigate();
  const [contrats, setContrats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = filterStatut ? `?statut=${filterStatut}` : '';
    api.get(`/contrats${params}`)
      .then(r => setContrats(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterStatut]);

  const filtered = search
    ? contrats.filter(c => {
        const q = search.toLowerCase();
        return (c.client_nom || c.prospect_nom || '').toLowerCase().includes(q)
          || (c.collaborateur_nom || '').toLowerCase().includes(q);
      })
    : contrats;

  const stats = {
    total: contrats.length,
    actifs: contrats.filter(c => c.statut === 'mission_active').length,
    signees: contrats.filter(c => c.statut === 'ldm_signee').length,
    ca: contrats.filter(c => c.statut === 'mission_active').reduce((s, c) => s + parseFloat(c.honoraires_ht || 0), 0),
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Contrats & missions</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Vue globale de tous les contrats clients
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Total contrats', value: stats.total, color: '#6b7280' },
            { label: 'Missions actives', value: stats.actifs, color: '#059669' },
            { label: 'LDM signées', value: stats.signees, color: '#00897b' },
            { label: 'CA missions actives', value: fmt(stats.ca), color: '#1d4ed8', big: true },
          ].map(s => (
            <div key={s.label} className="card" style={{ flex: 1, padding: '16px 20px' }}>
              <div style={{ fontSize: s.big ? 20 : 28, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-control"
            placeholder="Rechercher client, collaborateur…"
            style={{ maxWidth: 280 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 200 }}
            value={filterStatut}
            onChange={e => { setFilterStatut(e.target.value); setLoading(true); }}
          >
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Client / Prospect</th>
                  <th>Statut</th>
                  <th>Collaborateur</th>
                  <th style={{ textAlign: 'right' }}>Honoraires HT</th>
                  <th>Date devis</th>
                  <th>Date signature</th>
                  <th>Date début</th>
                  <th style={{ textAlign: 'center' }}>Mandats</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Aucun contrat
                  </td></tr>
                )}
                {filtered.map(c => (
                  <tr key={c.id}
                    onClick={() => c.client_id && navigate(`/clients/${c.client_id}`)}
                    style={{ cursor: c.client_id ? 'pointer' : 'default' }}
                  >
                    <td style={{ fontWeight: 600 }}>
                      {c.client_nom || c.prospect_nom || '—'}
                      {c.prospect_nom && <span style={{ fontSize: 11, color: '#8b5cf6', marginLeft: 6 }}>prospect</span>}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                        background: (STATUT_COLORS[c.statut] || '#6b7280') + '18',
                        color: STATUT_COLORS[c.statut] || '#6b7280',
                        border: `1px solid ${(STATUT_COLORS[c.statut] || '#6b7280')}40`,
                      }}>
                        {STATUTS[c.statut] || c.statut}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{c.collaborateur_nom || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.honoraires_ht ? fmt(c.honoraires_ht) : '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(c.date_devis)}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(c.date_signature)}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(c.date_debut_mission)}</td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {c.nb_mandats > 0
                        ? <span style={{ color: c.nb_mandats_signes === c.nb_mandats ? '#059669' : '#f59e0b', fontWeight: 600 }}>
                            {c.nb_mandats_signes}/{c.nb_mandats}
                          </span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
