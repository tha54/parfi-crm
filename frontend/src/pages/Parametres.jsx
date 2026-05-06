import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const CAT_LABELS = { expert: 'Expert-Comptable', chef_mission: 'Chef de Mission', collaborateur: 'Collaborateur', stagiaire: 'Stagiaire', secretaire: 'Secrétaire' };

const ROLE_METIER_LABELS = {
  expert_comptable:     'Expert-comptable',
  chef_de_groupe:       'Chef de groupe',
  chef_de_mission:      'Chef de mission',
  collaborateur_senior: 'Collab. comptable senior',
  collaborateur_medior: 'Collab. comptable médior',
  collaborateur_junior: 'Collab. comptable junior',
  collaborateur_social: 'Collaborateur social et paie',
  juriste:              'Juriste',
};

const ROLE_SYSTEM_LABELS = {
  expert:        'Expert-comptable (accès complet)',
  chef_mission:  'Chef de mission (accès étendu)',
  collaborateur: 'Collaborateur (accès standard)',
};

function F({ label, name, type = 'text', placeholder, rows, form, setForm }) {
  return (
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
}

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
    brevoApiKey: '', emailExpediteur: '', nomExpediteur: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingBrevo, setSavingBrevo] = useState(false);
  const [savedBrevo, setSavedBrevo] = useState(false);
  const [clients, setClients] = useState([]);
  const [portalForm, setPortalForm] = useState({ client_id: '', email: '', password: '' });
  const [portalMsg, setPortalMsg] = useState(null);
  const [portalSaving, setPortalSaving] = useState(false);
  const [clauses, setClauses] = useState([]);
  const [clauseEdit, setClauseEdit] = useState(null);
  const [newClause, setNewClause] = useState({ titre: '', categorie: 'tronc_commun', contenu: '' });
  const [modeles, setModeles] = useState([]);
  const [modeleEdit, setModeleEdit] = useState(null);
  const [newModele, setNewModele] = useState({ nom: '', categorie: 'tenue_comptable', description: '' });
  const [tachesDim, setTachesDim] = useState([]);
  const [tachesDimEdit, setTachesDimEdit] = useState({});
  // Rôles métier
  const [rolesMetier, setRolesMetier] = useState([]);
  const [rolesTauxEdit, setRolesTauxEdit] = useState({});
  const [rolesSaving, setRolesSaving] = useState({});
  // Équipe
  const [equipe, setEquipe] = useState([]);
  const [equipeEdit, setEquipeEdit] = useState({});
  const [equipeSaving, setEquipeSaving] = useState({});
  const [equipeMsg, setEquipeMsg] = useState(null);

  const loadEquipe = () => api.get('/utilisateurs').then(r => setEquipe(r.data || [])).catch(() => {});
  const loadRoles = () => api.get('/parametres/roles-metier').then(r => setRolesMetier(r.data || [])).catch(() => {});

  useEffect(() => {
    Promise.all([
      api.get('/parametres').then(r => { if (r.data) setForm(f => ({ ...f, ...r.data })); }),

      api.get('/clients').then(r => setClients(r.data || [])).catch(() => {}),
      api.get('/parametres/clauses').then(r => setClauses(r.data || [])).catch(() => {}),
      api.get('/parametres/modeles-missions').then(r => setModeles(r.data || [])).catch(() => {}),
      api.get('/parametres/taches-dim').then(r => setTachesDim(r.data || [])).catch(() => {}),
      loadRoles(),
      loadEquipe(),
    ]).finally(() => setLoading(false));
  }, []);

  const saveRoleTaux = async (code) => {
    setRolesSaving(s => ({ ...s, [code]: true }));
    try {
      await api.put(`/parametres/roles-metier/${code}`, { taux_horaire: rolesTauxEdit[code] });
      setRolesTauxEdit(e => { const n = { ...e }; delete n[code]; return n; });
      loadRoles();
    } catch { alert('Erreur lors de la sauvegarde du taux'); }
    finally { setRolesSaving(s => ({ ...s, [code]: false })); }
  };

  const saveEquipeUser = async (id) => {
    setEquipeSaving(s => ({ ...s, [id]: true }));
    setEquipeMsg(null);
    try {
      const patch = equipeEdit[id];
      await api.put(`/utilisateurs/${id}`, patch);
      setEquipeEdit(e => { const n = { ...e }; delete n[id]; return n; });
      setEquipeMsg({ type: 'ok', text: 'Collaborateur mis à jour' });
      loadEquipe();
    } catch (e) {
      setEquipeMsg({ type: 'err', text: e.response?.data?.message || 'Erreur' });
    } finally { setEquipeSaving(s => ({ ...s, [id]: false })); }
  };


  const savePortalAccess = async () => {
    if (!portalForm.client_id || !portalForm.email || !portalForm.password) {
      setPortalMsg({ type: 'err', text: 'Client, email et mot de passe sont requis' });
      return;
    }
    setPortalSaving(true); setPortalMsg(null);
    try {
      await api.post('/portal/admin/create-access', {
        client_id: Number(portalForm.client_id),
        email: portalForm.email,
        password: portalForm.password,
      });
      setPortalMsg({ type: 'ok', text: 'Accès portail créé avec succès' });
      setPortalForm({ client_id: '', email: '', password: '' });
    } catch (e) {
      setPortalMsg({ type: 'err', text: e.response?.data?.message || 'Erreur lors de la création' });
    } finally { setPortalSaving(false); }
  };

  const saveBrevo = async () => {
    setSavingBrevo(true); setSavedBrevo(false);
    try {
      await api.put('/parametres', {
        brevoApiKey: form.brevoApiKey,
        emailExpediteur: form.emailExpediteur,
        nomExpediteur: form.nomExpediteur,
      });
      setSavedBrevo(true);
      setTimeout(() => setSavedBrevo(false), 3000);
    } catch { alert('Erreur lors de la sauvegarde'); }
    finally { setSavingBrevo(false); }
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
            <F form={form} setForm={setForm} label="Nom du cabinet *" name="nom" placeholder="ParFi France" />
            <div className="form-row">
              <F form={form} setForm={setForm} label="SIRET" name="siret" placeholder="00000000000000" />
              <F form={form} setForm={setForm} label="N° d'ordre" name="numeroOrdre" placeholder="REG-XXXX" />
            </div>
            <F form={form} setForm={setForm} label="Adresse" name="adresse" placeholder="12 rue de la Paix" />
            <div className="form-row">
              <F form={form} setForm={setForm} label="Code postal" name="codePostal" placeholder="75000" />
              <F form={form} setForm={setForm} label="Ville" name="ville" placeholder="Paris" />
            </div>
            <div className="form-row">
              <F form={form} setForm={setForm} label="Téléphone" name="telephone" placeholder="+33 1 23 45 67 89" />
              <F form={form} setForm={setForm} label="Email" name="email" type="email" placeholder="contact@parfi-france.fr" />
            </div>
            <F form={form} setForm={setForm} label="Site web" name="siteWeb" placeholder="https://www.parfi-france.fr" />
            <F form={form} setForm={setForm} label="Assurance RCP" name="assuranceRCP" placeholder="Compagnie / N° de police" />
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
              <F form={form} setForm={setForm} label="IBAN" name="iban" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              <F form={form} setForm={setForm} label="BIC" name="bic" placeholder="BNPAFRPPXXX" />
            </div>
            <F form={form} setForm={setForm} label="Mentions légales" name="mentionsLegales" rows={3} placeholder="Mentions légales figurant sur les factures et devis…" />
            <F form={form} setForm={setForm} label="Signature email" name="emailSignature" rows={3} placeholder="Cordialement,\nParFi France…" />
          </div>
        </div>

        {/* Envoi d'emails */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Envoi d'emails (Brevo)</h3>
            <button className="btn btn-primary btn-sm" onClick={saveBrevo} disabled={savingBrevo}>
              {savingBrevo ? 'Enregistrement…' : savedBrevo ? '✅ Sauvegardé' : 'Sauvegarder'}
            </button>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Utilisé pour l'envoi des devis et lettres de mission par email avec pièce jointe PDF.
              Créez un compte sur <strong>brevo.com</strong>, puis copiez votre clé API dans <em>SMTP & API → API Keys</em>.
            </p>
            <F form={form} setForm={setForm} label="Clé API Brevo" name="brevoApiKey" placeholder="xkeysib-…" />
            <div className="form-row">
              <F form={form} setForm={setForm} label="Email expéditeur" name="emailExpediteur" type="email" placeholder="contact@parfi-france.fr" />
              <F form={form} setForm={setForm} label="Nom expéditeur" name="nomExpediteur" placeholder="ParFi France" />
            </div>
          </div>
        </div>

        {/* Rôles métier & Taux horaires */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">Rôles métier & Taux horaires (€/h)</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Taux utilisés dans le dimensionnement</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rôle</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 140 }}>Taux (€/h)</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {rolesMetier.map(r => (
                  <tr key={r.code} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, fontSize: 13 }}>{r.libelle}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {rolesTauxEdit[r.code] !== undefined ? (
                        <input
                          type="number" min="0" step="1"
                          className="form-control"
                          style={{ padding: '4px 8px', fontSize: 13, textAlign: 'right', width: 90, display: 'inline-block' }}
                          value={rolesTauxEdit[r.code]}
                          onChange={e => setRolesTauxEdit(ed => ({ ...ed, [r.code]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && saveRoleTaux(r.code)}
                          autoFocus
                        />
                      ) : (
                        <strong style={{ fontSize: 14 }}>{parseFloat(r.taux_horaire).toFixed(0)} €</strong>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      {rolesTauxEdit[r.code] !== undefined ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => saveRoleTaux(r.code)} disabled={rolesSaving[r.code]}>✓</button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setRolesTauxEdit(ed => { const n = { ...ed }; delete n[r.code]; return n; })}>✕</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setRolesTauxEdit(ed => ({ ...ed, [r.code]: parseFloat(r.taux_horaire) }))}>✏️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Équipe du cabinet */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">Équipe du cabinet</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rôle métier et taux personnalisé par collaborateur</span>
          </div>
          {equipeMsg && (
            <div style={{ margin: '0 16px 8px', padding: '8px 12px', borderRadius: 6, background: equipeMsg.type === 'ok' ? '#dcfce7' : '#fee2e2', color: equipeMsg.type === 'ok' ? '#166534' : '#991b1b', fontSize: 13 }}>
              {equipeMsg.text}
              <button onClick={() => setEquipeMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          )}
          <div className="card-body" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Collaborateur</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rôle métier</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accès système</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 130 }}>Taux perso (€/h)</th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {equipe.filter(u => u.actif !== 0).map(u => {
                  const editing = equipeEdit[u.id];
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid var(--border)', background: editing ? '#fafbff' : '' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13 }}>
                        {u.prenom} {u.nom}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {editing ? (
                          <select
                            className="form-control"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            value={editing.role_metier ?? u.role_metier}
                            onChange={e => setEquipeEdit(ed => ({ ...ed, [u.id]: { ...ed[u.id], role_metier: e.target.value } }))}
                          >
                            {Object.entries(ROLE_METIER_LABELS).map(([code, lbl]) => (
                              <option key={code} value={code}>{lbl}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{ROLE_METIER_LABELS[u.role_metier] || u.role_metier}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {editing ? (
                          <select
                            className="form-control"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            value={editing.role ?? u.role}
                            onChange={e => setEquipeEdit(ed => ({ ...ed, [u.id]: { ...ed[u.id], role: e.target.value } }))}
                          >
                            {Object.entries(ROLE_SYSTEM_LABELS).map(([code, lbl]) => (
                              <option key={code} value={code}>{lbl}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ROLE_SYSTEM_LABELS[u.role] || u.role}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {editing ? (
                          <input
                            type="number" min="0" step="1" placeholder="Par défaut"
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: 12, textAlign: 'right', width: 90, display: 'inline-block' }}
                            value={editing.taux_horaire ?? (u.taux_horaire || '')}
                            onChange={e => setEquipeEdit(ed => ({ ...ed, [u.id]: { ...ed[u.id], taux_horaire: e.target.value } }))}
                          />
                        ) : (
                          <span style={{ fontSize: 12 }}>
                            {u.taux_horaire
                              ? <strong style={{ color: 'var(--accent)' }}>{parseFloat(u.taux_horaire).toFixed(0)} €</strong>
                              : <span style={{ color: 'var(--text-muted)' }}>Par défaut ({parseFloat(u.taux_effectif || 0).toFixed(0)} €)</span>
                            }
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        {editing ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => saveEquipeUser(u.id)} disabled={equipeSaving[u.id]}>✓ Sauver</button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setEquipeEdit(ed => { const n = { ...ed }; delete n[u.id]; return n; })}>✕</button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setEquipeEdit(ed => ({ ...ed, [u.id]: {} }))}>✏️ Modifier</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>


        {/* Accès portail client */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Accès portail client</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Créer ou mettre à jour les identifiants de connexion d'un client au portail client.
            </p>
            {portalMsg && (
              <div className={`alert ${portalMsg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
                {portalMsg.text}
                <button onClick={() => setPortalMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select
                  className="form-control"
                  value={portalForm.client_id}
                  onChange={e => setPortalForm(f => ({ ...f, client_id: e.target.value }))}
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients
                    .filter(c => c.statut === 'client' || !c.statut)
                    .sort((a, b) => a.nom.localeCompare(b.nom))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                        {c.portal_email ? ` ✓ (${c.portal_email})` : ''}
                      </option>
                    ))
                  }
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Email de connexion *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="client@entreprise.fr"
                  value={portalForm.email}
                  onChange={e => setPortalForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Mot de passe *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Mot de passe temporaire"
                  value={portalForm.password}
                  onChange={e => setPortalForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  className="btn btn-primary"
                  onClick={savePortalAccess}
                  disabled={portalSaving}
                  style={{ background: '#0f1f4b' }}
                >
                  {portalSaving ? 'Création…' : '🌐 Créer l\'accès portail'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Clauses bibliothèque */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Bibliothèque de clauses</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {clauses.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Titre</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 160 }}>Catégorie</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {clauses.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        {clauseEdit?.id === c.id ? (
                          <input className="form-control" style={{ fontSize: 12 }} value={clauseEdit.titre}
                            onChange={e => setClauseEdit(x => ({ ...x, titre: e.target.value }))} />
                        ) : <span style={{ fontSize: 13, fontWeight: 500 }}>{c.titre}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{c.categorie?.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {clauseEdit?.id === c.id ? (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                              onClick={async () => {
                                await api.put(`/parametres/clauses/${c.id}`, clauseEdit);
                                setClauses(list => list.map(x => x.id === c.id ? { ...x, ...clauseEdit } : x));
                                setClauseEdit(null);
                              }}>✓</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                              onClick={() => setClauseEdit({ id: c.id, titre: c.titre, categorie: c.categorie, contenu: c.contenu })}>✏️</button>
                          )}
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }}
                            onClick={async () => {
                              await api.delete(`/parametres/clauses/${c.id}`);
                              setClauses(list => list.filter(x => x.id !== c.id));
                            }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: 14, borderTop: clauses.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Titre *</label>
                <input className="form-control" style={{ fontSize: 12 }} placeholder="Titre de la clause"
                  value={newClause.titre} onChange={e => setNewClause(n => ({ ...n, titre: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Catégorie *</label>
                <select className="form-control" style={{ fontSize: 12 }} value={newClause.categorie}
                  onChange={e => setNewClause(n => ({ ...n, categorie: e.target.value }))}>
                  {['tronc_commun','mission_tenue','mission_revision','mission_social','mission_juridique','mission_fiscal','mission_conseil','mission_audit','annexe'].map(t => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                onClick={async () => {
                  if (!newClause.titre) return;
                  const { data: r } = await api.post('/parametres/clauses', newClause);
                  setClauses(list => [...list, { ...newClause, id: r.id, code: r.code, actif: 1 }]);
                  setNewClause({ titre: '', categorie: 'tronc_commun', contenu: '' });
                }}>+ Ajouter</button>
            </div>
            {clauseEdit && (
              <div style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
                <label className="form-label" style={{ fontSize: 11 }}>Contenu de la clause</label>
                <textarea className="form-control" rows={4} style={{ fontSize: 12 }} value={clauseEdit.contenu || ''}
                  onChange={e => setClauseEdit(x => ({ ...x, contenu: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        {/* Modèles de mission */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Modèles de mission</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            {modeles.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nom</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 160 }}>Catégorie</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: 80 }}>Ratio</th>
                    <th style={{ width: 80 }} />
                  </tr>
                </thead>
                <tbody>
                  {modeles.map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        {modeleEdit?.id === m.id ? (
                          <input className="form-control" style={{ fontSize: 12 }} value={modeleEdit.nom}
                            onChange={e => setModeleEdit(x => ({ ...x, nom: e.target.value }))} />
                        ) : <span style={{ fontSize: 13, fontWeight: 500 }}>{m.nom}</span>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{m.categorie}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12 }}>{m.ratioSaisie}%</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {modeleEdit?.id === m.id ? (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                              onClick={async () => {
                                await api.put(`/parametres/modeles-missions/${m.id}`, modeleEdit);
                                setModeles(list => list.map(x => x.id === m.id ? { ...x, ...modeleEdit } : x));
                                setModeleEdit(null);
                              }}>✓</button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                              onClick={() => setModeleEdit({ id: m.id, nom: m.nom, categorie: m.categorie, description: m.description, ratioSaisie: m.ratioSaisie })}>✏️</button>
                          )}
                          <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }}
                            onClick={async () => {
                              await api.delete(`/parametres/modeles-missions/${m.id}`);
                              setModeles(list => list.filter(x => x.id !== m.id));
                            }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ padding: 14, borderTop: modeles.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--bg)', display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Nom du modèle *</label>
                <input className="form-control" style={{ fontSize: 12 }} placeholder="Ex : Tenue comptable PME"
                  value={newModele.nom} onChange={e => setNewModele(n => ({ ...n, nom: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Catégorie *</label>
                <select className="form-control" style={{ fontSize: 12 }} value={newModele.categorie}
                  onChange={e => setNewModele(n => ({ ...n, categorie: e.target.value }))}>
                  {['tenue_comptable','revision','etablissement_comptes','fiscal','social','paie','juridique','conseil','autre'].map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                onClick={async () => {
                  if (!newModele.nom) return;
                  const { data: r } = await api.post('/parametres/modeles-missions', newModele);
                  setModeles(list => [...list, { ...newModele, id: r.id, code: r.code, actif: 1, estModele: 1, ratioSaisie: 100 }]);
                  setNewModele({ nom: '', categorie: 'tenue_comptable', description: '' });
                }}>+ Ajouter</button>
            </div>
          </div>
        </div>

        {/* Catalogue des prestations */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">Catalogue des prestations de mission</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Pour chaque tâche, choisissez un taux spécifique ou laissez vide pour utiliser le taux du profil intervenant affecté.
            </p>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {(() => {
              // Grouper par rubrique
              const groupes = {};
              tachesDim.forEach(t => {
                if (!groupes[t.rubrique]) groupes[t.rubrique] = [];
                groupes[t.rubrique].push(t);
              });
              return Object.entries(groupes).map(([rubrique, taches]) => (
                <div key={rubrique}>
                  <div style={{ padding: '8px 14px', background: 'var(--bg)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{rubrique}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({taches[0].section})</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {taches.map(t => {
                        const editing = tachesDimEdit[t.id];
                        const hasSpecific = t.taux_specifique !== null;
                        return (
                          <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '9px 14px', fontSize: 13 }}>{t.libelle}</td>
                            <td style={{ padding: '9px 14px', width: 160 }}>
                              <span style={{
                                display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                background: t.intervenant === 'Expert-comptable' ? '#eff6ff' : t.intervenant.includes('Social') ? '#fdf4ff' : t.intervenant.includes('Juridique') ? '#f0fdf4' : '#f8fafc',
                                color: t.intervenant === 'Expert-comptable' ? '#1d4ed8' : t.intervenant.includes('Social') ? '#7e22ce' : t.intervenant.includes('Juridique') ? '#15803d' : '#475569',
                              }}>{t.intervenant}</span>
                            </td>
                            <td style={{ padding: '9px 14px', width: 230 }}>
                              {editing !== undefined ? (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <input
                                    type="number" min="0" placeholder={`${t.taux_profil} (profil)`}
                                    className="form-control"
                                    style={{ width: 110, fontSize: 12, padding: '3px 8px' }}
                                    value={editing}
                                    onChange={e => setTachesDimEdit(ed => ({ ...ed, [t.id]: e.target.value }))}
                                  />
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>€/h</span>
                                  <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                                    onClick={async () => {
                                      await api.put(`/parametres/taches-dim/${t.id}`, { taux_specifique: editing === '' ? null : Number(editing) });
                                      setTachesDim(list => list.map(x => x.id === t.id ? { ...x, taux_specifique: editing === '' ? null : Number(editing) } : x));
                                      setTachesDimEdit(ed => { const n = { ...ed }; delete n[t.id]; return n; });
                                    }}>✓</button>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                                    onClick={() => setTachesDimEdit(ed => { const n = { ...ed }; delete n[t.id]; return n; })}>✕</button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  {hasSpecific ? (
                                    <>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f1f4b' }}>{t.taux_specifique} €/h</span>
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>spécifique</span>
                                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--text-muted)' }}
                                        onClick={async () => {
                                          await api.put(`/parametres/taches-dim/${t.id}`, { taux_specifique: null });
                                          setTachesDim(list => list.map(x => x.id === t.id ? { ...x, taux_specifique: null } : x));
                                        }} title="Revenir au taux du profil">↩ profil</button>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Taux du profil ({t.taux_profil} €/h)</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '9px 14px', width: 60, textAlign: 'right' }}>
                              {editing === undefined && (
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                                  onClick={() => setTachesDimEdit(ed => ({ ...ed, [t.id]: t.taux_specifique ?? '' }))}>✏️</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Apparence */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Apparence</h3></div>
          <div className="card-body">
            <F form={form} setForm={setForm} label="URL du logo" name="logoUrl" placeholder="https://..." />
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
