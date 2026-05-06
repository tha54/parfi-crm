import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const MISSION_LABELS = {
  tenue_comptable: 'Tenue comptable',
  revision: 'Révision',
  etablissement_comptes: 'Établissement des comptes',
  fiscal: 'Fiscal',
  social_paie: 'Social / Paie',
  conseil: 'Conseil',
  juridique: 'Juridique',
  autre: 'Autre',
};

const STATUT_COLORS = {
  brouillon: 'autre',
  envoyee: 'en_cours',
  signee: 'termine',
  archivee: 'inactif',
};

const STATUT_LABELS = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée',
  signee: 'Signée',
  archivee: 'Archivée',
};

export default function Cabinet() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCollab, setFilterCollab] = useState('');

  useEffect(() => {
    api.get('/clients/cabinet')
      .then(r => setRows(r.data))
      .finally(() => setLoading(false));
  }, []);

  const collabs = useMemo(() => {
    const seen = new Set();
    return rows
      .filter(r => r.collab_nom)
      .filter(r => {
        const key = `${r.collab_prenom} ${r.collab_nom}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(r => ({ prenom: r.collab_prenom, nom: r.collab_nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase();
    if (q && !r.nom.toLowerCase().includes(q) && !(r.ldm_numero || '').toLowerCase().includes(q)) return false;
    if (filterStatut) {
      if (filterStatut === 'sans_ldm' && r.ldm_id) return false;
      if (filterStatut !== 'sans_ldm' && r.ldm_statut !== filterStatut) return false;
    }
    if (filterCollab && `${r.collab_prenom} ${r.collab_nom}` !== filterCollab) return false;
    return true;
  }), [rows, search, filterStatut, filterCollab]);

  const totalHonoraires = filtered.reduce((s, r) => s + parseFloat(r.honoraires_annuel || 0), 0);
  const avecLdmSignee = filtered.filter(r => r.ldm_statut === 'signee').length;

  return (
    <>
      <div className="page-header">
        <h1>Cabinet — Portefeuille clients</h1>
      </div>
      <div className="page-body">
        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card" style={{ borderTop: '3px solid var(--primary)' }}>
            <div className="kpi-value">{filtered.length}</div>
            <div className="kpi-label">Clients actifs</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #22c55e' }}>
            <div className="kpi-value" style={{ color: '#22c55e' }}>{avecLdmSignee}</div>
            <div className="kpi-label">LDM signées</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #f59e0b' }}>
            <div className="kpi-value" style={{ color: '#f59e0b' }}>{filtered.filter(r => !r.ldm_id).length}</div>
            <div className="kpi-label">Sans LDM</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid var(--accent)' }}>
            <div className="kpi-value">{fmt(totalHonoraires)}</div>
            <div className="kpi-label">Honoraires annuels (sélection)</div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #8b5cf6' }}>
            <div className="kpi-value">{fmt(totalHonoraires / 12)}</div>
            <div className="kpi-label">Honoraires mensuels</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input
                className="form-control search-input"
                placeholder="Rechercher un client ou n° LDM..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ minWidth: 220 }}
              />
              <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                <option value="signee">Signée</option>
                <option value="envoyee">Envoyée</option>
                <option value="brouillon">Brouillon</option>
                <option value="sans_ldm">Sans LDM</option>
              </select>
              {collabs.length > 0 && (
                <select className="form-control" style={{ width: 'auto' }} value={filterCollab} onChange={e => setFilterCollab(e.target.value)}>
                  <option value="">Tous les collaborateurs</option>
                  {collabs.map(c => (
                    <option key={`${c.prenom} ${c.nom}`} value={`${c.prenom} ${c.nom}`}>{c.prenom} {c.nom}</option>
                  ))}
                </select>
              )}
            </div>
            <span className="text-muted text-sm">{filtered.length} client(s)</span>
          </div>

          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🗂️</div>
                <p>Aucun client trouvé</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>LDM</th>
                    <th>Mission</th>
                    <th>Statut LDM</th>
                    <th>Collaborateur</th>
                    <th style={{ textAlign: 'right' }}>Honoraires / an</th>
                    <th style={{ textAlign: 'right' }}>/ mois</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr
                      key={r.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => r.ldm_id ? navigate(`/lettres-mission/${r.ldm_id}`) : navigate(`/clients/${r.id}`)}
                    >
                      <td>
                        <strong
                          style={{ cursor: 'pointer', color: 'var(--primary)' }}
                          onClick={e => { e.stopPropagation(); navigate(`/clients/${r.id}`); }}
                        >
                          {r.nom}
                        </strong>
                      </td>
                      <td><span className="badge badge-autre">{r.type}</span></td>
                      <td>
                        {r.ldm_id ? (
                          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.ldm_numero}</span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {MISSION_LABELS[r.ldm_type_mission] || r.ldm_type_mission || '—'}
                      </td>
                      <td>
                        {r.ldm_statut ? (
                          <span className={`badge badge-${STATUT_COLORS[r.ldm_statut] || 'autre'}`}>
                            {STATUT_LABELS[r.ldm_statut] || r.ldm_statut}
                          </span>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 12 }}>Aucune LDM</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {r.collab_nom ? `${r.collab_prenom} ${r.collab_nom}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {r.honoraires_annuel > 0 ? fmt(r.honoraires_annuel) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                        {r.honoraires_annuel > 0 ? fmt(r.honoraires_annuel / 12) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                    <td colSpan={6} style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                      Total sélection ({filtered.length} clients)
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmt(totalHonoraires)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmt(totalHonoraires / 12)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
