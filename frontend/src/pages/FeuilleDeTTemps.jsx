import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function mondayToSemaineStr(monday) {
  return `${monday.getFullYear()}-W${String(getISOWeek(monday)).padStart(2, '0')}`;
}

function semaineStrToMonday(str) {
  if (!/^\d{4}-W\d{2}$/.test(str)) return getMondayOfWeek();
  const [yr, wkStr] = str.split('-W');
  const year = Number(yr);
  const week = Number(wkStr);
  const jan4 = new Date(year, 0, 4);
  const w1Mon = new Date(jan4);
  w1Mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const mon = new Date(w1Mon);
  mon.setDate(w1Mon.getDate() + (week - 1) * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmtMin(m) {
  if (!m) return '';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  return h > 0 ? `${h}h${String(mn).padStart(2, '0')}` : `${mn}min`;
}

function parseHHMM(str) {
  if (!str || !str.trim()) return 0;
  const clean = str.trim().replace(',', '.');
  if (clean.includes(':')) {
    const [h, m] = clean.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  if (clean.includes('h')) {
    const [h, m] = clean.split('h').map(s => Number(s || 0));
    return h * 60 + m;
  }
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  // If >= 10 assume minutes, else hours
  return n >= 10 ? Math.round(n) : Math.round(n * 60);
}

const STATUT_CONFIG = {
  brouillon: { label: 'Brouillon', color: '#0369a1', bg: '#e0f2fe' },
  figee:     { label: 'Figée',     color: '#7c3aed', bg: '#ede9fe' },
  validee:   { label: 'Validée',   color: '#15803d', bg: '#dcfce7' },
  rejetee:   { label: 'Rejetée',   color: '#be123c', bg: '#ffe4e6' },
};

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── Cell editor ─────────────────────────────────────────────────────────────

function Cell({ entry, date, tacheId, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const inputRef = useRef(null);
  const isWeekend = new Date(date + 'T12:00:00').getDay() === 0 || new Date(date + 'T12:00:00').getDay() === 6;

  const startEdit = () => {
    if (disabled) return;
    setVal(entry ? fmtMin(entry.duree_minutes) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const save = async () => {
    setEditing(false);
    const mins = parseHHMM(val);
    await onSave(tacheId, date, entry, mins);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') setEditing(false);
  };

  const statutBg = entry ? (STATUT_CONFIG[entry.statut]?.bg || '#f0f9ff') : 'transparent';

  if (editing) {
    return (
      <td style={{ padding: 0 }}>
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={handleKey}
          placeholder="1h30"
          style={{
            width: '100%', padding: '6px 8px', fontSize: 13, fontWeight: 600,
            border: '2px solid #6366f1', borderRadius: 4, outline: 'none',
            textAlign: 'center', boxSizing: 'border-box', background: '#eef2ff',
          }}
        />
      </td>
    );
  }

  return (
    <td
      onClick={startEdit}
      style={{
        padding: '6px 8px', textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
        fontSize: 13, fontWeight: entry ? 600 : 400,
        background: isWeekend ? '#f8f9fb' : (entry ? statutBg : 'transparent'),
        color: entry ? '#0F1F4B' : '#cbd5e1',
        transition: 'background .1s',
        minWidth: 72,
      }}
      title={disabled ? '' : 'Cliquer pour saisir'}
    >
      {entry ? fmtMin(entry.duree_minutes) : (isWeekend ? '—' : '·')}
    </td>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeuilleDeTTemps() {
  const { user } = useAuth();
  const [semaine, setSemaine] = useState(() => mondayToSemaineStr(getMondayOfWeek()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // tacheId_date key
  const [addOpen, setAddOpen] = useState(false);
  const [addFilter, setAddFilter] = useState('');
  const [error, setError] = useState('');

  const monday = semaineStrToMonday(semaine);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/tache-temps/feuille?semaine=${semaine}`);
      setData(d);
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [semaine]);

  useEffect(() => { load(); }, [load]);

  const prevWeek = () => {
    const mon = semaineStrToMonday(semaine);
    mon.setDate(mon.getDate() - 7);
    setSemaine(mondayToSemaineStr(mon));
  };
  const nextWeek = () => {
    const mon = semaineStrToMonday(semaine);
    mon.setDate(mon.getDate() + 7);
    setSemaine(mondayToSemaineStr(mon));
  };
  const goToday = () => setSemaine(mondayToSemaineStr(getMondayOfWeek()));

  const handleSave = async (tacheId, date, existing, mins) => {
    const key = `${tacheId}_${date}`;
    setSaving(key);
    try {
      if (mins === 0 && existing) {
        await api.delete(`/tache-temps/${existing.id}`);
      } else if (mins > 0 && existing) {
        await api.put(`/tache-temps/${existing.id}`, { duree_minutes: mins, date_travail: date });
      } else if (mins > 0) {
        await api.post(`/tache-temps/tache/${tacheId}`, {
          duree_minutes: mins, date_travail: date, source: 'feuille_temps',
        });
      }
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(null);
    }
  };

  const handleAddTask = async (tache) => {
    if (!data) return;
    // Check if already in grid
    if (data.lignes.some(l => l.tache.id === tache.id)) { setAddOpen(false); return; }
    // Add a placeholder entry (first available weekday = today if in week, else monday)
    const today = fmtD(new Date());
    const targetDate = data.dates.includes(today) ? today : data.dates[0];
    try {
      await api.post(`/tache-temps/tache/${tache.id}`, {
        duree_minutes: 0, date_travail: targetDate, source: 'feuille_temps',
      });
    } catch { /* ignore — might fail with 0 minutes; that's OK, just reload */ }
    setAddOpen(false);
    setAddFilter('');
    load();
  };

  const isFrozen = data?.statut_global === 'figee' || data?.statut_global === 'validee';
  const sc = STATUT_CONFIG[data?.statut_global] || STATUT_CONFIG.brouillon;

  const weekLabel = (() => {
    const wk = getISOWeek(monday);
    const d1 = monday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const d2 = sunday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `S${wk} · ${d1} – ${d2} ${sunday.getFullYear()}`;
  })();

  const filteredTaches = (data?.taches_disponibles || []).filter(t =>
    !addFilter || t.titre.toLowerCase().includes(addFilter.toLowerCase()) ||
    (t.client_nom || '').toLowerCase().includes(addFilter.toLowerCase())
  ).filter(t => !data?.lignes.some(l => l.tache.id === t.id));

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">⏱ Feuille de temps</h1>
          <p className="page-subtitle">Saisissez vos heures par tâche et par jour</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status badge */}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            background: sc.bg, color: sc.color,
          }}>
            {sc.label || 'Brouillon'}
          </span>
          {/* Week nav */}
          <button className="btn btn-ghost btn-sm" onClick={prevWeek}>←</button>
          <button className="btn btn-ghost btn-sm" style={{ minWidth: 220, fontWeight: 700 }}>{weekLabel}</button>
          <button className="btn btn-ghost btn-sm" onClick={nextWeek}>→</button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Aujourd'hui</button>
        </div>
      </div>

      {error && (
        <div style={{ margin: '0 0 12px', padding: '8px 14px', background: '#ffebee', color: '#d63031', borderRadius: 8, fontSize: 13 }}>
          {error} <button style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#d63031' }} onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ tableLayout: 'fixed', minWidth: 700 }}>
          <colgroup>
            <col style={{ width: 260 }} />
            {(data?.dates || []).map(d => <col key={d} style={{ width: 80 }} />)}
            <col style={{ width: 72 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#f8f9fb', zIndex: 2 }}>
                Tâche
              </th>
              {(data?.dates || []).map((d, i) => {
                const isToday = d === fmtD(new Date());
                const isWeekend = i >= 5;
                return (
                  <th key={d} style={{
                    textAlign: 'center', background: isToday ? '#eef2ff' : isWeekend ? '#f8f9fb' : '#fff',
                    fontSize: 11, whiteSpace: 'nowrap',
                    color: isToday ? '#4338ca' : isWeekend ? '#94a3b8' : 'inherit',
                    fontWeight: isToday ? 800 : 600,
                  }}>
                    <div>{DAY_LABELS[i]}</div>
                    <div style={{ fontWeight: 400, opacity: 0.7 }}>
                      {new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </th>
                );
              })}
              <th style={{ textAlign: 'center', fontSize: 11 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  Chargement…
                </td>
              </tr>
            ) : !data?.lignes?.length ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune saisie cette semaine. Cliquez "+ Ajouter une tâche" pour commencer.
                </td>
              </tr>
            ) : (
              data.lignes.map(({ tache, entrees }) => {
                const rowTotal = Object.values(entrees).reduce((s, e) => s + (e?.duree_minutes || 0), 0);
                return (
                  <tr key={tache.id}>
                    <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, maxWidth: 260, overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tache.titre}>
                        {tache.titre}
                      </div>
                      {tache.client_nom && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{tache.client_nom}</div>
                      )}
                    </td>
                    {(data.dates || []).map(d => (
                      <Cell
                        key={d}
                        entry={entrees[d]}
                        date={d}
                        tacheId={tache.id}
                        disabled={isFrozen && !!entrees[d]}
                        onSave={handleSave}
                      />
                    ))}
                    <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0F1F4B', padding: '6px 8px' }}>
                      {rowTotal > 0 ? fmtMin(rowTotal) : '—'}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Total row */}
            {data && (
              <tr style={{ background: '#f8f9fb', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td style={{ position: 'sticky', left: 0, background: '#f8f9fb', zIndex: 1, fontSize: 12, padding: '8px 12px' }}>
                  Total journalier
                </td>
                {(data.dates || []).map(d => (
                  <td key={d} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0F1F4B', padding: '8px' }}>
                    {data.totaux_par_jour?.[d] > 0 ? fmtMin(data.totaux_par_jour[d]) : '—'}
                  </td>
                ))}
                <td style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#0F1F4B', padding: '8px' }}>
                  {data.total_semaine > 0 ? fmtMin(data.total_semaine) : '—'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add task */}
      <div style={{ marginTop: 12, position: 'relative' }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ borderStyle: 'dashed' }}
          onClick={() => setAddOpen(v => !v)}
        >
          {addOpen ? '✕ Fermer' : '+ Ajouter une tâche'}
        </button>

        {addOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 50,
            background: '#fff', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', width: 380, marginTop: 4,
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Rechercher une tâche ou client…"
                value={addFilter}
                onChange={e => setAddFilter(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              {filteredTaches.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune tâche disponible
                </div>
              ) : filteredTaches.slice(0, 20).map(t => (
                <button
                  key={t.id}
                  onClick={() => handleAddTask(t)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f7fa'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <div style={{ fontWeight: 600 }}>{t.titre}</div>
                  {t.client_nom && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.client_nom}</div>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info message for frozen weeks */}
      {isFrozen && (
        <div style={{ marginTop: 12, padding: '8px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#7c3aed' }}>
          {data?.statut_global === 'validee'
            ? '✅ Cette semaine a été validée par votre manager.'
            : '🔒 Cette semaine est figée et en attente de validation.'}
        </div>
      )}
    </div>
  );
}
