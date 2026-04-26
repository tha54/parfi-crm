import { useState, useEffect } from 'react';
import api from '../services/api';

const STATUTS = {
  prospect:      { label: 'Prospect',      color: '#6b7c93' },
  qualification: { label: 'Qualification', color: '#5bb8e8' },
  proposition:   { label: 'Proposition',   color: '#00b4d8' },
  negociation:   { label: 'Négociation',   color: '#e67e22' },
  gagne:         { label: 'Gagné',         color: '#00897b' },
  perdu:         { label: 'Perdu',         color: '#d63031' },
};

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

function OppModal({ opp, contacts, intervenants, onSave, onClose }) {
  const blank = { contactId: '', titre: '', description: '', statut: 'prospect', montantEstime: '', probabilite: 0, dateEcheance: '', intervenantId: '', raisonPerte: '' };
  const [form, setForm] = useState(opp ? { ...opp, contactId: opp.contactId || '', montantEstime: opp.montantEstime || '', dateEcheance: opp.dateEcheance ? opp.dateEcheance.slice(0,10) : '' } : blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, montantEstime: form.montantEstime ? Number(form.montantEstime) : null, probabilite: Number(form.probabilite) };
    if (opp) await api.put(`/opportunites/${opp.id}`, payload);
    else await api.post('/opportunites', payload);
    onSave();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{opp ? 'Modifier l\'opportunité' : 'Nouvelle opportunité'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Contact *</label>
            <select className="form-control" value={form.contactId} onChange={e => set('contactId', e.target.value)} required>
              <option value="">Sélectionner…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.raisonSociale}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Titre *</label>
            <input className="form-control" value={form.titre} onChange={e => set('titre', e.target.value)} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Statut</label>
              <select className="form-control" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Montant estimé (€)</label>
              <input className="form-control" type="number" value={form.montantEstime} onChange={e => set('montantEstime', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Probabilité (%)</label>
              <input className="form-control" type="number" min="0" max="100" value={form.probabilite} onChange={e => set('probabilite', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Échéance prévue</label>
              <input className="form-control" type="date" value={form.dateEcheance} onChange={e => set('dateEcheance', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Intervenant</label>
            <select className="form-control" value={form.intervenantId} onChange={e => set('intervenantId', e.target.value)}>
              <option value="">Aucun</option>
              {intervenants.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea className="form-control" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
          </div>
          {form.statut === 'perdu' && (
            <div className="form-group">
              <label>Raison de perte</label>
              <textarea className="form-control" rows={2} value={form.raisonPerte || ''} onChange={e => set('raisonPerte', e.target.value)} />
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [data, setData] = useState({ opportunites: [], stats: {}, totalPipeline: 0, tauxConversion: 0 });
  const [contacts, setContacts] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | opp object

  const load = async () => {
    setLoading(true);
    try {
      const [oRes, cRes, iRes] = await Promise.all([
        api.get('/opportunites' + (filterStatut ? `?statut=${filterStatut}` : '')),
        api.get('/contacts?type=prospect'),
        api.get('/intervenants?actif=true'),
      ]);
      setData(oRes.data);
      setContacts(cRes.data);
      setIntervenants(iRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterStatut]);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette opportunité ?')) return;
    await api.delete(`/opportunites/${id}`);
    load();
  };

  const { opportunites = [], stats = {}, totalPipeline = 0, tauxConversion = 0 } = data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pipeline commercial</h1>
          <p className="page-subtitle">Suivi des opportunités de {contacts.length + opportunites.length} contacts</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Nouvelle opportunité</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 24 }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00b4d8' }}>
          <div className="kpi-value">{fmt(totalPipeline)}</div>
          <div className="kpi-label">Pipeline total</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #00897b' }}>
          <div className="kpi-value">{tauxConversion}%</div>
          <div className="kpi-label">Taux de conversion</div>
        </div>
        {Object.entries(STATUTS).map(([k, v]) => (
          <div key={k} className="kpi-card" style={{ borderLeft: `4px solid ${v.color}`, cursor: 'pointer', opacity: filterStatut && filterStatut !== k ? 0.5 : 1 }}
            onClick={() => setFilterStatut(filterStatut === k ? '' : k)}>
            <div className="kpi-value">{stats[k]?.nb || 0}</div>
            <div className="kpi-label">{v.label}</div>
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{opportunites.length} opportunité{opportunites.length !== 1 ? 's' : ''}</span>
          {filterStatut && <button className="btn btn-ghost btn-sm" onClick={() => setFilterStatut('')}>✕ {STATUTS[filterStatut]?.label}</button>}
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Contact</th>
                <th>Statut</th>
                <th>Montant</th>
                <th>Prob.</th>
                <th>Échéance</th>
                <th>Intervenant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
              ) : opportunites.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune opportunité</td></tr>
              ) : opportunites.map(opp => (
                <tr key={opp.id}>
                  <td style={{ fontWeight: 500 }}>{opp.titre}</td>
                  <td>{opp.contactNom || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: STATUTS[opp.statut]?.color + '20', color: STATUTS[opp.statut]?.color, border: `1px solid ${STATUTS[opp.statut]?.color}40` }}>
                      {STATUTS[opp.statut]?.label || opp.statut}
                    </span>
                  </td>
                  <td>{opp.montantEstime ? fmt(opp.montantEstime) : '—'}</td>
                  <td>{opp.probabilite}%</td>
                  <td>{fmtDate(opp.dateEcheance)}</td>
                  <td>{opp.intervenantNom || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setModal(opp)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: '#d63031' }} onClick={() => handleDelete(opp.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <OppModal
          opp={modal === 'create' ? null : modal}
          contacts={contacts}
          intervenants={intervenants}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
