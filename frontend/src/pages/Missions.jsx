import { useState, useEffect } from 'react';
import api from '../services/api';

const STATUTS = {
  en_cours:  { label: 'En cours',   color: '#00b4d8' },
  suspendue: { label: 'Suspendue',  color: '#e67e22' },
  terminee:  { label: 'Terminée',   color: '#00897b' },
  annulee:   { label: 'Annulée',    color: '#d63031' },
};
const CATEGORIES = ['tenue_comptable','revision','etablissement_comptes','fiscal','social','paie','juridique','conseil','autre'];
const CAT_LABELS = { tenue_comptable:'Tenue comptable', revision:'Révision', etablissement_comptes:'Comptes annuels', fiscal:'Fiscal', social:'Social', paie:'Paie', juridique:'Juridique', conseil:'Conseil', autre:'Autre' };
const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

function MissionModal({ mission, contacts, intervenants, onSave, onClose }) {
  const blank = { contactId: '', nom: '', categorie: 'tenue_comptable', statut: 'en_cours', honorairesBudgetes: '', tempsBudgeteH: '', intervenantId: '', dateDebut: '', dateFin: '', notes: '' };
  const [form, setForm] = useState(mission ? {
    ...mission,
    dateDebut: mission.dateDebut ? mission.dateDebut.slice(0,10) : '',
    dateFin: mission.dateFin ? mission.dateFin.slice(0,10) : '',
  } : blank);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, honorairesBudgetes: Number(form.honorairesBudgetes || 0), tempsBudgeteH: Number(form.tempsBudgeteH || 0) };
    if (mission) await api.put(`/missions/${mission.id}`, payload);
    else await api.post('/missions', payload);
    onSave();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mission ? 'Modifier la mission' : 'Nouvelle mission'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Client *</label>
            <select className="form-control" value={form.contactId} onChange={e => set('contactId', e.target.value)} required>
              <option value="">Sélectionner…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.raisonSociale}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Nom de la mission *</label>
            <input className="form-control" value={form.nom} onChange={e => set('nom', e.target.value)} required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Catégorie *</label>
              <select className="form-control" value={form.categorie} onChange={e => set('categorie', e.target.value)} required>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Statut</label>
              <select className="form-control" value={form.statut} onChange={e => set('statut', e.target.value)}>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Honoraires budgétés (€ HT)</label>
              <input className="form-control" type="number" value={form.honorairesBudgetes} onChange={e => set('honorairesBudgetes', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Temps budgété (h)</label>
              <input className="form-control" type="number" step="0.5" value={form.tempsBudgeteH} onChange={e => set('tempsBudgeteH', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Intervenant responsable</label>
            <select className="form-control" value={form.intervenantId} onChange={e => set('intervenantId', e.target.value)}>
              <option value="">Aucun</option>
              {intervenants.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date de début</label>
              <input className="form-control" type="date" value={form.dateDebut} onChange={e => set('dateDebut', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Date de fin prévue</label>
              <input className="form-control" type="date" value={form.dateFin} onChange={e => set('dateFin', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea className="form-control" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SaisieModal({ missionId, onSave, onClose }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), dureeH: '', description: '', facturable: true });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post(`/missions/${missionId}/saisies`, { ...form, dureeH: Number(form.dureeH) });
    onSave();
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Saisir du temps</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label>Date *</label>
              <input className="form-control" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Durée (h) *</label>
              <input className="form-control" type="number" step="0.25" min="0.25" value={form.dureeH} onChange={e => set('dureeH', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label>Description de l'activité</label>
            <input className="form-control" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.facturable} onChange={e => set('facturable', e.target.checked)} />
              Facturable
            </label>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MissionDetail({ id, onClose }) {
  const [mission, setMission] = useState(null);
  const [saisieOpen, setSaisieOpen] = useState(false);

  const load = async () => {
    const res = await api.get(`/missions/${id}`);
    setMission(res.data);
  };
  useEffect(() => { load(); }, [id]);

  if (!mission) return <div className="modal-backdrop" onClick={onClose}><div className="modal" style={{ maxWidth: 700, padding: 32 }}>Chargement…</div></div>;

  const pctTemps = mission.tempsBudgeteH > 0 ? Math.min(100, Math.round((mission.tempsPasseH / mission.tempsBudgeteH) * 100)) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mission.nom}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <div className="kpi-card" style={{ borderLeft: '3px solid #00b4d8', padding: '12px 16px' }}>
              <div className="kpi-value" style={{ fontSize: 18 }}>{mission.tempsBudgeteH}h</div>
              <div className="kpi-label">Budgété</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: `3px solid ${pctTemps > 100 ? '#d63031' : '#00897b'}`, padding: '12px 16px' }}>
              <div className="kpi-value" style={{ fontSize: 18 }}>{mission.totalSaisiH?.toFixed(1) || 0}h</div>
              <div className="kpi-label">Saisi ({pctTemps}%)</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '3px solid #5bb8e8', padding: '12px 16px' }}>
              <div className="kpi-value" style={{ fontSize: 18 }}>{new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(mission.honorairesBudgetes||0)}</div>
              <div className="kpi-label">Honoraires</div>
            </div>
            <div className="kpi-card" style={{ borderLeft: '3px solid #e67e22', padding: '12px 16px' }}>
              <div className="kpi-value" style={{ fontSize: 18 }}>{mission.taches?.length || 0}</div>
              <div className="kpi-label">Tâches</div>
            </div>
          </div>

          {/* Barre de progression temps */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Avancement temps</span><span>{pctTemps}%</span>
            </div>
            <div style={{ height: 6, background: '#eee', borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${pctTemps}%`, background: pctTemps > 100 ? '#d63031' : '#00b4d8', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Tâches */}
          <h4 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Tâches de la mission ({mission.taches?.length || 0})</h4>
          {mission.taches?.length ? (
            <div style={{ marginBottom: 20 }}>
              {mission.taches.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{t.nom}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t.tempsBudgeteH}h budgété — {t.tempsPasseH}h passé</span>
                </div>
              ))}
            </div>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Aucune tâche</p>}

          {/* Saisies de temps */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Saisies de temps</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => setSaisieOpen(true)}>+ Saisir</button>
          </div>
          {mission.saisies?.length ? (
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Date</th><th>Durée</th><th>Description</th><th>Collaborateur</th></tr></thead>
              <tbody>
                {mission.saisies.map(s => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.date)}</td>
                    <td>{s.dureeH}h</td>
                    <td>{s.description || '—'}</td>
                    <td>{s.utilisateurNom}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune saisie</p>}
        </div>

        {saisieOpen && <SaisieModal missionId={id} onSave={() => { setSaisieOpen(false); load(); }} onClose={() => setSaisieOpen(false)} />}
      </div>
    </div>
  );
}

export default function Missions() {
  const [missions, setMissions] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filterStatut, setFilterStatut] = useState('en_cours');

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, cRes, iRes] = await Promise.all([
        api.get(`/missions?statut=${filterStatut || ''}`),
        api.get('/contacts?type=client'),
        api.get('/intervenants?actif=true'),
      ]);
      setMissions(mRes.data);
      setContacts(cRes.data);
      setIntervenants(iRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterStatut]);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette mission ?')) return;
    await api.delete(`/missions/${id}`);
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Missions</h1>
          <p className="page-subtitle">{missions.length} mission{missions.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Nouvelle mission</button>
      </div>

      {/* Filtres statut */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[{k:'', l:'Toutes'}, ...Object.entries(STATUTS).map(([k,v]) => ({k, l:v.label}))].map(({k, l}) => (
          <button key={k} className={`btn btn-sm ${filterStatut === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterStatut(k)}>{l}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Mission</th>
                <th>Client</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>Intervenant</th>
                <th>Honoraires</th>
                <th>Temps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
              ) : missions.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune mission</td></tr>
              ) : missions.map(m => {
                const pct = m.tempsBudgeteH > 0 ? Math.round((m.tempsPasseH / m.tempsBudgeteH) * 100) : 0;
                return (
                  <tr key={m.id}>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ fontWeight: 600, padding: 0, textDecoration: 'underline', color: 'var(--primary)' }} onClick={() => setDetail(m.id)}>
                        {m.nom}
                      </button>
                    </td>
                    <td>{m.contactNom || '—'}</td>
                    <td><span style={{ fontSize: 12, background: '#eee', padding: '2px 8px', borderRadius: 12 }}>{CAT_LABELS[m.categorie] || m.categorie}</span></td>
                    <td>
                      <span className="badge" style={{ background: STATUTS[m.statut]?.color + '20', color: STATUTS[m.statut]?.color, border: `1px solid ${STATUTS[m.statut]?.color}40` }}>
                        {STATUTS[m.statut]?.label}
                      </span>
                    </td>
                    <td>{m.intervenantNom || '—'}</td>
                    <td>{fmt(m.honorairesBudgetes)}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: pct > 100 ? '#d63031' : 'inherit' }}>{m.tempsPasseH || 0}h</span>
                        <span style={{ color: 'var(--text-muted)' }}> / {m.tempsBudgeteH}h ({pct}%)</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModal(m)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: '#d63031' }} onClick={() => handleDelete(m.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <MissionModal
          mission={modal === 'create' ? null : modal}
          contacts={contacts}
          intervenants={intervenants}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}

      {detail && <MissionDetail id={detail} onClose={() => { setDetail(null); load(); }} />}
    </div>
  );
}
