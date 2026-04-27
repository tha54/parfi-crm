import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

const STATUTS = { brouillon: 'Brouillon', envoyee: 'Envoyée', signee: 'Signée', archivee: 'Archivée' };
const STATUT_COLORS = { brouillon: '#6b7c93', envoyee: '#00b4d8', signee: '#00897b', archivee: '#9ca3af' };

const TYPES_MISSION = {
  tenue_comptable: 'Tenue comptable', revision: 'Révision',
  etablissement_comptes: 'Établissement des comptes', fiscal: 'Fiscal',
  social_paie: 'Social / Paie', conseil: 'Conseil', juridique: 'Juridique', autre: 'Autre',
};

const MANDAT_ICONS = { prelevement: '🏦', impots: '🏛️', urssaf: '👷', autre: '📄' };
const MANDAT_LABELS = { prelevement: 'Prélèvement bancaire', impots: 'Mandat fiscal (impôts)', urssaf: 'Organismes sociaux (URSSAF)', autre: 'Autre mandat' };

export default function LDMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ldm, setLdm] = useState(null);
  const [mandats, setMandats] = useState([]);
  const [taches, setTaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState(null);

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    try {
      const [{ data: l }, { data: m }] = await Promise.all([
        api.get(`/lettres-mission/${id}`),
        api.get(`/lettres-mission/${id}/mandats`).catch(() => ({ data: [] })),
      ]);
      setLdm(l);
      setMandats(m);
      // Load tasks injected from this LDM
      if (l.client_id) {
        api.get(`/taches?client_id=${l.client_id}`).then(r => {
          setTaches((r.data || []).filter(t => t.origine === 'ldm'));
        }).catch(() => {});
      }
    } catch { navigate('/lettres-mission'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const signLDM = async () => {
    if (!confirm('Confirmer la signature de la lettre de mission ? Les tâches seront automatiquement injectées.')) return;
    setSigning(true); setMsg(null);
    try {
      const { data: result } = await api.post(`/lettres-mission/${id}/signer`);
      setMsg({ type: 'ok', text: `✓ LDM signée — ${result.tachesCreees} tâche(s) injectée(s) dans le module Tâches` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur lors de la signature' });
    } finally { setSigning(false); }
  };

  const changeStatut = async (statut) => {
    try {
      await api.put(`/lettres-mission/${id}`, { statut });
      setLdm(d => ({ ...d, statut }));
    } catch { setMsg({ type: 'err', text: 'Erreur statut' }); }
  };

  const toggleMandat = async (m) => {
    try {
      await api.put(`/lettres-mission/${id}/mandats/${m.id}`, {
        signe: !m.signe,
        date_signature: !m.signe ? new Date().toISOString().slice(0, 10) : null,
      });
      setMandats(prev => prev.map(x => x.id === m.id ? { ...x, signe: !m.signe, date_signature: !m.signe ? new Date().toISOString().slice(0, 10) : null } : x));
    } catch { setMsg({ type: 'err', text: 'Erreur mandat' }); }
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!ldm) return null;

  const isSigned = ldm.statut === 'signee';

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lettres-mission')}>← LDM</button>
            <h1 style={{ margin: 0 }}>{ldm.numero}</h1>
            <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: STATUT_COLORS[ldm.statut] + '18', color: STATUT_COLORS[ldm.statut], border: `1px solid ${STATUT_COLORS[ldm.statut]}40` }}>
              {STATUTS[ldm.statut] || ldm.statut}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {ldm.client_nom || '—'} · {TYPES_MISSION[ldm.typeMission] || ldm.typeMission}
            {ldm.dateDebut && ` · À partir du ${new Date(ldm.dateDebut).toLocaleDateString('fr-FR')}`}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            {!isSigned && (
              <>
                {ldm.statut === 'brouillon' && (
                  <button className="btn btn-ghost" onClick={() => changeStatut('envoyee')}>📤 Marquer envoyée</button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={signLDM}
                  disabled={signing}
                  style={{ background: '#0f1f4b' }}
                >
                  {signing ? 'Signature…' : '✍️ Signer la LDM'}
                </button>
              </>
            )}
            {isSigned && (
              <span style={{ fontSize: 13, color: '#00897b', fontWeight: 600, alignSelf: 'center' }}>
                ✓ Signée le {ldm.dateSignatureClient ? new Date(ldm.dateSignatureClient).toLocaleDateString('fr-FR') : '—'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="page-body">
        {msg && (
          <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20 }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

          {/* Colonne principale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Mission */}
            <div className="card">
              <div className="card-header"><span className="card-title">Objet de la mission</span></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Type</div>
                    <div style={{ fontWeight: 600 }}>{TYPES_MISSION[ldm.typeMission] || ldm.typeMission}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Honoraires HT</div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary)' }}>{fmt(ldm.montantHonorairesHT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Mensuel TTC</div>
                    <div style={{ fontWeight: 600, color: 'var(--accent-hover)' }}>{fmt(Number(ldm.montantHonorairesHT) * 1.20 / 12)}</div>
                  </div>
                </div>
                {ldm.objetMission && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                    {ldm.objetMission}
                  </div>
                )}
              </div>
            </div>

            {/* Mandats */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Mandats</span>
                {mandats.length > 0 && (
                  <span style={{ fontSize: 12, color: mandats.filter(m => m.signe).length === mandats.length ? '#00897b' : 'var(--text-muted)' }}>
                    {mandats.filter(m => m.signe).length}/{mandats.length} signés
                  </span>
                )}
              </div>
              {mandats.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <p style={{ fontSize: 13 }}>Les mandats seront créés automatiquement à la signature de la LDM</p>
                </div>
              ) : (
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  {mandats.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 20 }}>{MANDAT_ICONS[m.type] || '📄'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{m.libelle || MANDAT_LABELS[m.type]}</div>
                        {m.date_signature && (
                          <div style={{ fontSize: 11, color: '#00897b' }}>
                            Signé le {new Date(m.date_signature).toLocaleDateString('fr-FR')}
                          </div>
                        )}
                      </div>
                      {canEdit && (
                        <button
                          className={`btn btn-sm ${m.signe ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => toggleMandat(m)}
                          style={{ fontSize: 12, padding: '4px 12px', background: m.signe ? '' : '#00897b', borderColor: m.signe ? '' : '#00897b' }}
                        >
                          {m.signe ? '✓ Signé' : 'Marquer signé'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tâches injectées */}
            {taches.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Tâches injectées</span>
                  <span className="text-muted text-sm">{taches.length} tâche{taches.length > 1 ? 's' : ''}</span>
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Tâche</th>
                        <th style={{ width: 90 }}>Statut</th>
                        <th style={{ width: 90, textAlign: 'right' }}>Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taches.slice(0, 20).map(t => (
                        <tr key={t.id}>
                          <td style={{ fontSize: 13 }}>
                            {t.titre || t.description}
                            {t.periodicite && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {t.periodicite}</span>}
                          </td>
                          <td>
                            <span className={`badge badge-${t.statut === 'termine' ? 'termine' : t.statut === 'en_cours' ? 'en_cours' : 'autre'}`} style={{ fontSize: 11 }}>
                              {t.statut}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                            {t.budget_minutes ? `${Math.floor(t.budget_minutes / 60)}h${t.budget_minutes % 60 > 0 ? String(t.budget_minutes % 60).padStart(2, '0') : ''}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Infos */}
            <div className="card">
              <div className="card-header"><span className="card-title">Informations</span></div>
              <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                {[
                  { label: 'Référence', value: <code style={{ fontSize: 12 }}>{ldm.numero}</code> },
                  { label: 'Client', value: ldm.client_id ? <Link to={`/clients/${ldm.client_id}`} style={{ color: 'var(--accent)' }}>{ldm.client_nom}</Link> : (ldm.client_nom || '—') },
                  { label: 'Statut', value: <span style={{ color: STATUT_COLORS[ldm.statut] }}>{STATUTS[ldm.statut]}</span> },
                  { label: 'Créée le', value: new Date(ldm.createdAt).toLocaleDateString('fr-FR') },
                  { label: 'Date de début', value: ldm.dateDebut ? new Date(ldm.dateDebut).toLocaleDateString('fr-FR') : '—' },
                  ldm.devis_id && { label: 'Devis lié', value: <Link to={`/devis/${ldm.devis_id}`} style={{ color: 'var(--accent)' }}>Voir le devis →</Link> },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span className="text-muted">{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Statut */}
            {canEdit && !isSigned && (
              <div className="card">
                <div className="card-header"><span className="card-title">Changer le statut</span></div>
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <select className="form-control" value={ldm.statut} onChange={e => changeStatut(e.target.value)}>
                    {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Notes internes */}
            {ldm.notesInternes && (
              <div className="card">
                <div className="card-header"><span className="card-title">Notes internes</span></div>
                <div className="card-body">
                  <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)', margin: 0 }}>{ldm.notesInternes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
