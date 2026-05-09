import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

/* ── Helpers ─────────────────────────────────────────────────────── */
const fmt    = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtH   = m => { if (!m) return '—'; const h = Math.floor(m/60), mn = m%60; return mn ? `${h}h${String(mn).padStart(2,'0')}` : `${h}h`; };
const fmtDate= d => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : null;
const isLate = d => d && new Date(d) < new Date(new Date().toDateString());
const pctColor = p => p == null ? '#9ca3af' : p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#22c55e';
const calcPct  = (a, b) => b > 0 ? Math.round((a / b) * 100) : null;

const LDM_COLOR = {
  active: '#059669', signee: '#0891b2', envoyee: '#8b5cf6',
  validee_interne: '#2563eb', a_valider: '#d97706', brouillon: '#9ca3af', resiliee: '#dc2626',
};

/* ── PctBar ──────────────────────────────────────────────────────── */
function PctBar({ consomme, budget }) {
  if (!budget) return null;
  const pct   = Math.min(200, Math.round((consomme / budget) * 100));
  const color = pctColor(pct);
  return (
    <div style={{ marginTop: 3, minWidth: 60 }}>
      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 4, background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

/* ── KpiStrip ────────────────────────────────────────────────────── */
function KpiStrip({ stats }) {
  const caPct = calcPct(stats.caFac,  stats.caTheo);
  const tPct  = calcPct(stats.tReel,  stats.tTheo);
  const caCol = pctColor(caPct);
  const tCol  = pctColor(tPct);

  const tiles = [
    { v: stats.nb,          s: 'dossiers',           color: '#0f1f4b',  icon: '🗂️'  },
    { v: fmt(stats.caTheo), s: 'CA théorique',        color: '#8b5cf6',  icon: '📋'  },
    { v: fmt(stats.caFac),  s: `CA facturé${caPct != null ? ` · ${caPct}%` : ''}`, color: caCol, icon: '💰' },
    { v: fmtH(stats.tTheo), s: 'Temps théorique',     color: '#6366f1',  icon: '⏳'  },
    { v: fmtH(stats.tReel), s: `Temps saisi${tPct  != null ? ` · ${tPct}%`  : ''}`, color: tCol,  icon: '⏱'  },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, padding: '0 28px 14px', flexWrap: 'wrap', flexShrink: 0 }}>
      {tiles.map(({ v, s, color, icon }) => (
        <div key={s} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', minWidth: 120, boxShadow: '0 1px 4px rgba(15,31,75,0.06)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, display: 'flex', gap: 4, alignItems: 'center' }}>
            <span>{icon}</span><span>{s}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Sort header cell ────────────────────────────────────────────── */
function Th({ col, label, sortCol, sortDir, onSort, style, align }) {
  const active = sortCol === col;
  return (
    <th onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: align || 'left', ...style }}>
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: active ? 0.9 : 0.25, color: active ? '#0f1f4b' : undefined }}>
        {active && sortDir === 'desc' ? '↓' : '↑'}
      </span>
    </th>
  );
}

