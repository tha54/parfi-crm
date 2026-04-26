import { useState, useEffect } from 'react';
import { marked } from 'marked';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

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

function buildTree(pages) {
  const roots = pages.filter((p) => !p.parent_id);
  const children = (parentId) => pages.filter((p) => p.parent_id === parentId);
  return { roots, children };
}

export default function Wiki() {
  const { user } = useAuth();
  const [pages, setPages] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ titre: '', contenu: '' });
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null); // 'create'
  const [createForm, setCreateForm] = useState({ titre: '', icone: '📄', parent_id: '' });
  const [error, setError] = useState('');

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/wiki');
      setPages(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch {
      setError('Impossible de charger le wiki');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = pages.find((p) => p.id === selectedId);
  const { roots, children } = buildTree(pages);

  const toggleExpand = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const startEdit = () => {
    if (!selected) return;
    setEditForm({ titre: selected.titre || '', contenu: selected.contenu || '' });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEditForm({ titre: '', contenu: '' }); };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/wiki/${selected.id}`, { titre: editForm.titre, contenu: editForm.contenu });
      await load();
      setEditing(false);
    } catch {
      setError('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer la page "${selected.titre}" ?`)) return;
    try {
      await api.delete(`/wiki/${selected.id}`);
      setSelectedId(null);
      await load();
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.titre.trim()) return;
    try {
      const payload = {
        titre: createForm.titre,
        icone: createForm.icone || '📄',
        parent_id: createForm.parent_id ? Number(createForm.parent_id) : null,
        contenu: '',
      };
      const { data } = await api.post('/wiki', payload);
      await load();
      setSelectedId(data.id);
      setModal(null);
      setCreateForm({ titre: '', icone: '📄', parent_id: '' });
    } catch {
      setError('Erreur lors de la création');
    }
  };

  const renderTreeNode = (page) => {
    const kids = children(page.id);
    const isActive = selectedId === page.id;
    const isExpanded = expanded[page.id];

    return (
      <div key={page.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            background: isActive ? '#0F1F4B' : 'transparent',
            color: isActive ? '#fff' : 'var(--text)',
            fontWeight: isActive ? 600 : 400,
            fontSize: 13,
            userSelect: 'none',
          }}
          onClick={() => setSelectedId(page.id)}
        >
          {kids.length > 0 && (
            <span
              style={{ fontSize: 10, width: 14, flexShrink: 0, color: isActive ? '#fff' : 'var(--text-muted)' }}
              onClick={(e) => { e.stopPropagation(); toggleExpand(page.id); }}
            >
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          {kids.length === 0 && <span style={{ width: 14, flexShrink: 0 }} />}
          <span>{page.icone || '📄'}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.titre}</span>
        </div>
        {kids.length > 0 && isExpanded && (
          <div style={{ paddingLeft: 18 }}>
            {kids.map((child) => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 0 }}>
      {/* Sidebar */}
      <div style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 12px 8px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Pages
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {loading ? (
            <div className="spinner" style={{ margin: '20px auto' }}><div className="spinner-ring" /></div>
          ) : roots.length === 0 ? (
            <div style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucune page
            </div>
          ) : (
            roots.map((p) => renderTreeNode(p))
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0F1F4B', flex: 1 }}>
            {selected ? `${selected.icone || '📄'} ${selected.titre}` : 'Wiki interne'}
          </h1>
          {canEdit && !editing && selected && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Éditer</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Supprimer</button>
            </>
          )}
          {canEdit && editing && (
            <>
              <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                {saving ? 'Sauvegarde…' : '💾 Sauvegarder'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Annuler</button>
            </>
          )}
          {canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>+ Nouvelle page</button>
          )}
        </div>

        {error && (
          <div style={{ padding: '8px 20px', background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
            {error}
            <button style={{ marginLeft: 12, cursor: 'pointer', border: 'none', background: 'none', color: '#991b1b', fontWeight: 600 }} onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {!selected ? (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <p>Sélectionnez une page dans le menu de gauche ou créez-en une nouvelle.</p>
              {canEdit && (
                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setModal('create')}>
                  + Nouvelle page
                </button>
              )}
            </div>
          ) : editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Titre de la page</label>
                <input
                  className="form-control"
                  value={editForm.titre}
                  onChange={(e) => setEditForm((f) => ({ ...f, titre: e.target.value }))}
                  style={{ fontSize: 18, fontWeight: 600 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contenu (Markdown)</label>
                <textarea
                  className="form-control"
                  value={editForm.contenu}
                  onChange={(e) => setEditForm((f) => ({ ...f, contenu: e.target.value }))}
                  style={{ width: '100%', minHeight: 400, fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
                  placeholder="# Titre&#10;&#10;Votre contenu en Markdown…"
                />
              </div>
            </div>
          ) : (
            <div
              className="wiki-content"
              dangerouslySetInnerHTML={{ __html: marked(selected.contenu || '*Aucun contenu — cliquez sur Éditer pour ajouter du contenu.*') }}
              style={wikiStyles}
            />
          )}
        </div>
      </div>

      {/* Create modal */}
      {modal === 'create' && (
        <Modal title="Nouvelle page Wiki" onClose={() => setModal(null)}>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Titre *</label>
              <input
                className="form-control"
                value={createForm.titre}
                onChange={(e) => setCreateForm((f) => ({ ...f, titre: e.target.value }))}
                placeholder="Nom de la page"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Icône (emoji)</label>
              <input
                className="form-control"
                value={createForm.icone}
                onChange={(e) => setCreateForm((f) => ({ ...f, icone: e.target.value }))}
                placeholder="📄"
                style={{ width: 80 }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Page parente (optionnel)</label>
              <select
                className="form-control"
                value={createForm.parent_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, parent_id: e.target.value }))}
              >
                <option value="">— Racine —</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.icone || '📄'} {p.titre}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Créer la page</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

const wikiStyles = {
  lineHeight: 1.7,
  color: 'var(--text)',
  maxWidth: 860,
};
