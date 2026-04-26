import { useState, useEffect } from 'react';
import api from '../services/api';

const roleLabel = { expert: 'Expert-Comptable', chef_mission: 'Chef de Mission', collaborateur: 'Collaborateur' };
const roleBadge = { expert: 'expert', chef_mission: 'chef', collaborateur: 'collab' };

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function UserForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ nom: '', prenom: '', email: '', role: 'collaborateur', mot_de_passe: '', ...initial });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!initial?.id;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = { nom: form.nom, prenom: form.prenom, email: form.email, role: form.role };
      if (form.mot_de_passe) payload.mot_de_passe = form.mot_de_passe;
      if (!isEdit) {
        if (!form.mot_de_passe) { setError('Mot de passe requis'); setLoading(false); return; }
        payload.mot_de_passe = form.mot_de_passe;
      }
      if (isEdit) await api.put(`/utilisateurs/${initial.id}`, payload);
      else await api.post('/utilisateurs', payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Prénom</label>
          <input className="form-control" value={form.prenom} onChange={set('prenom')} required />
        </div>
        <div className="form-group">
          <label className="form-label">Nom</label>
          <input className="form-control" value={form.nom} onChange={set('nom')} required />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Email</label>
        <input type="email" className="form-control" value={form.email} onChange={set('email')} required />
      </div>
      <div className="form-group">
        <label className="form-label">Rôle</label>
        <select className="form-control" value={form.role} onChange={set('role')}>
          <option value="collaborateur">Collaborateur</option>
          <option value="chef_mission">Chef de Mission</option>
          <option value="expert">Expert-Comptable</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">{isEdit ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe'}</label>
        <input type="password" className="form-control" value={form.mot_de_passe} onChange={set('mot_de_passe')} placeholder={isEdit ? '••••••••' : ''} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

export default function Collaborateurs() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/utilisateurs').then(r => setUsers(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (u) => {
    if (!confirm(`Désactiver ${u.prenom} ${u.nom} ?`)) return;
    await api.delete(`/utilisateurs/${u.id}`);
    load();
  };

  const handleReactivate = async (u) => {
    await api.put(`/utilisateurs/${u.id}`, { actif: 1 });
    load();
  };

  const filtered = users.filter(u =>
    `${u.prenom} ${u.nom} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-header">
        <h1>Collaborateurs</h1>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>+ Nouveau collaborateur</button>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <span className="text-muted text-sm">{filtered.length} utilisateur(s)</span>
          </div>
          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">👤</div><p>Aucun collaborateur trouvé</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Email</th>
                    <th>Rôle</th>
                    <th>Statut</th>
                    <th>Depuis</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.prenom} {u.nom}</strong></td>
                      <td>{u.email}</td>
                      <td><span className={`badge badge-${roleBadge[u.role]}`}>{roleLabel[u.role]}</span></td>
                      <td>
                        <span className={`badge badge-${u.actif ? 'actif' : 'inactif'}`}>
                          {u.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td>{new Date(u.cree_le).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <div className="td-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', user: u })}>Modifier</button>
                          {u.actif ? (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>Désactiver</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleReactivate(u)}>Réactiver</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modal?.type === 'create' && (
        <Modal title="Nouveau collaborateur" onClose={() => setModal(null)}>
          <UserForm onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title="Modifier le collaborateur" onClose={() => setModal(null)}>
          <UserForm initial={modal.user} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </>
  );
}
