import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  conges_payes: 'Congés payés', rtt: 'RTT', maladie: 'Arrêt maladie',
  formation: 'Formation', ferie: 'Jour férié', autre: 'Autre',
};
const STATUT_BADGES = {
  en_attente: { label: 'En attente', bg: '#fef3c7', color: '#92400e' },
  validee: { label: 'Validée', bg: '#dcfce7', color: '#166534' },
  refusee: { label: 'Refusée', bg: '#fee2e2', color: '#991b1b' },
};

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
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

function AbsenceForm({ onSave, onCancel, users, currentUser, isExpertOrChef }) {
  const [form, setForm] = useState({
    utilisateur_id: currentUser.id,
    type: 'conges_payes',
    date_debut: '',
    date_fin: '',
    nb_jours: 1,
    commentaire: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.date_debut || !form.date_fin) { setErr('Dates requises'); return; }
    setLoading(true);
    try {
      await api.post('/absences', form);
      onSave();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {err && <div className="alert alert-error">{err}</div>}
      {isExpertOrChef && (
        <div className="form-group">
          <label className="form-label">Collaborateur</label>
          <select className="form-control" value={form.utilisateur_id} onChange={set('utilisateur_id')}>
            {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Type *</label>
        <select className="form-control" value={form.type} onChange={set('type')}>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Début *</label>
          <input type="date" className="form-control" value={form.date_debut} onChange={set('date_debut')} required />
        </div>
        <div className="form-group">
          <label className="form-label">Fin *</label>
          <input type="date" className="form-control" value={form.date_fin} onChange={set('date_fin')} required />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Nombre de jours</label>
        <input type="number" className="form-control" min="0.5" step="0.5" value={form.nb_jours} onChange={set('nb_jours')} />
      </div>
      <div className="form-group">
        <label className="form-label">Commentaire</label>
        <textarea className="form-control" rows={2} value={form.commentaire} onChange={set('commentaire')} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Envoi…' : 'Soumettre la demande'}
        </button>
      </div>
    </form>
  );
}

export default function Absences() {
  const { user } = useAuth();
  const [absences, setAbsences] = useState([]);
  const [users, setUsers] = useState([]);
  const [feries, setFeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterUser, setFilterUser] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    const calls = [api.get('/absences'), api.get('/absences/feries')];
    if (isExpertOrChef) calls.push(api.get('/utilisateurs'));
    Promise.all(calls).then(([ar, fr, ur]) => {
      setAbsences(ar.data);
      setFeries(fr.data);
      if (ur) setUsers(ur.data.filter(u => u.actif));
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleValidate = async (id, statut) => {
    await api.put(`/absences/${id}/valider`, { statut });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette demande ?')) return;
    await api.delete(`/absences/${id}`);
    load();
  };

  const filtered = absences.filter(a => {
    const matchUser = filterUser ? a.utilisateur_id == filterUser : true;
    const matchStatut = filterStatut ? a.statut === filterStatut : true;
    return matchUser && matchStatut;
  });

  // Compute balance for current user
  const myAbsences = absences.filter(a => a.utilisateur_id === user?.id);
  const takenDays = myAbsences
    .filter(a => a.type === 'conges_payes' && a.statut === 'validee')
    .reduce((s, a) => s + parseFloat(a.nb_jours || 0), 0);
  const currentYear = new Date().getFullYear();
  const acquired = Math.min(25, ((new Date().getMonth() + 1) * 25 / 12)).toFixed(1);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Absences</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {currentYear} — CP acquis : {acquired}j · pris : {takenDays}j · solde : {(acquired - takenDays).toFixed(1)}j
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Poser des congés</button>
      </div>

      <div className="page-body">
        {/* Jours fériés */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>Jours fériés {currentYear}</strong></div>
          <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {feries.map(f => (
              <span key={f.id} style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                {new Date(f.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} — {f.nom}
              </span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              {isExpertOrChef && (
                <select className="form-control" style={{ width: 'auto' }} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                  <option value="">Tous les collaborateurs</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
                </select>
              )}
              <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUT_BADGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <span className="text-muted text-sm">{filtered.length} demande(s)</span>
          </div>

          <div className="table-wrapper">
            {loading ? <div className="spinner"><div className="spinner-ring" /></div> :
              filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🏖️</div>
                  <p>Aucune absence</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Collaborateur</th>
                      <th>Type</th>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Jours</th>
                      <th>Statut</th>
                      <th>Commentaire</th>
                      {isExpertOrChef && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(a => {
                      const badge = STATUT_BADGES[a.statut] || STATUT_BADGES.en_attente;
                      return (
                        <tr key={a.id}>
                          <td><strong>{a.prenom} {a.user_nom}</strong></td>
                          <td>{TYPE_LABELS[a.type] || a.type}</td>
                          <td>{new Date(a.date_debut).toLocaleDateString('fr-FR')}</td>
                          <td>{new Date(a.date_fin).toLocaleDateString('fr-FR')}</td>
                          <td><strong>{a.nb_jours}j</strong></td>
                          <td>
                            <span className="badge" style={{ background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.commentaire || '—'}</td>
                          {isExpertOrChef && (
                            <td>
                              <div className="td-actions">
                                {a.statut === 'en_attente' && (
                                  <>
                                    <button className="btn btn-accent btn-sm" onClick={() => handleValidate(a.id, 'validee')}>✓ Valider</button>
                                    <button className="btn btn-danger btn-sm" onClick={() => handleValidate(a.id, 'refusee')}>✗ Refuser</button>
                                  </>
                                )}
                                {a.statut !== 'validee' && a.utilisateur_id === user?.id && (
                                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a.id)}>🗑</button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>

      {modal === 'create' && (
        <Modal title="Poser des congés" onClose={() => setModal(null)}>
          <AbsenceForm
            currentUser={user}
            users={users.length ? users : [user]}
            isExpertOrChef={isExpertOrChef}
            onSave={() => { setModal(null); load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </>
  );
}
