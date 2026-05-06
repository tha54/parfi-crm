import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ProspectEditModal from '../components/ProspectEditModal';

const STATUTS = {
  nouveau:        { label: 'Nouveau',        color: '#006f94', bg: '#e0f6fc' },
  contacte:       { label: 'Contacté',       color: '#5b21b6', bg: '#ede9fe' },
  en_negociation: { label: 'En négociation', color: '#92400e', bg: '#fef3c7' },
  converti:       { label: 'Converti',       color: '#00695c', bg: '#e8f5f3' },
  perdu:          { label: 'Perdu',          color: '#9f1239', bg: '#ffe4e6' },
};

const DEVIS_COLORS = {
  brouillon: '#6b7c93', envoye: '#f59e0b', accepte: '#00897b', refuse: '#e74c3c',
};

const TYPES_CLIENT  = ['BIC', 'BNC', 'SCI', 'SA', 'Association', 'Autre'];
const REGIMES_CLIENT = ['mensuel', 'trimestriel', 'annuel'];
const regimeLabel    = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };
const TYPE_PROSPECT_LABEL = { particulier: 'Particulier', entreprise: 'Entreprise', association: 'Association', autre: 'Autre' };

const fmt = v => v ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v) : null;

function StatutBadge({ s }) {
  const st = STATUTS[s] || { label: s, bg: '#f1f5f9', color: '#475569' };
  return <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>;
}

function DevisBadge({ p, navigate }) {
  if (!p.devis_id) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: 11, whiteSpace: 'nowrap' }}
        onClick={e => { e.stopPropagation(); navigate(`/devis/new?prospect_id=${p.id}&nom=${encodeURIComponent(p.nom)}`); }}
      >
        + Créer un devis
      </button>
    );
  }
  const color = DEVIS_COLORS[p.devis_statut] || '#6b7c93';
  const isEditable = p.devis_statut === 'brouillon';
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        navigate(isEditable ? `/devis/new?edit=${p.devis_id}` : `/devis/${p.devis_id}`);
      }}
      style={{ fontSize: 11, fontWeight: 600, color, background: color + '12', border: `1px solid ${color}40`,
               borderRadius: 10, padding: '2px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {isEditable ? '✏️' : '📄'} {p.devis_numero}
      {p.devis_montant_ht && <span style={{ opacity: 0.8 }}>· {fmt(p.devis_montant_ht)}</span>}
    </button>
  );
}