/* ── Shared row renderer ─────────────────────────────────────────── */
function DossierRow({ r, showResponsable, isSelected, onSelect }) {
  const bH  = Number(r.budget_honoraires    || 0);
  const fH  = Number(r.honoraires_factures  || 0);
  const bM  = Number(r.budget_minutes_total || 0);
  const sM  = Number(r.temps_saisi_minutes  || 0);
  const caP = calcPct(fH, bH);
  const tP  = calcPct(sM, bM);
  const ldmC = LDM_COLOR[r.ldm_statut] || '#9ca3af';

  return (
    <tr
      onClick={onSelect ? () => onSelect(isSelected ? null : r) : undefined}
      style={{
        cursor: onSelect ? 'pointer' : 'default',
        background: isSelected ? '#f0f9ff' : undefined,
        borderLeft: `3px solid ${isSelected ? '#0891b2' : 'transparent'}`,
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!isSelected && onSelect) e.currentTarget.style.background = '#f8fafc'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = ''; }}
    >
      {/* Client */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Link to={`/clients/${r.client_id}`} onClick={e => e.stopPropagation()}
            style={{ fontWeight: 700, color: '#0f1f4b', textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap' }}>
            {r.client_nom}
          </Link>
          {r.ldm_statut && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap',
              background: ldmC + '14', color: ldmC, border: `1px solid ${ldmC}30` }}>
              {r.ldm_statut}
            </span>
          )}
        </div>
      </td>

      {/* Responsable (vue cabinet) */}
      {showResponsable && (
        <td style={{ fontSize: 12, color: '#6b7c93', whiteSpace: 'nowrap' }}>
          {r.responsable_nom || <span style={{ color: '#d1d5db' }}>—</span>}
        </td>
      )}

      {/* Type mission */}
      <td>
        {r.type_mission
          ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#eef2ff', color: '#4f46e5', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.type_mission}</span>
          : <span style={{ color: '#d1d5db' }}>—</span>}
      </td>

      {/* CA théorique */}
      <td style={{ textAlign: 'right', fontSize: 13, color: bH > 0 ? '#374151' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
        {bH > 0 ? fmt(bH) : '—'}
      </td>

      {/* CA facturé */}
      <td style={{ minWidth: 110 }}>
        {fH > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: pctColor(caP), fontVariantNumeric: 'tabular-nums' }}>{fmt(fH)}</span>
              {caP != null && <span style={{ fontSize: 10, color: pctColor(caP), opacity: 0.8 }}>{caP}%</span>}
            </div>
            <PctBar consomme={fH} budget={bH} />
          </>
        ) : <span style={{ color: '#d1d5db' }}>—</span>}
      </td>

      {/* Temps théorique */}
      <td style={{ textAlign: 'right', fontSize: 13, color: bM > 0 ? '#374151' : '#d1d5db', fontVariantNumeric: 'tabular-nums' }}>
        {bM > 0 ? fmtH(bM) : '—'}
      </td>

      {/* Temps saisi */}
      <td style={{ minWidth: 110 }}>
        {sM > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: pctColor(tP), fontVariantNumeric: 'tabular-nums' }}>{fmtH(sM)}</span>
              {tP != null && <span style={{ fontSize: 10, color: pctColor(tP), opacity: 0.8 }}>{tP}%</span>}
            </div>
            <PctBar consomme={sM} budget={bM} />
          </>
        ) : <span style={{ color: '#d1d5db' }}>—</span>}
      </td>

      {/* Toggle tâches */}
      {onSelect && (
        <td style={{ textAlign: 'center', width: 28 }}>
          <span style={{ fontSize: 11, color: isSelected ? '#0891b2' : '#cbd5e1' }}>
            {isSelected ? '◀' : '▶'}
          </span>
        </td>
      )}
    </tr>
  );
}

/* ── Shared table headers ────────────────────────────────────────── */
function TableHead({ showResponsable, onSelect, sortCol, sortDir, onSort }) {
  return (
    <thead>
      <tr>
        <Th col="client_nom" label="Client"         sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={{ minWidth: 190 }} />
        {showResponsable && <Th col="responsable_nom" label="Responsable" sortCol={sortCol} sortDir={sortDir} onSort={onSort} />}
        <th>Type mission</th>
        <Th col="budget_honoraires"   label="CA théorique" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
        <Th col="honoraires_factures" label="CA facturé"   sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={{ minWidth: 120 }} />
        <Th col="budget_minutes_total"  label="Temps théo" sortCol={sortCol} sortDir={sortDir} onSort={onSort} align="right" />
        <Th col="temps_saisi_minutes"   label="Temps saisi" sortCol={sortCol} sortDir={sortDir} onSort={onSort} style={{ minWidth: 120 }} />
        {onSelect && <th style={{ width: 28 }} />}
      </tr>
    </thead>
  );
}

