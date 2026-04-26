import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUTS = { brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée', partielle: 'Partielle', retard: 'En retard', annulee: 'Annulée' };
const STATUT_COLORS = { brouillon: 'autre', envoyee: 'en_cours', payee: 'termine', partielle: 'responsable', retard: 'reporte', annulee: 'inactif' };

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

export default function Factures() {
  const { user } = useAuth();
  const [factures, setFactures] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ client_id: '', type: 'facture', dateEcheance: '', tauxTVA: '20', notesInternes: '', lignes: [emptyLigne()] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  useEffect(() => {
    Promise.all([
      api.get('/factures').then(r => setFactures(r.data)),
      api.get('/clients').then(r => setClients(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const reload = () => api.get('/factures').then(r => setFactures(r.data));

  const openCreate = () => {
    const today = new Date();
    const echeance = new Date(today); echeance.setDate(today.getDate() + 30);
    setForm({ client_id: '', type: 'facture', dateEcheance: echeance.toISOString().substring(0, 10), tauxTVA: '20', notesInternes: '', lignes: [emptyLigne()] });
    setErr(''); setModal('create');
  };

  const openEdit = (f) => {
    setForm({ client_id: f.client_id || '', type: f.type || 'facture', dateEcheance: f.dateEcheance ? f.dateEcheance.substring(0, 10) : '', tauxTVA: String(f.tauxTVA || 20), notesInternes: f.notesInternes || '', lignes: [emptyLigne()] });
    setErr(''); setModal(f);
  };

  const setLigne = (i, field, val) => {
    setForm(f => ({ ...f, lignes: f.lignes.map((l, idx) => idx === i ? calcLigne({ ...l, [field]: val }) : l) }));
  };

  const addLigne = () => setForm(f => ({ ...f, lignes: [...f.lignes, emptyLigne()] }));
  const removeLigne = (i) => setForm(f => ({ ...f, lignes: f.lignes.filter((_, idx) => idx !== i) }));

  const totaux = calcTotaux(form.lignes, form.tauxTVA);

  const save = async () => {
    if (!form.client_id) { setErr('Client requis'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form, ...totaux };
      if (modal === 'create') await api.post('/factures', payload);
      else await api.put(`/factures/${modal.id}`, payload);
      await reload(); setModal(null);
    } catch (e) { setErr(e.response?.data?.message || 'Erreur'); }
    finally { setSaving(false); }
  };

  const marquerPayee = async (f) => {
    try {
      await api.put(`/factures/${f.id}`, { statut: 'payee', datePaiement: new Date().toISOString().substring(0, 10), montantPaye: f.totalTTC });
      await reload();
    } catch { alert('Erreur'); }
  };

  const changeStatut = async (f, statut) => {
    try { await api.put(`/factures/${f.id}`, { statut }); await reload(); }
    catch { alert('Erreur'); }
  };

  const del = async (f) => {
    if (!confirm(`Supprimer la facture ${f.numero} ?`)) return;
    try { await api.delete(`/factures/${f.id}`); await reload(); }
    catch { alert('Erreur'); }
  };

  const filtered = factures.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q || f.numero?.toLowerCase().includes(q) || f.client_nom?.toLowerCase().includes(q);
    const matchStatut = !filterStatut || f.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const caEncaisse = factures.filter(f => f.statut === 'payee').reduce((s, f) => s + parseFloat(f.totalTTC || 0), 0);
  const caEnAttente = factures.filter(f => ['envoyee', 'partielle'].includes(f.statut)).reduce((s, f) => s + parseFloat(f.totalTTC || 0), 0);
  const caRetard = factures.filter(f => f.statut === 'retard').reduce((s, f) => s + parseFloat(f.totalTTC || 0), 0);

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Factures</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && <button className="btn btn-primary" onClick={openCreate}>+ Nouvelle facture</button>}
        </div>
      </div>

      <div className="page-body">
        {/* KPI résumé */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          <div className="kpi-card" style={{ borderTop: '3px solid #00897b' }}>
            <span className="kpi-icon">💚</span>
            <div><div className="kpi-value" style={{ color: '#00897b' }}>{fmt(caEncaisse)}</div><div className="kpi-label">CA encaissé</div></div>
          </div>
          <div className="kpi-card" style={{ borderTop: '3px solid #00b4d8' }}>
            <span className="kpi-icon">⏳</span>
            <div><div className="kpi-value" style={{ color: '#00b4d8' }}>{fmt(caEnAttente)}</div><div className="kpi-label">En attente</div></div>
          </div>
          {caRetard > 0 && (
            <div className="kpi-card" style={{ borderTop: '3px solid #d63031' }}>
              <span className="kpi-icon">⚠️</span>
              <div><div className="kpi-value" style={{ color: '#d63031' }}>{fmt(caRetard)}</div><div className="kpi-label">En retard</div></div>
            </div>
          )}
          <div className="kpi-card" style={{ borderTop: '3px solid var(--primary)' }}>
            <span className="kpi-icon">📊</span>
            <div><div className="kpi-value">{factures.length}</div><div className="kpi-label">Factures total</div></div>
          </div>
        </div>

        {/* Filtres */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ paddingTop: 14, paddingBottom: 14 }}>
            <div className="filters-bar">
              <input className="form-control search-input" placeholder="Rechercher (n°, client)…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-control" style={{ width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                <option value="">Tous les statuts</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <p>Aucune facture{search || filterStatut ? ' pour ces filtres' : ''}</p>
                {canEdit && !search && !filterStatut && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openCreate}>Créer la première facture</button>}
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Client</th>
                      <th>Type</th>
                      <th>Statut</th>
                      <th>Total HT</th>
                      <th>Total TTC</th>
                      <th>Échéance</th>
                      {canEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(f => {
                      const enRetard = f.statut === 'retard' || (f.statut === 'envoyee' && f.dateEcheance && new Date(f.dateEcheance) < new Date());
                      return (
                        <tr key={f.id} style={enRetard ? { background: '#fff5f5' } : {}}>
                          <td><code style={{ fontSize: 12 }}>{f.numero}</code></td>
                          <td>{f.client_nom || <span className="text-muted">—</span>}</td>
                          <td><span className="badge badge-assistant" style={{ textTransform: 'capitalize' }}>{f.type}</span></td>
                          <td><StatutBadge s={f.statut} /></td>
                          <td>{fmt(f.totalHT)}</td>
                          <td><strong style={{ color: enRetard ? 'var(--danger)' : 'inherit' }}>{fmt(f.totalTTC)}</strong></td>
                          <td>
                            <span style={{ color: enRetard ? 'var(--danger)' : 'inherit', fontWeight: enRetard ? 600 : 400 }}>
                              {f.dateEcheance ? new Date(f.dateEcheance).toLocaleDateString('fr-FR') : '—'}
                            </span>
                          </td>
                          {canEdit && (
                            <td>
                              <div className="td-actions">
                                {f.statut !== 'payee' && f.statut !== 'annulee' && (
                                  <button className="btn btn-ghost btn-sm" style={{ color: '#00897b', borderColor: '#00897b' }} onClick={() => marquerPayee(f)}>✓ Payée</button>
                                )}
                                <select className="form-control" style={{ width: 120, fontSize: 12, padding: '4px 8px' }}
                                  value={f.statut} onChange={e => changeStatut(f, e.target.value)}>
                                  {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                                  <button className="btn btn-ghost btn-sm" title="Télécharger PDF Factur-X"
                                  onClick={() => window.open(`/api/factures/${f.id}/pdf`, '_blank')}>📄 PDF</button>
                                <button className="btn btn-ghost btn-sm" title="Télécharger XML Factur-X"
                                  onClick={() => window.open(`/api/factures/${f.id}/facturx-xml`, '_blank')}>🔖 XML</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(f)}>✏️</button>
                                {user?.role === 'expert' && <button className="btn btn-danger btn-sm" onClick={() => del(f)}>🗑</button>}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
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
              <span className="modal-title">{modal === 'create' ? 'Nouvelle facture' : `Modifier ${modal.numero}`}</span>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
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
                  <label className="form-label">Type</label>
                  <select className="form-control" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="facture">Facture</option>
                    <option value="acompte">Acompte</option>
                    <option value="solde">Solde</option>
                    <option value="avoir">Avoir</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date d'échéance</label>
                <input type="date" className="form-control" value={form.dateEcheance} onChange={e => setForm(f => ({ ...f, dateEcheance: e.target.value }))} />
              </div>

              {/* Lignes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>Lignes de facturation</label>
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

              <div className="form-group">
                <label className="form-label">Notes internes</label>
                <textarea className="form-control" rows={3} value={form.notesInternes} onChange={e => setForm(f => ({ ...f, notesInternes: e.target.value }))} />
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