/* ── Quick create prospect (sans ID = nouveau) ── */
function QuickCreateModal({ onSaved, onClose }) {
  const [form, setForm] = useState({ nom: '', email: '', telephone: '', type_prospect: 'entreprise', siren: '', adresse: '', code_postal: '', ville: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) { setErr('Nom requis'); return; }
    if (!form.email && !form.telephone) { setErr('Email ou téléphone requis'); return; }
    setSaving(true); setErr('');
    try {
      const { data } = await api.post('/prospects', form);
      onSaved(data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">Nouveau prospect</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type_prospect} onChange={set('type_prospect')}>
                <option value="entreprise">Entreprise</option>
                <option value="particulier">Particulier</option>
                <option value="association">Association</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nom / Raison sociale *</label>
              <input className="form-control" value={form.nom} onChange={set('nom')} placeholder="SARL Exemple…" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">SIREN</label>
                <input className="form-control" value={form.siren} onChange={set('siren')} placeholder="123456789" maxLength={9} style={{ fontFamily: 'monospace' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Ville</label>
                <input className="form-control" value={form.ville} onChange={set('ville')} placeholder="Longwy" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-control" value={form.email} onChange={set('email')} placeholder="contact@exemple.fr" />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone</label>
                <input className="form-control" value={form.telephone} onChange={set('telephone')} placeholder="06 00 00 00 00" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Création…' : '+ Créer le prospect'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Convertir en client ── */
function ConvertirModal({ prospect, onConfirm, onCancel }) {
  const suggested = (() => {
    const f = (prospect.forme_juridique || '').toLowerCase();
    if (f.includes('sci') || f.includes('civile immobilière')) return 'SCI';
    if (f.includes('association') || f.includes('fondation'))  return 'Association';
    if (f.includes('anonyme'))                                  return 'SA';
    if (f.includes('individuelle') || f.includes('libéral'))   return 'BNC';
    return 'BIC';
  })();
  const [type, setType]     = useState(suggested);
  const [regime, setRegime] = useState('mensuel');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await api.post(`/prospects/${prospect.id}/convertir`, { type, regime });
      onConfirm(data.client);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la conversion');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">Convertir en client</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            <p style={{ marginBottom: 18, color: 'var(--text-muted)', fontSize: 13 }}>
              Le prospect <strong>{prospect.nom}</strong> va être converti en client.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type client *</label>
                <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
                  {TYPES_CLIENT.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Régime TVA *</label>
                <select className="form-control" value={regime} onChange={e => setRegime(e.target.value)}>
                  {REGIMES_CLIENT.map(r => <option key={r} value={r}>{regimeLabel[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {loading ? 'Conversion…' : '✓ Convertir en client'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Page principale ── */
export default function Prospects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prospects, setProspects]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [editId, setEditId]         = useState(null);   // ProspectEditModal
  const [createModal, setCreateModal] = useState(false);
  const [convertirProspect, setConvertirProspect] = useState(null);

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    api.get('/prospects').then(r => setProspects(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (p, e) => {
    e.stopPropagation();
    if (!confirm(`Supprimer définitivement "${p.nom}" ?`)) return;
    await api.delete(`/prospects/${p.id}`);
    load();
  };

  const filtered = prospects.filter(p => {
    const q = `${p.nom} ${p.siren || ''} ${p.ville || ''} ${p.forme_juridique || ''} ${p.contact_prenom || ''} ${p.contact_nom || ''}`.toLowerCase();
    return q.includes(search.toLowerCase()) && (!filterStatut || p.statut === filterStatut);
  });

  const counts = Object.fromEntries(Object.keys(STATUTS).map(k => [k, prospects.filter(p => p.statut === k).length]));

  return (
    <>
      <div className="page-header">
        <h1>Prospects</h1>
        {isExpertOrChef && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/pipeline')}>
              📊 Pipeline
            </button>
            <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
              + Nouveau prospect
            </button>
          </div>
        )}
      </div>

      <div className="page-body">
        {/* KPI statuts */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          {Object.entries(STATUTS).map(([k, v]) => (
            <div key={k} className="kpi-card"
              style={{ borderTop: `3px solid ${v.color}`, cursor: 'pointer' }}
              onClick={() => setFilterStatut(f => f === k ? '' : k)}>
              <div>
                <div className="kpi-value" style={{ color: v.color, fontSize: 24 }}>{counts[k] ?? 0}</div>
                <div className="kpi-label">{v.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher par nom, SIREN, ville…"
                value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <span className="text-muted text-sm">{filtered.length} prospect(s)</span>
          </div>

          <div className="table-wrapper">
            {loading ? (
              <div className="spinner"><div className="spinner-ring" /></div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🎯</div>
                <p>{search || filterStatut ? 'Aucun prospect pour ces filtres' : 'Aucun prospect — créez le premier !'}</p>
                {isExpertOrChef && !search && !filterStatut && (
                  <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setCreateModal(true)}>
                    + Nouveau prospect
                  </button>
                )}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nom / Raison sociale</th>
                    <th>SIREN</th>
                    <th>Ville</th>
                    <th>Statut</th>
                    <th>Devis</th>
                    <th>Créé le</th>
                    {isExpertOrChef && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const displayName = p.type_prospect === 'particulier' && p.contact_prenom
                      ? `${p.contact_prenom} ${p.nom}` : p.nom;
                    return (
                      <tr key={p.id}
                        onClick={() => setEditId(p.id)}
                        style={{ cursor: 'pointer' }}
                        title="Cliquer pour modifier la fiche">
                        <td style={{ minWidth: 180 }}>
                          <strong>{displayName}</strong>
                          {p.forme_juridique && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.forme_juridique}</div>}
                          {p.activite && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.activite}</div>}
                        </td>
                        <td>
                          <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.siren || '—'}</code>
                        </td>
                        <td>
                          {p.ville
                            ? <span>{p.ville}{p.code_postal && <span className="text-muted"> ({p.code_postal})</span>}</span>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td><StatutBadge s={p.statut} /></td>
                        <td onClick={e => e.stopPropagation()}>
                          <DevisBadge p={p} navigate={navigate} />
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(p.cree_le).toLocaleDateString('fr-FR')}
                        </td>
                        {isExpertOrChef && (
                          <td onClick={e => e.stopPropagation()}>
                            <div className="td-actions">
                              <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => setEditId(p.id)}>✏️</button>
                              {p.statut !== 'converti' && (
                                <button className="btn btn-accent btn-sm" onClick={() => setConvertirProspect(p)}>→ Client</button>
                              )}
                              {user?.role === 'expert' && (
                                <button className="btn btn-danger btn-sm" onClick={e => handleDelete(p, e)}>🗑</button>
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

      {/* Création rapide */}
      {createModal && (
        <QuickCreateModal
          onSaved={() => { setCreateModal(false); load(); }}
          onClose={() => setCreateModal(false)}
        />
      )}

      {/* Édition fiche prospect (avec synchro SIREN) */}
      {editId && (
        <ProspectEditModal
          prospectId={editId}
          onSaved={() => { setEditId(null); load(); }}
          onClose={() => setEditId(null)}
        />
      )}

      {/* Conversion en client */}
      {convertirProspect && (
        <ConvertirModal
          prospect={convertirProspect}
          onConfirm={client => {
            setConvertirProspect(null);
            load();
            alert(`✓ "${client.nom}" créé en tant que client (#${client.id})`);
          }}
          onCancel={() => setConvertirProspect(null)}
        />
      )}
    </>
  );
}