/* ── Flat table with sorting ─────────────────────────────────────── */
function DossierTable({ rows, showResponsable, selectedId, onSelect }) {
  const [sortCol, setSortCol] = useState('client_nom');
  const [sortDir, setSortDir] = useState('asc');
  const onSort = col => { setSortDir(d => col === sortCol ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); setSortCol(col); };

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb||'').toLowerCase(); }
    else { va = Number(va); vb = Number(vb); }
    const r = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === 'asc' ? r : -r;
  }), [rows, sortCol, sortDir]);

  const tot = useMemo(() => ({
    bH: rows.reduce((s,r) => s+Number(r.budget_honoraires||0), 0),
    fH: rows.reduce((s,r) => s+Number(r.honoraires_factures||0), 0),
    bM: rows.reduce((s,r) => s+Number(r.budget_minutes_total||0), 0),
    sM: rows.reduce((s,r) => s+Number(r.temps_saisi_minutes||0), 0),
  }), [rows]);

  if (rows.length === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 8 }}>
      <span style={{ fontSize: 40 }}>🗂️</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>Aucun dossier</span>
    </div>
  );

  const colSpan = (showResponsable ? 3 : 2);

  return (
    <div className="table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
      <table>
        <TableHead showResponsable={showResponsable} onSelect={onSelect} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {sorted.map(r => (
            <DossierRow key={r.client_id} r={r} showResponsable={showResponsable}
              isSelected={selectedId === r.client_id} onSelect={onSelect} />
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f8fafc', fontSize: 13 }}>
            <td colSpan={colSpan}>
              <span style={{ color: '#374151' }}>Total</span>
              <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>{rows.length} dossier{rows.length !== 1 ? 's' : ''}</span>
            </td>
            <td style={{ textAlign: 'right' }}>{tot.bH > 0 ? fmt(tot.bH) : '—'}</td>
            <td>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: pctColor(calcPct(tot.fH, tot.bH)) }}>{tot.fH > 0 ? fmt(tot.fH) : '—'}</span>
                {tot.bH > 0 && <span style={{ fontSize: 10, color: pctColor(calcPct(tot.fH, tot.bH)) }}>{calcPct(tot.fH, tot.bH)}%</span>}
              </div>
              <PctBar consomme={tot.fH} budget={tot.bH} />
            </td>
            <td style={{ textAlign: 'right' }}>{tot.bM > 0 ? fmtH(tot.bM) : '—'}</td>
            <td>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ color: pctColor(calcPct(tot.sM, tot.bM)) }}>{tot.sM > 0 ? fmtH(tot.sM) : '—'}</span>
                {tot.bM > 0 && <span style={{ fontSize: 10, color: pctColor(calcPct(tot.sM, tot.bM)) }}>{calcPct(tot.sM, tot.bM)}%</span>}
              </div>
              <PctBar consomme={tot.sM} budget={tot.bM} />
            </td>
            {onSelect && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ── Grouped table (Vue Cabinet) ─────────────────────────────────── */
function GroupedTable({ rows, selectedId, onSelect }) {
  const [sortCol, setSortCol] = useState('client_nom');
  const [sortDir, setSortDir] = useState('asc');
  const onSort = col => { setSortDir(d => col === sortCol ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); setSortCol(col); };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.responsable_id ?? '__none__';
      if (!map.has(key)) map.set(key, { key, nom: r.responsable_nom || 'Non attribué', rows: [] });
      map.get(key).rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [rows]);

  const [collapsed, setCollapsed] = useState({});
  const toggleGroup = key => setCollapsed(p => ({ ...p, [key]: !p[key] }));
  const allOpen = Object.values(collapsed).every(v => !v);

  const sortRows = rs => [...rs].sort((a, b) => {
    let va = a[sortCol] ?? '', vb = b[sortCol] ?? '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb||'').toLowerCase(); }
    else { va = Number(va); vb = Number(vb); }
    const r = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDir === 'asc' ? r : -r;
  });

  if (rows.length === 0) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 8 }}>
      <span style={{ fontSize: 40 }}>🗂️</span><span style={{ fontWeight: 600, fontSize: 14 }}>Aucun dossier</span>
    </div>
  );

  const NB_COLS = 8; // client + type + CA théo + CA fac + temps théo + temps sai + arrow

  return (
    <div className="table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setCollapsed(allOpen ? Object.fromEntries(grouped.map(g => [g.key, true])) : {})}
          style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7c93', cursor: 'pointer' }}>
          {allOpen ? 'Tout replier ▲' : 'Tout déplier ▼'}
        </button>
      </div>
      <table>
        <TableHead showResponsable={false} onSelect={onSelect} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {grouped.map(group => {
            const isOpen = !collapsed[group.key];
            const g = {
              bH: group.rows.reduce((s,r) => s+Number(r.budget_honoraires||0),   0),
              fH: group.rows.reduce((s,r) => s+Number(r.honoraires_factures||0), 0),
              bM: group.rows.reduce((s,r) => s+Number(r.budget_minutes_total||0),0),
              sM: group.rows.reduce((s,r) => s+Number(r.temps_saisi_minutes||0), 0),
            };
            const caP = calcPct(g.fH, g.bH);
            const tP  = calcPct(g.sM, g.bM);
            const caC = pctColor(caP);
            const tC  = pctColor(tP);
            return [
              /* Group header row */
              <tr key={`gh-${group.key}`} onClick={() => toggleGroup(group.key)}
                style={{ background: '#f1f5f9', cursor: 'pointer', borderTop: '2px solid #e2e8f0' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#e9eef5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}>
                <td colSpan={NB_COLS} style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1f4b', minWidth: 160 }}>{group.nom}</span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#0f1f4b14', color: '#0f1f4b', fontWeight: 600 }}>
                      {group.rows.length} dossier{group.rows.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7c93' }}>CA théo&nbsp;<strong style={{ color: '#374151' }}>{fmt(g.bH)}</strong></span>
                    <span style={{ fontSize: 12 }}>CA facturé&nbsp;
                      <strong style={{ color: caC }}>{fmt(g.fH)}</strong>
                      {caP != null && <span style={{ fontSize: 10, color: caC, opacity: 0.8 }}>&nbsp;{caP}%</span>}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7c93' }}>Temps théo&nbsp;<strong style={{ color: '#374151' }}>{fmtH(g.bM)}</strong></span>
                    <span style={{ fontSize: 12 }}>Saisi&nbsp;
                      <strong style={{ color: tC }}>{fmtH(g.sM)}</strong>
                      {tP != null && <span style={{ fontSize: 10, color: tC, opacity: 0.8 }}>&nbsp;{tP}%</span>}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </td>
              </tr>,
              /* Data rows */
              isOpen && sortRows(group.rows).map(r => (
                <DossierRow key={r.client_id} r={r} showResponsable={false}
                  isSelected={selectedId === r.client_id} onSelect={onSelect} />
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── TaskPanel ───────────────────────────────────────────────────── */
const ST   = { a_faire: { label: 'À faire', color: '#3b82f6', bg: '#eff6ff' }, en_cours: { label: 'En cours', color: '#f59e0b', bg: '#fffbeb' }, termine: { label: 'Terminée', color: '#10b981', bg: '#f0fdf4' }, reporte: { label: 'Reportée', color: '#9ca3af', bg: '#f9fafb' } };
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

  const actives = taches.filter(t => t.statut !== 'termine');
  const filtrees = showAll ? taches : actives;

  return (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,31,75,0.08)' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f0f4f8', background: 'linear-gradient(135deg, #f8fafc 0%, #f0f9ff 100%)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0f1f4b', lineHeight: 1.3 }}>{dossier.client_nom}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0, marginTop: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to={`/clients/${dossier.client_id}`} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0891b2', textDecoration: 'none', fontWeight: 600 }}>Cockpit →</Link>
          {dossier.ldm_id && <Link to={`/lettres-mission/${dossier.ldm_id}`} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #a7f3d0', color: '#059669', textDecoration: 'none', fontWeight: 600 }}>LDM →</Link>}
          <span style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 7px', borderRadius: 20, background: actives.length > 0 ? '#eff6ff' : '#f0fdf4', color: actives.length > 0 ? '#3b82f6' : '#10b981', fontWeight: 600 }}>
            {actives.length} active{actives.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setShowAll(v => !v)} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid #e5e7eb', background: showAll ? '#0f1f4b' : '#fff', color: showAll ? '#fff' : '#6b7c93', cursor: 'pointer', fontWeight: 600 }}>
            {showAll ? '— terminées' : '+ terminées'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
        ) : filtrees.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Aucune tâche active</div>
          </div>
        ) : filtrees.map(t => {
          const st     = ST[t.statut] || ST.a_faire;
          const retard = isLate(t.date_echeance) && t.statut !== 'termine';
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', borderBottom: '1px solid #f3f4f6', background: retard ? '#fffbfb' : '#fff' }}>
              <button onClick={() => toggle(t.id, NEXT[t.statut] || 'en_cours')}
                style={{ marginTop: 2, width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `2px solid ${st.color}`, background: t.statut === 'termine' ? st.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t.statut === 'termine' && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
              </button>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: PC[t.priorite] || '#9ca3af', flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: t.statut === 'termine' ? 400 : 600, color: t.statut === 'termine' ? '#9ca3af' : '#0f1f4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.statut === 'termine' ? 'line-through' : 'none' }}>
                  {t.titre || t.libelle}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  {t.date_echeance && <span style={{ fontSize: 10, color: retard ? '#dc2626' : '#9ca3af' }}>{retard ? '⚠ ' : ''}{fmtDate(t.date_echeance)}</span>}
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VUE MON PORTEFEUILLE
   ═══════════════════════════════════════════════════════════════════ */
function VuePortefeuille({ user, isManager }) {
  const [rows,    setRows]   = useState([]);
  const [collabs, setCollabs]= useState([]);
  const [selUid,  setSelUid] = useState(user.id);
  const [periode, setPeriode]= useState('exercice');
  const [search,  setSearch] = useState('');
  const [selected,setSelected]=useState(null);
  const [loading, setLoading]= useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get('/utilisateurs').then(r => setCollabs((r.data||[]).filter(u => u.actif))).catch(() => {});
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
    caTheo: filtered.reduce((s,r) => s+Number(r.budget_honoraires||0), 0),
    caFac:  filtered.reduce((s,r) => s+Number(r.honoraires_factures||0), 0),
    tTheo:  filtered.reduce((s,r) => s+Number(r.budget_minutes_total||0), 0),
    tReel:  filtered.reduce((s,r) => s+Number(r.temps_saisi_minutes||0), 0),
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
        {loading && <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Chargement…</span>}
      </div>

      <KpiStrip stats={stats} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 14 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"><div className="spinner-ring" /></div>
          </div>
        ) : (
          <>
            <DossierTable rows={filtered} showResponsable={false} selectedId={selected?.client_id} onSelect={setSelected} />
            {selected && <TaskPanel dossier={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   VUE CABINET
   ═══════════════════════════════════════════════════════════════════ */
function VueCabinet() {
  const [rows,     setRows]   = useState([]);
  const [collabs,  setCollabs]= useState([]);
  const [filtreUid,setFiltre] = useState('');
  const [periode,  setPeriode]= useState('exercice');
  const [search,   setSearch] = useState('');
  const [selected, setSelected]=useState(null);
  const [loading,  setLoading]= useState(false);

  useEffect(() => {
    api.get('/utilisateurs').then(r => setCollabs((r.data||[]).filter(u => u.actif && u.role !== 'client'))).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ periode });
    if (filtreUid) qs.set('collaborateur_id', filtreUid);
    api.get(`/portefeuille/vue-cabinet?${qs}`)
      .then(r => setRows((r.data||{}).rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filtreUid, periode]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.client_nom.toLowerCase().includes(q) || (r.responsable_nom||'').toLowerCase().includes(q));
  }, [rows, search]);

  const stats = useMemo(() => ({
    nb:     filtered.length,
    caTheo: filtered.reduce((s,r) => s+Number(r.budget_honoraires||0), 0),
    caFac:  filtered.reduce((s,r) => s+Number(r.honoraires_factures||0), 0),
    tTheo:  filtered.reduce((s,r) => s+Number(r.budget_minutes_total||0), 0),
    tReel:  filtered.reduce((s,r) => s+Number(r.temps_saisi_minutes||0), 0),
  }), [filtered]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Filtres */}
      <div style={{ padding: '0 28px 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <input type="text" placeholder="Client ou responsable…" value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }}
          className="form-control" style={{ maxWidth: 230 }} />
        <select className="form-control" style={{ width: 'auto' }} value={periode} onChange={e => setPeriode(e.target.value)}>
          <option value="exercice">Exercice en cours</option>
          <option value="mois">Mois en cours</option>
          <option value="">Toutes périodes</option>
        </select>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Chargement…</span>}
      </div>

      {/* Pills collaborateurs */}
      <div style={{ padding: '0 28px 10px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {[{ id: '', label: `Tous (${rows.length})` },
          ...collabs.filter(u => !['collaborateur_social','collaborateur_juridique','juriste'].includes(u.role_metier))
            .map(u => ({ id: String(u.id), label: `${u.prenom} ${u.nom}` }))
        ].map(({ id, label }) => {
          const active = filtreUid === id;
          return (
            <button key={id} onClick={() => { setFiltre(id); setSelected(null); }}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
                borderColor: active ? '#0f1f4b' : '#e5e7eb',
                background:  active ? '#0f1f4b' : '#fff',
                color:       active ? '#fff'    : '#6b7c93',
              }}>
              {label}
            </button>
          );
        })}
      </div>

      <KpiStrip stats={stats} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 14 }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"><div className="spinner-ring" /></div>
          </div>
        ) : (
          <>
            {filtreUid
              ? <DossierTable rows={filtered} showResponsable={false} selectedId={selected?.client_id} onSelect={setSelected} />
              : <GroupedTable rows={filtered} selectedId={selected?.client_id} onSelect={setSelected} />
            }
            {selected && <TaskPanel dossier={selected} onClose={() => setSelected(null)} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE PRINCIPALE
   ═══════════════════════════════════════════════════════════════════ */
export default function MonPortefeuille() {
  const user      = JSON.parse(localStorage.getItem('parfi_user') || '{}');
  const isManager = ['expert','chef_mission'].includes(user.role) ||
                    ['expert_comptable','chef_de_groupe','chef_de_mission'].includes(user.role_metier);
  const [vue, setVue] = useState('perso');

  const TABS = [
    { key: 'perso',   label: '👤 Mon portefeuille' },
    ...(isManager ? [{ key: 'cabinet', label: '🏢 Vue cabinet' }] : []),
  ];

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">{vue === 'cabinet' ? 'Portefeuille cabinet' : 'Mon portefeuille'}</h1>
          <p style={{ fontSize: 13, color: '#6b7c93', marginTop: 2 }}>
            {vue === 'cabinet'
              ? 'Dossiers par collaborateur — CA théorique, facturé, temps théo et réel'
              : `CA et temps par dossier — ${[user.prenom, user.nom].filter(Boolean).join(' ')}`}
          </p>
        </div>
        {TABS.length > 1 && (
          <div style={{ display: 'flex', background: '#f0f4f8', borderRadius: 8, padding: 3, gap: 2 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setVue(t.key)} style={{
                padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .15s',
                background: vue === t.key ? '#fff' : 'transparent',
                color:      vue === t.key ? '#0f1f4b' : '#6b7c93',
                boxShadow:  vue === t.key ? '0 1px 4px rgba(15,31,75,0.12)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {vue === 'cabinet' ? <VueCabinet /> : <VuePortefeuille user={user} isManager={isManager} />}
    </div>
  );
}
