import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Contrats from './Contrats';
import HonorairesModal from '../components/HonorairesModal';

const STATUTS = { brouillon: 'Brouillon', envoyee: 'Envoyée', signee: 'Signée', archivee: 'Archivée' };
const STATUT_COLORS = { brouillon: 'autre', envoyee: 'en_cours', signee: 'termine', archivee: 'inactif' };

const TYPES_MISSION = {
  tenue_comptable: 'Tenue comptable',
  revision: 'Révision',
  etablissement_comptes: 'Établissement des comptes',
  fiscal: 'Fiscal',
  social_paie: 'Social / Paie',
  conseil: 'Conseil',
  juridique: 'Juridique',
  autre: 'Autre',
};

function StatutBadge({ s }) {
  return <span className={`badge badge-${STATUT_COLORS[s] || 'autre'}`}>{STATUTS[s] || s}</span>;
}

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

export default function LettresMission() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'contrats' ? 'contrats' : 'ldm');
  const [lettres, setLettres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  useEffect(() => {
    api.get('/lettres-mission').then(r => setLettres(r.data)).finally(() => setLoading(false));
  }, []);

  const reload = () => api.get('/lettres-mission').then(r => setLettres(r.data));

  const [showHonorairesModal, setShowHonorairesModal] = useState(false);

  const openCreate = () => setShowHonorairesModal(true);

  const changeStatut = async (l, statut) => {
    try { await api.put(`/lettres-mission/${l.id}`, { statut }); await reload(); }
    catch { alert('Erreur'); }
  };

  const del = async (l) => {
    if (!confirm(`Supprimer la lettre ${l.numero} ?`)) return;
    try { await api.delete(`/lettres-mission/${l.id}`); await reload(); }
    catch { alert('Erreur'); }
  };

  const filtered = lettres.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.numero?.toLowerCase().includes(q) || l.client_nom?.toLowerCase().includes(q) || TYPES_MISSION[l.typeMission]?.toLowerCase().includes(q);
    const matchStatut = !filterStatut || l.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const totalHonoraires = lettres.filter(l => l.statut === 'signee').reduce((s, l) => s + parseFloat(l.montantHonorairesHT || 0), 0);

  const TabBar = () => (
    <div style={{
      display: 'flex', gap: 0,
      borderBottom: '2px solid var(--border)',
      background: 'var(--bg-primary)',
      padding: '0 24px',
    }}>
      {[
        { key: 'ldm',      icon: '📋', label: 'Lettres de mission' },
        { key: 'contrats', icon: '🤝', label: 'Contrats actifs' },
      ].map(({ key, icon, label }) => (
        <button key={key} onClick={() => setTab(key)} style={{
          padding: '12px 20px', border: 'none',
          borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: -2, background: 'none', cursor: 'pointer',
          fontWeight: tab === key ? 700 : 400,
          color: tab === key ? 'var(--primary)' : 'var(--text-secondary)',
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {icon} {label}
        </button>
      ))}
    </div>
  );

  if (tab === 'contrats') return (
    <>
      <TabBar />
      <Contrats />
    </>
  );

  if (loading) return <><TabBar /><div className="spinner"><div className="spinner-ring" /></div></>;

  return (
    <>
      <TabBar />
      <div className="page-header">
        <h1>Lettres de mission</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && <button className="btn btn-primary" onClick={openCreate}>+ Nouvelle lettre</button>}
        </div>
      </div>

      <div className="page-body">
        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {Object.entries(STATUTS).map(([k, v]) => {
            const count = lettres.filter(l => l.statut === k).length;
            const color = k === 'signee' ? '#00897b' : k === 'envoyee' ? '#00b4d8' : k === 'archivee' ? '#6b7c93' : '#e67e22';
            return (
              <div key={k} className="kpi-card" style={{ cursor: 'pointer', borderTop: `3px solid ${color}` }}
                onClick={() => setFilterStatut(filterStatut === k ? '' : k)}>
                <div><div className="kpi-value" style={{ color }}>{count}</div><div className="kpi-label">{v}</div></div>
              </div>
            );
          })}
          <div className="kpi-card" style={{ borderTop: '3px solid #00897b' }}>
            <span className="kpi-icon">💼</span>
            <div><div className="kpi-value" style={{ color: '#00897b', fontSize: 20 }}>{fmt(totalHonoraires)}</div><div className="kpi-label">Honoraires signés</div></div>
          </div>
        </div>

        {/* Filtres */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher (n°, client, type)…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p>Aucune lettre de mission{search || filterStatut ? ' pour ces filtres' : ''}</p>
                {canEdit && !search && !filterStatut && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openCreate}>Créer la première lettre</button>}
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Type de mission</th>
                      <th>Statut</th>
                      <th>Honoraires HT</th>
                      <th>Début</th>
                      <th>Fin</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(l => (
                      <tr key={l.id} onClick={e => { if (!e.target.closest('select,button')) navigate(`/lettres-mission/${l.id}`); }} style={{ cursor: 'pointer' }}>
                        <td><code style={{ fontSize: 12 }}>{l.numero}</code></td>
                        <td>{l.client_nom || <span className="text-muted">—</span>}</td>
                        <td>
                          <span className="badge badge-en_cours" style={{ background: '#eff6ff', color: '#1e40af' }}>
                            {TYPES_MISSION[l.typeMission] || l.typeMission}
                          </span>
                        </td>
                        <td><StatutBadge s={l.statut} /></td>
                        <td><strong>{fmt(l.montantHonorairesHT)}</strong></td>
                        <td>{l.dateDebut ? new Date(l.dateDebut).toLocaleDateString('fr-FR') : '—'}</td>
                        <td>{l.dateFin ? new Date(l.dateFin).toLocaleDateString('fr-FR') : <span className="text-muted">Indéterminée</span>}</td>
                        {canEdit && (
                          <td>
                            <div className="td-actions">
                              <select className="form-control" style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
                                value={l.statut} onChange={e => changeStatut(l, e.target.value)}>
                                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/lettres-mission/${l.id}`)}>✏️</button>
                              {user?.role === 'expert' && <button className="btn btn-danger btn-sm" onClick={() => del(l)}>🗑</button>}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHonorairesModal && (
        <HonorairesModal
          type="ldm"
          onSaved={async (id) => { setShowHonorairesModal(false); await reload(); navigate(`/lettres-mission/${id}`); }}
          onClose={() => setShowHonorairesModal(false)}
        />
      )}
    </>
  );
}
