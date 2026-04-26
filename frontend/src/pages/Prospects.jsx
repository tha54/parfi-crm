import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUTS = {
  nouveau:        { label: 'Nouveau',          bg: '#e0f6fc', color: '#006f94' },
  contacte:       { label: 'Contacté',         bg: '#ede9fe', color: '#5b21b6' },
  en_negociation: { label: 'En négociation',   bg: '#fef3c7', color: '#92400e' },
  converti:       { label: 'Converti',         bg: '#e8f5f3', color: '#00695c' },
  perdu:          { label: 'Perdu',            bg: '#ffe4e6', color: '#9f1239' },
};

const TYPES_CLIENT  = ['BIC', 'BNC', 'SCI', 'SA', 'Association', 'Autre'];
const REGIMES_CLIENT = ['mensuel', 'trimestriel', 'annuel'];
const regimeLabel    = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };

function suggestClientType(forme) {
  const f = (forme || '').toLowerCase();
  if (f.includes('sci') || f.includes('civile immobilière')) return 'SCI';
  if (f.includes('association') || f.includes('fondation'))  return 'Association';
  if (f.includes('anonyme'))                                  return 'SA';
  if (f.includes('individuelle') || f.includes('libéral'))   return 'BNC';
  if (f.includes('limitée') || f.includes('simplifiée') || f.includes('collective')) return 'BIC';
  return 'BIC';
}

function StatutBadge({ s }) {
  const st = STATUTS[s] || { label: s, bg: '#f1f5f9', color: '#475569' };
  return (
    <span className="badge" style={{ background: st.bg, color: st.color }}>
      {st.label}
    </span>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 720 } : {}}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── Bloc SIREN lookup (réutilisé dans ProspectForm ET dans ClientForm) ─────────
