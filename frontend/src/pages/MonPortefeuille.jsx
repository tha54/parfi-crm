import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

/* ── Helpers ────────────────────────────────────────────────────────── */
const fmt     = n  => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = d  => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : null;
const fmtH    = m  => { if (!m) return '—'; const h = Math.floor(m/60), mn = m%60; return mn ? `${h}h${String(mn).padStart(2,'0')}` : `${h}h`; };
const isRetard = (date, statut) => {
  if (!date || statut === 'termine') return false;
  return new Date(date) < new Date(new Date().toDateString());
};

const STATUT_TACHE = {
  a_faire:  { label: 'À faire',  color: '#3b82f6', bg: '#eff6ff' },
  en_cours: { label: 'En cours', color: '#f59e0b', bg: '#fffbeb' },
  termine:  { label: 'Terminée', color: '#10b981', bg: '#f0fdf4' },
  reporte:  { label: 'Reportée', color: '#9ca3af', bg: '#f9fafb' },
};
const NEXT_STATUT    = { a_faire: 'en_cours', en_cours: 'termine', termine: 'a_faire', reporte: 'a_faire' };
const PRIORITE_COLOR = { basse: '#9ca3af', normale: '#3b82f6', haute: '#f59e0b', urgente: '#ef4444' };

const LDM_STATUT_MAP = {
  brouillon:       { label: 'Brouillon', color: '#9ca3af' },
  a_valider:       { label: 'À valider', color: '#d97706' },
  validee_interne: { label: 'Validée',   color: '#2563eb' },
  envoyee:         { label: 'Envoyée',   color: '#8b5cf6' },
  active:          { label: 'Active',    color: '#059669' },
  resiliee:        { label: 'Résiliée',  color: '#dc2626' },
  echue:           { label: 'Échue',     color: '#6b7c93' },
};

const ROLE_METIER_LABEL = {
  expert_comptable:       'Expert-comptable',
  chef_de_groupe:         'Chef de groupe',
  chef_de_mission:        'Chef de mission',
  collaborateur:          'Collaborateur',
  collaborateur_medior:   'Collaborateur',
  collaborateur_junior:   'Collaborateur',
  collaborateur_social:   'Collab. social',
  collaborateur_juridique:'Collab. juridique',
  juriste:                'Juriste',
};
const ROLE_METIER_COLOR = {
  expert_comptable:       '#0f1f4b',
  chef_de_groupe:         '#7c3aed',
  chef_de_mission:        '#0891b2',
  collaborateur:          '#059669',
  collaborateur_medior:   '#059669',
  collaborateur_junior:   '#059669',
  collaborateur_social:   '#d97706',
  collaborateur_juridique:'#dc2626',
  juriste:                '#9333ea',
};

const ROLE_DOSSIER_LABEL = {
  responsable:  { label: 'Responsable', color: '#0f1f4b', bg: '#eef2ff' },
  chef_mission: { label: 'Chef de mission', color: '#0891b2', bg: '#e0f2fe' },
  assistant:    { label: 'Intervenant', color: '#6b7c93', bg: '#f1f5f9' },
};

