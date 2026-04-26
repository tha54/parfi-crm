import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

/* ─── Constants ───────────────────────────────────────────── */
const STATUTS = {
  en_cours:  { label: 'En cours',  color: '#00b4d8', gantt: '#00b4d8' },
  terminee:  { label: 'Terminée',  color: '#00897b', gantt: '#00897b' },
  suspendue: { label: 'Suspendue', color: '#e67e22', gantt: '#e67e22' },
  annulee:   { label: 'Annulée',   color: '#9b9b9b', gantt: '#9b9b9b' },
};
const CATEGORIES = ['tenue_comptable','revision','etablissement_comptes','fiscal','social','paie','juridique','conseil','autre'];
const CAT_LABELS = {
  tenue_comptable: 'Tenue comptable',
  revision: 'Révision',
  etablissement_comptes: 'Comptes annuels',
  fiscal: 'Fiscal',
  social: 'Social',
  paie: 'Paie',
  juridique: 'Juridique',
  conseil: 'Conseil',
  autre: 'Autre',
};

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

/* ─── Progress Bar ────────────────────────────────────────── */
function ProgressBar({ passe, budgete }) {
  if (!budgete || budgete === 0) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const pct = Math.round((passe / budgete) * 100);
  const capped = Math.min(pct, 100);
  const color = pct >= 100 ? '#d63031' : pct >= 80 ? '#e67e22' : '#00897b';
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3, color: 'var(--text-muted)' }}>
        <span style={{ color: pct > 100 ? '#d63031' : 'inherit', fontWeight: pct > 100 ? 700 : 400 }}>
          {Number(passe || 0).toFixed(1)}h / {Number(budgete).toFixed(0)}h
        </span>
        <span style={{ color, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: '#e5e9f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${capped}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

/* ─── Statut Badge ────────────────────────────────────────── */
function StatutBadge({ statut }) {
  const s = STATUTS[statut] || { label: statut, color: '#9b9b9b' };
  return (
    <span className="badge" style={{
      background: s.color + '18',
      color: s.color,
      border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  );
}

/* ─── Saisie Temps Modal ──────────────────────────────────── */
function SaisieTempsModal({ missionId, utilisateurs, onSave, onClose }) {
  const [form, setForm] = useState({
    utilisateur_id: '',
    date: new Date().toISOString().slice(0, 10),
    dureeH: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/missions/${missionId}/saisies`, {
        date: form.date,
        dureeH: Number(form.dureeH),
        description: form.description || null,
        facturable: true,
      });
      onSave();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Saisir du temps</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">Collaborateur</label>
            <select className="form-control" value={form.utilisateur_id} onChange={e => set('utilisateur_id', e.target.value)}>
              <option value="">— Sélectionner —</option>
              {utilisateurs.map(u => (
                <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input className="form-control" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Heures *</label>
              <input className="form-control" type="number" step="0.25" min="0.25" placeholder="1.5" value={form.dureeH} onChange={e => set('dureeH', e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" placeholder="Activité réalisée…" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Mission Row with inline tâches ─────────────────────── */
function MissionRow({ mission, utilisateurs, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [taches, setTaches] = useState(null);
  const [loadingTaches, setLoadingTaches] = useState(false);
  const [saisieOpen, setSaisieOpen] = useState(false);

  const toggleExpand = async () => {
    if (!expanded && taches === null) {
      setLoadingTaches(true);
      try {
        // Try mission.taches JSON first, then API
        if (mission.taches && Array.isArray(mission.taches) && mission.taches.length > 0) {
          setTaches(mission.taches);
        } else {
          const res = await api.get(`/missions/${mission.id}/taches`);
          setTaches(res.data || []);
        }
      } catch {
        setTaches([]);
      } finally {
        setLoadingTaches(false);
      }
    }
    setExpanded(p => !p);
  };

  const pct = mission.tempsBudgeteH > 0
    ? Math.round((Number(mission.tempsPasseH || 0) / Number(mission.tempsBudgeteH)) * 100)
    : 0;

  return (
    <>
      <tr style={{ cursor: 'pointer' }}>
        <td onClick={toggleExpand} style={{ fontWeight: 500 }}>
          <span style={{ marginRight: 6, color: 'var(--text-muted)', fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
          {mission.nom}
        </td>
        <td><span style={{ fontSize: 11, background: '#eef2fa', color: '#475569', padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>{CAT_LABELS[mission.categorie] || mission.categorie}</span></td>
        <td><StatutBadge statut={mission.statut} /></td>
        <td><ProgressBar passe={mission.tempsPasseH} budgete={mission.tempsBudgeteH} /></td>
        <td>
          <div style={{ fontSize: 12 }}>
            <div style={{ color: 'var(--text-muted)' }}>Budg. <strong style={{ color: 'var(--text)' }}>{fmt(mission.honorairesBudgetes)}</strong></div>
            {Number(mission.honorairesFactures) > 0 && (
              <div style={{ color: '#00897b', fontWeight: 600 }}>Fact. {fmt(mission.honorairesFactures)}</div>
            )}
          </div>
        </td>
        <td>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: '#00b4d8', borderColor: '#00b4d840' }}
              onClick={e => { e.stopPropagation(); setSaisieOpen(true); }}
            >
              + Saisir temps
            </button>
          </div>
        </td>
      </tr>

      {/* Inline tâches expansion */}
      {expanded && (
        <tr>
          <td colSpan={6} style={{ padding: 0, background: '#f6f9fc' }}>
            <div style={{ padding: '12px 24px 12px 48px', borderTop: '1px solid var(--border-light)' }}>
              {loadingTaches ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement des tâches…</span>
              ) : taches && taches.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tâche</th>
                      <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Statut</th>
                      <th style={{ textAlign: 'left', padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Échéance</th>
                      <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priorité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taches.map((t, i) => (
                      <tr key={t.id || i} style={{ borderTop: i > 0 ? '1px solid var(--border-light)' : 'none' }}>
                        <td style={{ padding: '6px 12px 6px 0' }}>{t.titre || t.nom || t.description || '—'}</td>
                        <td style={{ padding: '6px 12px 6px 0' }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: t.statut === 'termine' ? '#e8f5f3' : t.statut === 'en_cours' ? '#e0f6fc' : '#f1f5f9', color: t.statut === 'termine' ? '#00897b' : t.statut === 'en_cours' ? '#006f94' : '#475569', fontWeight: 600, textTransform: 'uppercase' }}>
                            {t.statut || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 12px 6px 0', color: 'var(--text-muted)' }}>{fmtDate(t.date_echeance)}</td>
                        <td style={{ padding: '6px 0', color: t.priorite === 'urgente' ? '#d63031' : t.priorite === 'haute' ? '#e67e22' : 'var(--text-muted)' }}>
                          {t.priorite || 'normale'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune tâche associée à cette mission.</span>
              )}
            </div>
          </td>
        </tr>
      )}

      {saisieOpen && (
        <SaisieTempsModal
          missionId={mission.id}
          utilisateurs={utilisateurs}
          onSave={() => { setSaisieOpen(false); onRefresh(); }}
          onClose={() => setSaisieOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Tab 1: Liste ────────────────────────────────────────── */
function TabListe({ missions, clients, utilisateurs, loading, onRefresh }) {
  const [filterStatut, setFilterStatut] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterClient, setFilterClient] = useState('');

  const filtered = missions.filter(m => {
    if (filterStatut && m.statut !== filterStatut) return false;
    if (filterCategorie && m.categorie !== filterCategorie) return false;
    if (filterClient && String(m.client_id) !== String(filterClient) && String(m.contactId) !== String(filterClient)) return false;
    return true;
  });

  // KPIs
  const enCours = missions.filter(m => m.statut === 'en_cours');
  const totalPasse = missions.reduce((s, m) => s + Number(m.tempsPasseH || 0), 0);
  const totalBudgete = missions.reduce((s, m) => s + Number(m.tempsBudgeteH || 0), 0);
  const totalHonoBudg = missions.reduce((s, m) => s + Number(m.honorairesBudgetes || 0), 0);
  const totalHonoFact = missions.reduce((s, m) => s + Number(m.honorairesFactures || 0), 0);
  const rentabilite = totalHonoBudg > 0 ? Math.round((totalHonoFact / totalHonoBudg) * 100) : 0;
  const enRetard = missions.filter(m => m.statut === 'en_cours' && Number(m.tempsPasseH || 0) > Number(m.tempsBudgeteH || 0) && Number(m.tempsBudgeteH || 0) > 0);

  // Group by client
  const grouped = {};
  filtered.forEach(m => {
    const key = m.client_nom || m.contactNom || `client_${m.client_id || m.contactId}` || 'Sans client';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });
  const sortedClients = Object.keys(grouped).sort();

  return (
    <div>
      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-icon">🎯</div>
          <div>
            <div className="kpi-value">{enCours.length}</div>
            <div className="kpi-label">Missions en cours</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">⏱</div>
          <div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{totalPasse.toFixed(0)}h</div>
            <div className="kpi-label">Temps passé total</div>
            <div className="kpi-sub">{totalBudgete.toFixed(0)}h budgétées</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">📈</div>
          <div>
            <div className="kpi-value" style={{ color: rentabilite >= 80 ? '#00897b' : rentabilite >= 60 ? '#e67e22' : '#d63031' }}>
              {rentabilite}%
            </div>
            <div className="kpi-label">Rentabilité globale</div>
            <div className="kpi-sub">{fmt(totalHonoFact)} / {fmt(totalHonoBudg)}</div>
          </div>
        </div>
        <div className="kpi-card" style={{ borderLeft: enRetard.length > 0 ? '3px solid #d63031' : undefined }}>
          <div className="kpi-icon">⚠️</div>
          <div>
            <div className="kpi-value" style={{ color: enRetard.length > 0 ? '#d63031' : 'var(--primary)' }}>{enRetard.length}</div>
            <div className="kpi-label">Missions en dépassement</div>
            <div className="kpi-sub">Temps passé &gt; budgété</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-control" style={{ width: 'auto', minWidth: 130 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto', minWidth: 160 }} value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
        <select className="form-control" style={{ width: 'auto', minWidth: 180 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom || c.raisonSociale}</option>)}
        </select>
        {(filterStatut || filterCategorie || filterClient) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterStatut(''); setFilterCategorie(''); setFilterClient(''); }}>
            Réinitialiser
          </button>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{filtered.length} mission{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table grouped by client */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune mission trouvée</div>
      ) : (
        sortedClients.map(clientNom => (
          <div key={clientNom} className="card" style={{ marginBottom: 16 }}>
            {/* Client header */}
            <div style={{
              padding: '12px 20px',
              borderBottom: '2px solid var(--border)',
              background: 'linear-gradient(90deg, #0f1f4b08 0%, transparent 100%)',
              borderRadius: '10px 10px 0 0',
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>{clientNom}</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                {grouped[clientNom].length} mission{grouped[clientNom].length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Catégorie</th>
                    <th>Statut</th>
                    <th>Temps passé / budgété</th>
                    <th>Honoraires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[clientNom].map(mission => (
                    <MissionRow
                      key={mission.id}
                      mission={mission}
                      utilisateurs={utilisateurs}
                      onRefresh={onRefresh}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Tab 2: Gantt Planning ───────────────────────────────── */
function TabPlanning({ missions }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Window: current month ± 2 months
  const windowStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const windowEnd = new Date(today.getFullYear(), today.getMonth() + 3, 0); // last day of +2 months

  const totalDays = Math.round((windowEnd - windowStart) / 86400000) + 1;

  // Build week headers
  const weeks = [];
  const cur = new Date(windowStart);
  // Align to Monday
  const dayOfWeek = cur.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  cur.setDate(cur.getDate() + diff);
  while (cur <= windowEnd) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  const dayPct = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const offset = Math.round((d - windowStart) / 86400000);
    return Math.max(0, Math.min(100, (offset / totalDays) * 100));
  };

  const todayPct = dayPct(today);

  const LABEL_W = 200; // px for mission label column
  const BAR_AREA = 'calc(100% - 200px)';

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 800 }}>
          {/* Header row: month + weeks */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: '#f0f4f8' }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: '10px 16px', fontWeight: 700, fontSize: 12, color: 'var(--primary)', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
              Mission / Client
            </div>
            <div style={{ flex: 1, position: 'relative', height: 38 }}>
              {weeks.map((wk, i) => {
                const pct = dayPct(wk);
                const label = wk.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 4,
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    borderLeft: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </div>
                );
              })}
              {/* Today marker in header */}
              <div style={{
                position: 'absolute',
                left: `${todayPct}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: '#d63031',
                zIndex: 5,
              }} />
            </div>
          </div>

          {/* Mission rows */}
          {missions.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune mission à afficher.</div>
          ) : missions.map((m, idx) => {
            const hasDate = m.dateDebut && m.dateFin;
            let leftPct = 0, widthPct = 0;
            if (hasDate) {
              const start = dayPct(m.dateDebut);
              const end = dayPct(m.dateFin);
              leftPct = Math.max(0, start);
              widthPct = Math.max(0.5, end - leftPct);
              if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
            }
            const barColor = STATUTS[m.statut]?.gantt || '#9b9b9b';
            const clientLabel = m.client_nom || m.contactNom || 'Client inconnu';

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border-light)',
                  background: idx % 2 === 0 ? 'white' : '#fafbfc',
                  minHeight: 44,
                  alignItems: 'center',
                }}
              >
                {/* Label */}
                <div style={{
                  width: LABEL_W,
                  minWidth: LABEL_W,
                  padding: '8px 16px',
                  borderRight: '1px solid var(--border)',
                  flexShrink: 0,
                }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nom}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientLabel}</div>
                </div>

                {/* Bar area */}
                <div style={{ flex: 1, position: 'relative', height: 44, display: 'flex', alignItems: 'center' }}>
                  {/* Week grid lines */}
                  {weeks.map((wk, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${dayPct(wk)}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: 'var(--border-light)',
                    }} />
                  ))}

                  {/* Today line */}
                  <div style={{
                    position: 'absolute',
                    left: `${todayPct}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#d63031',
                    zIndex: 4,
                  }} />

                  {/* Mission bar */}
                  {hasDate ? (
                    <div
                      title={`${m.nom} — ${fmtDate(m.dateDebut)} → ${fmtDate(m.dateFin)}`}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        height: 22,
                        background: barColor,
                        borderRadius: 4,
                        opacity: 0.85,
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        paddingLeft: 6,
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.nom}
                      </span>
                    </div>
                  ) : (
                    <div style={{
                      position: 'absolute',
                      left: 8,
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                    }}>
                      Dates non définies
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap', background: '#f9fafb' }}>
            {Object.entries(STATUTS).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 14, height: 10, background: v.gantt, borderRadius: 2, opacity: 0.85 }} />
                {v.label}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#d63031' }}>
              <div style={{ width: 2, height: 12, background: '#d63031' }} />
              Aujourd'hui
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab 3: Charge ───────────────────────────────────────── */
function TabCharge() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/rentabilite/charge-travail')
      .then(r => setData(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>;
  if (!data.length) return <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>Aucune donnée disponible.</div>;

  return (
    <div className="card">
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Collaborateur</th>
              <th>Missions actives</th>
              <th>Heures budgétées</th>
              <th>Heures passées</th>
              <th>Taux d'occupation</th>
              <th>Tâches à venir (7j)</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const budgete = Number(row.tempsBudgeteTotal || 0);
              const passe = Number(row.tempsPasseTotal || 0);
              const taux = budgete > 0 ? Math.round((passe / budgete) * 100) : 0;
              const tauxColor = taux >= 100 ? '#d63031' : taux >= 80 ? '#e67e22' : '#00897b';
              return (
                <tr key={row.id}>
                  <td style={{ fontWeight: 600 }}>{row.nom}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{row.nbMissions || 0}</span>
                  </td>
                  <td>{budgete.toFixed(1)}h</td>
                  <td style={{ color: passe > budgete && budgete > 0 ? '#d63031' : 'inherit', fontWeight: passe > budgete && budgete > 0 ? 700 : 400 }}>
                    {passe.toFixed(1)}h
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 80, height: 6, background: '#e5e9f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, taux)}%`, height: '100%', background: tauxColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontWeight: 700, color: tauxColor, fontSize: 12 }}>{taux}%</span>
                    </div>
                  </td>
                  <td>
                    {Number(row.tachesSemaine || 0) > 0 ? (
                      <span className="badge" style={{ background: '#fff0f0', color: '#d63031', border: '1px solid #d6303130' }}>
                        {row.tachesSemaine} tâche{row.tachesSemaine !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Main Travaux Page ───────────────────────────────────── */
export default function Travaux() {
  const [activeTab, setActiveTab] = useState('liste');
  const [missions, setMissions] = useState([]);
  const [clients, setClients] = useState([]);
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, cRes, uRes] = await Promise.all([
        api.get('/missions'),
        api.get('/clients'),
        api.get('/utilisateurs'),
      ]);
      setMissions(mRes.data || []);
      setClients(cRes.data || []);
      setUtilisateurs(uRes.data || []);
    } catch (e) {
      console.error('Erreur chargement Travaux:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { key: 'liste',    label: 'Liste' },
    { key: 'planning', label: 'Planning (Gantt)' },
    { key: 'charge',   label: 'Charge' },
  ];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Travaux</h1>
          <p className="page-subtitle">
            {missions.length} mission{missions.length !== 1 ? 's' : ''} — {missions.filter(m => m.statut === 'en_cours').length} en cours
          </p>
        </div>
      </div>

      <div className="page-body">
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: activeTab === tab.key ? 700 : 400,
                color: activeTab === tab.key ? '#0f1f4b' : 'var(--text-muted)',
                borderBottom: activeTab === tab.key ? '2px solid #00b4d8' : '2px solid transparent',
                marginBottom: -2,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'liste' && (
          <TabListe
            missions={missions}
            clients={clients}
            utilisateurs={utilisateurs}
            loading={loading}
            onRefresh={load}
          />
        )}
        {activeTab === 'planning' && (
          <TabPlanning missions={missions} />
        )}
        {activeTab === 'charge' && (
          <TabCharge />
        )}
      </div>
    </div>
  );
}
