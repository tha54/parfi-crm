import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

/* ─── Column definitions ─────────────────────────────────────────── */
const COLUMNS = [
  { statut: 'prospect',     label: 'Nouveau contact', color: '#9ca3af' },
  { statut: 'qualification',label: 'En discussion',   color: '#3b82f6' },
  { statut: 'negociation',  label: 'Devis envoyé',    color: '#f59e0b' },
  { statut: 'devis_envoye', label: 'Devis accepté',   color: '#10b981' },
  { statut: 'gagne',        label: 'Client actif',    color: '#0f1f4b' },
  { statut: 'perdu',        label: 'Perdu',           color: '#ef4444' },
];

const STATUT_MAP = Object.fromEntries(COLUMNS.map(c => [c.statut, c]));

/* ─── Formatters ─────────────────────────────────────────────────── */
const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n || 0);

const fmtRelative = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}j dépassé`, urgent: true };
  if (diffDays === 0) return { label: "Aujourd'hui", urgent: true };
  if (diffDays <= 7) return { label: `Dans ${diffDays}j`, urgent: true };
  if (diffDays <= 30) return { label: `Dans ${diffDays}j`, urgent: false };
  const months = Math.round(diffDays / 30);
  return { label: `Dans ${months} mois`, urgent: false };
};

/* ─── Opportunity Modal ──────────────────────────────────────────── */
function OppModal({ opp, defaultStatut, contacts, intervenants, onSave, onClose }) {
  const blank = {
    contactId: '', titre: '', description: '',
    statut: defaultStatut || 'prospect',
    montantEstime: '', probabilite: 50,
    dateEcheance: '', intervenantId: '',
  };
  const [form, setForm] = useState(
    opp
      ? {
          ...opp,
          contactId: opp.contactId || '',
          montantEstime: opp.montantEstime ?? '',
          probabilite: opp.probabilite ?? 50,
          dateEcheance: opp.dateEcheance ? opp.dateEcheance.slice(0, 10) : '',
          intervenantId: opp.intervenantId || '',
        }
      : blank
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        montantEstime: form.montantEstime !== '' ? Number(form.montantEstime) : null,
        probabilite: Number(form.probabilite),
        intervenantId: form.intervenantId || null,
        dateEcheance: form.dateEcheance || null,
      };
      if (opp) await api.put(`/opportunites/${opp.id}`, payload);
      else await api.post('/opportunites', payload);
      onSave();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,31,75,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560,
          boxShadow: '0 20px 60px rgba(15,31,75,0.22)',
          display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #dce6f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f1f4b', margin: 0 }}>
            {opp ? "Modifier l'opportunité" : 'Nouvelle opportunité'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 20, color: '#6b7c93', lineHeight: 1, padding: '0 4px',
            }}
          >×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <div className="form-group">
            <label className="form-label">Contact *</label>
            <select
              className="form-control"
              value={form.contactId}
              onChange={e => set('contactId', e.target.value)}
              required
            >
              <option value="">Sélectionner…</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.raisonSociale}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Titre *</label>
            <input
              className="form-control"
              value={form.titre}
              onChange={e => set('titre', e.target.value)}
              placeholder="Ex: Mission comptabilité 2025"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Statut</label>
              <select
                className="form-control"
                value={form.statut}
                onChange={e => set('statut', e.target.value)}
              >
                {COLUMNS.map(c => (
                  <option key={c.statut} value={c.statut}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Montant estimé (€)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="100"
                value={form.montantEstime}
                onChange={e => set('montantEstime', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Probabilité (%)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                max="100"
                value={form.probabilite}
                onChange={e => set('probabilite', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Échéance prévue</label>
              <input
                className="form-control"
                type="date"
                value={form.dateEcheance}
                onChange={e => set('dateEcheance', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Intervenant</label>
            <select
              className="form-control"
              value={form.intervenantId}
              onChange={e => set('intervenantId', e.target.value)}
            >
              <option value="">Aucun</option>
              {intervenants.map(i => (
                <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              rows={2}
              value={form.description || ''}
              onChange={e => set('description', e.target.value)}
              placeholder="Notes sur cette opportunité…"
            />
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            paddingTop: 8, borderTop: '1px solid #edf2f7', marginTop: 8,
          }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Card "..." menu ────────────────────────────────────────────── */
function CardMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9ca3af', fontSize: 16, padding: '0 4px',
          borderRadius: 4, lineHeight: 1,
          display: 'flex', alignItems: 'center',
        }}
        title="Options"
      >
        ···
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 200,
          background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,31,75,0.16)',
          border: '1px solid #dce6f0', minWidth: 130, overflow: 'hidden',
        }}>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#1a2a3a', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            ✏️ Modifier
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: '#ef4444', textAlign: 'left',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff0f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            🗑 Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Kanban Card ────────────────────────────────────────────────── */
function KanbanCard({ opp, isDragging, onEdit, onDelete, onDragStart, onDragEnd }) {
  const rel = fmtRelative(opp.dateEcheance);
  const colColor = STATUT_MAP[opp.statut]?.color || '#9ca3af';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: '#fff',
        border: '1px solid #dce6f0',
        borderRadius: 8,
        padding: '12px 14px',
        boxShadow: isDragging
          ? 'none'
          : '0 1px 4px rgba(15,31,75,0.08)',
        opacity: isDragging ? 0.45 : 1,
        cursor: 'grab',
        userSelect: 'none',
        transition: 'box-shadow 0.15s, opacity 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,31,75,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = isDragging ? 'none' : '0 1px 4px rgba(15,31,75,0.08)'; }}
    >
      {/* Top row: title + menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f1f4b', lineHeight: 1.3, flex: 1 }}>
          {opp.titre}
        </span>
        <CardMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Client name */}
      {opp.contactNom && (
        <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 8 }}>
          {opp.contactNom}
        </div>
      )}

      {/* Montant + probabilité */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{
          fontSize: 15, fontWeight: 800, color: colColor, letterSpacing: '-0.01em',
        }}>
          {opp.montantEstime ? fmt(opp.montantEstime) : '—'}
        </span>
        <span style={{
          background: colColor + '18',
          color: colColor,
          border: `1px solid ${colColor}40`,
          borderRadius: 20,
          fontSize: 11, fontWeight: 700,
          padding: '2px 8px',
        }}>
          {opp.probabilite ?? 0}%
        </span>
      </div>

      {/* Bottom row: intervenant + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#6b7c93', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {opp.intervenantNom || <span style={{ fontStyle: 'italic' }}>Sans intervenant</span>}
        </span>
        {rel && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: rel.urgent ? '#ef4444' : '#6b7c93',
            whiteSpace: 'nowrap',
          }}>
            {rel.label}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Kanban Column ──────────────────────────────────────────────── */
function KanbanColumn({ col, cards, dragOverCol, onDragOver, onDrop, onDragLeave, onAddCard, onEditCard, onDeleteCard, onCardDragStart, onCardDragEnd, draggingId }) {
  const total = cards.reduce((s, c) => s + (Number(c.montantEstime) || 0), 0);
  const isTarget = dragOverCol === col.statut;

  return (
    <div
      style={{
        width: 264,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 220px)',
        background: isTarget ? '#eff6ff' : '#f0f4f8',
        border: isTarget ? `2px solid ${col.color}` : '2px solid transparent',
        borderRadius: 10,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      {/* Column Header */}
      <div style={{
        borderTop: `4px solid ${col.color}`,
        borderRadius: '8px 8px 0 0',
        padding: '12px 14px 10px',
        background: '#fff',
        borderBottom: '1px solid #edf2f7',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f1f4b' }}>
              {col.label}
            </span>
            <span style={{
              background: col.color + '20',
              color: col.color,
              borderRadius: 20,
              fontSize: 11, fontWeight: 700,
              padding: '1px 7px',
              border: `1px solid ${col.color}40`,
            }}>
              {cards.length}
            </span>
          </div>
          <button
            onClick={onAddCard}
            title="Ajouter une opportunité"
            style={{
              width: 24, height: 24,
              borderRadius: 6,
              background: col.color + '18',
              color: col.color,
              border: `1px solid ${col.color}30`,
              cursor: 'pointer',
              fontSize: 16, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = col.color + '35'}
            onMouseLeave={e => e.currentTarget.style.background = col.color + '18'}
          >
            +
          </button>
        </div>
      </div>

      {/* Cards list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 60,
      }}>
        {cards.length === 0 && (
          <div style={{
            textAlign: 'center', color: '#9ca3af',
            fontSize: 12, padding: '20px 0',
            fontStyle: 'italic',
          }}>
            Aucune opportunité
          </div>
        )}
        {cards.map(opp => (
          <KanbanCard
            key={opp.id}
            opp={opp}
            isDragging={draggingId === opp.id}
            onEdit={() => onEditCard(opp)}
            onDelete={() => onDeleteCard(opp.id)}
            onDragStart={() => onCardDragStart(opp.id)}
            onDragEnd={onCardDragEnd}
          />
        ))}
        {/* Drop placeholder when dragging over */}
        {isTarget && draggingId && (
          <div style={{
            height: 4, borderRadius: 2,
            background: col.color,
            opacity: 0.6,
            margin: '4px 0',
          }} />
        )}
      </div>

      {/* Column Footer */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid #edf2f7',
        background: '#fff',
        borderRadius: '0 0 8px 8px',
      }}>
        <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500 }}>Total colonne</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: col.color }}>
          {fmt(total)}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Pipeline component ────────────────────────────────────── */
export default function Pipeline() {
  const [opportunites, setOpportunites] = useState([]);
  const [stats, setStats] = useState({});
  const [totalPipeline, setTotalPipeline] = useState(0);
  const [tauxConversion, setTauxConversion] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Drag state
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Modal state: null | { mode: 'create', statut } | { mode: 'edit', opp }
  const [modal, setModal] = useState(null);

  /* Load data */
  const load = async () => {
    setLoading(true);
    try {
      const [oRes, cRes, iRes] = await Promise.all([
        api.get('/opportunites'),
        api.get('/contacts?type=prospect'),
        api.get('/intervenants?actif=true'),
      ]);
      const d = oRes.data;
      setOpportunites(d.opportunites || []);
      setStats(d.stats || {});
      setTotalPipeline(d.totalPipeline || 0);
      setTauxConversion(d.tauxConversion || 0);
      setContacts(cRes.data || []);
      setIntervenants(iRes.data || []);
    } catch (err) {
      console.error('Erreur chargement pipeline:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* Delete */
  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette opportunité ?')) return;
    try {
      await api.delete(`/opportunites/${id}`);
      setOpportunites(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  /* Drag handlers */
  const handleCardDragStart = (id) => {
    setDraggingId(id);
  };

  const handleCardDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleColDragOver = (e, statut) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== statut) setDragOverCol(statut);
  };

  const handleColDragLeave = (e) => {
    // Only clear if leaving the column container itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(null);
    }
  };

  const handleColDrop = async (e, targetStatut) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggingId) return;

    const opp = opportunites.find(o => o.id === draggingId);
    if (!opp || opp.statut === targetStatut) {
      setDraggingId(null);
      return;
    }

    // Optimistic update
    setOpportunites(prev =>
      prev.map(o => o.id === draggingId ? { ...o, statut: targetStatut } : o)
    );
    setDraggingId(null);

    try {
      await api.put(`/opportunites/${draggingId}`, { statut: targetStatut });
    } catch (err) {
      console.error('Erreur mise à jour statut:', err);
      // Rollback
      setOpportunites(prev =>
        prev.map(o => o.id === draggingId ? { ...o, statut: opp.statut } : o)
      );
    }
  };

  /* Group cards by column */
  const cardsByCol = Object.fromEntries(
    COLUMNS.map(col => [
      col.statut,
      opportunites.filter(o => o.statut === col.statut),
    ])
  );

  /* KPI totals */
  const totalActive = opportunites
    .filter(o => o.statut !== 'perdu')
    .reduce((s, o) => s + (Number(o.montantEstime) || 0), 0);

  const totalGagne = opportunites
    .filter(o => o.statut === 'gagne')
    .reduce((s, o) => s + (Number(o.montantEstime) || 0), 0);

  const nbActive = opportunites.filter(o => !['perdu', 'gagne'].includes(o.statut)).length;

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Page header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Pipeline commercial</h1>
          <p style={{ fontSize: 13, color: '#6b7c93', marginTop: 2 }}>
            {opportunites.length} opportunité{opportunites.length !== 1 ? 's' : ''} · Vue Kanban
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal({ mode: 'create', statut: 'prospect' })}
        >
          + Nouvelle opportunité
        </button>
      </div>

      {/* KPI bar */}
      <div style={{
        padding: '14px 28px 0',
        flexShrink: 0,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Pipeline total */}
        <div style={{
          background: '#fff', border: '1px solid #dce6f0',
          borderLeft: '4px solid #0f1f4b',
          borderRadius: 8, padding: '12px 18px',
          minWidth: 160,
          boxShadow: '0 1px 3px rgba(15,31,75,0.08)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f1f4b', letterSpacing: '-0.02em' }}>
            {fmt(totalPipeline)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>
            Pipeline total
          </div>
        </div>

        {/* En cours */}
        <div style={{
          background: '#fff', border: '1px solid #dce6f0',
          borderLeft: '4px solid #3b82f6',
          borderRadius: 8, padding: '12px 18px',
          minWidth: 140,
          boxShadow: '0 1px 3px rgba(15,31,75,0.08)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6', letterSpacing: '-0.02em' }}>
            {nbActive}
          </div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>
            En cours
          </div>
        </div>

        {/* Clients actifs */}
        <div style={{
          background: '#fff', border: '1px solid #dce6f0',
          borderLeft: '4px solid #10b981',
          borderRadius: 8, padding: '12px 18px',
          minWidth: 160,
          boxShadow: '0 1px 3px rgba(15,31,75,0.08)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
            {fmt(totalGagne)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>
            Clients actifs (CA)
          </div>
        </div>

        {/* Taux conversion */}
        <div style={{
          background: '#fff', border: '1px solid #dce6f0',
          borderLeft: '4px solid #f59e0b',
          borderRadius: 8, padding: '12px 18px',
          minWidth: 140,
          boxShadow: '0 1px 3px rgba(15,31,75,0.08)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.02em' }}>
            {tauxConversion}%
          </div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>
            Taux de conversion
          </div>
        </div>

        {/* Perdu */}
        <div style={{
          background: '#fff', border: '1px solid #dce6f0',
          borderLeft: '4px solid #ef4444',
          borderRadius: 8, padding: '12px 18px',
          minWidth: 120,
          boxShadow: '0 1px 3px rgba(15,31,75,0.08)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', letterSpacing: '-0.02em' }}>
            {stats['perdu']?.nb || 0}
          </div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>
            Perdus
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div style={{
        flex: 1,
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: '16px 28px 24px',
      }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#6b7c93', fontSize: 14,
          }}>
            Chargement…
          </div>
        ) : (
          <div style={{
            display: 'flex',
            gap: 14,
            height: '100%',
            minWidth: 'max-content',
          }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.statut}
                col={col}
                cards={cardsByCol[col.statut] || []}
                dragOverCol={dragOverCol}
                draggingId={draggingId}
                onDragOver={e => handleColDragOver(e, col.statut)}
                onDrop={e => handleColDrop(e, col.statut)}
                onDragLeave={handleColDragLeave}
                onAddCard={() => setModal({ mode: 'create', statut: col.statut })}
                onEditCard={opp => setModal({ mode: 'edit', opp })}
                onDeleteCard={handleDelete}
                onCardDragStart={handleCardDragStart}
                onCardDragEnd={handleCardDragEnd}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <OppModal
          opp={modal.mode === 'edit' ? modal.opp : null}
          defaultStatut={modal.mode === 'create' ? modal.statut : undefined}
          contacts={contacts}
          intervenants={intervenants}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
