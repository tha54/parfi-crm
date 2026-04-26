import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const STATUT_LABEL = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const STATUT_COLOR = { a_faire: '#6b7c93', en_cours: '#00b4d8', termine: '#00897b', reporte: '#e67e22' };
const PRIORITE_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute', critique: 'Critique' };
const PRIORITE_COLOR = { basse: '#6b7c93', normale: '#0288d1', haute: '#e67e22', critique: '#d63031' };

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function initials(nom, prenom) {
  return `${(prenom?.[0] || '').toUpperCase()}${(nom?.[0] || '').toUpperCase()}`;
}

/**
 * TaskCommentDrawer — slide-in drawer from the right showing task details
 * and a comment thread with @mention support.
 *
 * Props:
 *   tache        object    the task object
 *   onClose      function  called when drawer should close
 *   utilisateurs array     list of users for @mention dropdown
 */
export default function TaskCommentDrawer({ tache, onClose, utilisateurs = [] }) {
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDrop, setShowMentionDrop] = useState(false);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  // Dependencies state
  const [dependances, setDependances] = useState([]);
  const [loadingDeps, setLoadingDeps] = useState(true);

  const textareaRef = useRef(null);
  const drawerRef = useRef(null);

  const loadComments = () => {
    setLoadingComments(true);
    api
      .get(`/commentaires/tache/${tache.id}`)
      .then((r) => setComments(r.data || []))
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  };

  const loadDependances = () => {
    setLoadingDeps(true);
    api
      .get(`/taches/${tache.id}/dependances`)
      .then((r) => setDependances(r.data || []))
      .catch(() => setDependances([]))
      .finally(() => setLoadingDeps(false));
  };

  useEffect(() => {
    loadComments();
    loadDependances();
  }, [tache.id]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setNewComment(val);

    // Detect @mention
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const mentionMatch = before.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setShowMentionDrop(true);
      setMentionCursorPos(pos - mentionMatch[0].length);
    } else {
      setShowMentionDrop(false);
      setMentionQuery('');
    }
  };

  const filteredUsers = utilisateurs.filter(
    (u) =>
      !mentionQuery ||
      u.prenom?.toLowerCase().includes(mentionQuery) ||
      u.nom?.toLowerCase().includes(mentionQuery)
  );

  const selectMention = (user) => {
    // Replace the @query with @FullName in the textarea
    const before = newComment.slice(0, mentionCursorPos);
    const after = newComment.slice(textareaRef.current?.selectionStart || mentionCursorPos + mentionQuery.length + 1);
    const mention = `@${user.prenom} ${user.nom} `;
    setNewComment(before + mention + after);
    setSelectedMentionIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
    setShowMentionDrop(false);
    setMentionQuery('');
    textareaRef.current?.focus();
  };

  const sendComment = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    setSendErr('');
    try {
      await api.post(`/commentaires/tache/${tache.id}`, {
        contenu: newComment.trim(),
        mentions: selectedMentionIds,
      });
      setNewComment('');
      setSelectedMentionIds([]);
      loadComments();
    } catch (e) {
      setSendErr(e.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  const hasBlockingDeps = dependances.some((d) => d.statut !== 'termine');

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 299,
        }}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        style={{
          position: 'fixed', top: 0, right: 0, width: 420, height: '100vh',
          background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 300, display: 'flex', flexDirection: 'column', overflowY: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          background: '#0F1F4B', color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Détails de la tâche</span>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* Task details */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0F1F4B', fontWeight: 700 }}>
              {hasBlockingDeps && (
                <span title={`Bloquée par : ${dependances.filter(d => d.statut !== 'termine').map(d => d.description || d.titre).join(', ')}`}
                  style={{ marginRight: 6 }}>
                  🔒
                </span>
              )}
              {tache.titre || tache.description}
            </h3>
            {tache.titre && tache.description && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                {tache.description}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: STATUT_COLOR[tache.statut] || '#6b7c93', color: '#fff',
              }}>
                {STATUT_LABEL[tache.statut] || tache.statut}
              </span>
              {tache.priorite && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                  background: PRIORITE_COLOR[tache.priorite] || '#6b7c93', color: '#fff',
                }}>
                  {PRIORITE_LABEL[tache.priorite] || tache.priorite}
                </span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ['Échéance', fmtDate(tache.date_echeance)],
                  ['Durée', tache.duree ? `${tache.duree}h` : '—'],
                  ['Client', tache.client_nom || '—'],
                  ['Assigné à', tache.prenom ? `${tache.prenom} ${tache.user_nom || ''}` : '—'],
                ].map(([label, val]) => (
                  <tr key={label}>
                    <td style={{ padding: '5px 0', color: 'var(--text-muted)', width: 100, fontWeight: 600 }}>{label}</td>
                    <td style={{ padding: '5px 0', color: 'var(--text)' }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Dependencies */}
          {!loadingDeps && dependances.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 8 }}>
                Dépendances
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dependances.map((d) => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 6,
                    background: d.statut === 'termine' ? '#f0faf4' : '#fff8f0',
                    border: `1px solid ${d.statut === 'termine' ? '#c3e6cb' : '#ffd699'}`,
                    fontSize: 12,
                  }}>
                    <span>{d.statut === 'termine' ? '✅' : '🔒'}</span>
                    <span style={{ flex: 1 }}>{d.description || d.titre}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {STATUT_LABEL[d.statut] || d.statut}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 16px' }} />

          {/* Comments section */}
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B', marginBottom: 12 }}>
            💬 Commentaires
            {comments.length > 0 && (
              <span style={{
                marginLeft: 8, background: '#00B4D8', color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
              }}>
                {comments.length}
              </span>
            )}
          </div>

          {loadingComments ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              Chargement…
            </div>
          ) : comments.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
              Aucun commentaire. Soyez le premier à commenter !
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
              {comments.map((c, idx) => (
                <div key={c.id || idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#0F1F4B',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>
                    {initials(c.auteur_nom || c.user_nom, c.auteur_prenom || c.prenom)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {c.auteur_prenom || c.prenom} {c.auteur_nom || c.user_nom}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtDateTime(c.cree_le || c.created_at)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13, lineHeight: 1.6, color: 'var(--text)',
                      background: '#f8f9fb', borderRadius: 8, padding: '8px 12px',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {c.contenu}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New comment input */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={handleTextareaChange}
              placeholder="Ajouter un commentaire… (utilisez @ pour mentionner)"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13, lineHeight: 1.5,
                border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />

            {/* @mention dropdown */}
            {showMentionDrop && filteredUsers.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 10,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto',
              }}>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onMouseDown={(e) => { e.preventDefault(); selectMention(u); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left', fontSize: 13,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f7fa')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: '#00B4D8',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials(u.nom, u.prenom)}
                    </div>
                    <span style={{ fontWeight: 600 }}>{u.prenom} {u.nom}</span>
                    {u.role && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{u.role}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedMentionIds.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Mentions : {utilisateurs
                .filter((u) => selectedMentionIds.includes(u.id))
                .map((u) => `@${u.prenom} ${u.nom}`)
                .join(', ')}
            </div>
          )}

          {sendErr && (
            <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{sendErr}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={sendComment}
              disabled={sending || !newComment.trim()}
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
