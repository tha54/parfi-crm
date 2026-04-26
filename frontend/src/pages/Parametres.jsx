import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const CAT_LABELS = { expert: 'Expert-Comptable', chef_mission: 'Chef de Mission', collaborateur: 'Collaborateur', stagiaire: 'Stagiaire', secretaire: 'Secrétaire' };

export default function Parametres() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    nom: '', adresse: '', ville: '', codePostal: '', pays: 'France',
    telephone: '', email: '', siteWeb: '', siret: '',
    numeroOrdre: '', assuranceRCP: '',
    tvaTaux: '20', mentionsLegales: '', iban: '', bic: '',
    logoUrl: '',
    couleurPrimaire: '#0f1f4b', couleurSecondaire: '#00b4d8',
    emailSignature: '', relanceAutomatique: false, delaiRelance1: 15, delaiRelance2: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grille, setGrille] = useState([]);
  const [grilleEdit, setGrilleEdit] = useState({});
  const [newTarif, setNewTarif] = useState({ categorie: 'collaborateur', libelle: '', taux_horaire: '' });

  useEffect(() => {
    Promise.all([
      api.get('/parametres').then(r => { if (r.data) setForm(f => ({ ...f, ...r.data })); }),
      api.get('/parametres/grille-tarifaire').then(r => setGrille(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const saveGrilleRow = async (id) => {
    await api.put(`/parametres/grille-tarifaire/${id}`, grilleEdit[id]);
    setGrilleEdit(e => { const n = { ...e }; delete n[id]; return n; });
    api.get('/parametres/grille-tarifaire').then(r => setGrille(r.data));
  };

  const addGrilleRow = async () => {
    if (!newTarif.libelle || !newTarif.taux_horaire) return;
    await api.post('/parametres/grille-tarifaire', newTarif);
    setNewTarif({ categorie: 'collaborateur', libelle: '', taux_horaire: '' });
    api.get('/parametres/grille-tarifaire').then(r => setGrille(r.data));
  };

  const deleteGrilleRow = async (id) => {
    await api.delete(`/parametres/grille-tarifaire/${id}`);
    setGrille(g => g.filter(r => r.id !== id));
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/parametres', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { alert('Erreur lors de la sauvegarde'); }
    finally { setSaving(false); }
  };

  if (user?.role !== 'expert') {
    return (
      <div className="page-body">
        <div className="empty-state"><div className="empty-state-icon">🔒</div><p>Accès réservé à l'expert-comptable</p></div>
      </div>
    );
  }

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const F = ({ label, name, type = 'text', placeholder, rows }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {rows ? (
        <textarea className="form-control" rows={rows} placeholder={placeholder}
          value={form[name] || ''} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      ) : (
        <input type={type} className="form-control" placeholder={placeholder}
          value={form[name] || ''} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      )}
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1>Paramètres du cabinet</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : saved ? '✅ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      <div className="page-body">
        {saved && <div className="alert alert-success" style={{ marginBottom: 16 }}>Paramètres sauvegardés avec succès.</div>}

        {/* Identité cabinet */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Identité du cabinet</h3></div>
          <div className="card-body">
            <F label="Nom du cabinet *" name="nom" placeholder="ParFi France" />
            <div className="form-row">
              <F label="SIRET" name="siret" placeholder="00000000000000" />
              <F label="N° d'ordre" name="numeroOrdre" placeholder="REG-XXXX" />
            </div>
            <F label="Adresse" name="adresse" placeholder="12 rue de la Paix" />
            <div className="form-row">
              <F label="Code postal" name="codePostal" placeholder="75000" />
              <F label="Ville" name="ville" placeholder="Paris" />
            </div>
            <div className="form-row">
              <F label="Téléphone" name="telephone" placeholder="+33 1 23 45 67 89" />
              <F label="Email" name="email" type="email" placeholder="contact@parfi-france.fr" />
            </div>
            <F label="Site web" name="siteWeb" placeholder="https://www.parfi-france.fr" />
            <F label="Assurance RCP" name="assuranceRCP" placeholder="Compagnie / N° de police" />
          </div>
        </div>

        {/* Facturation */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Facturation & relances</h3></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Taux TVA par défaut (%)</label>
                <select className="form-control" value={form.tvaTaux} onChange={e => setForm(f => ({ ...f, tvaTaux: e.target.value }))}>
                  <option value="0">0%</option>
                  <option value="5.5">5.5%</option>
                  <option value="10">10%</option>
                  <option value="20">20%</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Relances automatiques</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.relanceAutomatique} onChange={e => setForm(f => ({ ...f, relanceAutomatique: e.target.checked }))} />
                  Activer les relances automatiques
                </label>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Délai relance 1 (jours)</label>
                <input type="number" className="form-control" value={form.delaiRelance1} onChange={e => setForm(f => ({ ...f, delaiRelance1: e.target.value }))} min="1" />
              </div>
              <div className="form-group">
                <label className="form-label">Délai relance 2 (jours)</label>
                <input type="number" className="form-control" value={form.delaiRelance2} onChange={e => setForm(f => ({ ...f, delaiRelance2: e.target.value }))} min="1" />
              </div>
            </div>
            <div className="form-row">
              <F label="IBAN" name="iban" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              <F label="BIC" name="bic" placeholder="BNPAFRPPXXX" />
            </div>
            <F label="Mentions légales" name="mentionsLegales" rows={3} placeholder="Mentions légales figurant sur les factures et devis…" />
            <F label="Signature email" name="emailSignature" rows={3} placeholder="Cordialement,\nParFi France…" />
          </div>
        </div>

        {/* Grille tarifaire */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Grille tarifaire (€/heure)</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Catégorie</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Libellé</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 110 }}>Taux (€/h)</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {grille.map(g => (
                  <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12 }}><span className="badge badge-autre">{CAT_LABELS[g.categorie] || g.categorie}</span></td>
                    <td style={{ padding: '10px 14px' }}>
                      {grilleEdit[g.id] ? (
                        <input className="form-control" style={{ padding: '4px 8px', fontSize: 12 }} value={grilleEdit[g.id].libelle}
                          onChange={e => setGrilleEdit(ed => ({ ...ed, [g.id]: { ...ed[g.id], libelle: e.target.value } }))} />
                      ) : <span style={{ fontSize: 13 }}>{g.libelle}</span>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {grilleEdit[g.id] ? (
                        <input type="number" className="form-control" style={{ padding: '4px 8px', fontSize: 12, textAlign: 'right', width: 90 }} value={grilleEdit[g.id].taux_horaire}
                          onChange={e => setGrilleEdit(ed => ({ ...ed, [g.id]: { ...ed[g.id], taux_horaire: e.target.value } }))} />
                      ) : <strong style={{ fontSize: 14 }}>{parseFloat(g.taux_horaire).toFixed(0)} €</strong>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {grilleEdit[g.id] ? (
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => saveGrilleRow(g.id)}>✓</button>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setGrilleEdit(ed => ({ ...ed, [g.id]: { libelle: g.libelle, taux_horaire: g.taux_horaire } }))}>✏️</button>
                        )}
                        <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} onClick={() => deleteGrilleRow(g.id)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <select className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} value={newTarif.categorie} onChange={e => setNewTarif(n => ({ ...n, categorie: e.target.value }))}>
                      {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Libellé…" value={newTarif.libelle} onChange={e => setNewTarif(n => ({ ...n, libelle: e.target.value }))} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <input type="number" className="form-control" style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right', width: 90 }} placeholder="€/h" value={newTarif.taux_horaire} onChange={e => setNewTarif(n => ({ ...n, taux_horaire: e.target.value }))} />
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={addGrilleRow}>+ Ajouter</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Apparence */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Apparence</h3></div>
          <div className="card-body">
            <F label="URL du logo" name="logoUrl" placeholder="https://..." />
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Couleur principale</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.couleurPrimaire || '#0f1f4b'} onChange={e => setForm(f => ({ ...f, couleurPrimaire: e.target.value }))} style={{ width: 48, height: 38, padding: 2, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  <input className="form-control" value={form.couleurPrimaire || ''} onChange={e => setForm(f => ({ ...f, couleurPrimaire: e.target.value }))} placeholder="#0f1f4b" style={{ width: 120 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Couleur secondaire</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.couleurSecondaire || '#00b4d8'} onChange={e => setForm(f => ({ ...f, couleurSecondaire: e.target.value }))} style={{ width: 48, height: 38, padding: 2, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  <input className="form-control" value={form.couleurSecondaire || ''} onChange={e => setForm(f => ({ ...f, couleurSecondaire: e.target.value }))} placeholder="#00b4d8" style={{ width: 120 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
