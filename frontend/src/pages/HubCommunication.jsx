import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPES = {
  appel: '📞 Appel', email: '📧 Email', reunion: '🤝 Réunion',
  note: '📝 Note', sms: '💬 SMS', courrier: '✉️ Courrier',
};
const DIRECTIONS = { entrant: 'Entrant', sortant: 'Sortant', interne: 'Interne' };
const URGENCES = { normale: 'Normale', haute: 'Haute', critique: 'Critique' };

function TimelineCard({ interaction, onSummarize }) {
  const [expanded, setExpanded] = useState(false);
  const resume = interaction.resume_ia ? (() => { try { return JSON.parse(interaction.resume_ia); } catch { return null; } })() : null;

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: `4px solid ${interaction.urgence === 'critique' ? '#ef4444' : interaction.urgence === 'haute' ? '#f59e0b' : '#00b4d8'}` }}>
      <div className="card-body" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{TYPES[interaction.type] || interaction.type}</span>
              {interaction.client_nom && <span className="badge badge-en_cours" style={{ background: '#eff6ff', color: '#1e40af' }}>{interaction.client_nom}</span>}
              <span className="badge badge-autre" style={{ fontSize: 11 }}>{DIRECTIONS[interaction.direction] || interaction.direction}</span>
              {interaction.urgence !== 'normale' && (
                <span className="badge" style={{ background: interaction.urgence === 'critique' ? '#fee2e2' : '#fef3c7', color: interaction.urgence === 'critique' ? '#dc2626' : '#d97706', fontSize: 11 }}>
                  {URGENCES[interaction.urgence]}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#6b7c93' }}>
                {new Date(interaction.date_interaction).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              {interaction.duree_minutes && <span style={{ fontSize: 12, color: '#6b7c93' }}>· {interaction.duree_minutes} min</span>}
            </div>
            {interaction.objet && <div style={{ fontWeight: 500, marginBottom: 4 }}>{interaction.objet}</div>}
            {interaction.contenu && (
              <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', ...(expanded ? {} : { maxHeight: 60, overflow: 'hidden' }) }}>
                {interaction.contenu}
              </div>
            )}
            {interaction.contenu && interaction.contenu.length > 200 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 6px', marginTop: 4 }} onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Réduire' : 'Lire plus…'}
              </button>
            )}
            {resume && (
              <div style={{ marginTop: 8, padding: 10, background: '#f0f9ff', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0369a1', marginBottom: 6 }}>✨ Résumé IA</div>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{resume.resume}</div>
                {resume.actions?.length > 0 && (
                  <div style={{ fontSize: 12 }}>
                    <strong>Actions :</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {resume.actions.map((a, i) => <li key={i}>{a.description}{a.responsable ? ` — ${a.responsable}` : ''}{a.delai ? ` (${a.delai})` : ''}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {(interaction.transcription || interaction.contenu) && !resume && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => onSummarize(interaction)}>✨ IA</button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{interaction.utilisateur_nom}</div>
      </div>
    </div>
  );
}

function SummarizeModal({ interaction, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [tasks, setTasks] = useState([]);

  const summarize = async () => {
    setLoading(true);
    try {
      const r = await api.post('/interactions/ai/summarize', {
        transcription: interaction.transcription || interaction.contenu,
        interactionId: interaction.id,
        contexte: interaction.client_nom ? `Client: ${interaction.client_nom}` : '',
      });
      setResult(r.data.resume);
      if (r.data.resume?.actions) {
        setTasks(r.data.resume.actions.map(a => ({ ...a, selected: true })));
      }
    } catch { alert('Erreur IA'); }
    finally { setLoading(false); }
  };

  useEffect(() => { summarize(); }, []);

  const createTasks = async () => {
    const selected = tasks.filter(t => t.selected);
    for (const t of selected) {
      await api.post('/taches', {
        description: t.description,
        client_id: interaction.client_id,
        date_echeance: t.delai || null,
        priorite: 'normale',
        origine: 'email',
      }).catch(() => {});
    }
    onSaved();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <span className="modal-title">✨ Résumé IA</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading && <div className="spinner"><div className="spinner-ring" /></div>}
          {result && (
            <>
              <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 8, marginBottom: 16 }}>
                <p style={{ margin: 0, fontStyle: 'italic' }}>{result.resume}</p>
              </div>
              {result.decisions?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ fontSize: 13 }}>Décisions :</strong>
                  <ul style={{ margin: '4px 0 0 16px', fontSize: 13 }}>{result.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              )}
              {tasks.length > 0 && (
                <div>
                  <strong style={{ fontSize: 13 }}>Actions à créer :</strong>
                  <div style={{ marginTop: 8 }}>
                    {tasks.map((t, i) => (
                      <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={t.selected} onChange={e => {
                          const next = [...tasks]; next[i] = { ...next[i], selected: e.target.checked }; setTasks(next);
                        }} style={{ marginTop: 2 }} />
                        <span style={{ fontSize: 13 }}>{t.description}{t.responsable ? ` — ${t.responsable}` : ''}{t.delai ? ` (${t.delai})` : ''}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {result.pointsAttention?.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: '#fef3c7', borderRadius: 6 }}>
                  <strong style={{ fontSize: 12, color: '#92400e' }}>⚠️ Points d'attention :</strong>
                  <ul style={{ margin: '4px 0 0 16px', fontSize: 12, color: '#92400e' }}>{result.pointsAttention.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            {tasks.filter(t => t.selected).length > 0 && (
              <button className="btn btn-primary" onClick={createTasks}>
                Créer {tasks.filter(t => t.selected).length} tâche(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewInteractionModal({ clients, onClose, onSaved }) {
  const [form, setForm] = useState({
    client_id: '', type: 'appel', direction: 'entrant', objet: '', contenu: '',
    urgence: 'normale', duree_minutes: '', date_interaction: new Date().toISOString().substring(0, 16),
  });
  const [emailMode, setEmailMode] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const extractTasks = async () => {
    if (!form.contenu) return;
    setExtracting(true);
    try {
      const r = await api.post('/interactions/ai/extract-tasks', { texte: form.contenu, type: form.type === 'email' ? 'email' : 'autre' });
      setExtractedTasks(r.data.taches?.map(t => ({ ...t, selected: true })) || []);
    } catch { alert('Erreur IA'); }
    finally { setExtracting(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/interactions', { ...form, date_interaction: form.date_interaction || new Date() });
      for (const t of extractedTasks.filter(t => t.selected)) {
        await api.post('/taches', {
          description: t.description,
          client_id: t.client_id || form.client_id || null,
          utilisateur_id: t.utilisateur_id || null,
          date_echeance: t.date_echeance || null,
          priorite: t.priorite || 'normale',
          origine: 'email',
        }).catch(() => {});
      }
      onSaved();
      onClose();
    } catch (e) { alert(e.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <span className="modal-title">Nouvelle interaction</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-control" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">Aucun</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Direction</label>
              <select className="form-control" value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                {Object.entries(DIRECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Urgence</label>
              <select className="form-control" value={form.urgence} onChange={e => setForm(f => ({ ...f, urgence: e.target.value }))}>
                {Object.entries(URGENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date & heure</label>
              <input type="datetime-local" className="form-control" value={form.date_interaction} onChange={e => setForm(f => ({ ...f, date_interaction: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Durée (min)</label>
              <input type="number" className="form-control" value={form.duree_minutes} onChange={e => setForm(f => ({ ...f, duree_minutes: e.target.value }))} min="0" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Objet</label>
            <input className="form-control" value={form.objet} onChange={e => setForm(f => ({ ...f, objet: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">
              Contenu / Transcription
              {form.contenu && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, marginLeft: 8 }} onClick={extractTasks} disabled={extracting}>
                  {extracting ? '⏳ Analyse…' : '✨ Extraire les tâches (IA)'}
                </button>
              )}
            </label>
            <textarea className="form-control" rows={5} value={form.contenu} onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))} placeholder="Coller le contenu de l'email, transcription d'appel, notes de réunion…" />
          </div>

          {extractedTasks.length > 0 && (
            <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, marginBottom: 12 }}>
              <strong style={{ fontSize: 13, color: '#166534' }}>✅ Tâches extraites :</strong>
              <div style={{ marginTop: 8 }}>
                {extractedTasks.map((t, i) => (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={t.selected} onChange={e => {
                      const next = [...extractedTasks]; next[i] = { ...next[i], selected: e.target.checked }; setExtractedTasks(next);
                    }} style={{ marginTop: 2 }} />
                    {t.description}{t.date_echeance ? ` — ${t.date_echeance}` : ''}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HubCommunication() {
  const { user } = useAuth();
  const [interactions, setInteractions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [summarizeTarget, setSummarizeTarget] = useState(null);
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [search, setSearch] = useState('');

  const load = () => Promise.all([
    api.get('/interactions').then(r => setInteractions(r.data)),
    api.get('/clients').then(r => setClients(r.data)),
  ]).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = interactions.filter(i => {
    if (filterClient && String(i.client_id) !== filterClient) return false;
    if (filterType && i.type !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(i.objet?.toLowerCase().includes(q) || i.contenu?.toLowerCase().includes(q) || i.client_nom?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Hub de communication</h1>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ Nouvelle interaction</button>
      </div>

      <div className="page-body">
        {/* Filtres */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 180 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
                <option value="">Tous les clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              <select className="form-control" style={{ width: 150 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Tous les types</option>
                {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'Total', value: interactions.length, color: '#0f1f4b' },
            { label: 'Ce mois', value: interactions.filter(i => new Date(i.date_interaction) > new Date(Date.now() - 30 * 86400000)).length, color: '#00b4d8' },
            { label: 'Urgents', value: interactions.filter(i => i.urgence === 'critique').length, color: '#ef4444' },
            { label: 'Avec résumé IA', value: interactions.filter(i => i.resume_ia).length, color: '#10b981' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div><div className="kpi-value" style={{ color: k.color }}>{k.value}</div><div className="kpi-label">{k.label}</div></div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p>Aucune interaction{search || filterClient || filterType ? ' pour ces filtres' : ''}</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setModal('new')}>Enregistrer la première interaction</button>
          </div>
        ) : (
          <div>
            {filtered.map(i => (
              <TimelineCard key={i.id} interaction={i} onSummarize={setSummarizeTarget} />
            ))}
          </div>
        )}
      </div>

      {modal === 'new' && (
        <NewInteractionModal clients={clients} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {summarizeTarget && (
        <SummarizeModal interaction={summarizeTarget} onClose={() => setSummarizeTarget(null)} onSaved={() => { setSummarizeTarget(null); load(); }} />
      )}
    </>
  );
}
