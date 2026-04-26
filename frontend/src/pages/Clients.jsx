import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPES = ['BIC', 'BNC', 'SCI', 'SA', 'Association', 'Autre'];
const REGIMES = ['mensuel', 'trimestriel', 'annuel'];
const regimeLabel = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };
const typeBadge = (t) => {
  const map = { BIC: 'bic', BNC: 'bnc', SCI: 'sci', SA: 'sa', Association: 'assoc', Autre: 'autre' };
  return map[t] || 'autre';
};

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

function ClientForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ nom: '', siren: '', type: 'BIC', regime: 'mensuel', ...initial });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!initial?.id;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.siren && !/^\d{9,14}$/.test(form.siren.replace(/\s/g, ''))) {
      setError('Le SIREN doit contenir 9 à 14 chiffres'); return;
    }
    setLoading(true);
    try {
      const payload = { nom: form.nom, siren: form.siren || null, type: form.type, regime: form.regime };
      if (isEdit) await api.put(`/clients/${initial.id}`, payload);
      else await api.post('/clients', payload);
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
      <div className="form-group">
        <label className="form-label">Nom du client *</label>
        <input className="form-control" value={form.nom} onChange={set('nom')} required placeholder="SARL Exemple..." />
      </div>
      <div className="form-group">
        <label className="form-label">SIREN / SIRET</label>
        <input className="form-control" value={form.siren} onChange={set('siren')} placeholder="123456789" maxLength={14} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Type *</label>
          <select className="form-control" value={form.type} onChange={set('type')}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Régime TVA *</label>
          <select className="form-control" value={form.regime} onChange={set('regime')}>
            {REGIMES.map(r => <option key={r} value={r}>{regimeLabel[r]}</option>)}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

function AttributionsPanel({ client, users, onClose }) {
  const [attributions, setAttributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ utilisateur_id: '', role_sur_dossier: 'assistant' });
  const [adding, setAdding] = useState(false);

  const load = () => {
    api.get(`/attributions/client/${client.id}`).then(r => setAttributions(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, [client.id]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.utilisateur_id) return;
    setAdding(true);
    try {
      await api.post('/attributions', { client_id: client.id, utilisateur_id: parseInt(form.utilisateur_id), role_sur_dossier: form.role_sur_dossier });
      setForm({ utilisateur_id: '', role_sur_dossier: 'assistant' });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Erreur');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id) => {
    if (!confirm('Supprimer cette attribution ?')) return;
    await api.delete(`/attributions/${id}`);
    load();
  };

  const availableUsers = users.filter(u => !attributions.find(a => a.utilisateur_id === u.id));

  return (
    <div>
      <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>
        Collaborateurs assignés à <strong>{client.nom}</strong>
      </h3>
      {loading ? <div className="spinner"><div className="spinner-ring" /></div> : (
        <>
          {attributions.length === 0 ? (
            <p className="text-muted" style={{ marginBottom: '16px' }}>Aucun collaborateur assigné</p>
          ) : (
            <div style={{ marginBottom: '16px' }}>
              {attributions.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: '6px' }}>
                  <div>
                    <strong>{a.prenom} {a.nom}</strong>
                    <span style={{ marginLeft: '8px' }} className={`badge badge-${a.role_sur_dossier}`}>{a.role_sur_dossier}</span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRemove(a.id)}>Retirer</button>
                </div>
              ))}
            </div>
          )}
          {availableUsers.length > 0 && (
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ flex: 2 }} value={form.utilisateur_id} onChange={e => setForm(f => ({ ...f, utilisateur_id: e.target.value }))}>
                <option value="">Sélectionner un collaborateur...</option>
                {availableUsers.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
              </select>
              <select className="form-control" style={{ flex: 1 }} value={form.role_sur_dossier} onChange={e => setForm(f => ({ ...f, role_sur_dossier: e.target.value }))}>
                <option value="responsable">Responsable</option>
                <option value="assistant">Assistant</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={adding || !form.utilisateur_id}>Assigner</button>
            </form>
          )}
        </>
      )}
      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRegime, setFilterRegime] = useState('');

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    const calls = [api.get('/clients')];
    if (isExpertOrChef) calls.push(api.get('/utilisateurs'));
    Promise.all(calls).then(([cr, ur]) => {
      setClients(cr.data);
      if (ur) setUsers(ur.data.filter(u => u.actif));
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (c) => {
    if (!confirm(`Désactiver le client "${c.nom}" ?`)) return;
    await api.delete(`/clients/${c.id}`);
    load();
  };

  const filtered = clients.filter(c => {
    const matchSearch = `${c.nom} ${c.siren || ''}`.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType ? c.type === filterType : true;
    const matchRegime = filterRegime ? c.regime === filterRegime : true;
    return matchSearch && matchType && matchRegime;
  });

  return (
    <>
      <div className="page-header">
        <h1>Clients</h1>
        {isExpertOrChef && (
          <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>+ Nouveau client</button>
        )}
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher par nom, SIREN..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Tous les types</option>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="form-control" style={{ width: 'auto' }} value={filterRegime} onChange={e => setFilterRegime(e.target.value)}>
                <option value="">Tous les régimes</option>
                {REGIMES.map(r => <option key={r} value={r}>{regimeLabel[r]}</option>)}
              </select>
            </div>
            <span className="text-muted text-sm">{filtered.length} client(s)</span>
          </div>
          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">👥</div><p>Aucun client trouvé</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>SIREN</th>
                    <th>Type</th>
                    <th>Régime TVA</th>
                    {isExpertOrChef && <th>Collaborateurs</th>}
                    <th>Ajouté le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.nom}</strong></td>
                      <td><code style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{c.siren || '—'}</code></td>
                      <td><span className={`badge badge-${typeBadge(c.type)}`}>{c.type}</span></td>
                      <td><span className={`badge badge-${c.regime === 'trimestriel' ? 'trim' : c.regime}`}>{regimeLabel[c.regime]}</span></td>
                      {isExpertOrChef && <td><span className="text-muted text-sm">{c.collaborateurs || 'Non assigné'}</span></td>}
                      <td>{new Date(c.cree_le).toLocaleDateString('fr-FR')}</td>
                      <td>
                        <div className="td-actions">
                          {isExpertOrChef && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'attrs', client: c })}>Équipe</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', client: c })}>Modifier</button>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>Archiver</button>
                            </>
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
        <Modal title="Nouveau client" onClose={() => setModal(null)}>
          <ClientForm onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title="Modifier le client" onClose={() => setModal(null)}>
          <ClientForm initial={modal.client} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'attrs' && (
        <Modal title="Attribution de l'équipe" onClose={() => setModal(null)}>
          <AttributionsPanel client={modal.client} users={users} onClose={() => setModal(null)} />
        </Modal>
      )}
    </>
  );
}
