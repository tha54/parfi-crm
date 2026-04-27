import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

const STATUTS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' };
const STATUT_COLORS = { brouillon: '#6b7c93', envoye: '#00b4d8', accepte: '#00897b', refuse: '#e74c3c', expire: '#9ca3af' };

export default function DevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [devis, setDevis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changingStatut, setChangingStatut] = useState(false);
  const [creatingLDM, setCreatingLDM] = useState(false);
  const [msg, setMsg] = useState(null);

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const load = () => api.get(`/devis/${id}`).then(r => setDevis(r.data)).catch(() => navigate('/devis')).finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  const changeStatut = async (statut) => {
    setChangingStatut(true);
    try {
      await api.put(`/devis/${id}`, { statut });
      setDevis(d => ({ ...d, statut }));
      setMsg({ type: 'ok', text: `Statut mis à jour : ${STATUTS[statut]}` });
    } catch { setMsg({ type: 'err', text: 'Erreur lors du changement de statut' }); }
    finally { setChangingStatut(false); }
  };

  const createLDM = async () => {
    if (!devis.client_id) {
      setMsg({ type: 'err', text: 'La création d\'une LDM nécessite un client CRM (pas un prospect).' });
      return;
    }
    setCreatingLDM(true);
    try {
      const typeMission = 'tenue_comptable';
      const objetMission = (devis.lignes || []).map(l => `- ${l.description} : ${fmt(l.totalHT)} HT`).join('\n');
      const { data: ldm } = await api.post('/lettres-mission', {
        client_id: devis.client_id,
        devis_id: devis.id,
        typeMission,
        objetMission: `Missions issues du devis ${devis.numero} :\n\n${objetMission}`,
        montantHonorairesHT: devis.totalHT,
        dateDebut: new Date().toISOString().slice(0, 10),
        notesInternes: `Générée depuis le devis ${devis.numero}`,
      });
      navigate(`/lettres-mission/${ldm.id}`);
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Erreur création LDM' });
    } finally { setCreatingLDM(false); }
  };

  const deleteDevis = async () => {
    if (!confirm(`Supprimer le devis ${devis?.numero} ?`)) return;
    try {
      await api.delete(`/devis/${id}`);
      navigate('/devis');
    } catch { setMsg({ type: 'err', text: 'Erreur lors de la suppression' }); }
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!devis) return null;

  const nom = devis.client_nom || devis.prospect_nom || devis.display_nom || '—';
  const lignes = devis.lignes || [];

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/devis')}>← Devis</button>
            <h1 style={{ margin: 0 }}>{devis.numero}</h1>
            <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: STATUT_COLORS[devis.statut] + '18', color: STATUT_COLORS[devis.statut], border: `1px solid ${STATUT_COLORS[devis.statut]}40` }}>
              {STATUTS[devis.statut] || devis.statut}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {nom}
            {devis.dateValidite && ` · Validité : ${new Date(devis.dateValidite).toLocaleDateString('fr-FR')}`}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            {devis.statut === 'brouillon' && (
              <button className="btn btn-ghost" onClick={() => changeStatut('envoye')} disabled={changingStatut}>
                📤 Marquer envoyé
              </button>
            )}
            {devis.statut === 'envoye' && (
              <>
                <button className="btn btn-ghost" style={{ borderColor: '#00897b', color: '#00897b' }} onClick={() => changeStatut('accepte')} disabled={changingStatut}>
                  ✓ Accepté
                </button>
                <button className="btn btn-ghost" style={{ borderColor: '#e74c3c', color: '#e74c3c' }} onClick={() => changeStatut('refuse')} disabled={changingStatut}>
                  ✗ Refusé
                </button>
              </>
            )}
            {devis.statut === 'accepte' && (
              <button className="btn btn-primary" onClick={createLDM} disabled={creatingLDM}>
                {creatingLDM ? 'Création…' : '📋 Créer une lettre de mission'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/devis?edit=${id}`)}>✏️ Modifier</button>
            {user?.role === 'expert' && (
              <button className="btn btn-danger btn-sm" onClick={deleteDevis}>🗑</button>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

          {/* Colonne principale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Lignes */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Lignes de devis</span>
                <span className="text-muted text-sm">{lignes.length} ligne{lignes.length !== 1 ? 's' : ''}</span>
              </div>
              {lignes.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <p>Aucune ligne dans ce devis</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ textAlign: 'right', width: 60 }}>Qté</th>
                        <th style={{ textAlign: 'right', width: 110 }}>PU HT</th>
                        <th style={{ textAlign: 'right', width: 60 }}>Rem %</th>
                        <th style={{ textAlign: 'right', width: 110 }}>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 13 }}>{l.description}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{l.quantite}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{fmt(l.prixUnitaireHT)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                            {Number(l.remisePct) > 0 ? `${l.remisePct}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(l.totalHT)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Notes */}
            {(devis.notesClient || devis.notesInternes) && (
              <div className="card">
                <div className="card-header"><span className="card-title">Notes</span></div>
                <div className="card-body">
                  {devis.notesClient && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes client</div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{devis.notesClient}</div>
                    </div>
                  )}
                  {devis.notesInternes && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes internes</div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{devis.notesInternes}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Totaux */}
            <div className="card">
              <div className="card-header"><span className="card-title">Totaux</span></div>
              <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span className="text-muted">Total HT</span><strong>{fmt(devis.totalHT)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span className="text-muted">TVA {devis.tauxTVA}%</span><span>{fmt(devis.totalTVA)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', marginTop: 8, background: 'var(--primary)', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
                  <span>Total TTC</span><span>{fmt(devis.totalTTC)}</span>
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--accent-hover)', fontWeight: 600 }}>
                  {fmt(Number(devis.totalTTC) / 12)} / mois TTC
                </div>
              </div>
            </div>

            {/* Infos */}
            <div className="card">
              <div className="card-header"><span className="card-title">Informations</span></div>
              <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                {[
                  { label: 'Référence', value: <code style={{ fontSize: 12 }}>{devis.numero}</code> },
                  { label: 'Client / Prospect', value: devis.client_id ? <Link to={`/clients/${devis.client_id}`} style={{ color: 'var(--accent)' }}>{nom}</Link> : nom },
                  { label: 'Date d\'émission', value: new Date(devis.createdAt || devis.dateEmission).toLocaleDateString('fr-FR') },
                  { label: 'Date de validité', value: devis.dateValidite ? new Date(devis.dateValidite).toLocaleDateString('fr-FR') : '—' },
                  { label: 'Statut', value: <span style={{ color: STATUT_COLORS[devis.statut] }}>{STATUTS[devis.statut]}</span> },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span className="text-muted">{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Changer statut */}
            {canEdit && (
              <div className="card">
                <div className="card-header"><span className="card-title">Changer le statut</span></div>
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <select
                    className="form-control"
                    value={devis.statut}
                    onChange={e => changeStatut(e.target.value)}
                    disabled={changingStatut}
                  >
                    {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