/* ══════════════════════════════════════════════════════════════════════
   BUDGET & TEMPS COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

function PctBar({ consomme, budget }) {
  if (!budget) return <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>;
  const pct   = Math.min(200, Math.round((consomme / budget) * 100));
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ minWidth: 72 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{pct}%</div>
      <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function BudgetTable({ rows }) {
  const totals = useMemo(() => ({
    bMin: rows.reduce((s, r) => s + (parseInt(r.budget_minutes_total) || 0), 0),
    sMin: rows.reduce((s, r) => s + (parseInt(r.temps_saisi_minutes)  || 0), 0),
    bHon: rows.reduce((s, r) => s + (parseFloat(r.budget_honoraires)  || 0), 0),
    fac:  rows.reduce((s, r) => s + (parseFloat(r.honoraires_factures)|| 0), 0),
  }), [rows]);

  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
      <div>Aucun dossier trouvé avec les filtres sélectionnés</div>
    </div>
  );

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Type mission</th>
            <th>Budget temps</th>
            <th>Temps saisi</th>
            <th>Temps restant</th>
            <th>Budget honoraires</th>
            <th>Facturé</th>
            <th>Reste à facturer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const bMin = parseInt(r.budget_minutes_total) || 0;
            const sMin = parseInt(r.temps_saisi_minutes)  || 0;
            const rMin = bMin - sMin;
            const bHon = parseFloat(r.budget_honoraires)  || 0;
            const fac  = parseFloat(r.honoraires_factures)|| 0;
            const rHon = bHon - fac;
            const tPct = bMin ? Math.round((sMin / bMin) * 100) : 0;
            const hPct = bHon ? Math.round((fac  / bHon) * 100) : 0;
            const tCol = tPct >= 90 ? '#ef4444' : tPct >= 70 ? '#f59e0b' : (bMin ? '#22c55e' : '#9ca3af');
            const hCol = hPct >= 90 ? '#ef4444' : hPct >= 70 ? '#f59e0b' : (bHon ? '#22c55e' : '#9ca3af');
            return (
              <tr key={r.client_id}>
                <td style={{ fontWeight: 600, color: '#0f1f4b' }}>{r.client_nom}</td>
                <td>
                  {r.type_mission
                    ? <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#eef2ff', color: '#4f46e5', fontWeight: 600 }}>{r.type_mission}</span>
                    : <span style={{ color: '#9ca3af' }}>—</span>}
                </td>
                <td style={{ fontSize: 13 }}>{fmtH(bMin)}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600, color: tCol, marginBottom: 3 }}>{fmtH(sMin)}</div>
                  <PctBar consomme={sMin} budget={bMin} />
                </td>
                <td style={{ fontSize: 13, fontWeight: rMin < 0 ? 700 : 400, color: rMin < 0 ? '#ef4444' : 'inherit' }}>
                  {rMin < 0 ? `-${fmtH(-rMin)}` : fmtH(rMin)}
                </td>
                <td style={{ fontSize: 13 }}>{bHon > 0 ? fmt(bHon) : '—'}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 600, color: hCol, marginBottom: 3 }}>{fac > 0 ? fmt(fac) : '—'}</div>
                  <PctBar consomme={fac} budget={bHon} />
                </td>
                <td style={{ fontSize: 13, fontWeight: rHon < 0 ? 700 : 400, color: rHon < 0 ? '#ef4444' : 'inherit' }}>
                  {bHon > 0 ? (rHon < 0 ? `-${fmt(-rHon)}` : fmt(rHon)) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f8fafc', fontSize: 13 }}>
            <td colSpan={2} style={{ color: '#374151' }}>
              Total — {rows.length} dossier{rows.length !== 1 ? 's' : ''}
            </td>
            <td>{fmtH(totals.bMin)}</td>
            <td>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{fmtH(totals.sMin)}</div>
              <PctBar consomme={totals.sMin} budget={totals.bMin} />
            </td>
            <td style={{ color: (totals.bMin - totals.sMin) < 0 ? '#ef4444' : 'inherit' }}>
              {fmtH(totals.bMin - totals.sMin)}
            </td>
            <td>{totals.bHon > 0 ? fmt(totals.bHon) : '—'}</td>
            <td>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>{totals.fac > 0 ? fmt(totals.fac) : '—'}</div>
              <PctBar consomme={totals.fac} budget={totals.bHon} />
            </td>
            <td style={{ color: (totals.bHon - totals.fac) < 0 ? '#ef4444' : 'inherit' }}>
              {totals.bHon > 0 ? fmt(totals.bHon - totals.fac) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function SyntheseTable({ rows }) {
  const totals = useMemo(() => ({
    nb: rows.reduce((s, r) => s + (parseInt(r.nb_dossiers)||0), 0),
    bM: rows.reduce((s, r) => s + (parseInt(r.budget_minutes_total)||0), 0),
    sM: rows.reduce((s, r) => s + (parseInt(r.temps_saisi_minutes)||0), 0),
    bH: rows.reduce((s, r) => s + (parseFloat(r.budget_honoraires)||0), 0),
    fa: rows.reduce((s, r) => s + (parseFloat(r.honoraires_factures)||0), 0),
  }), [rows]);

  if (rows.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>Aucune donnée</div>
  );

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Collaborateur</th>
            <th>Rôle</th>
            <th style={{ textAlign: 'center' }}>Dossiers</th>
            <th>Budget temps</th>
            <th>Saisi</th>
            <th>% temps</th>
            <th>Budget honoraires</th>
            <th>Facturé</th>
            <th>% honoraires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const bM = parseInt(r.budget_minutes_total)||0, sM = parseInt(r.temps_saisi_minutes)||0;
            const bH = parseFloat(r.budget_honoraires)||0, fa = parseFloat(r.honoraires_factures)||0;
            const tPct = bM ? Math.round((sM/bM)*100) : 0;
            const hPct = bH ? Math.round((fa/bH)*100) : 0;
            const rmC = ROLE_METIER_COLOR[r.role_metier] || '#6b7c93';
            return (
              <tr key={r.utilisateur_id}>
                <td style={{ fontWeight: 600, color: '#0f1f4b' }}>{r.prenom} {r.nom}</td>
                <td>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: rmC+'18', color: rmC, fontWeight: 600 }}>
                    {ROLE_METIER_LABEL[r.role_metier] || r.role_metier}
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontSize: 13 }}>{r.nb_dossiers}</td>
                <td style={{ fontSize: 13 }}>{fmtH(bM)}</td>
                <td style={{ fontSize: 13, fontWeight: 600, color: tPct >= 90 ? '#ef4444' : tPct >= 70 ? '#f59e0b' : '#0f1f4b' }}>{fmtH(sM)}</td>
                <td><PctBar consomme={sM} budget={bM} /></td>
                <td style={{ fontSize: 13 }}>{bH > 0 ? fmt(bH) : '—'}</td>
                <td style={{ fontSize: 13, fontWeight: 600, color: hPct >= 90 ? '#ef4444' : hPct >= 70 ? '#f59e0b' : '#0f1f4b' }}>{fa > 0 ? fmt(fa) : '—'}</td>
                <td><PctBar consomme={fa} budget={bH} /></td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f8fafc', fontSize: 13 }}>
            <td colSpan={2}>Total cabinet</td>
            <td style={{ textAlign: 'center' }}>{totals.nb}</td>
            <td>{fmtH(totals.bM)}</td>
            <td style={{ color: totals.bM ? (Math.round((totals.sM/totals.bM)*100) >= 90 ? '#ef4444' : totals.bM && Math.round((totals.sM/totals.bM)*100) >= 70 ? '#f59e0b' : '#0f1f4b') : 'inherit' }}>{fmtH(totals.sM)}</td>
            <td><PctBar consomme={totals.sM} budget={totals.bM} /></td>
            <td>{totals.bH > 0 ? fmt(totals.bH) : '—'}</td>
            <td>{totals.fa > 0 ? fmt(totals.fa) : '—'}</td>
            <td><PctBar consomme={totals.fa} budget={totals.bH} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function VueBudget({ user, isManager }) {
  const [periode,      setPeriode]      = useState('exercice');
  const [filterMission,setFilterMission]= useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [selectedUid,  setSelectedUid]  = useState(isManager ? '' : user.id);
  const [sousVue,      setSousVue]      = useState('collab');
  const [rows,         setRows]         = useState([]);
  const [synthese,     setSynthese]     = useState([]);
  const [collabs,      setCollabs]      = useState([]);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get('/utilisateurs').then(r => {
      setCollabs((r.data || []).filter(u =>
        u.actif && !['collaborateur_social','juriste','collaborateur_juridique'].includes(u.role_metier)
      ));
    }).catch(() => {});
  }, [isManager]);

  useEffect(() => {
    if (sousVue !== 'collab') return;
    const uid = isManager ? selectedUid : user.id;
    if (!uid) { setRows([]); return; }
    setLoading(true);
    api.get(`/portefeuille/budget?utilisateur_id=${uid}&periode=${periode}`)
      .then(r => setRows(r.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [selectedUid, periode, sousVue, isManager, user.id]);

  useEffect(() => {
    if (!isManager || sousVue !== 'globale') return;
    setLoading(true);
    api.get(`/portefeuille/budget/synthese?periode=${periode}`)
      .then(r => setSynthese(r.data || []))
      .catch(() => setSynthese([]))
      .finally(() => setLoading(false));
  }, [isManager, sousVue, periode]);

  const missionTypes = useMemo(() => [...new Set(rows.map(r => r.type_mission).filter(Boolean))], [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filterMission && r.type_mission !== filterMission) return false;
    if (filterStatut) {
      const bM = parseInt(r.budget_minutes_total) || 0;
      const sM = parseInt(r.temps_saisi_minutes)  || 0;
      const pct = bM ? (sM / bM) * 100 : 0;
      if (filterStatut === 'ok'         && pct >= 70) return false;
      if (filterStatut === 'alerte'     && (pct < 70 || pct >= 90)) return false;
      if (filterStatut === 'depassement'&& pct < 90) return false;
    }
    return true;
  }), [rows, filterMission, filterStatut]);

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Filters */}
      <div style={{ padding: '0 28px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {isManager && (
          <div style={{ display: 'flex', background: '#f0f4f8', borderRadius: 8, padding: 3, gap: 2, marginRight: 6 }}>
            {[{ k:'collab', l:'Par collaborateur' },{ k:'globale', l:'Vue globale' }].map(t => (
              <button key={t.k} onClick={() => setSousVue(t.k)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all .12s',
                background: sousVue === t.k ? '#fff' : 'transparent',
                color:      sousVue === t.k ? '#0f1f4b' : '#6b7c93',
                boxShadow:  sousVue === t.k ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>{t.l}</button>
            ))}
          </div>
        )}
        {isManager && sousVue === 'collab' && (
          <select className="form-control" style={{ width: 'auto', minWidth: 200 }} value={selectedUid}
            onChange={e => setSelectedUid(parseInt(e.target.value) || '')}>
            <option value="">Sélectionner un collaborateur…</option>
            {collabs.map(u => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        )}
        <select className="form-control" style={{ width: 'auto' }} value={periode} onChange={e => setPeriode(e.target.value)}>
          <option value="exercice">Exercice en cours</option>
          <option value="mois">Mois en cours</option>
          <option value="">Toutes périodes</option>
        </select>
        {sousVue !== 'globale' && missionTypes.length > 0 && (
          <select className="form-control" style={{ width: 'auto' }} value={filterMission} onChange={e => setFilterMission(e.target.value)}>
            <option value="">Tous les types</option>
            {missionTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {sousVue !== 'globale' && (
          <select className="form-control" style={{ width: 'auto' }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Tous statuts</option>
            <option value="ok">Dans le budget (&lt;70%)</option>
            <option value="alerte">En alerte (70–90%)</option>
            <option value="depassement">En dépassement (&gt;90%)</option>
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner"><div className="spinner-ring" /></div></div>
      ) : sousVue === 'globale' ? (
        <SyntheseTable rows={synthese} />
      ) : isManager && !selectedUid ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>
          Sélectionnez un collaborateur pour voir son portefeuille budget
        </div>
      ) : (
        <BudgetTable rows={filtered} />
      )}
    </div>
  );
}

/* ── TacheRow ────────────────────────────────────────────────────────── */
function TacheRow({ tache: t, onStatut }) {
  const retard = isRetard(t.date_echeance, t.statut);
  const st     = STATUT_TACHE[t.statut] || STATUT_TACHE.a_faire;
  const done   = t.statut === 'termine';

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid #f0f4f8', background: retard ? '#fff8f8' : '#fff', transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = retard ? '#fff0f0' : '#f8fafc'; }}
      onMouseLeave={e => { e.currentTarget.style.background = retard ? '#fff8f8' : '#fff'; }}
    >
      <button
        onClick={onStatut ? () => onStatut(t.id, NEXT_STATUT[t.statut] || 'en_cours') : undefined}
        title={onStatut ? `→ ${STATUT_TACHE[NEXT_STATUT[t.statut]]?.label}` : ''}
        style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: onStatut ? 'pointer' : 'default', border: `2px solid ${st.color}`, background: done ? st.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
      >
        {done && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
        {!done && t.statut === 'en_cours' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, display: 'block' }} />}
      </button>

      <div style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITE_COLOR[t.priorite] || '#9ca3af', flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: done ? 400 : 600, color: done ? '#9ca3af' : '#0f1f4b', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.titre || t.libelle}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 1 }}>
          {t.categorie   && <span style={{ fontSize: 11, color: '#6b7c93' }}>{t.categorie}</span>}
          {t.periodicite && <span style={{ fontSize: 11, color: '#9ca3af' }}>↻ {t.periodicite}</span>}
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 70 }}>
        {t.date_echeance && (
          <div style={{ fontSize: 11, fontWeight: 600, color: retard ? '#dc2626' : '#6b7c93', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
            {retard && '⚠'} {fmtDate(t.date_echeance)}
          </div>
        )}
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 6, background: st.bg, color: st.color }}>
          {st.label}
        </span>
      </div>
    </div>
  );
}

