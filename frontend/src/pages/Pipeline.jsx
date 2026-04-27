import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/* ─── Column definitions ─────────────────────────────────────────── */
const COLUMNS = [
  { statut: 'prospect',      label: 'Nouveau contact',   color: '#9ca3af' },
  { statut: 'qualification', label: 'Discussion en cours', color: '#3b82f6' },
  { statut: 'devis_fait',    label: 'Devis fait',        color: '#8b5cf6' },
  { statut: 'negociation',   label: 'Devis envoyé',      color: '#f59e0b' },
  { statut: 'devis_envoye',  label: 'Devis accepté',     color: '#10b981' },
  { statut: 'gagne',         label: 'Client',            color: '#0f1f4b' },
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
  const diffDays = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}j dépassé`, urgent: true };
  if (diffDays === 0) return { label: "Aujourd'hui", urgent: true };
  if (diffDays <= 7) return { label: `Dans ${diffDays}j`, urgent: true };
  if (diffDays <= 30) return { label: `Dans ${diffDays}j`, urgent: false };
  return { label: `Dans ${Math.round(diffDays / 30)} mois`, urgent: false };
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
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #dce6f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f1f4b', margin: 0 }}>
            {opp ? "Modifier l'opportunité" : 'Nouvelle opportunité'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7c93', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {contacts.length > 0 && (
            <div className="form-group">
              <label className="form-label">Contact</label>
              <select className="form-control" value={form.contactId} onChange={e => set('contactId', e.target.value)}>
                <option value="">Sélectionner…</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.raisonSociale}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Titre *</label>
            <input className="form-control" value={form.titre} onChange={e => set('titre', e.target.value)} placeholder="Ex: Mission comptabilité 2025" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Statut</label>
              <select className="form-control" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {COLUMNS.map(c => <option key={c.statut} value={c.statut}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Montant estimé (€)</label>
              <input className="form-control" type="number" min="0" step="100" value={form.montantEstime} onChange={e => set('montantEstime', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Probabilité (%)</label>
              <input className="form-control" type="number" min="0" max="100" value={form.probabilite} onChange={e => set('probabilite', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Échéance prévue</label>
              <input className="form-control" type="date" value={form.dateEcheance} onChange={e => set('dateEcheance', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Intervenant</label>
            <select className="form-control" value={form.intervenantId} onChange={e => set('intervenantId', e.target.value)}>
              <option value="">Aucun</option>
              {intervenants.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Notes sur cette opportunité…" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid #edf2f7', marginTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Convertir en client modal ──────────────────────────────────── */
function ConvertirClientModal({ opp, onSave, onClose }) {
  const [form, setForm] = useState({ type: 'BIC', regime: 'reel_normal' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const TYPES = [
    { v: 'BIC', l: 'BIC — Bénéfices industriels et commerciaux' },
    { v: 'BNC', l: 'BNC — Bénéfices non commerciaux' },
    { v: 'BA',  l: 'BA — Bénéfices agricoles' },
    { v: 'IS',  l: 'IS — Impôt sur les sociétés' },
  ];
  const REGIMES = [
    { v: 'reel_normal',    l: 'Réel normal' },
    { v: 'reel_simplifie', l: 'Réel simplifié' },
    { v: 'micro',          l: 'Micro-entreprise' },
    { v: 'franchise',      l: 'Franchise en base de TVA' },
  ];

  const handleSubmit = async () => {
    setSaving(true); setErr('');
    try {
      await api.post(`/opportunites/${opp.id}/convertir`, form);
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la conversion');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,31,75,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(15,31,75,0.22)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #dce6f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f1f4b', margin: 0 }}>Convertir en client</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7c93', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: '#6b7c93', marginBottom: 16 }}>
            Convertir <strong style={{ color: '#0f1f4b' }}>{opp.contactNom}</strong> en client actif.
          </p>
          {err && <div style={{ background: '#fff0f0', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{err}</div>}
          <div className="form-group">
            <label className="form-label">Type d'activité *</label>
            <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Régime TVA *</label>
            <select className="form-control" value={form.regime} onChange={e => setForm(f => ({ ...f, regime: e.target.value }))}>
              {REGIMES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Conversion…' : '✅ Convertir en client'}
            </button>
          </div>
        </div>
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
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, padding: '0 4px', borderRadius: 4, lineHeight: 1, display: 'flex', alignItems: 'center' }}
        title="Options"
      >···</button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(15,31,75,0.16)', border: '1px solid #dce6f0', minWidth: 130, overflow: 'hidden' }}>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1a2a3a', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >✏️ Modifier</button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff0f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >🗑 Supprimer</button>
        </div>
      )}
    </div>
  );
}

/* ─── Kanban Card ────────────────────────────────────────────────── */
function KanbanCard({ opp, isDragging, onEdit, onDelete, onDragStart, onDragEnd, onCreateDevis, onConvertirClient }) {
  const rel = fmtRelative(opp.dateEcheance);
  const colColor = STATUT_MAP[opp.statut]?.color || '#9ca3af';
  const showCreateDevis = (opp.statut === 'prospect' || opp.statut === 'qualification');
  const showConvertir   = opp.statut === 'devis_envoye' && opp.prospect_id;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: '#fff', border: '1px solid #dce6f0', borderRadius: 8,
        padding: '12px 14px',
        boxShadow: isDragging ? 'none' : '0 1px 4px rgba(15,31,75,0.08)',
        opacity: isDragging ? 0.45 : 1,
        cursor: 'grab', userSelect: 'none',
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

      {/* Contact name */}
      {opp.contactNom && (
        <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 8 }}>
          {opp.contactNom}
          {opp.prospect_id && (
            <span style={{ marginLeft: 6, fontSize: 10, background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
              Prospect
            </span>
          )}
        </div>
      )}

      {/* Montant + probabilité */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: colColor, letterSpacing: '-0.01em' }}>
          {opp.montantEstime ? fmt(opp.montantEstime) : '—'}
        </span>
        <span style={{ background: colColor + '18', color: colColor, border: `1px solid ${colColor}40`, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
          {opp.probabilite ?? 0}%
        </span>
      </div>

      {/* Bottom row: intervenant + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#6b7c93', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {opp.intervenantNom || <span style={{ fontStyle: 'italic' }}>Sans intervenant</span>}
        </span>
        {rel && (
          <span style={{ fontSize: 11, fontWeight: 600, color: rel.urgent ? '#ef4444' : '#6b7c93', whiteSpace: 'nowrap' }}>
            {rel.label}
          </span>
        )}
      </div>

      {/* Action buttons */}
      {(showCreateDevis || showConvertir) && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f4f8', display: 'flex', gap: 6 }}>
          {showCreateDevis && (
            <button
              onClick={e => { e.stopPropagation(); onCreateDevis && onCreateDevis(opp); }}
              style={{
                flex: 1, fontSize: 11, fontWeight: 600,
                color: '#5bb8e8', background: '#5bb8e810',
                border: '1px solid #5bb8e840', borderRadius: 6,
                cursor: 'pointer', padding: '4px 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#5bb8e820'}
              onMouseLeave={e => e.currentTarget.style.background = '#5bb8e810'}
            >
              📄 Créer un devis
            </button>
          )}
          {showConvertir && (
            <button
              onClick={e => { e.stopPropagation(); onConvertirClient && onConvertirClient(opp); }}
              style={{
                flex: 1, fontSize: 11, fontWeight: 600,
                color: '#10b981', background: '#10b98110',
                border: '1px solid #10b98140', borderRadius: 6,
                cursor: 'pointer', padding: '4px 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#10b98120'}
              onMouseLeave={e => e.currentTarget.style.background = '#10b98110'}
            >
              ✅ Convertir en client
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Kanban Column ──────────────────────────────────────────────── */
function KanbanColumn({ col, cards, dragOverCol, onDragOver, onDrop, onDragLeave, onAddCard, onEditCard, onDeleteCard, onCardDragStart, onCardDragEnd, draggingId, onCreateDevis, onConvertirClient }) {
  const total = cards.reduce((s, c) => s + (Number(c.montantEstime) || 0), 0);
  const isTarget = dragOverCol === col.statut;

  return (
    <div
      style={{
        width: 264, flexShrink: 0, display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 220px)',
        background: isTarget ? '#eff6ff' : '#f0f4f8',
        border: isTarget ? `2px solid ${col.color}` : '2px solid transparent',
        borderRadius: 10, transition: 'border-color 0.15s, background 0.15s',
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      {/* Column Header */}
      <div style={{ borderTop: `4px solid ${col.color}`, borderRadius: '8px 8px 0 0', padding: '12px 14px 10px', background: '#fff', borderBottom: '1px solid #edf2f7' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0f1f4b' }}>{col.label}</span>
            <span style={{ background: col.color + '20', color: col.color, borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '1px 7px', border: `1px solid ${col.color}40` }}>
              {cards.length}
            </span>
          </div>
          <button
            onClick={onAddCard}
            title="Ajouter une opportunité"
            style={{ width: 24, height: 24, borderRadius: 6, background: col.color + '18', color: col.color, border: `1px solid ${col.color}30`, cursor: 'pointer', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = col.color + '35'}
            onMouseLeave={e => e.currentTarget.style.background = col.color + '18'}
          >+</button>
        </div>
      </div>

      {/* Cards list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
        {cards.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0', fontStyle: 'italic' }}>
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
            onCreateDevis={onCreateDevis}
            onConvertirClient={onConvertirClient}
          />
        ))}
        {isTarget && draggingId && (
          <div style={{ height: 4, borderRadius: 2, background: col.color, opacity: 0.6, margin: '4px 0' }} />
        )}
      </div>

      {/* Column Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #edf2f7', background: '#fff', borderRadius: '0 0 8px 8px' }}>
        <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500 }}>Total colonne</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: col.color }}>{fmt(total)}</div>
      </div>
    </div>
  );
}

/* ─── Main Pipeline component ────────────────────────────────────── */
export default function Pipeline() {
  const navigate = useNavigate();
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

  // Modal state
  const [modal, setModal] = useState(null); // null | { mode: 'create', statut } | { mode: 'edit', opp }
  const [convertirModal, setConvertirModal] = useState(null); // null | opp

  /* Load data */
  const load = async () => {
    setLoading(true);
    try {
      const [oRes, cRes, iRes] = await Promise.all([
        api.get('/opportunites'),
        api.get('/contacts?type=prospect').catch(() => ({ data: [] })),
        api.get('/intervenants?actif=true').catch(() => ({ data: [] })),
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

  /* "Créer un devis" from pipeline card */
  const handleCreateDevis = (opp) => {
    const params = new URLSearchParams();
    params.set('new', '1');
    params.set('opp_id', opp.id);
    if (opp.prospect_id) params.set('prospect_id', opp.prospect_id);
    if (opp.contactNom) params.set('nom', opp.contactNom);
    navigate(`/devis?${params.toString()}`);
  };

  /* Drag handlers */
  const handleCardDragStart = (id) => setDraggingId(id);
  const handleCardDragEnd   = () => { setDraggingId(null); setDragOverCol(null); };
  const handleColDragOver   = (e, statut) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== statut) setDragOverCol(statut); };
  const handleColDragLeave  = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null); };

  const handleColDrop = async (e, targetStatut) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!draggingId) return;
    const opp = opportunites.find(o => o.id === draggingId);
    if (!opp || opp.statut === targetStatut) { setDraggingId(null); return; }

    // Dragging to "Client" column: trigger conversion modal
    if (targetStatut === 'gagne' && opp.prospect_id) {
      setDraggingId(null);
      setConvertirModal(opp);
      return;
    }

    setOpportunites(prev => prev.map(o => o.id === draggingId ? { ...o, statut: targetStatut } : o));
    setDraggingId(null);

    try {
      await api.put(`/opportunites/${draggingId}`, { statut: targetStatut });
    } catch {
      setOpportunites(prev => prev.map(o => o.id === draggingId ? { ...o, statut: opp.statut } : o));
    }
  };

  /* Group cards by column */
  const cardsByCol = Object.fromEntries(
    COLUMNS.map(col => [col.statut, opportunites.filter(o => o.statut === col.statut)])
  );

  /* KPI totals */
  const totalActive = opportunites.filter(o => o.statut !== 'perdu').reduce((s, o) => s + (Number(o.montantEstime) || 0), 0);
  const totalGagne  = opportunites.filter(o => o.statut === 'gagne').reduce((s, o) => s + (Number(o.montantEstime) || 0), 0);
  const nbActive    = opportunites.filter(o => !['perdu', 'gagne'].includes(o.statut)).length;

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
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create', statut: 'prospect' })}>
          + Nouvelle opportunité
        </button>
      </div>

      {/* KPI bar */}
      <div style={{ padding: '14px 28px 0', flexShrink: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { v: fmt(totalPipeline), l: 'Pipeline total',    color: '#0f1f4b' },
          { v: nbActive,           l: 'En cours',          color: '#3b82f6' },
          { v: fmt(totalGagne),    l: 'Clients actifs (CA)', color: '#10b981' },
          { v: tauxConversion + '%', l: 'Taux de conversion', color: '#f59e0b' },
          { v: stats['perdu']?.nb || 0, l: 'Perdus',       color: '#ef4444' },
        ].map(({ v, l, color }) => (
          <div key={l} style={{ background: '#fff', border: '1px solid #dce6f0', borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '12px 18px', minWidth: 140, boxShadow: '0 1px 3px rgba(15,31,75,0.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '16px 28px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7c93', fontSize: 14 }}>
            Chargement…
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 14, height: '100%', minWidth: 'max-content' }}>
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
                onCreateDevis={handleCreateDevis}
                onConvertirClient={opp => setConvertirModal(opp)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Opp modal */}
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

      {/* Convertir en client modal */}
      {convertirModal && (
        <ConvertirClientModal
          opp={convertirModal}
          onSave={() => { setConvertirModal(null); load(); }}
          onClose={() => setConvertirModal(null)}
        />
      )}
    </div>
  );
}
