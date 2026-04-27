import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import TaskCommentDrawer from '../components/TaskCommentDrawer';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUTS = ['a_faire', 'en_cours', 'termine', 'reporte'];
const STATUT_LABEL  = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const STATUT_COLOR  = { a_faire: '#6b7c93', en_cours: '#00b4d8', termine: '#00897b', reporte: '#e67e22' };
const PRIORITE_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
const PRIORITE_COLOR = { basse: '#adb5bd', normale: '#0288d1', haute: '#e67e22', urgente: '#d63031' };

const PERIODS = [
  { key: 'retard',      label: 'En retard',      icon: '⚠' },
  { key: 'aujourd_hui', label: "Aujourd'hui",     icon: '📌' },
  { key: 'demain',      label: 'Demain',          icon: '➡' },
  { key: 'semaine',     label: 'Cette semaine',   icon: '📆' },
  { key: 'tout',        label: 'Tout',            icon: '☰' },
];

const VIEWS = [
  { key: 'liste',      label: 'Liste',       icon: '☰' },
  { key: 'kanban',     label: 'Kanban',      icon: '⊞' },
  { key: 'calendrier', label: 'Calendrier',  icon: '📅' },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const toISO = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const getWeekBounds = () => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(now); mon.setDate(now.getDate() - daysFromMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { mon, sun };
};

// ─── Modal ────────────────────────────────────────────────────────────────────

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

// ─── Constants for form ───────────────────────────────────────────────────────

const CATEGORIES = ['Fiscal', 'Social', 'Juridique', 'Comptabilité', 'Admin', 'Client'];

// ─── Task form ────────────────────────────────────────────────────────────────

function TacheForm({ initial, clients, users, currentUser, onSave, onCancel }) {
  const isManager = ['expert', 'chef_mission'].includes(currentUser?.role);
  const isEdit    = !!initial?.id;

  const [form, setForm] = useState(() => ({
    titre:         '',
    description:   '',
    utilisateur_id: isManager ? '' : String(currentUser?.id ?? ''),
    client_id:     '',
    priorite:      'normale',
    categorie:     '',
    type_travail:  'recurrent',
    date_echeance: '',
    duree:         '',
    ...initial,
    // Normalise date from ISO string
    date_echeance: initial?.date_echeance
      ? (initial.date_echeance.split('T')[0] || initial.date_echeance)
      : '',
    utilisateur_id: initial?.utilisateur_id
      ? String(initial.utilisateur_id)
      : isManager ? '' : String(currentUser?.id ?? ''),
  }));

  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.titre.trim()) { setError('Le titre est requis.'); return; }
    if (!form.date_echeance) { setError("L'échéance est requise."); return; }

    setLoading(true);
    try {
      const payload = {
        titre:         form.titre.trim(),
        description:   form.description.trim(),
        client_id:     form.client_id  || null,
        priorite:      form.priorite,
        categorie:     form.categorie  || null,
        type_travail:  form.type_travail || 'recurrent',
        date_echeance: form.date_echeance,
        duree:         form.duree ? parseFloat(form.duree) : null,
      };

      if (isEdit) {
        // Managers can reassign; collaborators cannot change assignee
        if (isManager) payload.utilisateur_id = Number(form.utilisateur_id) || currentUser.id;
        await api.put(`/taches/${initial.id}`, payload);
      } else {
        payload.utilisateur_id = isManager
          ? (Number(form.utilisateur_id) || currentUser.id)
          : currentUser.id;
        await api.post('/taches', payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Titre */}
      <div className="form-group">
        <label className="form-label">Titre *</label>
        <input
          className="form-control"
          value={form.titre}
          onChange={set('titre')}
          placeholder="Ex : Déclaration TVA mars 2026"
          autoFocus
        />
      </div>

      {/* Assigné à + Client */}
      <div style={row2}>
        <div className="form-group">
          <label className="form-label">
            {isManager ? 'Assigné à *' : 'Assigné à'}
          </label>
          {isManager ? (
            <select className="form-control" value={form.utilisateur_id} onChange={set('utilisateur_id')}>
              <option value="">— Moi-même —</option>
              {users.map(u => (
                <option key={u.id} value={String(u.id)}>
                  {u.prenom} {u.nom}
                  {u.id === currentUser?.id ? ' (moi)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="form-control"
              value={`${currentUser?.prenom ?? ''} ${currentUser?.nom ?? ''}`}
              disabled
              style={{ background: '#f5f7fa', color: 'var(--text-muted)' }}
            />
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Client</label>
          <select className="form-control" value={form.client_id} onChange={set('client_id')}>
            <option value="">— Aucun —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {/* Priorité + Catégorie */}
      <div style={row2}>
        <div className="form-group">
          <label className="form-label">Priorité</label>
          <select className="form-control" value={form.priorite} onChange={set('priorite')}>
            {Object.entries(PRIORITE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Catégorie</label>
          <select className="form-control" value={form.categorie} onChange={set('categorie')}>
            <option value="">— Aucune —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Type de travail</label>
          <select className="form-control" value={form.type_travail || 'recurrent'} onChange={set('type_travail')}>
            <option value="recurrent">Récurrent (LDM)</option>
            <option value="exceptionnel_non_facturable">Exceptionnel non facturable</option>
            <option value="exceptionnel_facturable">Exceptionnel facturable</option>
            <option value="non_facturable">Non facturable (interne)</option>
          </select>
        </div>
      </div>

      {/* Échéance + Budget */}
      <div style={row2}>
        <div className="form-group">
          <label className="form-label">Échéance *</label>
          <input
            type="date"
            className="form-control"
            value={form.date_echeance}
            onChange={set('date_echeance')}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Budget (heures)</label>
          <input
            type="number"
            step="0.5"
            min="0"
            className="form-control"
            value={form.duree}
            onChange={set('duree')}
            placeholder="Ex : 2.5"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="form-group">
        <label className="form-label">Notes / Description</label>
        <textarea
          className="form-control"
          value={form.description}
          onChange={set('description')}
          rows={3}
          placeholder="Détails, instructions…"
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer la tâche'}
        </button>
      </div>
    </form>
  );
}

// ─── Priority badge ───────────────────────────────────────────────────────────

function PrioriteBadge({ priorite }) {
  if (!priorite || priorite === 'normale') return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12,
      background: (PRIORITE_COLOR[priorite] || '#adb5bd') + '22',
      color: PRIORITE_COLOR[priorite] || '#adb5bd',
      border: `1px solid ${(PRIORITE_COLOR[priorite] || '#adb5bd')}44`,
      marginRight: 6, whiteSpace: 'nowrap',
    }}>
      {PRIORITE_LABEL[priorite] || priorite}
    </span>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function TacheListView({ taches, isExpertOrChef, taskDeps, commentCounts, onStatutChange, onOpenDrawer, onEdit, onDelete }) {
  if (taches.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">✅</div>
        <p>Aucune tâche pour cette période</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Tâche</th>
            <th>Catégorie</th>
            <th>Assigné par</th>
            <th>Client</th>
            {isExpertOrChef && <th>Assigné à</th>}
            <th>Budget</th>
            <th>Échéance</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {taches.map(t => {
            const deps = taskDeps[t.id] || [];
            const hasBlock = deps.some(d => d.statut !== 'termine');
            const blockNames = deps.filter(d => d.statut !== 'termine').map(d => d.titre || d.description).join(', ');
            const commentCount = commentCounts[t.id] || 0;
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const echeance = new Date(t.date_echeance); echeance.setHours(0, 0, 0, 0);
            const overdue = t.statut !== 'termine' && echeance < now;
            const label = t.titre || t.description;
            return (
              <tr key={t.id} style={overdue ? { background: '#fff8f8' } : {}}>
                <td>
                  {hasBlock && <span title={`Bloquée par : ${blockNames}`} style={{ marginRight: 5, cursor: 'help' }}>🔒</span>}
                  <PrioriteBadge priorite={t.priorite} />
                  <span style={{ fontWeight: 500 }}>{label}</span>
                  {t.titre && t.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
                  )}
                  {overdue && <span style={{ marginLeft: 6, color: 'var(--danger)', fontSize: 11 }}>⚠ Retard</span>}
                </td>
                <td>
                  {t.categorie
                    ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#f1f5f9', color: '#475569' }}>{t.categorie}</span>
                    : <span className="text-muted">—</span>
                  }
                </td>
                <td style={{ fontSize: 12 }}>
                  {t.assigne_par_prenom
                    ? <span style={{ fontWeight: 500 }}>{t.assigne_par_prenom} {t.assigne_par_nom}</span>
                    : <span className="text-muted">—</span>
                  }
                </td>
                <td>{t.client_nom || <span className="text-muted">—</span>}</td>
                {isExpertOrChef && <td style={{ fontSize: 13 }}>{t.prenom} {t.user_nom}</td>}
                <td style={{ fontSize: 12 }}>{t.duree ? `${t.duree}h` : <span className="text-muted">—</span>}</td>
                <td style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: overdue ? 600 : undefined }}>
                  {fmtDate(t.date_echeance)}
                </td>
                <td>
                  <select
                    className="form-control"
                    style={{ padding: '3px 6px', fontSize: 12, width: 'auto' }}
                    value={t.statut}
                    onChange={e => onStatutChange(t, e.target.value)}
                  >
                    {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </td>
                <td>
                  <div className="td-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenDrawer(t)} title="Commentaires">
                      💬{commentCount > 0 && (
                        <span style={{ marginLeft: 3, background: '#00B4D8', color: '#fff', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>
                          {commentCount}
                        </span>
                      )}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}>Modifier</button>
                    {isExpertOrChef && (
                      <button className="btn btn-danger btn-sm" onClick={() => onDelete(t)}>Supprimer</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({ t, isExpertOrChef, onStatutChange, onOpenDrawer, onEdit, onDelete }) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const echeance = new Date(t.date_echeance); echeance.setHours(0, 0, 0, 0);
  const overdue = t.statut !== 'termine' && echeance < now;

  return (
    <div
      onClick={() => onOpenDrawer(t)}
      style={{
        background: '#fff', borderRadius: 8, padding: '10px 12px',
        border: `1px solid ${overdue ? '#ffd0d0' : 'var(--border)'}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <PrioriteBadge priorite={t.priorite} />
        {overdue && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12, background: '#ffebeb', color: '#d63031' }}>
            ⚠ Retard
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1F4B', marginBottom: 4, lineHeight: 1.4 }}>
        {t.titre || t.description}
      </div>
      {t.titre && t.description && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t.description}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
        {t.categorie && <span style={{ fontWeight: 600, color: '#475569' }}>🏷 {t.categorie}</span>}
        {t.client_nom && <span>📁 {t.client_nom}</span>}
        {isExpertOrChef && t.prenom && <span>👤 {t.prenom} {t.user_nom}</span>}
        {t.assigne_par_prenom && (
          <span style={{ color: '#6c757d' }}>↪ Par {t.assigne_par_prenom} {t.assigne_par_nom}</span>
        )}
        <span style={{ color: overdue ? '#d63031' : undefined }}>
          📅 {fmtDate(t.date_echeance)}{t.duree ? ` · ${t.duree}h` : ''}
        </span>
      </div>

      <div
        style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}
        onClick={e => e.stopPropagation()}
      >
        <select
          className="form-control"
          style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
          value={t.statut}
          onChange={e => onStatutChange(t, e.target.value)}
        >
          {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onEdit(t)}>✏</button>
        {isExpertOrChef && (
          <button className="btn btn-danger btn-sm" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => onDelete(t)}>×</button>
        )}
      </div>
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

function TacheKanbanView({ taches, isExpertOrChef, onStatutChange, onOpenDrawer, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 2px 8px' }}>
      {STATUTS.map(statut => {
        const col = taches.filter(t => t.statut === statut);
        return (
          <div key={statut} style={{ flex: '0 0 270px', minWidth: 270 }}>
            <div style={{
              background: STATUT_COLOR[statut], color: '#fff',
              borderRadius: '8px 8px 0 0', padding: '10px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{STATUT_LABEL[statut]}</span>
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 12, padding: '1px 8px', fontSize: 12 }}>
                {col.length}
              </span>
            </div>
            <div style={{
              background: '#f5f7fa', border: '1px solid var(--border)',
              borderTop: 'none', borderRadius: '0 0 8px 8px',
              minHeight: 180, padding: 8, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {col.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                  Aucune tâche
                </div>
              ) : col.map(t => (
                <KanbanCard
                  key={t.id} t={t} isExpertOrChef={isExpertOrChef}
                  onStatutChange={onStatutChange} onOpenDrawer={onOpenDrawer}
                  onEdit={onEdit} onDelete={onDelete}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────────────────────────

const DAY_HEADERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function getWeekStart(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - daysFromMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

function TacheCalendarView({ taches, onOpenDrawer }) {
  const [calDate, setCalDate] = useState(() => new Date());
  const [calMode, setCalMode] = useState('mois');

  const tasksByDate = useMemo(() => {
    const map = {};
    taches.forEach(t => {
      const key = toISO(t.date_echeance);
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [taches]);

  const todayStr = toISO(new Date());

  const navigate = (dir) => {
    const d = new Date(calDate);
    if (calMode === 'mois') {
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
    } else if (calMode === 'semaine') {
      d.setDate(d.getDate() + dir * 7);
    } else {
      d.setDate(d.getDate() + dir);
    }
    setCalDate(d);
  };

  const navLabel = () => {
    if (calMode === 'mois') {
      return new Date(calDate.getFullYear(), calDate.getMonth(), 1)
        .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } else if (calMode === 'semaine') {
      const mon = getWeekStart(calDate);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const fmt = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `Semaine du ${fmt(mon)} au ${fmt(sun)} ${sun.getFullYear()}`;
    } else {
      return calDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
  };

  const TaskChip = ({ t, compact = true }) => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const ec  = new Date(t.date_echeance); ec.setHours(0, 0, 0, 0);
    const ov  = t.statut !== 'termine' && ec < now;
    const col = ov ? '#d63031' : STATUT_COLOR[t.statut] || '#6b7c93';
    return (
      <div
        onClick={() => onOpenDrawer(t)}
        title={`${t.titre || t.description}${t.assigne_par_prenom ? ` — par ${t.assigne_par_prenom} ${t.assigne_par_nom}` : ''}`}
        style={{
          fontSize: compact ? 10 : 12,
          padding: compact ? '2px 5px' : '4px 8px',
          borderRadius: 4, marginBottom: compact ? 2 : 3,
          background: col + '22', color: col, fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: compact ? 'nowrap' : 'normal',
          overflow: compact ? 'hidden' : 'visible',
          textOverflow: compact ? 'ellipsis' : 'unset',
          border: `1px solid ${col}44`,
        }}
      >
        {t.titre || t.description}
      </div>
    );
  };

  const renderMois = () => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startOffs = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const cells = [];
    for (let i = 0; i < startOffs; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAY_HEADERS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>
              {d}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={`e-${idx}`} style={{ minHeight: 88 }} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasksByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isPast  = dateStr < todayStr;
            return (
              <div key={dateStr} style={{
                minHeight: 88, border: '1px solid', padding: 4, borderRadius: 6,
                background: isToday ? '#e8f4fd' : '#fff',
                borderColor: isToday ? '#00B4D8' : 'var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#00B4D8' : isPast ? '#94a3b8' : 'var(--text)', marginBottom: 3 }}>
                  {day}
                </div>
                {dayTasks.slice(0, 3).map(t => <TaskChip key={t.id} t={t} compact />)}
                {dayTasks.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>
                    +{dayTasks.length - 3} autre(s)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderSemaine = () => {
    const mon = getWeekStart(calDate);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i); return d;
    });
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {days.map((d, i) => {
          const dateStr  = toISO(d);
          const dayTasks = tasksByDate[dateStr] || [];
          const isToday  = dateStr === todayStr;
          const isPast   = dateStr < todayStr;
          return (
            <div key={dateStr} style={{
              border: '1px solid', borderRadius: 8, padding: 6,
              background: isToday ? '#e8f4fd' : '#fff',
              borderColor: isToday ? '#00B4D8' : 'var(--border)',
              minHeight: 140,
            }}>
              <div style={{ textAlign: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#00B4D8' : isPast ? '#94a3b8' : 'var(--text-muted)' }}>
                  {DAY_HEADERS[i]}
                </div>
                <div style={{ fontSize: 16, fontWeight: isToday ? 700 : 500, color: isToday ? '#00B4D8' : isPast ? '#94a3b8' : 'var(--text)' }}>
                  {d.getDate()}
                </div>
              </div>
              {dayTasks.map(t => <TaskChip key={t.id} t={t} compact />)}
              {dayTasks.length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderJour = () => {
    const dateStr  = toISO(calDate);
    const dayTasks = tasksByDate[dateStr] || [];
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {dayTasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>
            Aucune tâche ce jour
          </div>
        ) : (
          dayTasks.map(t => {
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const ec  = new Date(t.date_echeance); ec.setHours(0, 0, 0, 0);
            const ov  = t.statut !== 'termine' && ec < now;
            const col = ov ? '#d63031' : STATUT_COLOR[t.statut] || '#6b7c93';
            return (
              <div
                key={t.id}
                onClick={() => onOpenDrawer(t)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 14px', borderRadius: 8, marginBottom: 6,
                  background: col + '11', border: `1px solid ${col}33`,
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0F1F4B', marginBottom: 3 }}>
                    {t.titre || t.description}
                  </div>
                  {t.titre && t.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t.description}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    <span style={{ background: col + '22', color: col, padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>
                      {STATUT_LABEL[t.statut] || t.statut}
                    </span>
                    {t.priorite && (
                      <span style={{ background: (PRIORITE_COLOR[t.priorite] || '#6b7c93') + '22', color: PRIORITE_COLOR[t.priorite] || '#6b7c93', padding: '1px 7px', borderRadius: 4, fontWeight: 600 }}>
                        {PRIORITE_LABEL[t.priorite] || t.priorite}
                      </span>
                    )}
                    {t.categorie && (
                      <span style={{ background: '#6b7c9322', color: '#6b7c93', padding: '1px 7px', borderRadius: 4 }}>
                        {t.categorie}
                      </span>
                    )}
                    {t.client_nom && <span style={{ color: 'var(--text-muted)' }}>👥 {t.client_nom}</span>}
                    {t.prenom && <span style={{ color: 'var(--text-muted)' }}>👤 {t.prenom} {t.user_nom}</span>}
                    {t.assigne_par_prenom && <span style={{ color: 'var(--text-muted)' }}>📌 par {t.assigne_par_prenom} {t.assigne_par_nom}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* Navigation + mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>‹ Précédent</button>
        <span style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize', flex: 1, textAlign: 'center', minWidth: 160 }}>
          {navLabel()}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(1)}>Suivant ›</button>
        <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
          {[['mois', 'Mois'], ['semaine', 'Semaine'], ['jour', 'Jour']].map(([m, lbl]) => (
            <button
              key={m}
              className={`btn btn-sm ${calMode === m ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCalMode(m)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {calMode === 'mois'    && renderMois()}
      {calMode === 'semaine' && renderSemaine()}
      {calMode === 'jour'    && renderJour()}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        {STATUTS.map(s => (
          <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: STATUT_COLOR[s], display: 'inline-block' }} />
            {STATUT_LABEL[s]}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#d63031', display: 'inline-block' }} />
          En retard
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Taches() {
  const { user } = useAuth();
  const [taches, setTaches]         = useState([]);
  const [clients, setClients]       = useState([]);
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch]         = useState('');
  const [selectedTache, setSelectedTache] = useState(null);
  const [commentCounts, setCommentCounts] = useState({});
  const [taskDeps, setTaskDeps]     = useState({});
  const [periode, setPeriode]       = useState('aujourd_hui');
  const [view, setView]             = useState('liste');

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/taches'), api.get('/clients'), api.get('/utilisateurs')])
      .then(([tr, cr, ur]) => {
        const data = tr.data;
        setTaches(data);
        setClients(cr.data);
        if (ur) setUsers(ur.data.filter(u => u.actif));
        data.forEach(t => {
          api.get(`/commentaires/tache/${t.id}`)
            .then(r => setCommentCounts(prev => ({ ...prev, [t.id]: (r.data || []).length })))
            .catch(() => {});
          api.get(`/taches/${t.id}/dependances`)
            .then(r => setTaskDeps(prev => ({ ...prev, [t.id]: r.data || [] })))
            .catch(() => {});
        });
      })
      .finally(() => setLoading(false));
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

  // Period counts
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayStr    = toISO(today);
  const tomorrowStr = toISO(new Date(today.getTime() + 86400000));
  const { mon: weekStart, sun: weekEnd } = useMemo(getWeekBounds, []);

  const periodeCounts = useMemo(() => ({
    retard:      taches.filter(t => { const d=new Date(t.date_echeance); d.setHours(0,0,0,0); return t.statut!=='termine' && d<today; }).length,
    aujourd_hui: taches.filter(t => toISO(new Date(t.date_echeance))===todayStr).length,
    demain:      taches.filter(t => toISO(new Date(t.date_echeance))===tomorrowStr).length,
    semaine:     taches.filter(t => { const d=new Date(t.date_echeance); d.setHours(0,0,0,0); return d>=weekStart && d<=weekEnd; }).length,
    tout:        taches.length,
  }), [taches, today, todayStr, tomorrowStr, weekStart, weekEnd]);

  const periodeFilter = (t) => {
    const d = new Date(t.date_echeance); d.setHours(0, 0, 0, 0);
    switch (periode) {
      case 'retard':      return t.statut !== 'termine' && d < today;
      case 'aujourd_hui': return toISO(d) === todayStr;
      case 'demain':      return toISO(d) === tomorrowStr;
      case 'semaine':     return d >= weekStart && d <= weekEnd;
      default:            return true;
    }
  };

  const filtered = useMemo(() => {
    const base = view === 'calendrier' ? taches : taches.filter(periodeFilter);
    return base.filter(t => {
      const matchStatut = filterStatut ? t.statut === filterStatut : true;
      const matchSearch = search
        ? `${t.titre || ''} ${t.description} ${t.client_nom || ''} ${t.categorie || ''} ${t.prenom || ''} ${t.user_nom || ''}`.toLowerCase().includes(search.toLowerCase())
        : true;
      return matchStatut && matchSearch;
    });
  }, [taches, view, periode, filterStatut, search, today, todayStr, tomorrowStr, weekStart, weekEnd]);

  return (
    <>
      <div className="page-header">
        <h1>Mes Tâches</h1>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>+ Nouvelle tâche</button>
      </div>

      <div className="page-body">

        {/* ── Period tabs (hidden in calendar view) ── */}
        {view !== 'calendrier' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {PERIODS.map(p => {
              const count = periodeCounts[p.key];
              const isActive = periode === p.key;
              const isRetard = p.key === 'retard';
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriode(p.key)}
                  style={{
                    padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                    border: `1.5px solid ${isActive ? '#0F1F4B' : 'var(--border)'}`,
                    background: isActive ? '#0F1F4B' : '#fff',
                    color: isActive ? '#fff' : 'var(--text)',
                    fontWeight: 600, fontSize: 13,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                >
                  {p.icon} {p.label}
                  <span style={{
                    borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                    background: isRetard && count > 0 ? '#d63031' : isActive ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
                    color: (isRetard && count > 0) || isActive ? '#fff' : 'var(--text-muted)',
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="card">
          {/* ── Toolbar ── */}
          <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="filters-bar" style={{ flex: 1, minWidth: 200 }}>
              <input
                className="form-control search-input"
                placeholder="Rechercher…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {view !== 'calendrier' && (
                <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                  <option value="">Tous les statuts</option>
                  {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                </select>
              )}
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {VIEWS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  title={v.label}
                  style={{
                    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: view === v.key ? '#0F1F4B' : '#fff',
                    color: view === v.key ? '#fff' : 'var(--text-muted)',
                    borderRight: '1px solid var(--border)',
                    transition: 'all 0.15s',
                  }}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            {view !== 'calendrier' && (
              <span className="text-muted text-sm">{filtered.length} tâche(s)</span>
            )}
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div className="spinner"><div className="spinner-ring" /></div>
            </div>
          ) : view === 'liste' ? (
            <TacheListView
              taches={filtered} isExpertOrChef={isExpertOrChef}
              taskDeps={taskDeps} commentCounts={commentCounts}
              onStatutChange={handleStatut}
              onOpenDrawer={t => setSelectedTache(t)}
              onEdit={t => setModal({ type: 'edit', tache: t })}
              onDelete={handleDelete}
            />
          ) : view === 'kanban' ? (
            <div style={{ padding: '0 16px 16px' }}>
              <TacheKanbanView
                taches={filtered} isExpertOrChef={isExpertOrChef}
                onStatutChange={handleStatut}
                onOpenDrawer={t => setSelectedTache(t)}
                onEdit={t => setModal({ type: 'edit', tache: t })}
                onDelete={handleDelete}
              />
            </div>
          ) : (
            <TacheCalendarView taches={filtered} onOpenDrawer={t => setSelectedTache(t)} />
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'create' && (
        <Modal title="Nouvelle tâche" onClose={() => setModal(null)}>
          <TacheForm clients={clients} users={users} currentUser={user}
            onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title="Modifier la tâche" onClose={() => setModal(null)}>
          <TacheForm initial={modal.tache} clients={clients} users={users} currentUser={user}
            onSave={() => { setModal(null); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {/* ── Detail drawer ── */}
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
