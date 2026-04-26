import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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
  const [lettres, setLettres] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    client_id: '', typeMission: 'tenue_comptable', objetMission: '',
    montantHonorairesHT: '', dateDebut: '', dateFin: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      api.get('/lettres-mission').then(r => setLettres(r.data)),
      api.get('/clients').then(r => setClients(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const reload = () => api.get('/lettres-mission').then(r => setLettres(r.data));

  const openCreate = () => {
    const today = new Date().toISOString().substring(0, 10);
    setForm({ client_id: '', typeMission: 'tenue_comptable', objetMission: '', montantHonorairesHT: '', dateDebut: today, dateFin: '' });
    setErr(''); setModal('create');
  };

  const openEdit = (l) => {
    setForm({
      client_id: l.client_id || '',
      typeMission: l.typeMission || 'tenue_comptable',
      objetMission: l.objetMission || '',
      montantHonorairesHT: l.montantHonorairesHT || '',
      dateDebut: l.dateDebut ? l.dateDebut.substring(0, 10) : '',
      dateFin: l.dateFin ? l.dateFin.substring(0, 10) : '',
    });
    setErr(''); setModal(l);
  };

  const save = async () => {
    if (!form.client_id || !form.typeMission) { setErr('Client et type de mission requis'); return; }
    setSaving(true); setErr('');
    try {
      if (modal === 'create') await api.post('/lettres-mission', form);
      else await api.put(`/lettres-mission/${modal.id}`, form);
      await reload(); setModal(null);
    } catch (e) { setErr(e.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

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

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Lettres de mission</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dimensionnement')} title="Calculer les honoraires et créer une LDM depuis le dimensionnement">
              📐 Dimensionner
            </button>
          )}
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
                      <tr key={l.id}>
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
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(l)}>✏️</button>
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

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Nouvelle lettre de mission' : `Modifier ${modal.numero}`}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12 }}
                  onClick={() => navigate(`/dimensionnement?returnTo=ldm${form.client_id ? `&clientId=${form.client_id}` : ''}`)}
                  title="Calculer les honoraires depuis le dimensionnement"
                >
                  📐 Calculer avec le dimensionnement
                </button>
                <button className="modal-close" onClick={() => setModal(null)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select className="form-control" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Type de mission *</label>
                  <select className="form-control" value={form.typeMission} onChange={e => setForm(f => ({ ...f, typeMission: e.target.value }))}>
                    {Object.entries(TYPES_MISSION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Objet de la mission</label>
                <textarea className="form-control" rows={3} value={form.objetMission} onChange={e => setForm(f => ({ ...f, objetMission: e.target.value }))} placeholder="Description des prestations confiées…" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Honoraires HT (€)</label>
                  <input type="number" className="form-control" value={form.montantHonorairesHT} onChange={e => setForm(f => ({ ...f, montantHonorairesHT: e.target.value }))} min="0" step="0.01" placeholder="0.00" />
                </div>
                <div className="form-group" />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date de début</label>
                  <input type="date" className="form-control" value={form.dateDebut} onChange={e => setForm(f => ({ ...f, dateDebut: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date de fin <span className="text-muted">(optionnel)</span></label>
                  <input type="date" className="form-control" value={form.dateFin} onChange={e => setForm(f => ({ ...f, dateFin: e.target.value }))} />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