function SirenLookup({ onResult }) {
  const [siren, setSiren] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'error'|'info', text }

  const search = async () => {
    const clean = siren.replace(/\s/g, '');
    if (!/^\d{9}$/.test(clean)) {
      setMsg({ type: 'error', text: 'Saisissez exactement 9 chiffres' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const { data } = await api.get(`/pappers/siren/${clean}`);
      onResult(data);
      setMsg({ type: 'info', text: `Données chargées pour ${data.nom}` });
    } catch (err) {
      const m = err.response?.data?.message || 'Erreur lors de la recherche';
      const isUnconfigured = err.response?.data?.unconfigured;
      setMsg({
        type: 'error',
        text: isUnconfigured
          ? 'Pappers non configuré — renseignez PAPPERS_API_KEY dans le .env du backend'
          : m,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--accent-light)', border: '1px solid #bee3ed', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 22 }}>
      <div className="form-label" style={{ marginBottom: 8, color: 'var(--accent-hover)', fontSize: 11 }}>
        RECHERCHE AUTOMATIQUE VIA PAPPERS
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-control"
          placeholder="Numéro SIREN (9 chiffres)"
          value={siren}
          onChange={(e) => setSiren(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())}
          maxLength={9}
          style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.1em' }}
        />
        <button
          type="button"
          className="btn btn-accent"
          onClick={search}
          disabled={loading}
          style={{ whiteSpace: 'nowrap' }}
        >
          {loading ? '…' : '🔍 Rechercher'}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 8, fontSize: 12, color: msg.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  nom: '', siren: '', siret: '', forme_juridique: '', adresse: '', code_postal: '', ville: '',
  capital: '', code_naf: '', activite: '', date_creation_ent: '',
  email: '', telephone: '',
  contact_prenom: '', contact_nom: '', contact_email: '', contact_telephone: '',
  notes: '', statut: 'nouveau', source: '',
};

function ProspectForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isEdit = !!initial?.id;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handlePappersResult = (data) => {
    setForm((f) => ({
      ...f,
      nom:             data.nom             || f.nom,
      siren:           data.siren           || f.siren,
      siret:           data.siret           || f.siret,
      forme_juridique: data.forme_juridique || f.forme_juridique,
      adresse:         data.adresse         || f.adresse,
      code_postal:     data.code_postal     || f.code_postal,
      ville:           data.ville           || f.ville,
      capital:         data.capital != null  ? String(data.capital) : f.capital,
      code_naf:        data.code_naf        || f.code_naf,
      activite:        data.activite        || f.activite,
      date_creation_ent: data.date_creation_ent || f.date_creation_ent,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nom.trim()) { setError('Le nom est requis'); return; }
    if (form.siren && !/^\d{9}$/.test(form.siren.replace(/\s/g, ''))) {
      setError('Le SIREN doit contenir exactement 9 chiffres'); return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        siren:   form.siren.replace(/\s/g, '') || null,
        capital: form.capital ? parseFloat(form.capital) : null,
      };
      if (isEdit) await api.put(`/prospects/${initial.id}`, payload);
      else        await api.post('/prospects', payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      {!isEdit && <SirenLookup onResult={handlePappersResult} />}

      {/* ── Entreprise ─────────── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Informations entreprise</div>

      <div className="form-group">
        <label className="form-label">Raison sociale *</label>
        <input className="form-control" value={form.nom} onChange={set('nom')} required placeholder="SARL Exemple…" />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">SIREN</label>
          <input className="form-control" value={form.siren} onChange={set('siren')} placeholder="123456789" maxLength={9} style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
        </div>
        <div className="form-group">
          <label className="form-label">SIRET siège</label>
          <input className="form-control" value={form.siret} onChange={set('siret')} placeholder="12345678900001" maxLength={14} style={{ fontFamily: 'monospace' }} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Forme juridique</label>
          <input className="form-control" value={form.forme_juridique} onChange={set('forme_juridique')} placeholder="SARL, SAS, SA…" />
        </div>
        <div className="form-group">
          <label className="form-label">Code NAF</label>
          <input className="form-control" value={form.code_naf} onChange={set('code_naf')} placeholder="64.19Z" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Activité</label>
        <input className="form-control" value={form.activite} onChange={set('activite')} placeholder="Libellé de l'activité" />
      </div>

      <div className="form-group">
        <label className="form-label">Adresse</label>
        <input className="form-control" value={form.adresse} onChange={set('adresse')} placeholder="29 boulevard Haussmann" />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Code postal</label>
          <input className="form-control" value={form.code_postal} onChange={set('code_postal')} placeholder="75009" maxLength={10} />
        </div>
        <div className="form-group">
          <label className="form-label">Ville</label>
          <input className="form-control" value={form.ville} onChange={set('ville')} placeholder="Paris" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Capital (€)</label>
          <input type="number" className="form-control" value={form.capital} onChange={set('capital')} placeholder="10000" min="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Date de création</label>
          <input type="date" className="form-control" value={form.date_creation_ent ? form.date_creation_ent.substring(0, 10) : ''} onChange={set('date_creation_ent')} />
        </div>
      </div>

      {/* ── Contact ────────────── */}
      <div style={{ margin: '20px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Contact</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Email entreprise</label>
          <input type="email" className="form-control" value={form.email} onChange={set('email')} placeholder="contact@exemple.fr" />
        </div>
        <div className="form-group">
          <label className="form-label">Téléphone</label>
          <input className="form-control" value={form.telephone} onChange={set('telephone')} placeholder="+33 1 23 45 67 89" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Prénom interlocuteur</label>
          <input className="form-control" value={form.contact_prenom} onChange={set('contact_prenom')} placeholder="Jean" />
        </div>
        <div className="form-group">
          <label className="form-label">Nom interlocuteur</label>
          <input className="form-control" value={form.contact_nom} onChange={set('contact_nom')} placeholder="Dupont" />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Email interlocuteur</label>
          <input type="email" className="form-control" value={form.contact_email} onChange={set('contact_email')} placeholder="jean.dupont@exemple.fr" />
        </div>
        <div className="form-group">
          <label className="form-label">Tél. interlocuteur</label>
          <input className="form-control" value={form.contact_telephone} onChange={set('contact_telephone')} placeholder="+33 6 12 34 56 78" />
        </div>
      </div>

      {/* ── Suivi CRM ──────────── */}
      <div style={{ margin: '20px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Suivi commercial</div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Statut</label>
          <select className="form-control" value={form.statut} onChange={set('statut')}>
            {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Source</label>
          <input className="form-control" value={form.source} onChange={set('source')} placeholder="Réseau, Site web, Recommandation…" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} placeholder="Observations, besoins identifiés…" />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : (isEdit ? 'Enregistrer' : 'Créer le prospect')}
        </button>
      </div>
    </form>
  );
}

function ConvertirModal({ prospect, onConfirm, onCancel }) {
  const suggested = suggestClientType(prospect.forme_juridique);
  const [type, setType]     = useState(suggested);
  const [regime, setRegime] = useState('mensuel');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/prospects/${prospect.id}/convertir`, { type, regime });
      onConfirm(data.client);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de la conversion');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <p style={{ marginBottom: 18, color: 'var(--text-muted)', fontSize: 13 }}>
        Le prospect <strong>{prospect.nom}</strong> va être converti en client.
        {prospect.forme_juridique && (
          <> Forme juridique détectée : <em>{prospect.forme_juridique}</em>.</>
        )}
      </p>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Type client *</label>
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES_CLIENT.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Régime TVA *</label>
          <select className="form-control" value={regime} onChange={(e) => setRegime(e.target.value)}>
            {REGIMES_CLIENT.map((r) => <option key={r} value={r}>{regimeLabel[r]}</option>)}
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
  );
}

export default function Prospects() {
  const { user } = useAuth();
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [search, setSearch]       = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const isExpertOrChef = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => {
    setLoading(true);
    api.get('/prospects').then((r) => setProspects(r.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (p) => {
    if (!confirm(`Supprimer définitivement le prospect "${p.nom}" ?`)) return;
    await api.delete(`/prospects/${p.id}`);
    load();
  };

  const filtered = prospects.filter((p) => {
    const matchSearch = `${p.nom} ${p.siren || ''} ${p.ville || ''} ${p.forme_juridique || ''}`
      .toLowerCase().includes(search.toLowerCase());
    const matchStatut = filterStatut ? p.statut === filterStatut : true;
    return matchSearch && matchStatut;
  });

  // KPI counts
  const counts = Object.fromEntries(
    Object.keys(STATUTS).map((k) => [k, prospects.filter((p) => p.statut === k).length])
  );

  return (
    <>
      <div className="page-header">
        <h1>Prospects</h1>
        {isExpertOrChef && (
          <button className="btn btn-primary" onClick={() => setModal({ type: 'create' })}>
            + Nouveau prospect
          </button>
        )}
      </div>

      <div className="page-body">
        {/* KPI cards */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          {Object.entries(STATUTS).map(([k, v]) => (
            <div
              key={k}
              className="kpi-card"
              style={{ borderTop: `3px solid ${v.color}`, cursor: 'pointer' }}
              onClick={() => setFilterStatut(filterStatut === k ? '' : k)}
            >
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
              <input
                className="form-control search-input"
                placeholder="Rechercher par nom, SIREN, ville…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
              >
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
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
                  <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setModal({ type: 'create' })}>
                    + Nouveau prospect
                  </button>
                )}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Raison sociale</th>
                    <th>SIREN</th>
                    <th>Forme juridique</th>
                    <th>Ville</th>
                    <th>Statut</th>
                    <th>Source</th>
                    <th>Créé le</th>
                    {isExpertOrChef && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.nom}</strong>
                        {p.activite && (
                          <div className="text-muted text-sm" style={{ marginTop: 2 }}>{p.activite}</div>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {p.siren || '—'}
                        </code>
                      </td>
                      <td>
                        <span className="text-sm">{p.forme_juridique || <span className="text-muted">—</span>}</span>
                      </td>
                      <td>
                        {p.ville
                          ? <span>{p.ville}{p.code_postal && <span className="text-muted"> ({p.code_postal})</span>}</span>
                          : <span className="text-muted">—</span>
                        }
                      </td>
                      <td><StatutBadge s={p.statut} /></td>
                      <td><span className="text-muted text-sm">{p.source || '—'}</span></td>
                      <td>{new Date(p.cree_le).toLocaleDateString('fr-FR')}</td>
                      {isExpertOrChef && (
                        <td>
                          <div className="td-actions">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setModal({ type: 'edit', prospect: p })}
                            >
                              ✏️
                            </button>
                            {p.statut !== 'converti' && (
                              <button
                                className="btn btn-accent btn-sm"
                                onClick={() => setModal({ type: 'convertir', prospect: p })}
                              >
                                → Client
                              </button>
                            )}
                            {p.statut === 'converti' && p.client_id && (
                              <span className="badge" style={{ background: '#e8f5f3', color: '#00695c' }}>
                                Converti
                              </span>
                            )}
                            {user?.role === 'expert' && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>
                                🗑
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {modal?.type === 'create' && (
        <Modal title="Nouveau prospect" onClose={() => setModal(null)} wide>
          <ProspectForm
            onSave={() => { setModal(null); load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title={`Modifier — ${modal.prospect.nom}`} onClose={() => setModal(null)} wide>
          <ProspectForm
            initial={modal.prospect}
            onSave={() => { setModal(null); load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.type === 'convertir' && (
        <Modal title="Convertir en client" onClose={() => setModal(null)}>
          <ConvertirModal
            prospect={modal.prospect}
            onConfirm={(client) => {
              setModal(null);
              load();
              alert(`✓ "${client.nom}" a été créé en tant que client (ID #${client.id})`);
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </>
  );
}
