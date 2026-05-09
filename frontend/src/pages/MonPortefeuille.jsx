import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

/* ── Helpers ───────────────────────────────────────────────────────── */
const fmt    = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtH   = m => { if (!m) return '—'; const h = Math.floor(m/60), mn = m%60; return mn ? `${h}h${String(mn).padStart(2,'0')}` : `${h}h`; };
const fmtDate= d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : null;
const isLate = d => d && new Date(d) < new Date(new Date().toDateString());

const LDM_COLORS = {
  active:          '#059669',
  signee:          '#0891b2',
  envoyee:         '#8b5cf6',
  validee_interne: '#2563eb',
  a_valider:       '#d97706',
  brouillon:       '#9ca3af',
  resiliee:        '#dc2626',
};

/* ── PctBar ─────────────────────────────────────────────────────────── */
function PctBar({ consomme, budget }) {
  if (!budget) return <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>;
  const pct   = Math.min(200, Math.round((consomme / budget) * 100));
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ minWidth: 60 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{pct}%</div>
      <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

/* ── KpiStrip ───────────────────────────────────────────────────────── */
function KpiStrip({ stats }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 28px 16px', flexShrink: 0 }}>
      {[
        { v: stats.nb,          l: 'Dossiers',        color: '#0f1f4b' },
        { v: fmt(stats.caTheo), l: 'CA théorique',    color: '#6b7c93' },
        { v: fmt(stats.caFac),  l: 'CA facturé',      color: '#059669' },
        { v: fmtH(stats.tTheo), l: 'Temps théorique', color: '#6b7c93' },
        { v: fmtH(stats.tReel), l: 'Temps saisi',     color: '#0891b2' },
      ].map(({ v, l, color }) => (
        <div key={l} style={{ background: '#fff', border: '1px solid #dce6f0', borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '10px 16px', minWidth: 130, boxShadow: '0 1px 3px rgba(15,31,75,0.06)' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1.2 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 3 }}>{l}</div>
        </div>
      ))}
    </div>
  );
}

