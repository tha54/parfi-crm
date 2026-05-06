import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// ─── Couleur selon taux de charge ────────────────────────────────────────────

function tauxColor(taux) {
  if (!taux || taux === 0) return null;
  if (taux > 100) return { bg: '#fef2f2', fg: '#dc2626', bar: '#ef4444' };
  if (taux >= 85)  return { bg: '#fffbeb', fg: '#d97706', bar: '#f59e0b' };
  return            { bg: '#f0fdf4', fg: '#16a34a', bar: '#22c55e' };
}

function fmtH(minutes) {
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

// ─── Cellule pivot ────────────────────────────────────────────────────────────

function PivotCell({ cell, onClick }) {
  if (!cell) return <td style={{ background: '#f9fafb', minWidth: 90 }} />;
  const { budget_minutes, capacite_minutes, taux_charge, nb_taches } = cell;
  const colors = tauxColor(taux_charge);

  if (!colors) {
    return (
      <td style={{ minWidth: 90, padding: '8px 6px', textAlign: 'center', color: '#cbd5e1', fontSize: 12, cursor: 'default' }}>
        —
      </td>
    );
  }

  const pct = Math.min(100, taux_charge || 0);
  return (
    <td
      onClick={onClick}
      style={{
        minWidth: 90, padding: '8px 6px', cursor: 'pointer',
        background: colors.bg, verticalAlign: 'middle',
        transition: 'filter .12s',
      }}
      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(.95)'}
      onMouseLeave={e => e.currentTarget.style.filter = ''}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Taux */}
        <div style={{ fontWeight: 800, fontSize: 15, color: colors.fg, lineHeight: 1 }}>
          {taux_charge > 999 ? '>999' : Math.round(taux_charge)}%
        </div>
        {/* Barre */}
        <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, margin: '4px 0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: colors.bar, borderRadius: 2, transition: 'width .3s' }} />
        </div>
        {/* Heures */}
        <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1 }}>
          {fmtH(budget_minutes)} / {fmtH(capacite_minutes)}
        </div>
        {/* Nb tâches */}
        {nb_taches > 0 && (
          <div style={{ fontSize: 9, color: colors.fg, marginTop: 2, opacity: 0.75 }}>
            {nb_taches} tâche{nb_taches > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </td>
  );
}

// ─── Panneau détail ───────────────────────────────────────────────────────────

function DetailPanel({ collab, periode, onClose }) {
  const [taches, setTaches] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/charge-travail/detail', {
      params: { userId: collab.id, debut: periode.debut, fin: periode.fin },
    })
      .then(r => setTaches(r.data))
      .catch(() => setTaches([]))
      .finally(() => setLoading(false));
  }, [collab.id, periode.debut, periode.fin]);

  const PRIO_COLOR = { urgente: '#dc2626', haute: '#f59e0b', normale: '#3b82f6', basse: '#9ca3af' };
  const ORIGINE_LABEL = { manuelle: 'Manuel', fiscale: 'Fiscal', appel: 'Appel', ldm: 'LDM', mission: 'Mission' };

  const totalBudget = (taches || []).reduce((s, t) => s + Number(t.budget_minutes || 0), 0);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3 style={{ margin: 0 }}>{collab.prenom} {collab.nom}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {periode.label} {periode.sublabel} · {periode.debut} → {periode.fin}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body" style={{ overflowY: 'auto' }}>
          {/* Résumé */}
          {taches && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <strong>{taches.length} tâche{taches.length !== 1 ? 's' : ''}</strong> budgétée{taches.length !== 1 ? 's' : ''}
              <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>Total : <strong>{fmtH(totalBudget)}</strong></span>
            </div>
          )}

          {loading && <div className="spinner"><div className="spinner-ring" /></div>}

          {taches?.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32, fontSize: 14 }}>
              Aucune tâche budgétée sur cette période
            </div>
          )}

          {taches && taches.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', fontWeight: 600 }}>Tâche</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Client</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>LDM</th>
                  <th style={{ textAlign: 'right', padding: '6px 0 6px 8px', fontWeight: 600 }}>Budget</th>
                  <th style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600 }}>Éch.</th>
                </tr>
              </thead>
              <tbody>
                {taches.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                    <td style={{ padding: '7px 8px 7px 0', verticalAlign: 'top', maxWidth: 180 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.titre || t.description || '—'}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                        {t.priorite && (
                          <span style={{ fontSize: 10, color: PRIO_COLOR[t.priorite] || '#9ca3af', fontWeight: 600 }}>
                            {t.priorite}
                          </span>
                        )}
                        {t.origine && t.origine !== 'manuelle' && (
                          <span style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b', borderRadius: 3, padding: '1px 4px' }}>
                            {ORIGINE_LABEL[t.origine] || t.origine}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '7px 8px', color: '#475569', fontSize: 12, verticalAlign: 'top' }}>
                      {t.client_nom || '—'}
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: 11, color: '#7c3aed', verticalAlign: 'top' }}>
                      {t.ldm_numero || (t.mission_libelle ? t.mission_libelle.slice(0, 20) : '—')}
                    </td>
                    <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', fontWeight: 700, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {fmtH(t.budget_minutes)}
                    </td>
                    <td style={{ padding: '7px 4px', textAlign: 'center', fontSize: 11, color: '#64748b', verticalAlign: 'top' }}>
                      {t.date_echeance ? new Date(t.date_echeance + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '8px 0', fontWeight: 700, fontSize: 13 }}>Total</td>
                  <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 800, fontSize: 14 }}>
                    {fmtH(totalBudget)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Légende ─────────────────────────────────────────────────────────────────

function Legende() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
      {[
        { color: '#22c55e', label: '< 85 % — OK' },
        { color: '#f59e0b', label: '85–100 % — Saturé' },
        { color: '#ef4444', label: '> 100 % — Surchargé' },
      ].map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
          {label}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: '#e2e8f0' }} />
        Aucune tâche
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const ROLE_METIER_LABEL = {
  expert_comptable:        'Expert-comptable',
  chef_de_groupe:          'Chef de groupe',
  chef_de_mission:         'Chef de mission',
  collaborateur:           'Collaborateur',
  collaborateur_social:    'Collab. social',
  collaborateur_juridique: 'Collab. juridique',
};

