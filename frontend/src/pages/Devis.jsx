import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUTS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' };
const STATUT_COLORS = { brouillon: 'autre', envoye: 'en_cours', accepte: 'termine', refuse: 'reporte', expire: 'inactif' };

function StatutBadge({ s }) {
  return <span className={`badge badge-${STATUT_COLORS[s] || 'autre'}`}>{STATUTS[s] || s}</span>;
}

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

const emptyLigne = () => ({ description: '', quantite: 1, prixUnitaireHT: 0, remisePct: 0, totalHT: 0 });

function calcLigne(l) {
  const total = parseFloat(l.quantite || 0) * parseFloat(l.prixUnitaireHT || 0) * (1 - parseFloat(l.remisePct || 0) / 100);
  return { ...l, totalHT: Math.round(total * 100) / 100 };
}

function calcTotaux(lignes, tauxTVA) {
  const totalHT = lignes.reduce((s, l) => s + parseFloat(l.totalHT || 0), 0);
  const totalTVA = totalHT * (parseFloat(tauxTVA) / 100);
  return { totalHT: Math.round(totalHT * 100) / 100, totalTVA: Math.round(totalTVA * 100) / 100, totalTTC: Math.round((totalHT + totalTVA) * 100) / 100 };
}

export default function Devis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [devis, setDevis] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | {id, ...}
  const [form, setForm] = useState({ client_id: '', titre: '', dateValidite: '', tauxTVA: '20', notesClient: '', notesInternes: '', lignes: [emptyLigne()] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [grille, setGrille] = useState([]);
  const [showGrille, setShowGrille] = useState(false);
  const [grilleHeures, setGrilleHeures] = useState({});

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      api.get('/devis').then(r => setDevis(r.data)),
      api.get('/clients').then(r => setClients(r.data)),
      api.get('/parametres/grille-tarifaire').then(r => setGrille(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const applyGrille = () => {
    const nouvelles = grille
      .filter(g => parseFloat(grilleHeures[g.id] || 0) > 0)
      .map(g => calcLigne({ description: g.libelle, quantite: parseFloat(grilleHeures[g.id]), prixUnitaireHT: parseFloat(g.taux_horaire), remisePct: 0, totalHT: 0 }));
    if (nouvelles.length === 0) return;
    setForm(f => ({
      ...f,
      lignes: [...f.lignes.filter(l => l.description || l.prixUnitaireHT > 0), ...nouvelles],
    }));
    setGrilleHeures({});
    setShowGrille(false);
  };

  const reload = () => api.get('/devis').then(r => setDevis(r.data));

  const openCreate = () => {
    setForm({ client_id: '', titre: '', dateValidite: '', tauxTVA: '20', notesClient: '', notesInternes: '', lignes: [emptyLigne()] });
    setErr('');
    setModal('create');
  };

  const openEdit = (d) => {
    setForm({
      client_id: d.client_id || '',
      titre: d.titre || '',
      dateValidite: d.dateValidite ? d.dateValidite.substring(0, 10) : '',
      tauxTVA: String(d.tauxTVA || 20),
      notesClient: d.notesClient || '',
      notesInternes: d.notesInternes || '',
      lignes: [emptyLigne()],
    });
    setErr('');
    setModal(d);
  };

  const setLigne = (i, field, val) => {
    setForm(f => {
      const lignes = f.lignes.map((l, idx) => idx === i ? calcLigne({ ...l, [field]: val }) : l);
      return { ...f, lignes };
    });
  };

  const addLigne = () => setForm(f => ({ ...f, lignes: [...f.lignes, emptyLigne()] }));
  const removeLigne = (i) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, idx) => idx !== i) }));

  const totaux = calcTotaux(form.lignes, form.tauxTVA);

  const save = async () => {
    if (!form.client_id || !form.titre) { setErr('Client et titre requis'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form, ...totaux };
      if (modal === 'create') await api.post('/devis', payload);
      else await api.put(`/devis/${modal.id}`, { statut: modal.statut, ...payload });
      await reload();
      setModal(null);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur');
    } finally { setSaving(false); }
  };

  const changeStatut = async (d, statut) => {
    try { await api.put(`/devis/${d.id}`, { statut }); await reload(); }
    catch { alert('Erreur'); }
  };

  const del = async (d) => {
    if (!confirm(`Supprimer le devis ${d.numero} ?`)) return;
    try { await api.delete(`/devis/${d.id}`); await reload(); }
    catch { alert('Erreur'); }
  };

  const filtered = devis.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.numero?.toLowerCase().includes(q) || d.titre?.toLowerCase().includes(q) || d.client_nom?.toLowerCase().includes(q);
    const matchStatut = !filterStatut || d.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const totalHT = filtered.reduce((s, d) => s + parseFloat(d.totalHT || 0), 0);
  const totalTTC = filtered.reduce((s, d) => s + parseFloat(d.totalTTC || 0), 0);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Devis</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="text-muted text-sm">{filtered.length} devis · {fmt(totalTTC)} TTC</span>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dimensionnement')} title="Calculer les honoraires et créer un devis depuis le dimensionnement">
              📐 Dimensionner
            </button>
          )}
          {canEdit && <button className="btn btn-primary" onClick={openCreate}>+ Nouveau devis</button>}
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher (n°, titre, client)…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Résumé statuts */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {Object.entries(STATUTS).map(([k, v]) => {
            const count = devis.filter(d => d.statut === k).length;
            return (
              <div key={k} className="kpi-card" style={{ cursor: 'pointer', borderTop: `3px solid ${k === 'accepte' ? '#00897b' : k === 'envoye' ? '#00b4d8' : k === 'refuse' ? '#d63031' : '#6b7c93'}` }}
                onClick={() => setFilterStatut(filterStatut === k ? '' : k)}>
                <div>
                  <div className="kpi-value" style={{ fontSize: 22 }}>{count}</div>
                  <div className="kpi-label">{v}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📄</div>
                <p>Aucun devis{search || filterStatut ? ' pour ces filtres' : ''}</p>
                {canEdit && !search && !filterStatut && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openCreate}>Créer le premier devis</button>}
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Titre</th>
                      <th>Statut</th>
                      <th>Total HT</th>
                      <th>Total TTC</th>
                      <th>Validité</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id}>
                        <td><code style={{ fontSize: 12 }}>{d.numero}</code></td>
                        <td>{d.client_nom || <span className="text-muted">—</span>}</td>
                        <td>{d.titre}</td>
                        <td><StatutBadge s={d.statut} /></td>
                        <td>{fmt(d.totalHT)}</td>
                        <td><strong>{fmt(d.totalTTC)}</strong></td>
                        <td>{d.dateValidite ? new Date(d.dateValidite).toLocaleDateString('fr-FR') : '—'}</td>
                        {canEdit && (
                          <td>
                            <div className="td-actions">
                              <select className="form-control" style={{ width: 120, fontSize: 12, padding: '4px 8px' }}
                                value={d.statut}
                                onChange={e => changeStatut(d, e.target.value)}>
                                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>✏️</button>
                              {user?.role === 'expert' && <button className="btn btn-danger btn-sm" onClick={() => del(d)}>🗑</button>}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg)' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 600 }}>Total filtré</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmt(totalHT)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--primary)' }}>{fmt(totalTTC)}</td>
                      <td colSpan={canEdit ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Nouveau devis' : `Modifier ${modal.numero}`}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 12 }}
                    onClick={() => setShowGrille(v => !v)}
                    title="Calculer honoraires depuis la grille tarifaire"
                  >
                    📊 Grille tarifaire
                  </button>
                  {showGrille && grille.length > 0 && (
                    <div style={{ position: 'absolute', top: 36, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 16, minWidth: 360 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0f1f4b' }}>Calculer honoraires</div>
                      {grille.map(g => (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <div style={{ flex: 1, fontSize: 12 }}>{g.libelle}<br /><span style={{ color: '#6b7c93', fontSize: 11 }}>{parseFloat(g.taux_horaire).toFixed(0)} €/h</span></div>
                          <input type="number" min="0" step="0.5" placeholder="0h" style={{ width: 70, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                            value={grilleHeures[g.id] || ''} onChange={e => setGrilleHeures(h => ({ ...h, [g.id]: e.target.value }))} />
                          <span style={{ fontSize: 11, color: '#6b7c93', width: 70, textAlign: 'right' }}>{fmt(parseFloat(grilleHeures[g.id] || 0) * parseFloat(g.taux_horaire))}</span>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>Total : {fmt(grille.reduce((s, g) => s + parseFloat(grilleHeures[g.id] || 0) * parseFloat(g.taux_horaire), 0))}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowGrille(false)}>Annuler</button>
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={applyGrille}>Ajouter au devis</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12 }}
                  onClick={() => navigate(`/dimensionnement?returnTo=devis${form.client_id ? `&clientId=${form.client_id}` : ''}`)}
                  title="Calculer les honoraires depuis le dimensionnement"
                >
                  📐 Dimensionner
                </button>
                <button className="modal-close" onClick={() => setModal(null)}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-error">{err}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Client *</label>
                  <select className="form-control" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date de validité</label>
                  <input type="date" className="form-control" value={form.dateValidite} onChange={e => setForm(f => ({ ...f, dateValidite: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Titre *</label>
                <input className="form-control" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Objet du devis" />
              </div>

              {/* Lignes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>Lignes de devis</label>
                  <button className="btn btn-ghost btn-sm" onClick={addLigne}>+ Ligne</button>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>Description</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 70 }}>Qté</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 100 }}>PU HT (€)</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 70 }}>Rem %</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', width: 100 }}>Total HT</th>
                        <th style={{ width: 32 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {form.lignes.map((l, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <input className="form-control" style={{ padding: '4px 8px' }} value={l.description} onChange={e => setLigne(i, 'description', e.target.value)} placeholder="Prestation…" />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input type="number" className="form-control" style={{ padding: '4px 6px' }} value={l.quantite} onChange={e => setLigne(i, 'quantite', e.target.value)} min="0" step="0.5" />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input type="number" className="form-control" style={{ padding: '4px 6px' }} value={l.prixUnitaireHT} onChange={e => setLigne(i, 'prixUnitaireHT', e.target.value)} min="0" step="0.01" />
                          </td>
                          <td style={{ padding: '6px 6px' }}>
                            <input type="number" className="form-control" style={{ padding: '4px 6px' }} value={l.remisePct} onChange={e => setLigne(i, 'remisePct', e.target.value)} min="0" max="100" />
                          </td>
                          <td style={{ padding: '6px 6px', fontWeight: 600, color: 'var(--primary)', fontSize: 13 }}>{fmt(l.totalHT)}</td>
                          <td style={{ padding: '6px 6px' }}>
                            {form.lignes.length > 1 && <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }} onClick={() => removeLigne(i)}>×</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totaux */}
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">Taux TVA (%)</label>
                  <input type="number" className="form-control" style={{ maxWidth: 120 }} value={form.tauxTVA} onChange={e => setForm(f => ({ ...f, tauxTVA: e.target.value }))} min="0" max="100" step="0.1" />
                </div>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', fontSize: 13 }}>
                  <div>Total HT : <strong>{fmt(totaux.totalHT)}</strong></div>
                  <div>TVA ({form.tauxTVA}%) : <strong>{fmt(totaux.totalTVA)}</strong></div>
                  <div style={{ fontSize: 15 }}>Total TTC : <strong style={{ color: 'var(--primary)' }}>{fmt(totaux.totalTTC)}</strong></div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Notes client</label>
                  <textarea className="form-control" rows={3} value={form.notesClient} onChange={e => setForm(f => ({ ...f, notesClient: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes internes</label>
                  <textarea className="form-control" rows={3} value={form.notesInternes} onChange={e => setForm(f => ({ ...f, notesInternes: e.target.value }))} />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
