import { useState, useEffect } from 'react';
import api from '../services/api';

const roleLabel = { responsable: 'Responsable', assistant: 'Assistant' };

export default function Attributions() {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [attributions, setAttributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ client_id: '', utilisateur_id: '', role_sur_dossier: 'assistant' });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [cr, ur] = await Promise.all([api.get('/clients'), api.get('/utilisateurs')]);
      setClients(cr.data);
      setUsers(ur.data.filter(u => u.actif));
      // Get all attributions by fetching for each client — use a single endpoint instead
      const attrRes = await Promise.all(cr.data.map(c => api.get(`/attributions/client/${c.id}`)));
      const all = attrRes.flatMap((r, i) => r.data.map(a => ({ ...a, client_nom: cr.data[i].nom })));
      setAttributions(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.client_id || !form.utilisateur_id) return;
    setAdding(true);
    try {
      await api.post('/attributions', {
        client_id: parseInt(form.client_id),
        utilisateur_id: parseInt(form.utilisateur_id),
        role_sur_dossier: form.role_sur_dossier
      });
      setForm({ client_id: '', utilisateur_id: '', role_sur_dossier: 'assistant' });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette attribution ?')) return;
    await api.delete(`/attributions/${id}`);
    load();
  };

  const filtered = attributions.filter(a => {
    const matchSearch = `${a.client_nom} ${a.prenom} ${a.nom}`.toLowerCase().includes(search.toLowerCase());
    const matchUser = filterUser ? a.utilisateur_id === parseInt(filterUser) : true;
    return matchSearch && matchUser;
  });

  return (
    <>
      <div className="page-header">
        <h1>Attributions</h1>
      </div>
      <div className="page-body">
        {/* Add attribution form */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header"><span className="card-title">Nouvelle attribution</span></div>
          <div className="card-body">
            <form onSubmit={handleAdd}>
              <div className="form-row" style={{ gridTemplateColumns: '2fr 2fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Client</label>
                  <select className="form-control" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} required>
                    <option value="">Sélectionner un client...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Collaborateur</label>
                  <select className="form-control" value={form.utilisateur_id} onChange={e => setForm(f => ({ ...f, utilisateur_id: e.target.value }))} required>
                    <option value="">Sélectionner...</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Rôle</label>
                  <select className="form-control" value={form.role_sur_dossier} onChange={e => setForm(f => ({ ...f, role_sur_dossier: e.target.value }))}>
                    <option value="responsable">Responsable</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={adding} style={{ marginBottom: 0 }}>
                  {adding ? '...' : 'Attribuer'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Attributions list */}
        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 'auto' }} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="">Tous les collaborateurs</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
            </div>
            <span className="text-muted text-sm">{filtered.length} attribution(s)</span>
          </div>
          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">🔗</div><p>Aucune attribution</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Collaborateur</th>
                    <th>Rôle sur dossier</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => (
                    <tr key={a.id}>
                      <td><strong>{a.client_nom}</strong></td>
                      <td>{a.prenom} {a.nom}<br /><span className="text-muted text-sm">{a.email}</span></td>
                      <td><span className={`badge badge-${a.role_sur_dossier}`}>{roleLabel[a.role_sur_dossier]}</span></td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>Supprimer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
