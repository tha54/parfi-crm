import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PRIORITE_COLORS = { urgente: '#ef4444', haute: '#f59e0b', normale: '#3b82f6', basse: '#9ca3af' };
const STATUT_LABELS = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const ECHEANCE_TYPES = {
  tva_mensuelle: '📅 TVA mensuelle', tva_trimestrielle: '📅 TVA trim.',
  liasse_fiscale: '📋 Liasse fiscale', bilan: '📊 Bilan',
  dsn: '👥 DSN', bulletins_paie: '💸 Bulletins paie',
  acompte_is: '💰 Acompte IS', cfe: '🏢 CFE',
  ca12: '📄 CA12', cotisations_tns: '👤 Cot. TNS', autre: '📌 Autre',
};

function TacheCard({ tache, onChange }) {
  const next = { a_faire: 'en_cours', en_cours: 'termine', termine: 'a_faire' };
  const isLate = tache.statut !== 'termine' && tache.date_echeance && new Date(tache.date_echeance) < new Date();

  const advance = async () => {
    await api.put(`/taches/${tache.id}`, { statut: next[tache.statut] || 'a_faire' }).catch(() => {});
    onChange();
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
      borderLeft: `3px solid ${PRIORITE_COLORS[tache.priorite] || '#3b82f6'}`,
      background: tache.statut === 'termine' ? '#f9fafb' : '#fff',
      borderRadius: '0 6px 6px 0', marginBottom: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,.08)',
    }}>
      <button onClick={advance} style={{
        width: 20, height: 20, borderRadius: '50%', border: `2px solid ${PRIORITE_COLORS[tache.priorite] || '#3b82f6'}`,
        background: tache.statut === 'termine' ? PRIORITE_COLORS[tache.priorite] : 'transparent',
        cursor: 'pointer', flexShrink: 0, marginTop: 2,
      }} title={`Passer à : ${STATUT_LABELS[next[tache.statut]] || ''}`} />
      <div style={{ flex: 1, opacity: tache.statut === 'termine' ? 0.5 : 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13, textDecoration: tache.statut === 'termine' ? 'line-through' : 'none' }}>
          {tache.titre || tache.description}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
          {tache.client_nom && <span style={{ fontSize: 11, color: '#6b7c93' }}>{tache.client_nom}</span>}
          {tache.utilisateur_nom && <span style={{ fontSize: 11, color: '#6b7c93' }}>· {tache.utilisateur_nom}</span>}
          {tache.date_echeance && (
            <span style={{ fontSize: 11, color: isLate ? '#ef4444' : '#6b7c93', fontWeight: isLate ? 600 : 400 }}>
              {isLate ? '⚠️ ' : ''}
              {new Date(tache.date_echeance).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>
      <span style={{ fontSize: 11, color: '#6b7c93', whiteSpace: 'nowrap' }}>{STATUT_LABELS[tache.statut]}</span>
    </div>
  );
}

function EcheanceRow({ e, onChange }) {
  const isLate = e.statut === 'a_faire' && new Date(e.date_echeance) < new Date();
  const toggle = async () => {
    const newStatut = e.statut === 'termine' ? 'a_faire' : 'termine';
    await api.put(`/planning/echeances/${e.id}`, { statut: newStatut }).catch(() => {});
    onChange();
  };
  return (
    <tr style={{ opacity: e.statut === 'termine' ? 0.5 : 1 }}>
      <td>{new Date(e.date_echeance).toLocaleDateString('fr-FR')}</td>
      <td>{ECHEANCE_TYPES[e.type] || e.type}</td>
      <td>{e.label}</td>
      <td>{e.client_nom || <span className="text-muted">—</span>}</td>
      <td>
        <span className={`badge badge-${e.statut === 'termine' ? 'termine' : isLate ? 'inactif' : 'en_cours'}`}>
          {e.statut === 'termine' ? 'Terminé' : isLate ? '⚠️ Retard' : 'À faire'}
        </span>
      </td>
      <td>
        <button className="btn btn-ghost btn-sm" onClick={toggle} style={{ fontSize: 11 }}>
          {e.statut === 'termine' ? 'Rouvrir' : 'Terminer'}
        </button>
      </td>
    </tr>
  );
}

function CalendrierMois({ taches, echeances, mois, annee }) {
  const premier = new Date(annee, mois, 1);
  const dernier = new Date(annee, mois + 1, 0);
  const debutSemaine = new Date(premier);
  debutSemaine.setDate(1 - ((premier.getDay() + 6) % 7));

  const jours = [];
  const cur = new Date(debutSemaine);
  while (cur <= dernier || jours.length % 7 !== 0) {
    jours.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    if (jours.length > 42) break;
  }

  const getEvents = (date) => {
    const iso = date.toISOString().substring(0, 10);
    const t = taches.filter(t => t.date?.substring(0, 10) === iso);
    const e = echeances.filter(e => e.date?.substring(0, 10) === iso);
    return [...t, ...e];
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, minWidth: 700 }}>
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(j => (
          <div key={j} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, padding: '4px 0', color: '#6b7c93' }}>{j}</div>
        ))}
        {jours.map((jour, i) => {
          const events = getEvents(jour);
          const isToday = jour.toDateString() === new Date().toDateString();
          const isCurrentMonth = jour.getMonth() === mois;
          return (
            <div key={i} style={{
              minHeight: 80, padding: 4, borderRadius: 4,
              background: isToday ? '#eff6ff' : isCurrentMonth ? '#fff' : '#f9fafb',
              border: isToday ? '2px solid #3b82f6' : '1px solid #e5e7eb',
            }}>
              <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isCurrentMonth ? '#111' : '#9ca3af', marginBottom: 2 }}>
                {jour.getDate()}
              </div>
              {events.slice(0, 3).map((ev, j) => (
                <div key={j} title={ev.titre} style={{
                  fontSize: 10, padding: '1px 4px', borderRadius: 3, marginBottom: 2, truncate: true,
                  background: ev.type_evenement === 'echeance' ? '#fef3c7' : PRIORITE_COLORS[ev.priorite] || '#3b82f6',
                  color: ev.type_evenement === 'echeance' ? '#92400e' : '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {ev.titre}
                </div>
              ))}
              {events.length > 3 && <div style={{ fontSize: 10, color: '#6b7c93' }}>+{events.length - 3}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Planning() {
  const { user } = useAuth();
  const [tab, setTab] = useState('taches');
  const [taches, setTaches] = useState([]);
  const [echeances, setEcheances] = useState([]);
  const [calData, setCalData] = useState({ taches: [], echeances: [] });
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [generating, setGenerating] = useState(false);
  const [calMois, setCalMois] = useState(new Date().getMonth());
  const [calAnnee, setCalAnnee] = useState(new Date().getFullYear());

  const canManage = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [t, e, s] = await Promise.all([
        api.get('/planning/taches').then(r => r.data),
        api.get('/planning/echeances').then(r => r.data),
        api.get('/planning/stats').then(r => r.data),
      ]);
      setTaches(t);
      setEcheances(e);
      setStats(s);
    } catch {}
    finally { setLoading(false); }
  };

  const loadCal = async () => {
    const debut = new Date(calAnnee, calMois, 1).toISOString().substring(0, 10);
    const fin = new Date(calAnnee, calMois + 1, 0).toISOString().substring(0, 10);
    try {
      const r = await api.get(`/planning/calendrier?debut=${debut}&fin=${fin}`);
      setCalData(r.data);
    } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'calendrier') loadCal(); }, [tab, calMois, calAnnee]);

  const generateEcheances = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/planning/echeances/generate', { annee: new Date().getFullYear() });
      alert(r.data.message);
      await load();
    } catch (e) { alert('Erreur génération'); }
    finally { setGenerating(false); }
  };

  const tachesFiltrees = taches.filter(t => {
    if (filterStatut && t.statut !== filterStatut) return false;
    if (filterPriorite && t.priorite !== filterPriorite) return false;
    return true;
  });

  const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      <div className="page-header">
        <h1>Planning</h1>
        {canManage && (
          <button className="btn btn-ghost btn-sm" onClick={generateEcheances} disabled={generating}>
            {generating ? '⏳ Génération…' : '📅 Générer les échéances fiscales'}
          </button>
        )}
      </div>

      <div className="page-body">
        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'En retard', value: stats.en_retard || 0, color: '#ef4444' },
            { label: "Aujourd'hui", value: stats.aujourd_hui || 0, color: '#f59e0b' },
            { label: 'Cette semaine', value: stats.cette_semaine || 0, color: '#3b82f6' },
            { label: 'Terminées', value: stats.terminees || 0, color: '#10b981' },
            { label: 'Éch. retard', value: stats.echeances_retard || 0, color: '#ef4444' },
            { label: 'Éch. semaine', value: stats.echeances_semaine || 0, color: '#f59e0b' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div><div className="kpi-value" style={{ color: k.color }}>{k.value}</div><div className="kpi-label">{k.label}</div></div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
          {[['taches', '✅ Tâches'], ['echeances', '📅 Échéances fiscales'], ['calendrier', '📆 Calendrier']].map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === k ? 600 : 400, color: tab === k ? '#0f1f4b' : '#6b7c93',
              borderBottom: tab === k ? '2px solid #0f1f4b' : '2px solid transparent', marginBottom: -2,
            }}>{v}</button>
          ))}
        </div>

        {/* Tâches */}
        {tab === 'taches' && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <div className="filters-bar">
                  <select className="form-control" style={{ width: 150 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
                    <option value="">Tous les statuts</option>
                    {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="form-control" style={{ width: 150 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
                    <option value="">Toutes priorités</option>
                    {Object.keys(PRIORITE_COLORS).map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {tachesFiltrees.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">✅</div><p>Aucune tâche</p></div>
            ) : (
              <div>
                {['urgente','haute','normale','basse'].map(priorite => {
                  const group = tachesFiltrees.filter(t => t.priorite === priorite);
                  if (!group.length) return null;
                  return (
                    <div key={priorite} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: PRIORITE_COLORS[priorite], marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {priorite} ({group.length})
                      </div>
                      {group.map(t => <TacheCard key={t.id} tache={t} onChange={load} />)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Échéances */}
        {tab === 'echeances' && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {echeances.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📅</div>
                  <p>Aucune échéance fiscale</p>
                  {canManage && (
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={generateEcheances} disabled={generating}>
                      Générer les échéances de l'année
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Type</th><th>Libellé</th><th>Client</th><th>Statut</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                      {echeances.map(e => <EcheanceRow key={e.id} e={e} onChange={load} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calendrier */}
        {tab === 'calendrier' && (
          <div className="card">
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  if (calMois === 0) { setCalMois(11); setCalAnnee(y => y - 1); }
                  else setCalMois(m => m - 1);
                }}>◀</button>
                <strong>{MOIS_NOMS[calMois]} {calAnnee}</strong>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  if (calMois === 11) { setCalMois(0); setCalAnnee(y => y + 1); }
                  else setCalMois(m => m + 1);
                }}>▶</button>
              </div>
              <CalendrierMois taches={calData.taches || []} echeances={calData.echeances || []} mois={calMois} annee={calAnnee} />
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12 }}>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f6', borderRadius: 2, marginRight: 4 }} />Tâche</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fef3c7', border: '1px solid #d97706', borderRadius: 2, marginRight: 4 }} />Échéance fiscale</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