/* ── DossierCard (partagé entre les deux vues) ───────────────────────── */
function DossierCard({ d, selected, onClick }) {
  const retard   = Number(d.nb_retard) > 0;
  const ldmS     = LDM_STATUT_MAP[d.ldm_statut];
  const roleInfo = ROLE_DOSSIER_LABEL[d.role_sur_dossier] || ROLE_DOSSIER_LABEL.assistant;
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${selected ? '#0891b2' : retard ? '#fca5a5' : '#dce6f0'}`, background: selected ? '#f0f9ff' : retard ? '#fff9f9' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.12s' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#93c5fd'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = retard ? '#fca5a5' : '#dce6f0'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1f4b', lineHeight: 1.3, flex: 1 }}>{d.nom}</span>
        {retard && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>⚠ {d.nb_retard}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 6, background: roleInfo.bg, color: roleInfo.color }}>{roleInfo.label}</span>
        {ldmS && <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 6, background: ldmS.color + '15', color: ldmS.color, border: `1px solid ${ldmS.color}25` }}>LDM {ldmS.label}</span>}
        <span style={{ fontSize: 11, color: '#6b7c93' }}>{Number(d.nb_taches)} tâche{d.nb_taches != 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {d.prochaine_echeance ? (
          <div style={{ fontSize: 11, color: isRetard(d.prochaine_echeance, 'a_faire') ? '#dc2626' : '#9ca3af' }}>
            Prochaine : {fmtDate(d.prochaine_echeance)}
          </div>
        ) : <span />}
        {Number(d.ca_facture_annee) > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{fmt(d.ca_facture_annee)}</div>
        )}
      </div>
    </button>
  );
}

/* ── Panneau tâches (partagé) ─────────────────────────────────────────── */
function TachesPanel({ dossier, taches, onStatut, showAll, onToggleAll, isCabinet }) {
  const filtered = showAll ? taches : taches.filter(t => t.statut !== 'termine');
  const grouped  = useMemo(() => {
    if (dossier) return null; // pas de groupement quand un dossier est sélectionné
    const map = {};
    for (const t of filtered) {
      const key = t.client_id ?? 0;
      if (!map[key]) map[key] = { label: t.client_nom || 'Sans dossier', tasks: [] };
      map[key].tasks.push(t);
    }
    return Object.entries(map);
  }, [filtered, dossier]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #dce6f0', borderRadius: 10, overflow: 'hidden', minWidth: 0 }}>
      {/* Header */}
      <div style={{ padding: '11px 14px', borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1f4b', minWidth: 0 }}>
          {dossier ? dossier.nom : 'Toutes les tâches'}
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>{filtered.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={onToggleAll} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #dce6f0', background: showAll ? '#0f1f4b' : '#fff', color: showAll ? '#fff' : '#6b7c93', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            {showAll ? 'Masquer terminées' : 'Voir terminées'}
          </button>
          {dossier?.id && <Link to={`/clients/${dossier.id}`} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0891b2', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>Client →</Link>}
          {dossier?.ldm_id && <Link to={`/lettres-mission/${dossier.ldm_id}`} style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #a7f3d0', background: '#f0fdf4', color: '#059669', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>LDM →</Link>}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 600 }}>Aucune tâche active</div>
          </div>
        ) : grouped ? (
          grouped.map(([key, { label, tasks }]) => (
            <div key={key}>
              <div style={{ padding: '6px 14px', background: '#f8fafc', borderBottom: '1px solid #edf2f7', fontSize: 11, fontWeight: 700, color: '#6b7c93', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {label} <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {tasks.length}</span>
              </div>
              {tasks.map(t => <TacheRow key={t.id} tache={t} onStatut={isCabinet ? null : onStatut} />)}
            </div>
          ))
        ) : (
          filtered.map(t => <TacheRow key={t.id} tache={t} onStatut={isCabinet ? null : onStatut} />)
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VUE PERSONNELLE
   ═══════════════════════════════════════════════════════════════════════ */
function VuePersonnelle({ user }) {
  const [dossiers, setDossiers] = useState([]);
  const [taches,   setTaches]   = useState([]);
  const [stats,    setStats]    = useState({});
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null); // null=tous | 'indep' | client_id
  const [showAll,  setShowAll]  = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/portefeuille');
      setDossiers(data.dossiers || []);
      setTaches(data.taches   || []);
      setStats(data.stats     || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateStatut = async (id, statut) => {
    setTaches(prev => prev.map(t => t.id === id ? { ...t, statut } : t));
    try { await api.put(`/taches/${id}`, { statut }); } catch { load(); }
  };

  const tachesFiltrees = useMemo(() => {
    let list = taches;
    if (selected === 'indep')   list = taches.filter(t => !t.client_id);
    else if (selected !== null) list = taches.filter(t => t.client_id === selected);
    if (!showAll) list = list.filter(t => t.statut !== 'termine');
    return list;
  }, [taches, selected, showAll]);

  const tachesIndep    = taches.filter(t => !t.client_id && t.statut !== 'termine');
  const selectedDossier = selected !== null && selected !== 'indep'
    ? dossiers.find(d => d.id === selected) : null;

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;

  return (
    <>
      {/* KPI */}
      <div style={{ padding: '0 28px 16px', flexShrink: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { v: stats.nbDossiers,    l: 'Dossiers',       color: '#0f1f4b' },
          { v: stats.nbRetard,      l: 'En retard',      color: '#ef4444' },
          { v: stats.nbEnCours,     l: 'En cours',       color: '#f59e0b' },
          { v: stats.nbAFaire,      l: 'À faire',        color: '#3b82f6' },
          { v: fmt(stats.caAnnuel), l: 'CA facturé (exercice)', color: '#059669' },
        ].map(({ v, l, color }) => (
          <div key={l} style={{ background: '#fff', border: '1px solid #dce6f0', borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '10px 16px', minWidth: 120, boxShadow: '0 1px 3px rgba(15,31,75,0.06)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 1 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Two-panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 14 }}>

        {/* Dossiers */}
        <div style={{ width: 272, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto' }}>
          <NavBtn selected={selected === null} onClick={() => setSelected(null)} label="Toutes les tâches" badge={taches.filter(t => t.statut !== 'termine').length} color="#0f1f4b" />
          {dossiers.length === 0 && (
            <div style={{ padding: '20px 8px', fontSize: 13, color: '#6b7c93', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🗂️</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aucun dossier attribué</div>
              <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>Vos dossiers clients apparaîtront ici dès qu'ils vous seront assignés.</div>
            </div>
          )}
          {dossiers.map(d => <DossierCard key={d.id} d={d} selected={selected === d.id} onClick={() => setSelected(d.id)} />)}
          {tachesIndep.length > 0 && <NavBtn selected={selected === 'indep'} onClick={() => setSelected('indep')} label="Tâches sans dossier" badge={tachesIndep.length} color="#8b5cf6" />}
        </div>

        {/* Tâches */}
        <TachesPanel
          dossier={selectedDossier}
          taches={tachesFiltrees}
          onStatut={updateStatut}
          showAll={showAll}
          onToggleAll={() => setShowAll(v => !v)}
          isCabinet={false}
        />
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   VUE CABINET (expert uniquement)
   ═══════════════════════════════════════════════════════════════════════ */
const FILTRE_ROLES = [
  { key: 'tous',                   label: 'Tous' },
  { key: 'chef_de_groupe',         label: 'Chefs de groupe' },
  { key: 'chef_de_mission',        label: 'Chefs de mission' },
  { key: 'collaborateur',          label: 'Collaborateurs' },
  { key: 'collaborateur_social',   label: 'Social' },
  { key: 'collaborateur_juridique',label: 'Juridique' },
];

function VueCabinet() {
  const [collaborateurs, setCollaborateurs] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filtreRole,     setFiltreRole]     = useState('tous');
  const [selectedUser,   setSelectedUser]   = useState(null); // { id, prenom, nom, dossiers }
  const [selectedDossier,setSelectedDossier]= useState(null); // dossier object
  const [taches,         setTaches]         = useState([]);
  const [loadingTaches,  setLoadingTaches]  = useState(false);
  const [showAll,        setShowAll]        = useState(false);

  const [totalClients, setTotalClients] = useState(0);

  useEffect(() => {
    api.get('/portefeuille/cabinet')
      .then(r => {
        const data = r.data || {};
        setCollaborateurs(data.collaborateurs || []);
        setTotalClients(data.total_clients || 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Charger les tâches quand on sélectionne un collaborateur
  useEffect(() => {
    if (!selectedUser) { setTaches([]); return; }
    setLoadingTaches(true);
    api.get(`/portefeuille?userId=${selectedUser.id}`)
      .then(r => setTaches(r.data.taches || []))
      .catch(console.error)
      .finally(() => setLoadingTaches(false));
  }, [selectedUser?.id]);

  // Réinitialiser le dossier quand l'user change
  useEffect(() => { setSelectedDossier(null); }, [selectedUser?.id]);

  const COLLAB_ROLES = ['collaborateur','collaborateur_medior','collaborateur_junior'];

  const collabFiltres = useMemo(() => {
    if (filtreRole === 'tous') return collaborateurs;
    if (filtreRole === 'collaborateur') return collaborateurs.filter(u => COLLAB_ROLES.includes(u.role_metier));
    return collaborateurs.filter(u => u.role_metier === filtreRole);
  }, [collaborateurs, filtreRole]);

  // Stats cabinet globales
  const statsGlobales = useMemo(() => ({
    nbCollab:   collaborateurs.filter(u => u.nb_dossiers > 0).length,
    nbDossiers: totalClients,
    nbRetard:   collaborateurs.reduce((s, u) => s + u.nb_retard, 0),
    caTotal:    collaborateurs.reduce((s, u) => s + u.ca_annuel, 0),
  }), [collaborateurs, totalClients]);

  // Tâches filtrées selon dossier sélectionné
  const tachesFiltrees = useMemo(() => {
    let list = taches;
    if (selectedDossier) list = taches.filter(t => t.client_id === selectedDossier.id);
    if (!showAll) list = list.filter(t => t.statut !== 'termine');
    return list;
  }, [taches, selectedDossier, showAll]);

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;

  return (
    <>
      {/* KPI cabinet */}
      <div style={{ padding: '0 28px 14px', flexShrink: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[
          { v: statsGlobales.nbCollab,   l: 'Collaborateurs actifs', color: '#0f1f4b' },
          { v: statsGlobales.nbDossiers, l: 'Dossiers au total',     color: '#0891b2' },
          { v: statsGlobales.nbRetard,   l: 'Retards cabinet',       color: '#ef4444' },
          { v: fmt(statsGlobales.caTotal),l: 'CA annuel cabinet',    color: '#059669' },
        ].map(({ v, l, color }) => (
          <div key={l} style={{ background: '#fff', border: '1px solid #dce6f0', borderLeft: `4px solid ${color}`, borderRadius: 8, padding: '10px 16px', minWidth: 140, boxShadow: '0 1px 3px rgba(15,31,75,0.06)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color }}>{v}</div>
            <div style={{ fontSize: 11, color: '#6b7c93', fontWeight: 500, marginTop: 1 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtre rôle */}
      <div style={{ padding: '0 28px 12px', flexShrink: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FILTRE_ROLES.map(f => (
          <button key={f.key} onClick={() => setFiltreRole(f.key)} style={{
            padding: '5px 12px', borderRadius: 20, border: '1px solid',
            borderColor: filtreRole === f.key ? '#0f1f4b' : '#dce6f0',
            background: filtreRole === f.key ? '#0f1f4b' : '#fff',
            color: filtreRole === f.key ? '#fff' : '#6b7c93',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
          }}>
            {f.label}
            {f.key !== 'tous' && (
              <span style={{ marginLeft: 5, opacity: 0.7 }}>
                {f.key === 'collaborateur'
                  ? collaborateurs.filter(u => COLLAB_ROLES.includes(u.role_metier)).length
                  : collaborateurs.filter(u => u.role_metier === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Three-panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 28px 24px', gap: 12 }}>

        {/* Panneau 1 — Collaborateurs */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 4px 8px' }}>
            {collabFiltres.length} collaborateur{collabFiltres.length !== 1 ? 's' : ''}
          </div>
          {collabFiltres.map(u => {
            const sel   = selectedUser?.id === u.id;
            const rmColor = ROLE_METIER_COLOR[u.role_metier] || '#6b7c93';
            const retard = u.nb_retard > 0;
            return (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 11px', borderRadius: 8, border: `1px solid ${sel ? rmColor : retard ? '#fca5a5' : '#dce6f0'}`, background: sel ? rmColor + '10' : retard ? '#fff9f9' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.12s' }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = rmColor + '70'; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = retard ? '#fca5a5' : '#dce6f0'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1f4b' }}>{u.prenom} {u.nom}</span>
                  {retard && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '1px 5px', flexShrink: 0 }}>⚠ {u.nb_retard}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: rmColor + '15', color: rmColor, border: `1px solid ${rmColor}25` }}>
                    {ROLE_METIER_LABEL[u.role_metier] || u.role_metier || u.role}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7c93' }}>
                  <span>{u.nb_dossiers} dossier{u.nb_dossiers !== 1 ? 's' : ''}</span>
                  {u.ca_annuel > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>{fmt(u.ca_annuel)}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Panneau 2 — Dossiers du collaborateur sélectionné */}
        <div style={{ width: 252, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {!selectedUser ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
              Sélectionnez un collaborateur
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 4px 8px' }}>
                {selectedUser.prenom} {selectedUser.nom} · {selectedUser.dossiers.length} dossier{selectedUser.dossiers.length !== 1 ? 's' : ''}
              </div>
              {selectedUser.dossiers.length === 0 && (
                <div style={{ padding: '20px 8px', fontSize: 13, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>
                  Aucun dossier attribué
                </div>
              )}
              <NavBtn
                selected={selectedDossier === null}
                onClick={() => setSelectedDossier(null)}
                label="Toutes les tâches"
                badge={taches.filter(t => t.statut !== 'termine').length}
                color="#0891b2"
              />
              {selectedUser.dossiers.map(d => (
                <DossierCard key={d.id} d={d} selected={selectedDossier?.id === d.id} onClick={() => setSelectedDossier(d)} />
              ))}
            </>
          )}
        </div>

        {/* Panneau 3 — Tâches */}
        {selectedUser ? (
          loadingTaches ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
              Chargement des tâches…
            </div>
          ) : (
            <TachesPanel
              dossier={selectedDossier}
              taches={tachesFiltrees}
              onStatut={null}
              showAll={showAll}
              onToggleAll={() => setShowAll(v => !v)}
              isCabinet={true}
            />
          )
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13, fontStyle: 'italic', background: '#f8fafc', borderRadius: 10, border: '1px solid #edf2f7' }}>
            Sélectionnez un collaborateur pour voir ses tâches
          </div>
        )}
      </div>
    </>
  );
}

/* ── NavBtn ──────────────────────────────────────────────────────────── */
function NavBtn({ selected, onClick, label, badge, color }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, border: `1px solid ${selected ? color : '#dce6f0'}`, background: selected ? color : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = color + '80'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#dce6f0'; }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: selected ? '#fff' : '#374151' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: selected ? 'rgba(255,255,255,0.2)' : '#f0f4f8', color: selected ? '#fff' : '#6b7c93' }}>{badge}</span>
    </button>
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
    { key: 'budget',  label: '📊 Budget & Temps' },
    ...(isManager ? [{ key: 'cabinet', label: '🏢 Vue cabinet' }] : []),
  ];

  const titles = { perso: 'Mon Portefeuille', cabinet: 'Portefeuille cabinet', budget: 'Budget & Temps' };
  const subtitles = {
    perso:   `Vos dossiers clients, tâches et échéances — ${user.prenom || ''} ${user.nom || ''}`.trim(),
    cabinet: 'Vue d\'ensemble du cabinet — dossiers et tâches par collaborateur',
    budget:  'Suivi budget temps et honoraires par dossier',
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">{titles[vue]}</h1>
          <p style={{ fontSize: 13, color: '#6b7c93', marginTop: 2 }}>{subtitles[vue]}</p>
        </div>
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
      </div>

      {vue === 'cabinet' ? <VueCabinet /> :
       vue === 'budget'  ? <VueBudget user={user} isManager={isManager} /> :
       <VuePersonnelle user={user} />}
    </div>
  );
}