export default function ChargeTravail() {
  const [granularity, setGranularity] = useState('mois');
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null); // { collab, periode }

  const load = useCallback(async (g) => {
    setLoading(true);
    try {
      const r = await api.get('/charge-travail', { params: { granularity: g } });
      setData(r.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(granularity); }, [granularity, load]);

  const handleCellClick = (collab, pIdx) => {
    if (!data) return;
    const periodeInfo = data.periodes[pIdx];
    const periodeCell = collab.periodes[pIdx];
    if (!periodeCell || periodeCell.nb_taches === 0) return;
    setSelected({ collab, periode: periodeInfo });
  };

  // KPIs agrégés
  const kpis = data ? (() => {
    const allCells = data.collaborateurs.flatMap(c => c.periodes);
    const totalH   = allCells.reduce((s, c) => s + c.budget_minutes, 0);
    const surcharge = data.collaborateurs.filter(c => c.periodes.some(p => p.taux_charge > 100)).length;
    const sature    = data.collaborateurs.filter(c => c.periodes.some(p => p.taux_charge >= 85 && p.taux_charge <= 100)).length;
    return { totalH, surcharge, sature, nbCollabs: data.collaborateurs.length };
  })() : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Charge de travail</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '2px 0 0' }}>
            Charge prévisionnelle par collaborateur, basée sur les budgets de tâches
          </p>
        </div>
        {/* Sélecteur granularité */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-secondary)', borderRadius: 8, padding: 4 }}>
          {[
            { key: 'semaine', label: 'Semaine' },
            { key: 'mois',    label: 'Mois' },
            { key: 'annee',   label: 'Année' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setGranularity(key)}
              className={`btn btn-sm ${granularity === key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ minWidth: 72 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* KPIs */}
        {kpis && (
          <div className="kpi-bar" style={{ marginBottom: 16 }}>
            {[
              { icon: '👥', value: kpis.nbCollabs,              label: 'Collaborateurs',   color: null },
              { icon: '⏱️', value: fmtH(kpis.totalH),          label: 'Total budgété',    color: null, isText: true },
              { icon: '🔴', value: kpis.surcharge,              label: 'Surchargés >100%', color: kpis.surcharge > 0 ? '#dc2626' : null },
              { icon: '🟡', value: kpis.sature,                 label: 'Saturés 85–100%',  color: kpis.sature > 0 ? '#d97706' : null },
            ].map((k, i) => (
              <div key={i} className="kpi-card">
                <div className="kpi-icon">{k.icon}</div>
                <div className="kpi-value" style={k.color ? { color: k.color } : {}}>{k.value}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {loading && <div className="spinner"><div className="spinner-ring" /></div>}

        {!loading && data && (
          <>
            {/* Légende */}
            <div style={{ marginBottom: 12 }}>
              <Legende />
            </div>

            {/* Tableau pivot */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 'max-content' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border)' }}>
                      {/* Colonne collaborateur */}
                      <th style={{
                        position: 'sticky', left: 0, zIndex: 2,
                        background: 'var(--bg-secondary)',
                        padding: '10px 16px', textAlign: 'left',
                        fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
                        minWidth: 200, whiteSpace: 'nowrap',
                        borderRight: '1px solid var(--border)',
                      }}>
                        Collaborateur
                      </th>
                      {/* Colonnes périodes */}
                      {data.periodes.map(p => (
                        <th key={p.key} style={{
                          padding: '6px 8px', textAlign: 'center',
                          fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                          minWidth: 90, whiteSpace: 'nowrap',
                        }}>
                          <div>{p.label}</div>
                          {p.sublabel && <div style={{ fontWeight: 400, opacity: .7 }}>{p.sublabel}</div>}
                        </th>
                      ))}
                      {/* Colonne total */}
                      <th style={{
                        padding: '6px 12px', textAlign: 'center',
                        fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                        minWidth: 80, borderLeft: '1px solid var(--border)',
                      }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.collaborateurs.length === 0 && (
                      <tr>
                        <td colSpan={data.periodes.length + 2}
                          style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
                          Aucun collaborateur actif
                        </td>
                      </tr>
                    )}
                    {data.collaborateurs.map((collab, ci) => (
                      <tr key={collab.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                        {/* Nom */}
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 1,
                          background: '#fff',
                          padding: '10px 16px',
                          borderRight: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {collab.prenom} {collab.nom}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                            {ROLE_METIER_LABEL[collab.role_metier] || collab.role_metier || collab.role}
                          </div>
                        </td>
                        {/* Cellules périodes */}
                        {collab.periodes.map((cell, pIdx) => (
                          <PivotCell
                            key={cell.key}
                            cell={cell}
                            onClick={() => handleCellClick(collab, pIdx)}
                          />
                        ))}
                        {/* Total collab */}
                        <td style={{
                          padding: '10px 12px', textAlign: 'center',
                          fontWeight: 700, fontSize: 13,
                          borderLeft: '1px solid var(--border)',
                          color: collab.max_taux > 100 ? '#dc2626' : collab.max_taux >= 85 ? '#d97706' : 'var(--text-primary)',
                          background: '#fafafa',
                        }}>
                          {fmtH(collab.total_budget_minutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Note bas de page */}
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
              ℹ️ Capacité calculée sur 7h/j ouvré (hors jours fériés et absences validées).
              Cliquer sur une cellule pour voir le détail des tâches.
            </div>
          </>
        )}

        {!loading && !data && (
          <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
            Erreur lors du chargement des données
          </div>
        )}
      </div>

      {/* Drawer détail */}
      {selected && (
        <DetailPanel
          collab={selected.collab}
          periode={selected.periode}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
