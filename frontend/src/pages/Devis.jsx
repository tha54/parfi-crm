import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import HonorairesModal from '../components/HonorairesModal';

const STATUTS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' };
const STATUT_COLORS = { brouillon: 'autre', envoye: 'en_cours', accepte: 'termine', refuse: 'reporte', expire: 'inactif' };

function StatutBadge({ s }) {
  return <span className={`badge badge-${STATUT_COLORS[s] || 'autre'}`}>{STATUTS[s] || s}</span>;
}

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

/* ─── Main Devis component ───────────────────────────────────────── */
export default function Devis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [devis, setDevis]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [initialEntity, setInitialEntity] = useState(null);
  const [initialOpportuniteId, setInitialOpportuniteId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [search, setSearch]     = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const reload = () => api.get('/devis').then(r => setDevis(r.data));

  useEffect(() => {
    api.get('/devis').then(r => setDevis(r.data)).finally(() => setLoading(false));
  }, []);

  // Handle URL params from Pipeline "Créer un devis" button
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const nom        = searchParams.get('nom') || '';
      const prospectId = searchParams.get('prospect_id') || '';
      const clientId   = searchParams.get('client_id') || '';
      const oppId      = searchParams.get('opp_id') || '';
      if (clientId) {
        setInitialEntity({ id: Number(clientId), nom, type: 'client' });
      } else if (prospectId || nom) {
        setInitialEntity(prospectId ? { id: Number(prospectId), nom, type: 'prospect' } : { id: null, nom, type: 'prospect' });
      }
      setInitialOpportuniteId(oppId ? Number(oppId) : null);
      setEditData(null);
      setShowModal(true);
      setSearchParams({}, { replace: true });
      return;
    }
    const editId = searchParams.get('edit');
    if (editId) {
      api.get(`/devis/${editId}`).then(r => {
        const d = r.data;
        setEditData(d);
        setInitialEntity(
          d.client_id ? { id: d.client_id, nom: d.client_nom || '', type: 'client' } :
          d.prospect_id ? { id: d.prospect_id, nom: d.prospect_nom || '', type: 'prospect' } :
          null
        );
        setShowModal(true);
        setSearchParams({}, { replace: true });
      }).catch(() => alert('Devis introuvable'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = devis.filter(d => {
    const q = search.toLowerCase();
    const nom = d.client_nom || d.prospect_nom || d.display_nom || '';
    const matchSearch = !q || d.numero?.toLowerCase().includes(q) || d.titre?.toLowerCase().includes(q) || nom.toLowerCase().includes(q);
    const matchStatut = !filterStatut || d.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const totalHT  = filtered.reduce((s, d) => s + parseFloat(d.totalHT  || 0), 0);
  const totalTTC = filtered.reduce((s, d) => s + parseFloat(d.totalTTC || 0), 0);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Devis</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="text-muted text-sm">{filtered.length} devis · {fmt(totalTTC)} TTC</span>
          {canEdit && <button className="btn btn-primary" onClick={() => { setInitialEntity(null); setInitialOpportuniteId(null); setEditData(null); setShowModal(true); }}>+ Nouveau devis</button>}
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher (n°, titre, client, prospect)…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Résumé statuts */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {Object.entries(STATUTS).map(([k, v]) => {
            const count = devis.filter(d => d.statut === k).length;
            return (
              <div key={k} className="kpi-card"
                style={{ cursor: 'pointer', borderTop: `3px solid ${k === 'accepte' ? '#00897b' : k === 'envoye' ? '#00b4d8' : k === 'refuse' ? '#d63031' : '#6b7c93'}` }}
                onClick={() => setFilterStatut(filterStatut === k ? '' : k)}>
                <div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>{count}</div>
                  <div className="kpi-label">{v}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <p>Aucun devis{search || filterStatut ? ' pour ces filtres' : ''}</p>
                {canEdit && !search && !filterStatut && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowModal(true)}>Créer le premier devis</button>}
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client / Prospect</th>
                      <th>Titre</th>
                      <th>Statut</th>
                      <th>Total HT</th>
                      <th>Total TTC</th>
                      <th>Validité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id} onClick={e => { if (!e.target.closest('select,button')) navigate(`/devis/${d.id}`); }} style={{ cursor: 'pointer' }}>
                        <td><code style={{ fontSize: 12 }}>{d.numero}</code></td>
                        <td>
                          {d.client_nom
                            ? d.client_nom
                            : d.prospect_nom
                              ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {d.prospect_nom}
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', whiteSpace: 'nowrap' }}>
                                    Prospect
                                  </span>
                                </span>
                              )
                              : <span className="text-muted">—</span>
                          }
                        </td>
                        <td>{d.titre}</td>
                        <td><StatutBadge s={d.statut} /></td>
                        <td>{fmt(d.totalHT)}</td>
                        <td><strong>{fmt(d.totalTTC)}</strong></td>
                        <td>{d.dateValidite ? new Date(d.dateValidite).toLocaleDateString('fr-FR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg)' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 600 }}>Total filtré</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(totalHT)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--primary)' }}>{fmt(totalTTC)}</td>
                      <td colSpan={canEdit ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <HonorairesModal
          type="devis"
          initialEntity={initialEntity}
          initialOpportuniteId={initialOpportuniteId}
          initialData={editData}
          onSaved={async (id) => { setShowModal(false); setEditData(null); setInitialOpportuniteId(null); await reload(); navigate(`/devis/${id}`); }}
          onClose={() => { setShowModal(false); setEditData(null); setInitialOpportuniteId(null); }}
        />
      )}
    </>
  );
}
