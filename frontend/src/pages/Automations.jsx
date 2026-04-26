import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const DECLENCHEURS = {
  ldm_signee:          { label: 'LDM signée',          color: '#10b981' },
  tache_retard:        { label: 'Tâche en retard',      color: '#ef4444' },
  facture_impayee_30j: { label: 'Facture impayée 30j',  color: '#f59e0b' },
  nouveau_client:      { label: 'Nouveau client',        color: '#3b82f6' },
  devis_accepte:       { label: 'Devis accepté',         color: '#00b4d8' },
};

const PRIORITES = ['basse', 'normale', 'haute', 'urgente'];

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

function DeclencheurBadge({ value }) {
  const d = DECLENCHEURS[value] || { label: value, color: '#64748b' };
  return (
    <span
      className="badge"
      style={{
        background: d.color + '20',
        color: d.color,
        border: `1px solid ${d.color}40`,
        fontWeight: 600,
      }}
    >
      {d.label}
    </span>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: 'pointer',
        background: checked ? '#0F1F4B' : '#cbd5e1',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ActionDescription({ actions_json }) {
  if (!actions_json) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  let obj = actions_json;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return <span style={{ color: 'var(--text-muted)' }}>{actions_json}</span>; }
  }
  if (obj.type === 'create_task') {
    return (
      <span>
        Créer une tâche <strong>«{obj.description}»</strong>
        {obj.priorite && <span> · priorité <strong>{obj.priorite}</strong></span>}
        {obj.duree && <span> · {obj.duree}h</span>}
      </span>
    );
  }
  return <span>{JSON.stringify(obj)}</span>;
}

const EMPTY_FORM = {
  nom: '',
  declencheur: 'ldm_signee',
  description: '',
  priorite: 'normale',
  duree: '',
};

export default function Automations() {
  const { user } = useAuth();
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isExpert = user?.role === 'expert';
  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/automations');
      setAutomations(data);
    } catch {
      setError('Impossible de charger les automatisations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleToggle = async (automation) => {
    try {
      await api.put(`/automations/${automation.id}`, { actif: !automation.actif });
      setAutomations((list) =>
        list.map((a) => (a.id === automation.id ? { ...a, actif: !a.actif } : a))
      );
    } catch {
      setError('Erreur lors de la mise à jour');
    }
  };

  const handleDelete = async (automation) => {
    if (!confirm(`Supprimer l'automatisation "${automation.nom}" ?`)) return;
    try {
      await api.delete(`/automations/${automation.id}`);
      load();
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) return;
    setSaving(true);
    try {
      await api.post('/automations', {
        nom: form.nom,
        declencheur: form.declencheur,
        actions_json: {
          type: 'create_task',
          description: form.description,
          priorite: form.priorite,
          duree: form.duree ? Number(form.duree) : undefined,
        },
      });
      setShowModal(false);
      setForm({ ...EMPTY_FORM });
      load();
    } catch {
      setError('Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => { setForm({ ...EMPTY_FORM }); setShowModal(true); };

  return (
    <>
      <div className="page-header">
        <h1>Automatisations</h1>
        {isExpertOrChef && (
          <button className="btn btn-primary" onClick={openModal}>+ Nouvelle règle</button>
        )}
      </div>

      <div className="page-body">
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
            {error}
            <button style={{ marginLeft: 12, cursor: 'pointer', border: 'none', background: 'none', color: '#991b1b', fontWeight: 600 }} onClick={() => setError('')}>×</button>
          </div>
        )}

        {loading ? (
          <div className="spinner" style={{ margin: '60px auto' }}><div className="spinner-ring" /></div>
        ) : automations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚡</div>
            <p>Aucune automatisation — créez votre première règle.</p>
            {isExpertOrChef && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openModal}>+ Nouvelle règle</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {automations.map((a) => {
              const d = DECLENCHEURS[a.declencheur] || { color: '#64748b' };
              return (
                <div
                  key={a.id}
                  className="card"
                  style={{
                    borderLeft: `5px solid ${d.color}`,
                    opacity: a.actif ? 1 : 0.6,
                  }}
                >
                  <div className="card-body" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    {/* Left: rule info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 16, color: '#0F1F4B' }}>{a.nom}</strong>
                        <DeclencheurBadge value={a.declencheur} />
                        {!a.actif && (
                          <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>Inactif</span>
                        )}
                      </div>

                      {/* SI → ALORS */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: '#f8fafc',
                        borderRadius: 8,
                        fontSize: 13,
                        marginBottom: 10,
                        flexWrap: 'wrap',
                      }}>
                        <span style={{ color: d.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          SI {DECLENCHEURS[a.declencheur]?.label || a.declencheur}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>→</span>
                        <span style={{ color: '#0F1F4B', fontWeight: 600, whiteSpace: 'nowrap' }}>ALORS</span>
                        <span style={{ color: 'var(--text)', fontSize: 13 }}>
                          <ActionDescription actions_json={a.actions_json} />
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span>Dernière exécution : {formatDate(a.derniere_exec)}</span>
                        <span>Exécutions : <strong>{a.exec_count ?? 0}</strong></span>
                      </div>
                    </div>

                    {/* Right: toggle + delete */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.actif ? 'Actif' : 'Inactif'}</span>
                        <Toggle checked={!!a.actif} onChange={() => handleToggle(a)} />
                      </div>
                      {isExpert && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a)}>🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <Modal title="Nouvelle règle d'automatisation" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Nom de la règle *</label>
              <input
                className="form-control"
                value={form.nom}
                onChange={set('nom')}
                placeholder="Ex : Rappel devis accepté"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Déclencheur</label>
              <select className="form-control" value={form.declencheur} onChange={set('declencheur')}>
                {Object.entries(DECLENCHEURS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            <div style={{
              margin: '18px 0 12px',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Action — Créer une tâche
            </div>

            <div className="form-group">
              <label className="form-label">Description de la tâche *</label>
              <input
                className="form-control"
                value={form.description}
                onChange={set('description')}
                placeholder="Ex : Envoyer la lettre de mission"
                required
              />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Priorité</label>
                <select className="form-control" value={form.priorite} onChange={set('priorite')}>
                  {PRIORITES.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Durée estimée (heures)</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.duree}
                  onChange={set('duree')}
                  placeholder="Ex : 2"
                  min="0"
                  step="0.5"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Créer la règle'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
