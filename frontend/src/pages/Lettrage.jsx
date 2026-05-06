import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

const STATUS_COLOR = {
  non_lettre: { bg: '#fff7ed', color: '#c2410c', label: 'Non lettré' },
  lettre:     { bg: '#f0fdf4', color: '#15803d', label: 'Lettré' },
  ignore:     { bg: '#f8fafc', color: '#64748b', label: 'Ignoré' },
};

const CONN_COLOR = {
  actif:       { bg: '#dcfce7', color: '#15803d' },
  en_attente:  { bg: '#fef9c3', color: '#854d0e' },
  erreur:      { bg: '#fee2e2', color: '#dc2626' },
  expire:      { bg: '#f1f5f9', color: '#64748b' },
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}
function fmtMoney(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
}
function fmtSync(d) {
  if (!d) return 'Jamais';
  const diff = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (diff < 2)   return 'À l\'instant';
  if (diff < 60)  return `Il y a ${diff} min`;
  if (diff < 1440) return `Il y a ${Math.round(diff/60)}h`;
  return fmtDate(d);
}

// ─── Modal Suggestions de lettrage ─────────────────────────────────────────

function SuggestionsModal({ mouvement, onClose, onLettrer }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/powens/factures-suggerees/${mouvement.id}`)
      .then(r => setSuggestions(r.data))
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, [mouvement.id]);

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ background:'#fff',borderRadius:12,padding:28,width:600,maxWidth:'95vw',boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:700,fontSize:16 }}>Lettrer un mouvement</div>
            <div style={{ color:'#64748b',fontSize:13,marginTop:4 }}>
              {fmtDate(mouvement.date_operation)} — {mouvement.libelle_simplifie || mouvement.libelle}
            </div>
            <div style={{ fontSize:18,fontWeight:700,color: parseFloat(mouvement.montant) < 0 ? '#dc2626' : '#15803d',marginTop:4 }}>
              {fmtMoney(mouvement.montant)}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#64748b' }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign:'center',padding:32,color:'#94a3b8' }}>Chargement des suggestions…</div>
        ) : suggestions.length === 0 ? (
          <div style={{ textAlign:'center',padding:32,color:'#94a3b8' }}>
            <div style={{ fontSize:32,marginBottom:8 }}>🔍</div>
            Aucune facture à ce montant trouvée pour ce client
          </div>
        ) : (
          <div>
            <div style={{ fontSize:13,color:'#64748b',marginBottom:12 }}>Factures correspondantes (±2 %) :</div>
            {suggestions.map(f => (
              <div key={f.id} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',marginBottom:8,cursor:'pointer',transition:'background .15s' }}
                onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background='#fff'}
                onClick={() => { onLettrer(mouvement.id, f.id); onClose(); }}>
                <div>
                  <div style={{ fontWeight:600,fontSize:14 }}>{f.numero}</div>
                  <div style={{ color:'#64748b',fontSize:12 }}>Émise le {fmtDate(f.dateEmission)} · Échéance {fmtDate(f.dateEcheance)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700,color:'#1e293b' }}>{fmtMoney(f.totalTTC)}</div>
                  <div style={{ fontSize:11,color: f.statut==='retard'?'#dc2626':'#64748b',marginTop:2 }}>{f.statut}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop:16,borderTop:'1px solid #f1f5f9',paddingTop:14,display:'flex',gap:10 }}>
          <button onClick={() => { onLettrer(mouvement.id, null, 'ignorer'); onClose(); }}
            style={{ padding:'7px 14px',borderRadius:7,border:'1px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',fontSize:13,color:'#64748b' }}>
            Ignorer ce mouvement
          </button>
          <button onClick={onClose}
            style={{ padding:'7px 14px',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:13 }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Connexions ───────────────────────────────────────────────────────

function ConnexionsPanel({ clients, connexions, loadConnexions, syncing, onSync }) {
  const [connecting, setConnecting] = useState(null);
  const [selectedClient, setSelectedClient] = useState('');

  async function handleConnect() {
    if (!selectedClient) return;
    setConnecting(true);
    try {
      const r = await api.get(`/powens/connect/${selectedClient}`);
      window.open(r.data.webview_url, '_blank', 'width=800,height=700,menubar=no,toolbar=no');
    } catch (e) {
      const msg = e.response?.data?.message || 'Erreur connexion Powens';
      alert(msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(id) {
    if (!confirm('Déconnecter ce compte bancaire ?')) return;
    await api.delete(`/powens/connexions/${id}`);
    loadConnexions();
  }

  return (
    <div>
      <div style={{ fontWeight:700,fontSize:15,marginBottom:16 }}>Connexions bancaires</div>

      <div style={{ marginBottom:20,padding:16,background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0' }}>
        <div style={{ fontSize:13,fontWeight:600,marginBottom:10,color:'#374151' }}>Ajouter une connexion</div>
        <div style={{ display:'flex',gap:8 }}>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
            style={{ flex:1,padding:'7px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13 }}>
            <option value="">— Sélectionner un client —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <button onClick={handleConnect} disabled={!selectedClient || connecting}
            style={{ padding:'7px 16px',borderRadius:7,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,opacity:(!selectedClient||connecting)?0.5:1 }}>
            {connecting ? '…' : '🏦 Connecter'}
          </button>
        </div>
        <div style={{ fontSize:11,color:'#94a3b8',marginTop:8 }}>
          Vous serez redirigé vers l'interface sécurisée Powens pour sélectionner la banque.
        </div>
      </div>

      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
        <div style={{ fontSize:13,color:'#64748b' }}>{connexions.length} connexion(s)</div>
        <button onClick={onSync} disabled={syncing}
          style={{ padding:'5px 12px',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:12,color:'#374151' }}>
          {syncing ? '⏳ Sync…' : '🔄 Sync tout'}
        </button>
      </div>

      {connexions.length === 0 && (
        <div style={{ textAlign:'center',padding:32,color:'#94a3b8',fontSize:13 }}>
          Aucune connexion bancaire — connectez la banque d'un client ci-dessus.
        </div>
      )}

      {connexions.map(conn => {
        const sc = CONN_COLOR[conn.statut] || CONN_COLOR.expire;
        return (
          <div key={conn.id} style={{ padding:'12px 14px',borderRadius:9,border:'1px solid #e2e8f0',marginBottom:8,background:'#fff' }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:600,fontSize:14 }}>{conn.client_nom}</div>
                <div style={{ fontSize:12,color:'#64748b',marginTop:2 }}>
                  {conn.nb_comptes} compte(s) · {conn.nb_mouvements} mouvements
                </div>
                <div style={{ fontSize:11,color:'#94a3b8',marginTop:2 }}>
                  Dernière sync : {fmtSync(conn.derniere_sync)}
                </div>
              </div>
              <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6 }}>
                <span style={{ padding:'2px 8px',borderRadius:20,background:sc.bg,color:sc.color,fontSize:11,fontWeight:600 }}>
                  {conn.statut}
                </span>
                <div style={{ display:'flex',gap:6 }}>
                  <button onClick={() => onSync(conn.client_id)}
                    style={{ padding:'3px 8px',borderRadius:5,border:'1px solid #e2e8f0',background:'#f8fafc',cursor:'pointer',fontSize:11 }}>
                    🔄
                  </button>
                  <button onClick={() => handleDisconnect(conn.id)}
                    style={{ padding:'3px 8px',borderRadius:5,border:'1px solid #fee2e2',background:'#fff5f5',cursor:'pointer',fontSize:11,color:'#dc2626' }}>
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page principale ────────────────────────────────────────────────────────

export default function Lettrage() {
  const [searchParams] = useSearchParams();
  const [clients, setClients]         = useState([]);
  const [connexions, setConnexions]   = useState([]);
  const [comptes, setComptes]         = useState([]);
  const [mouvements, setMouvements]   = useState([]);
  const [configured, setConfigured]   = useState(true);
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [selectedModal, setSelectedModal] = useState(null);
  const [panel, setPanel]             = useState('mouvements');

  // Filtres
  const [filtClient, setFiltClient]   = useState(searchParams.get('client_id') || '');
  const [filtCompte, setFiltCompte]   = useState('');
  const [filtStatut, setFiltStatut]   = useState('non_lettre');
  const [filtDateDeb, setFiltDateDeb] = useState('');
  const [filtDateFin, setFiltDateFin] = useState('');

  const loadConnexions = useCallback(async () => {
    const r = await api.get('/powens/connexions').catch(() => ({ data: [] }));
    setConnexions(r.data);
  }, []);

  const loadComptes = useCallback(async () => {
    const params = filtClient ? `?client_id=${filtClient}` : '';
    const r = await api.get(`/powens/comptes${params}`).catch(() => ({ data: [] }));
    setComptes(r.data);
  }, [filtClient]);

  const loadMouvements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtClient)  params.set('client_id', filtClient);
      if (filtCompte)  params.set('compte_id', filtCompte);
      if (filtStatut)  params.set('statut_lettrage', filtStatut);
      if (filtDateDeb) params.set('date_debut', filtDateDeb);
      if (filtDateFin) params.set('date_fin', filtDateFin);
      const r = await api.get(`/powens/mouvements?${params}`);
      setMouvements(r.data);
    } catch { setMouvements([]); }
    setLoading(false);
  }, [filtClient, filtCompte, filtStatut, filtDateDeb, filtDateFin]);

  useEffect(() => {
    api.get('/powens/status').then(r => setConfigured(r.data.configured)).catch(() => {});
    api.get('/clients').then(r => setClients(r.data || [])).catch(() => {});
    loadConnexions();
  }, [loadConnexions]);

  useEffect(() => { loadComptes(); }, [loadComptes]);
  useEffect(() => { loadMouvements(); }, [loadMouvements]);

  // Retour depuis callback Powens
  useEffect(() => {
    if (searchParams.get('connected')) { loadConnexions(); loadMouvements(); }
  }, [searchParams, loadConnexions, loadMouvements]);

  async function handleSync(clientId) {
    setSyncing(true);
    try {
      const body = clientId ? { client_id: clientId } : {};
      const r = await api.post('/powens/sync', body);
      alert(r.data.message);
      loadConnexions();
      loadMouvements();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur sync');
    } finally { setSyncing(false); }
  }

  async function handleLettrer(mvtId, factureId, action) {
    try {
      if (action === 'ignorer') {
        await api.put(`/powens/mouvements/${mvtId}/ignorer`);
      } else {
        await api.put(`/powens/mouvements/${mvtId}/lettrer`, { facture_id: factureId });
      }
      loadMouvements();
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur lettrage');
    }
  }

  // Stats
  const totalMvt  = mouvements.length;
  const nbLettre  = mouvements.filter(m => m.statut_lettrage === 'lettre').length;
  const nbIgnore  = mouvements.filter(m => m.statut_lettrage === 'ignore').length;
  const nbRestant = mouvements.filter(m => m.statut_lettrage === 'non_lettre').length;
  const sumCredits = mouvements.filter(m => parseFloat(m.montant) > 0).reduce((s,m) => s + parseFloat(m.montant), 0);
  const sumDebits  = mouvements.filter(m => parseFloat(m.montant) < 0).reduce((s,m) => s + parseFloat(m.montant), 0);

  const filteredComptes = filtClient ? comptes.filter(c => String(c.client_id) === String(filtClient)) : comptes;

  return (
    <>
      <div className="page-header">
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          🏦 Lettrage bancaire
        </h1>
        <div style={{ display:'flex',gap:10,alignItems:'center' }}>
          <button onClick={() => setPanel(panel === 'connexions' ? 'mouvements' : 'connexions')}
            style={{ padding:'7px 14px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:13 }}>
            {panel === 'connexions' ? '📋 Mouvements' : '⚙️ Connexions'}
          </button>
          <button onClick={() => handleSync()}
            disabled={syncing}
            style={{ padding:'7px 14px',borderRadius:8,border:'none',background:'#3b82f6',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600,opacity:syncing?0.6:1 }}>
            {syncing ? '⏳ Sync…' : '🔄 Synchroniser'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {!configured && (
          <div style={{ padding:'14px 18px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,marginBottom:20,color:'#c2410c',fontSize:13 }}>
            <strong>⚠️ Powens non configuré</strong> — Renseignez <code>POWENS_CLIENT_ID</code> et <code>POWENS_CLIENT_SECRET</code> dans le fichier <code>.env</code> du backend puis redémarrez l'API.
          </div>
        )}

        {searchParams.get('powens_error') && (
          <div style={{ padding:'12px 18px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,marginBottom:20,color:'#dc2626',fontSize:13 }}>
            Erreur Powens : {searchParams.get('powens_error')}
          </div>
        )}
        {searchParams.get('connected') && (
          <div style={{ padding:'12px 18px',background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,marginBottom:20,color:'#15803d',fontSize:13 }}>
            ✅ Compte bancaire connecté avec succès — synchronisation en cours…
          </div>
        )}

        {panel === 'connexions' ? (
          <div style={{ maxWidth:520 }}>
            <ConnexionsPanel
              clients={clients}
              connexions={connexions}
              loadConnexions={loadConnexions}
              syncing={syncing}
              onSync={handleSync}
            />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:22 }}>
              {[
                { label:'Mouvements', value:totalMvt,   color:'#3b82f6', bg:'#eff6ff' },
                { label:'À lettrer',  value:nbRestant,  color:'#c2410c', bg:'#fff7ed' },
                { label:'Lettrés',    value:nbLettre,   color:'#15803d', bg:'#f0fdf4' },
                { label:'Crédits',    value:fmtMoney(sumCredits), color:'#15803d', bg:'#f0fdf4' },
                { label:'Débits',     value:fmtMoney(Math.abs(sumDebits)), color:'#dc2626', bg:'#fff5f5' },
              ].map(s => (
                <div key={s.label} style={{ padding:'14px 16px',borderRadius:10,background:s.bg,border:'1px solid',borderColor:s.bg }}>
                  <div style={{ fontSize:11,color:'#64748b',fontWeight:500,textTransform:'uppercase',letterSpacing:'.5px' }}>{s.label}</div>
                  <div style={{ fontSize:20,fontWeight:700,color:s.color,marginTop:4 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filtres */}
            <div style={{ display:'flex',gap:10,flexWrap:'wrap',marginBottom:16,padding:'14px 16px',background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0' }}>
              <select value={filtClient} onChange={e => { setFiltClient(e.target.value); setFiltCompte(''); }}
                style={{ padding:'6px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13,minWidth:180 }}>
                <option value="">Tous les clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>

              {filteredComptes.length > 0 && (
                <select value={filtCompte} onChange={e => setFiltCompte(e.target.value)}
                  style={{ padding:'6px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13,minWidth:180 }}>
                  <option value="">Tous les comptes</option>
                  {filteredComptes.map(c => (
                    <option key={c.id} value={c.id}>{c.banque || c.nom} {c.iban ? `(…${c.iban.slice(-4)})` : ''}</option>
                  ))}
                </select>
              )}

              <select value={filtStatut} onChange={e => setFiltStatut(e.target.value)}
                style={{ padding:'6px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13 }}>
                <option value="">Tous statuts</option>
                <option value="non_lettre">Non lettrés</option>
                <option value="lettre">Lettrés</option>
                <option value="ignore">Ignorés</option>
              </select>

              <input type="date" value={filtDateDeb} onChange={e => setFiltDateDeb(e.target.value)}
                placeholder="Du"
                style={{ padding:'6px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13 }} />
              <input type="date" value={filtDateFin} onChange={e => setFiltDateFin(e.target.value)}
                placeholder="Au"
                style={{ padding:'6px 10px',borderRadius:7,border:'1px solid #cbd5e1',fontSize:13 }} />

              {(filtClient||filtCompte||filtDateDeb||filtDateFin) && (
                <button onClick={() => { setFiltClient(''); setFiltCompte(''); setFiltDateDeb(''); setFiltDateFin(''); setFiltStatut('non_lettre'); }}
                  style={{ padding:'6px 12px',borderRadius:7,border:'1px solid #e2e8f0',background:'#fff',cursor:'pointer',fontSize:12,color:'#64748b' }}>
                  ✕ Réinitialiser
                </button>
              )}
            </div>

            {/* Tableau mouvements */}
            {loading ? (
              <div style={{ textAlign:'center',padding:48,color:'#94a3b8' }}>Chargement des mouvements…</div>
            ) : mouvements.length === 0 ? (
              <div style={{ textAlign:'center',padding:56,color:'#94a3b8',background:'#f8fafc',borderRadius:12,border:'2px dashed #e2e8f0' }}>
                <div style={{ fontSize:40,marginBottom:12 }}>🏦</div>
                <div style={{ fontWeight:600,fontSize:15,marginBottom:8 }}>Aucun mouvement</div>
                <div style={{ fontSize:13 }}>
                  {connexions.length === 0
                    ? 'Connectez un compte bancaire via ⚙️ Connexions pour commencer.'
                    : 'Lancez une synchronisation ou affinez les filtres.'}
                </div>
              </div>
            ) : (
              <div style={{ background:'#fff',borderRadius:12,border:'1px solid #e2e8f0',overflow:'hidden' }}>
                <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc',borderBottom:'1px solid #e2e8f0' }}>
                      <th style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#374151' }}>Date</th>
                      <th style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#374151' }}>Libellé</th>
                      <th style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#374151' }}>Client</th>
                      <th style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#374151' }}>Compte</th>
                      <th style={{ padding:'10px 14px',textAlign:'right',fontWeight:600,color:'#374151' }}>Montant</th>
                      <th style={{ padding:'10px 14px',textAlign:'center',fontWeight:600,color:'#374151' }}>Statut</th>
                      <th style={{ padding:'10px 14px',textAlign:'left',fontWeight:600,color:'#374151' }}>Facture liée</th>
                      <th style={{ padding:'10px 14px',textAlign:'center',fontWeight:600,color:'#374151' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.map((m, i) => {
                      const sc = STATUS_COLOR[m.statut_lettrage] || STATUS_COLOR.non_lettre;
                      const montant = parseFloat(m.montant);
                      return (
                        <tr key={m.id} style={{ borderBottom:'1px solid #f1f5f9',background: i%2===0?'#fff':'#fafafa' }}>
                          <td style={{ padding:'9px 14px',whiteSpace:'nowrap',color:'#374151' }}>
                            {fmtDate(m.date_operation)}
                          </td>
                          <td style={{ padding:'9px 14px',maxWidth:260 }}>
                            <div style={{ fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                              {m.libelle_simplifie || m.libelle || '—'}
                            </div>
                            {m.libelle && m.libelle_simplifie && m.libelle !== m.libelle_simplifie && (
                              <div style={{ fontSize:11,color:'#94a3b8',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{m.libelle}</div>
                            )}
                          </td>
                          <td style={{ padding:'9px 14px',color:'#374151' }}>{m.client_nom || '—'}</td>
                          <td style={{ padding:'9px 14px',color:'#64748b',fontSize:12 }}>
                            {m.compte_banque || m.compte_nom || '—'}
                            {m.compte_iban && <div style={{ fontSize:11,color:'#94a3b8' }}>…{m.compte_iban.slice(-4)}</div>}
                          </td>
                          <td style={{ padding:'9px 14px',textAlign:'right',fontWeight:700,color: montant >= 0 ? '#15803d' : '#dc2626',whiteSpace:'nowrap' }}>
                            {montant >= 0 ? '+' : ''}{fmtMoney(montant)}
                          </td>
                          <td style={{ padding:'9px 14px',textAlign:'center' }}>
                            <span style={{ padding:'2px 8px',borderRadius:20,background:sc.bg,color:sc.color,fontSize:11,fontWeight:600,whiteSpace:'nowrap' }}>
                              {sc.label}
                            </span>
                          </td>
                          <td style={{ padding:'9px 14px',color:'#374151' }}>
                            {m.facture_id ? (
                              <div>
                                <div style={{ fontWeight:500 }}>{m.facture_numero}</div>
                                <div style={{ fontSize:11,color:'#64748b' }}>par {m.lettre_par_nom}</div>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding:'9px 14px',textAlign:'center' }}>
                            {m.statut_lettrage === 'non_lettre' && (
                              <div style={{ display:'flex',gap:4,justifyContent:'center' }}>
                                <button onClick={() => setSelectedModal(m)}
                                  style={{ padding:'4px 10px',borderRadius:6,border:'1px solid #3b82f6',background:'#eff6ff',color:'#2563eb',cursor:'pointer',fontSize:12,fontWeight:600 }}>
                                  Lettrer
                                </button>
                                <button onClick={() => handleLettrer(m.id, null, 'ignorer')}
                                  title="Ignorer"
                                  style={{ padding:'4px 8px',borderRadius:6,border:'1px solid #e2e8f0',background:'#f8fafc',color:'#64748b',cursor:'pointer',fontSize:12 }}>
                                  —
                                </button>
                              </div>
                            )}
                            {m.statut_lettrage === 'lettre' && (
                              <button onClick={() => handleLettrer(m.id, null)}
                                title="Délettrer"
                                style={{ padding:'4px 8px',borderRadius:6,border:'1px solid #fee2e2',background:'#fff5f5',color:'#dc2626',cursor:'pointer',fontSize:11 }}>
                                ✕ Délettrer
                              </button>
                            )}
                            {m.statut_lettrage === 'ignore' && (
                              <button onClick={() => handleLettrer(m.id, null)}
                                style={{ padding:'4px 8px',borderRadius:6,border:'1px solid #e2e8f0',background:'#f8fafc',color:'#64748b',cursor:'pointer',fontSize:11 }}>
                                ↩ Rétablir
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {selectedModal && (
        <SuggestionsModal
          mouvement={selectedModal}
          onClose={() => setSelectedModal(null)}
          onLettrer={handleLettrer}
        />
      )}
    </>
  );
}
