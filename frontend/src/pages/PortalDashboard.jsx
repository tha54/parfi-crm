import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const portalApi = axios.create({ baseURL: '/api/portal' });
portalApi.interceptors.request.use(cfg => {
  const t = localStorage.getItem('portal_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const STATUT_COLORS = { brouillon: '#9ca3af', envoyee: '#3b82f6', payee: '#10b981', retard: '#ef4444', partielle: '#f59e0b', annulee: '#6b7c93' };
const STATUT_LABELS = { brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée', retard: 'En retard', partielle: 'Partielle', annulee: 'Annulée' };

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(v || 0));
}

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState(null);
  const [factures, setFactures] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [missions, setMissions] = useState([]);
  const [message, setMessage] = useState({ objet: '', contenu: '' });
  const [loading, setLoading] = useState(true);
  const [msgSent, setMsgSent] = useState(false);

  const client = JSON.parse(localStorage.getItem('portal_client') || '{}');

  const logout = () => { localStorage.removeItem('portal_token'); localStorage.removeItem('portal_client'); navigate('/portail'); };

  useEffect(() => {
    portalApi.get('/dashboard').then(r => setData(r.data)).catch(() => navigate('/portail')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'factures') portalApi.get('/factures').then(r => setFactures(r.data)).catch(() => {});
    if (tab === 'documents') portalApi.get('/documents').then(r => setDocuments(r.data)).catch(() => {});
    if (tab === 'missions') portalApi.get('/missions').then(r => setMissions(r.data)).catch(() => {});
  }, [tab]);

  const sendMessage = async () => {
    await portalApi.post('/message', message).catch(() => {});
    setMsgSent(true);
    setMessage({ objet: '', contenu: '' });
    setTimeout(() => setMsgSent(false), 4000);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><div className="spinner"><div className="spinner-ring" /></div></div>;

  const d = data || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#0f1f4b', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>ParFi<span style={{ color: '#00b4d8' }}>.</span></div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>{client.nom}</span>
          <button onClick={logout} style={{ background: 'none', border: '1px solid rgba(255,255,255,.25)', color: 'rgba(255,255,255,.7)', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Déconnexion</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 28px' }}>
        {[['dashboard','🏠 Accueil'], ['factures','🧾 Factures'], ['documents','📁 Documents'], ['missions','🎯 Missions'], ['messages','💬 Messages']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === k ? 700 : 400, color: tab === k ? '#0f1f4b' : '#6b7c93',
            borderBottom: tab === k ? '2px solid #0f1f4b' : '2px solid transparent',
            fontSize: 13, marginBottom: -1,
          }}>{v}</button>
        ))}
      </div>

      <div style={{ padding: '28px', maxWidth: 1000, margin: '0 auto' }}>

        {tab === 'dashboard' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f1f4b' }}>Bonjour, {client.nom}</h2>
              {d.client?.contact_cabinet && (
                <div style={{ fontSize: 13, color: '#6b7c93', marginTop: 4 }}>
                  Votre contact : <strong>{d.client.contact_cabinet}</strong> · {d.client.email_cabinet}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
              {d.derniereFacture && (
                <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', borderTop: `3px solid ${STATUT_COLORS[d.derniereFacture.statut] || '#9ca3af'}` }}>
                  <div style={{ fontSize: 11, color: '#6b7c93', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Dernière facture</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1f4b', marginTop: 4 }}>{fmt(d.derniereFacture.totalTTC)}</div>
                  <div style={{ fontSize: 12, color: STATUT_COLORS[d.derniereFacture.statut], marginTop: 2 }}>{STATUT_LABELS[d.derniereFacture.statut] || d.derniereFacture.statut}</div>
                </div>
              )}
              {d.missions && (
                <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)', borderTop: '3px solid #00b4d8' }}>
                  <div style={{ fontSize: 11, color: '#6b7c93', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Missions</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1f4b', marginTop: 4 }}>{d.missions.en_cours || 0} en cours</div>
                  <div style={{ fontSize: 12, color: '#6b7c93', marginTop: 2 }}>Avancement moyen : {d.missions.avancement || 0}%</div>
                  <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.missions.avancement || 0}%`, background: '#00b4d8' }} />
                  </div>
                </div>
              )}
            </div>

            {(d.prochainesEcheances || []).length > 0 && (
              <div style={{ background: '#fff', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                <div style={{ fontWeight: 700, color: '#0f1f4b', marginBottom: 12 }}>📅 Prochaines échéances fiscales</div>
                {d.prochainesEcheances.map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < d.prochainesEcheances.length - 1 ? '1px solid #f0f0f0' : 'none', fontSize: 13 }}>
                    <span>{e.label}</span>
                    <span style={{ color: '#6b7c93' }}>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'factures' && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f5f7fb' }}>
                {['N°', 'Date', 'Échéance', 'Montant TTC', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7c93' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {factures.map(f => (
                  <tr key={f.id}>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}><code>{f.numero}</code></td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(f.dateEmission).toLocaleDateString('fr-FR')}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>{f.dateEcheance ? new Date(f.dateEcheance).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>{fmt(f.totalTTC)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: STATUT_COLORS[f.statut] + '22', color: STATUT_COLORS[f.statut], fontWeight: 700 }}>
                        {STATUT_LABELS[f.statut] || f.statut}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                        onClick={() => window.open(`/api/factures/${f.id}/pdf`, '_blank')}>📄 PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'documents' && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.08)', overflow: 'hidden' }}>
            {documents.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Aucun document disponible</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f5f7fb' }}>
                  {['Document', 'Type', 'Année', 'Date', 'Action'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7c93' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {documents.map(d => (
                    <tr key={d.id}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500 }}>{d.nom}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7c93' }}>{d.type_document || d.type}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{d.annee_fiscale || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12 }}>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                          onClick={() => window.open(`/api/portal/documents/${d.id}/download`, '_blank')}>📥 Télécharger</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'missions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {missions.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Aucune mission</div>
            ) : missions.map((m, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: '#0f1f4b' }}>{m.nom}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: m.statut === 'en_cours' ? '#e0f9f6' : '#f0f0f0', color: m.statut === 'en_cours' ? '#0f766e' : '#6b7c93' }}>
                    {m.statut === 'en_cours' ? 'En cours' : m.statut}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 8 }}>{m.categorie?.replace(/_/g, ' ')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>Avancement</span>
                  <strong>{m.avancement_pct}%</strong>
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${m.avancement_pct}%`, background: '#00b4d8', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'messages' && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <h3 style={{ fontWeight: 700, color: '#0f1f4b', marginBottom: 16 }}>Envoyer un message au cabinet</h3>
            {msgSent && <div style={{ padding: '10px 16px', background: '#f0fdf4', borderRadius: 8, marginBottom: 16, color: '#166534', fontSize: 13 }}>✅ Message envoyé au cabinet</div>}
            <div className="form-group">
              <label className="form-label">Objet</label>
              <input className="form-control" value={message.objet} onChange={e => setMessage(m => ({ ...m, objet: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea className="form-control" rows={5} value={message.contenu} onChange={e => setMessage(m => ({ ...m, contenu: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={sendMessage} disabled={!message.contenu}>Envoyer</button>
          </div>
        )}
      </div>
    </div>
  );
}