/* ── DossierTable ───────────────────────────────────────────────────── */
function DossierTable({ rows, showResponsable, selectedId, onSelect }) {
  const totaux = useMemo(() => ({
    caTheo: rows.reduce((s, r) => s + Number(r.budget_honoraires  || 0), 0),
    caFac:  rows.reduce((s, r) => s + Number(r.honoraires_factures|| 0), 0),
    tTheo:  rows.reduce((s, r) => s + Number(r.budget_minutes_total || 0), 0),
    tReel:  rows.reduce((s, r) => s + Number(r.temps_saisi_minutes || 0), 0),
  }), [rows]);

  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>🗂️</div>
      <div style={{ fontWeight: 600 }}>Aucun dossier</div>
    </div>
  );

  const colSpanTotal = (showResponsable ? 4 : 3);

  return (
    <div className="table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th style={{ minWidth: 200 }}>Client</th>
            {showResponsable && <th>Responsable</th>}
            <th>Type mission</th>
            <th style={{ textAlign: 'right' }}>CA théorique</th>
            <th style={{ minWidth: 130 }}>CA facturé</th>
            <th style={{ textAlign: 'right' }}>Temps théo</th>
            <th style={{ minWidth: 130 }}>Temps saisi</th>
            {onSelect && <th style={{ width: 32 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const bH  = Number(r.budget_honoraires   || 0);
            const fH  = Number(r.honoraires_factures || 0);
            const bM  = Number(r.budget_minutes_total|| 0);
            const sM  = Number(r.temps_saisi_minutes || 0);
            const sel = selectedId === r.client_id;
            const ldmColor = LDM_COLORS[r.ldm_statut] || '#9ca3af';
            return (
              <tr
                key={r.client_id}
                onClick={onSelect ? () => onSelect(sel ? null : r) : undefined}
                style={{
                  cursor: onSelect ? 'pointer' : 'default',
                  background: sel ? '#f0f9ff' : undefined,
                  borderLeft: sel ? '3px solid #0891b2' : '3px solid transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = ''; }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Link
                      to={`/clients/${r.client_id}`}
                      onClick={e => e.stopPropagation()}
                      style={{ fontWeight: 700, color: '#0f1f4b', textDecoration: 'none', fontSize: 13 }}
                    >
                      {r.client_nom}
                    </Link>
                    {r.ldm_statut && (
                      <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: ldmColor + '18', color: ldmColor, border: `1px solid ${ldmColor}30`, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        LDM {r.ldm_statut}
                      </span>
                    )}
                  </div>
                </td>
                {showResponsable && (
                  <td style={{ fontSize: 12, color: '#6b7c93', whiteSpace: 'nowrap' }}>
                    {r.responsable_nom || <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                )}
                <td>
                  {r.type_mission
                    ? <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#eef2ff', color: '#4f46e5', fontWeight: 600 }}>{r.type_mission}</span>
                    : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', fontSize: 13, color: bH > 0 ? '#374151' : '#d1d5db' }}>
                  {bH > 0 ? fmt(bH) : '—'}
                </td>
                <td>
                  {fH > 0
                    ? <><div style={{ fontSize: 13, fontWeight: 600, color: '#059669', marginBottom: 3 }}>{fmt(fH)}</div><PctBar consomme={fH} budget={bH} /></>
                    : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', fontSize: 13, color: bM > 0 ? '#374151' : '#d1d5db' }}>
                  {bM > 0 ? fmtH(bM) : '—'}
                </td>
                <td>
                  {sM > 0
                    ? <><div style={{ fontSize: 13, fontWeight: 600, color: '#0891b2', marginBottom: 3 }}>{fmtH(sM)}</div><PctBar consomme={sM} budget={bM} /></>
                    : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                </td>
                {onSelect && <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{sel ? '◀' : '▶'}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f8fafc', fontSize: 13 }}>
            <td colSpan={colSpanTotal}>
              Total — {rows.length} dossier{rows.length !== 1 ? 's' : ''}
            </td>
            <td style={{ textAlign: 'right' }}>{totaux.caTheo > 0 ? fmt(totaux.caTheo) : '—'}</td>
            <td>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{totaux.caFac > 0 ? fmt(totaux.caFac) : '—'}</div>
              <PctBar consomme={totaux.caFac} budget={totaux.caTheo} />
            </td>
            <td style={{ textAlign: 'right' }}>{totaux.tTheo > 0 ? fmtH(totaux.tTheo) : '—'}</td>
            <td>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{totaux.tReel > 0 ? fmtH(totaux.tReel) : '—'}</div>
              <PctBar consomme={totaux.tReel} budget={totaux.tTheo} />
            </td>
            {onSelect && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── TaskPanel ──────────────────────────────────────────────────────── */
const ST = {
  a_faire:  { label: 'À faire',  color: '#3b82f6', bg: '#eff6ff' },
  en_cours: { label: 'En cours', color: '#f59e0b', bg: '#fffbeb' },
  termine:  { label: 'Terminée', color: '#10b981', bg: '#f0fdf4' },
  reporte:  { label: 'Reportée', color: '#9ca3af', bg: '#f9fafb' },
};
const NEXT = { a_faire: 'en_cours', en_cours: 'termine', termine: 'a_faire', reporte: 'a_faire' };
const PC   = { basse: '#9ca3af', normale: '#3b82f6', haute: '#f59e0b', urgente: '#ef4444' };

function TaskPanel({ dossier, onClose }) {
  const [taches,  setTaches]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!dossier) return;
    setLoading(true);
    api.get(`/taches?client_id=${dossier.client_id}`)
      .then(r => setTaches(r.data || []))
      .catch(() => setTaches([]))
      .finally(() => setLoading(false));
  }, [dossier?.client_id]);

  const toggle = async (id, statut) => {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, statut } : t));
    try { await api.put(`/taches/${id}`, { statut }); } catch {}
  };

  const filtrees = showAll ? taches : taches.filter(t => t.statut !== 'termine');

  return (
    <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #dce6f0', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #edf2f7', background: '#f8fafc', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#0f1f4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dossier.client_nom}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link to={`/clients/${dossier.client_id}`} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0891b2', textDecoration: 'none', fontWeight: 600 }}>Cockpit →</Link>
          {dossier.ldm_id && <Link to={`/lettres-mission/${dossier.ldm_id}`} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #a7f3d0', color: '#059669', textDecoration: 'none', fontWeight: 600 }}>LDM →</Link>}
          <button onClick={() => setShowAll(v => !v)} style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 6, border: '1px solid #dce6f0', background: showAll ? '#0f1f4b' : '#fff', color: showAll ? '#fff' : '#6b7c93', cursor: 'pointer', fontWeight: 600 }}>
            {showAll ? 'Actives' : '+ Terminées'}
          </button>
        </div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
        ) : filtrees.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 13 }}>Aucune tâche active</div>
          </div>
        ) : filtrees.map(t => {
          const st    = ST[t.statut] || ST.a_faire;
          const retard = isLate(t.date_echeance) && t.statut !== 'termine';
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f0f4f8', background: retard ? '#fff8f8' : '#fff' }}>
              <button
                onClick={() => toggle(t.id, NEXT[t.statut] || 'en_cours')}
                style={{ marginTop: 2, width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `2px solid ${st.color}`, background: t.statut === 'termine' ? st.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {t.statut === 'termine' && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
              </button>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: PC[t.priorite] || '#9ca3af', flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.statut === 'termine' ? '#9ca3af' : '#0f1f4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.statut === 'termine' ? 'line-through' : 'none' }}>
                  {t.titre || t.libelle}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {t.date_echeance && <span style={{ fontSize: 10, color: retard ? '#dc2626' : '#9ca3af' }}>{retard ? '⚠ ' : ''}{fmtDate(t.date_echeance)}</span>}
                  <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VUE MON PORTEFEUILLE (tous rôles)
   ═══════════════════════════════════════════════════════════════════════ */
function VuePortefeuille({ user, isManager }) {
  const [rows,       setRows]      = useState([]);
  const [collabs,    setCollabs]   = useState([]);
  const [selUid,     setSelUid]    = useState(user.id);
  const [periode,    setPeriode]   = useState('exercice');
  const [search,     setSearch]    = useState('');
  const [selected,   setSelected]  = useState(null);
  const [loading,    setLoading]   = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get('/utilisateurs').then(r => setCollabs((r.data || []).filter(u => u.actif))).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    const uid = isManager ? selUid : user.id;
    if (!uid) return;
    setLoading(true);
    api.get(`/portefeuille/budget?utilisateur_id=${uid}&periode=${periode}`)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [selUid, periode, isManager, user.id]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.client_nom.toLowerCase().includes(q));
  }, [rows, search]);

  const stats = useMemo(() => ({
    nb:     filtered.length,
    caTheo: filtered.reduce((s, r) => s + Number(r.budget_honoraires   || 0), 0),
    caFac:  filtered.reduce((s, r) => s + Number(r.honoraires_factures || 0), 0),
    tTheo:  filtered.reduce((s, r) => s + Number(r.budget_minutes_total|| 0), 0),
    tReel:  filtered.reduce((s, r) => s + Number(r.temps_saisi_minutes || 0), 0),
  }), [filtered]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filtres */}
      <div style={{ padding: '0 28px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <input type="text" placeholder="Rechercher un client…" value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
          className="form-control" style={{ maxWidth: 220 }} />
        {isManager && (
          <select className="form-control" style={{ width: 'auto', minWidth: 190 }}
            value={selUid} onChange={e => { setSelUid(parseInt(e.target.value) || user.id); setSelected(null); }}>
            {collabs.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        )}
        <select className="form-control" style={{ width: 'auto' }} value={periode} onChange={e => setPeriode(e.target.value)}>
          <option value="exercice">Exercice en cours</option>
          <option value="mois">Mois en cours</option>
          <option value="">Toutes périodes</option>
        </select>
      </div>

      {/* KPI */}
      <KpiStrip stats={stats} />

      {/* Table + panneau tâches */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 14 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"><div className="spinner-ring" /></div>
          </div>
        ) : (
          <>
            <DossierTable
              rows={filtered}
              showResponsable={false}
              selectedId={selected?.client_id}
              onSelect={setSelected}
            />
            {selected && <TaskPanel dossier={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VUE CABINET (managers uniquement)
   ═══════════════════════════════════════════════════════════════════════ */
function VueCabinet() {
  const [rows,     setRows]    = useState([]);
  const [collabs,  setCollabs] = useState([]);
  const [filtreUid,setFiltre]  = useState('');
  const [periode,  setPeriode] = useState('exercice');
  const [search,   setSearch]  = useState('');
  const [selected, setSelected]= useState(null);
  const [loading,  setLoading] = useState(false);

  useEffect(() => {
    api.get('/utilisateurs').then(r => setCollabs((r.data || []).filter(u => u.actif && u.role !== 'client'))).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ periode });
    if (filtreUid) qs.set('collaborateur_id', filtreUid);
    api.get(`/portefeuille/vue-cabinet?${qs}`)
      .then(r => setRows((r.data || {}).rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filtreUid, periode]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.client_nom.toLowerCase().includes(q) ||
      (r.responsable_nom || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const stats = useMemo(() => ({
    nb:     filtered.length,
    caTheo: filtered.reduce((s, r) => s + Number(r.budget_honoraires   || 0), 0),
    caFac:  filtered.reduce((s, r) => s + Number(r.honoraires_factures || 0), 0),
    tTheo:  filtered.reduce((s, r) => s + Number(r.budget_minutes_total|| 0), 0),
    tReel:  filtered.reduce((s, r) => s + Number(r.temps_saisi_minutes || 0), 0),
  }), [filtered]);

  // Pills collaborateurs
  const collabsActifs = collabs.filter(u =>
    !['collaborateur_social','collaborateur_juridique','juriste'].includes(u.role_metier)
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filtres */}
      <div style={{ padding: '0 28px 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <input type="text" placeholder="Rechercher client ou responsable…" value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
          className="form-control" style={{ maxWidth: 250 }} />
        <select className="form-control" style={{ width: 'auto' }} value={periode} onChange={e => setPeriode(e.target.value)}>
          <option value="exercice">Exercice en cours</option>
          <option value="mois">Mois en cours</option>
          <option value="">Toutes périodes</option>
        </select>
      </div>

      {/* Pills collaborateurs */}
      <div style={{ padding: '0 28px 12px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        <button
          onClick={() => { setFiltre(''); setSelected(null); }}
          style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', borderColor: !filtreUid ? '#0f1f4b' : '#dce6f0', background: !filtreUid ? '#0f1f4b' : '#fff', color: !filtreUid ? '#fff' : '#6b7c93', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s' }}>
          Tous ({rows.length})
        </button>
        {collabsActifs.map(u => {
          const active = filtreUid === String(u.id);
          return (
            <button key={u.id}
              onClick={() => { setFiltre(String(u.id)); setSelected(null); }}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', borderColor: active ? '#0f1f4b' : '#dce6f0', background: active ? '#0f1f4b' : '#fff', color: active ? '#fff' : '#6b7c93', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s' }}>
              {u.prenom} {u.nom}
            </button>
          );
        })}
      </div>

      {/* KPI */}
      <KpiStrip stats={stats} />

      {/* Table + panneau tâches */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 14 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"><div className="spinner-ring" /></div>
          </div>
        ) : (
          <>
            <DossierTable
              rows={filtered}
              showResponsable={true}
              selectedId={selected?.client_id}
              onSelect={setSelected}
            />
            {selected && <TaskPanel dossier={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
   ═══════════════════════════════════════════════════════════════════════ */
export default function MonPortefeuille() {
  const user      = JSON.parse(localStorage.getItem('parfi_user') || '{}');
  const isManager = ['expert','chef_mission'].includes(user.role) ||
                    ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(user.role_metier);
  const [vue, setVue] = useState('perso');

  const TABS = [
    { key: 'perso',   label: '👤 Mon portefeuille' },
    ...(isManager ? [{ key: 'cabinet', label: '🏢 Vue cabinet' }] : []),
  ];

  const subtitles = {
    perso:   `CA théorique, CA facturé, temps théo et réel · ${[user.prenom, user.nom].filter(Boolean).join(' ')}`,
    cabinet: 'Ensemble des dossiers clients du cabinet avec CA et temps',
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">{vue === 'cabinet' ? 'Portefeuille cabinet' : 'Mon portefeuille'}</h1>
          <p style={{ fontSize: 13, color: '#6b7c93', marginTop: 2 }}>{subtitles[vue]}</p>
        </div>
        {TABS.length > 1 && (
          <div style={{ display: 'flex', background: '#f0f4f8', borderRadius: 8, padding: 3, gap: 2 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setVue(t.key)} style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
                background: vue === t.key ? '#fff' : 'transparent',
                color:      vue === t.key ? '#0f1f4b' : '#6b7c93',
                boxShadow:  vue === t.key ? '0 1px 4px rgba(15,31,75,0.12)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {vue === 'cabinet'
        ? <VueCabinet />
        : <VuePortefeuille user={user} isManager={isManager} />}
    </div>
  );
}
