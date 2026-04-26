import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TaskCommentDrawer from '../components/TaskCommentDrawer';

const STATUTS = ['a_faire', 'en_cours', 'termine', 'reporte'];
const statutLabel = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };

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

function TacheForm({ initial, clients, users, currentUser, onSave, onCancel }) {
  const isExpertOrChef = ['expert', 'chef_mission'].includes(currentUser?.role);
  const [form, setForm] = useState({
    client_id: '', utilisateur_id: isExpertOrChef ? '' : currentUser?.id, description: '',
    duree: '', date_echeance: '', source: 'manuelle', ...initial
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!initial?.id;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        client_id: form.client_id || null,
        utilisateur_id: form.utilisateur_id || currentUser.id,
        description: form.description,
        duree: parseFloat(form.duree),
        date_echeance: form.date_echeance,
        source: form.source,
      };
      if (isEdit) {
        await api.put(`/taches/${initial.id}`, { description: payload.description, duree: payload.duree, date_echeance: payload.date_echeance });
      } else {
        await api.post('/taches', payload);
      }
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
        <label className="form-label">Description *</label>
        <input className="form-control" value={form.description} onChange={set('description')} required placeholder="Description de la tâche..." />
      </div>
      {!isEdit && isExpertOrChef && (
        <div className="form-group">
          <label className="form-label">Assigner à</label>
          <select className="form-control" value={form.utilisateur_id} onChange={set('utilisateur_id')}>
            <option value="">Soi-même</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        </div>
      )}
      {!isEdit && (
        <div className="form-group">
          <label className="form-label">Client lié</label>
          <select className="form-control" value={form.client_id} onChange={set('client_id')}>
            <option value="">Aucun</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Durée (h) *</label>
          <input type="number" step="0.5" min="0" className="form-control" value={form.duree} onChange={set('duree')} required placeholder="1.5" />
        </div>
        <div className="form-group">
          <label className="form-label">Échéance *</label>
          <input type="date" className="form-control" value={form.date_echeance?.split('T')[0] || form.date_echeance} onChange={set('date_echeance')} required />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Enregistrement...' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

export default function Taches() {
  const { user } = useAuth();
  const [taches, setTaches] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');
  const [selectedTache, setSelectedTache] = useState(null);
  const [commentCounts, setCommentCounts] = useState({});
  const [taskDeps, setTaskDeps] = useState({});

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    const calls = [api.get('/taches'), api.get('/clients'), api.get('/utilisateurs')];
    Promise.all(calls).then(([tr, cr, ur]) => {
      const tachesData = tr.data;
      setTaches(tachesData);
      setClients(cr.data);
      if (ur) setUsers(ur.data.filter(u => u.actif));

      // Fetch comment counts and dependencies for each task
      tachesData.forEach(t => {
        api.get(`/commentaires/tache/${t.id}`)
          .then(r => setCommentCounts(prev => ({ ...prev, [t.id]: (r.data || []).length })))
          .catch(() => {});
        api.get(`/taches/${t.id}/dependances`)
          .then(r => setTaskDeps(prev => ({ ...prev, [t.id]: r.data || [] })))
          .catch(() => {});
      });
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleStatut = async (t, statut) => {
    await api.put(`/taches/${t.id}`, { statut });
    load();
  };

  const handleDelete = async (t) => {
    if (!confirm('Supprimer cette tâche ?')) return;
    await api.delete(`/taches/${t.id}`);
    load();
  };

  const filtered = taches.filter(t => {
    const matchStatut = filterStatut ? t.statut === filterStatut : true;
    const matchSearch = `${t.description} ${t.client_nom || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchStatut && matchSearch;
  });

  const isOverdue = (t) => t.statut !== 'termine' && new Date(t.date_echeance) < new Date();

  return (
    <>
      <div className="page-header">
        <h1>Tâches</h1>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>+ Nouvelle tâche</button>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {STATUTS.map(s => <option key={s} value={s}>{statutLabel[s]}</option>)}
              </select>
            </div>
            <span className="text-muted text-sm">{filtered.length} tâche(s)</span>
          </div>
          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">✅</div><p>Aucune tâche</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Client</th>
                    {isExpertOrChef && <th>Assigné à</th>}
                    <th>Durée</th>
                    <th>Échéance</th>
                    <th>Reports</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const deps = taskDeps[t.id] || [];
                    const hasBlockingDep = deps.some(d => d.statut !== 'termine');
                    const blockingNames = deps.filter(d => d.statut !== 'termine').map(d => d.description || d.titre).join(', ');
                    const commentCount = commentCounts[t.id] || 0;
                    return (
                    <tr key={t.id} style={isOverdue(t) ? { background: '#fff8f8' } : {}}>
                      <td>
                        {hasBlockingDep && (
                          <span title={`Bloquée par : ${blockingNames}`} style={{ marginRight: 5, cursor: 'help' }}>🔒</span>
                        )}
                        {t.description}
                        {isOverdue(t) && <span style={{ marginLeft: '6px', color: 'var(--danger)', fontSize: '11px' }}>⚠ En retard</span>}
                      </td>
                      <td>{t.client_nom || <span className="text-muted">—</span>}</td>
                      {isExpertOrChef && <td>{t.prenom} {t.user_nom}</td>}
                      <td>{t.duree}h</td>
                      <td>{new Date(t.date_echeance).toLocaleDateString('fr-FR')}</td>
                      <td>{t.reports > 0 ? <span style={{ color: 'var(--warning)' }}>{t.reports}×</span> : '—'}</td>
                      <td>
                        <select
                          className="form-control"
                          style={{ padding: '3px 6px', fontSize: '12px', width: 'auto' }}
                          value={t.statut}
                          onChange={e => handleStatut(t, e.target.value)}
                        >
                          {STATUTS.map(s => <option key={s} value={s}>{statutLabel[s]}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="td-actions">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSelectedTache(t)}
                            title="Commentaires et détails"
                          >
                            💬{commentCount > 0 && <span style={{ marginLeft: 3, background: '#00B4D8', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{commentCount}</span>}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', tache: t })}>Modifier</button>
                          {isExpertOrChef && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>Supprimer</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modal?.type === 'create' && (
        <Modal title="Nouvelle tâche" onClose={() => setModal(null)}>
          <TacheForm clients={clients} users={users} currentUser={user} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title="Modifier la tâche" onClose={() => setModal(null)}>
          <TacheForm initial={modal.tache} clients={clients} users={users} currentUser={user} onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {selectedTache && (
        <TaskCommentDrawer
          tache={selectedTache}
          onClose={() => { setSelectedTache(null); load(); }}
          utilisateurs={users}
        />
      )}
    </>
  );
}
