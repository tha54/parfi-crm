import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function fmtD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO()    { return fmtD(new Date()); }
function tomorrowISO() { const d = new Date(); d.setDate(d.getDate() + 1); return fmtD(d); }

function getMondayStr() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  const mon = new Date(); const dow2 = (mon.getDay() + 6) % 7;
  mon.setDate(mon.getDate() - dow2); mon.setHours(0, 0, 0, 0);
  return `${mon.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function fmtH(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60); const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function DossierBudgetBar({ budget, consomme }) {
  if (!budget) return null;
  const pct     = Math.min(200, Math.round((consomme / budget) * 100));
  const restant = budget - consomme;
  const color   = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  const bg      = pct >= 90 ? '#fff1f2' : pct >= 70 ? '#fffbeb' : '#f0fdf4';
  return (
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 6, padding: '5px 8px', marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, justifyContent: 'space-between' }}>
        <span style={{ color: '#64748b' }}>Alloué <strong style={{ color: '#0F1F4B' }}>{fmtH(budget)}</strong></span>
        <span style={{ color: '#64748b' }}>Saisi <strong style={{ color }}>{fmtH(consomme)}</strong></span>
        <span style={{ color: '#64748b' }}>Restant <strong style={{ color: restant < 0 ? '#ef4444' : '#374151' }}>{restant < 0 ? '-' + fmtH(-restant) : fmtH(restant)}</strong></span>
        <span style={{ fontWeight: 700, color, fontSize: 12 }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

function groupByClient(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const key = t.client_id ?? 0;
    if (!map.has(key)) map.set(key, { client_id: t.client_id || null, client_nom: t.client_nom || null, tasks: [] });
    map.get(key).tasks.push(t);
  }
  return [...map.values()];
}

function daysOverdue(dateStr) {
  return Math.ceil((Date.now() - new Date(dateStr + 'T12:00:00').getTime()) / 86400000);
}

function labelDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const MONTH_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAY_ABBR     = ['L','M','M','J','V','S','D'];
const TARGET_MIN   = 2100; // 35h

// ─── Cabinet bell ─────────────────────────────────────────────────────────────

const BELL_ICONS = { prospect: '📡', ldm_signe: '🖊' };
const BELL_SEEN_KEY = 'cabinet_bell_last_seen';

const FACTU_ICONS = { non_facture: '🚫', sous_facturation: '⬇️', depassement: '📈', depassement_temps: '⏱' };
const FACTU_LABELS = { non_facture: 'Non facturé', sous_facturation: 'Sous-facturation', depassement: 'Dépassement budget', depassement_temps: 'Dépassement temps' };

function CabinetBell({ alertes, factuAlertes, evenements }) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => parseInt(localStorage.getItem(BELL_SEEN_KEY) || '0', 10));
  const ref = useRef(null);

  const unseenEvents = evenements.filter(a => new Date(a.date_evt).getTime() > lastSeen).length;
  const totalBadge   = alertes.length + factuAlertes.length + unseenEvents;
  const hasAlertes   = alertes.length > 0 || factuAlertes.length > 0;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const handleToggle = () => {
    if (!open) {
      const ts = Date.now();
      localStorage.setItem(BELL_SEEN_KEY, String(ts));
      setLastSeen(ts);
    }
    setOpen(v => !v);
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={handleToggle}
        style={{
          position: 'relative',
          background: open ? (hasAlertes ? '#fffbeb' : '#eef2ff') : 'none',
          border: '1px solid ' + (open ? (hasAlertes ? '#fcd34d' : '#c7d2fe') : 'var(--border)'),
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
          fontSize: 18, lineHeight: 1, transition: 'all .15s',
        }}
        title="Activité du cabinet"
      >
        🔔
        {totalBadge > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: hasAlertes ? '#f59e0b' : '#ef4444',
            color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>{totalBadge > 9 ? '9+' : totalBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
          width: 340, background: '#fff', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,.15)', border: '1px solid #e2e8f0',
          maxHeight: 460, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Alertes équipe incomplète */}
          {alertes.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ padding: '9px 16px', background: '#fffbeb', borderBottom: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>⚠️</span>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }}>
                  {alertes.length} client{alertes.length > 1 ? 's' : ''} sans équipe complète
                </span>
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', background: '#fffbeb' }}>
                {alertes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 16px', borderBottom: '1px solid #fef3c7', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>{a.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alertes facturation */}
          {factuAlertes.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ padding: '9px 16px', background: '#fff1f2', borderBottom: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>💰</span>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#9f1239' }}>
                  {factuAlertes.length} alerte{factuAlertes.length > 1 ? 's' : ''} facturation
                </span>
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', background: '#fff1f2' }}>
                {factuAlertes.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 16px', borderBottom: '1px solid #ffe4e6', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{FACTU_ICONS[a.type] || '💰'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#9f1239', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.client_nom}</div>
                      <div style={{ fontSize: 11, color: '#be123c', marginTop: 1 }}>{FACTU_LABELS[a.type]} — {a.ecart}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activité récente */}
          <div style={{ padding: '9px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: 12, color: '#64748b', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Activité récente
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {evenements.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucune activité récente</div>
            ) : evenements.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{BELL_ICONS[a.type] || '🔔'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0F1F4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{relativeTime(a.date_evt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ allTaches, selectedDate, onSelectDate, calMonth, onPrevMonth, onNextMonth }) {
  const today = todayISO();
  const { year, month } = calMonth;

  const firstOfMonth = new Date(year, month, 1);
  const startDow    = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells  = Math.ceil((startDow + daysInMonth) / 7) * 7;

  const taskDates   = new Set(allTaches.filter(t => t.date_echeance && t.statut !== 'termine').map(t => t.date_echeance.split('T')[0]));
  const overdueDates = new Set(allTaches.filter(t => t.date_echeance && t.statut !== 'termine' && t.date_echeance.split('T')[0] < today).map(t => t.date_echeance.split('T')[0]));

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startDow + 1;
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const dateStr = inMonth ? fmtD(new Date(year, month, dayNum)) : '';
    return { dayNum, dateStr, inMonth, colIdx: i % 7 };
  });

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={onPrevMonth}>◀</button>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#0F1F4B' }}>{MONTH_LABELS[month]} {year}</span>
        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={onNextMonth}>▶</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_ABBR.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: i >= 5 ? '#94a3b8' : '#64748b', paddingBottom: 6 }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px 1px' }}>
        {cells.map(({ dayNum, dateStr, inMonth, colIdx }, i) => {
          const isToday    = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const hasTasks   = inMonth && taskDates.has(dateStr);
          const isLate     = inMonth && overdueDates.has(dateStr);
          const isWeekend  = colIdx >= 5;

          return (
            <div
              key={i}
              onClick={() => inMonth && onSelectDate(isSelected ? null : dateStr)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '3px 0', borderRadius: 6,
                cursor: inMonth ? 'pointer' : 'default',
                background: isSelected ? '#0F1F4B' : isToday ? '#dbeafe' : 'transparent',
                opacity: inMonth ? 1 : 0,
                transition: 'background .12s',
              }}
              onMouseEnter={e => { if (inMonth && !isSelected && !isToday) e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={e => { if (inMonth && !isSelected && !isToday) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                fontSize: 12, lineHeight: '20px', width: 20, textAlign: 'center',
                fontWeight: isToday || isSelected ? 700 : 400,
                color: isSelected ? '#fff' : isToday ? '#1d4ed8' : isWeekend ? '#94a3b8' : '#374151',
              }}>
                {inMonth ? dayNum : ''}
              </span>
              {hasTasks && (
                <div style={{ width: 4, height: 4, borderRadius: '50%', marginTop: 1, background: isSelected ? '#93c5fd' : isLate ? '#ef4444' : '#6366f1' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task item ────────────────────────────────────────────────────────────────

function TaskItem({ t, hideClient }) {
  const today = todayISO();
  const dateStr = t.date_echeance?.split('T')[0];
  const isLate = dateStr && dateStr < today;
  const daysLate = isLate ? daysOverdue(dateStr) : 0;

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F1F4B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.titre || t.description}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
          {t.client_nom && !hideClient && <span>{t.client_nom}</span>}
          {t.budget_minutes > 0 && <span style={{ color: '#6366f1', fontWeight: 600 }}>{fmtH(t.budget_minutes)}</span>}
        </div>
      </div>
      {isLate && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: '#fee2e2', color: '#b91c1c', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {daysLate}j
        </span>
      )}
    </div>
  );
}

function SectionHeader({ label, count, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 4px', marginTop: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: color || '#64748b' }}>{label}</span>
      {count > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: color === '#b91c1c' ? '#fee2e2' : '#f1f5f9', color: color || '#64748b' }}>{count}</span>
      )}
    </div>
  );
}

// ─── Tâches column ────────────────────────────────────────────────────────────

function BlocTaches({ allTaches, selectedDate, onSelectDate, clientBudgets }) {
  const today    = todayISO();
  const tomorrow = tomorrowISO();

  const overdue   = allTaches.filter(t => t.statut !== 'termine' && t.date_echeance?.split('T')[0] < today).sort((a, b) => a.date_echeance < b.date_echeance ? -1 : 1);
  const todayT    = allTaches.filter(t => t.statut !== 'termine' && t.date_echeance?.split('T')[0] === today);
  const tomorrowT = allTaches.filter(t => t.statut !== 'termine' && t.date_echeance?.split('T')[0] === tomorrow);
  const selTasks  = selectedDate ? allTaches.filter(t => t.statut !== 'termine' && t.date_echeance?.split('T')[0] === selectedDate) : null;

  const renderGroups = (tasks) => groupByClient(tasks).map(g => {
    const bd = g.client_id ? clientBudgets?.[g.client_id] : null;
    return (
      <div key={g.client_id ?? 'none'} style={{ marginTop: 6 }}>
        {g.client_id && (
          <div style={{ marginBottom: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📁</span>{g.client_nom}
            </div>
            {bd?.budget_minutes > 0 && (
              <DossierBudgetBar budget={bd.budget_minutes} consomme={bd.consomme_minutes} />
            )}
          </div>
        )}
        {g.tasks.map(t => <TaskItem key={t.id} t={t} hideClient={!!g.client_id} />)}
      </div>
    );
  });

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#0F1F4B' }}>
          {selectedDate ? (
            <span style={{ textTransform: 'capitalize' }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          ) : '📋 Mes tâches'}
        </span>
        {selectedDate && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11 }}
            onClick={() => onSelectDate(null)}
          >
            ← Aujourd'hui
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedDate ? (
          selTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#15803d' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Aucune tâche ce jour</div>
            </div>
          ) : renderGroups(selTasks)
        ) : (
          <>
            {overdue.length > 0 && (
              <>
                <SectionHeader label="En retard" count={overdue.length} color="#b91c1c" />
                {renderGroups(overdue)}
              </>
            )}
            <SectionHeader label="Aujourd'hui" count={todayT.length} />
            {todayT.length === 0 ? (
              <div style={{ padding: '8px 0 4px', color: '#15803d', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span><span>Rien à faire aujourd'hui</span>
              </div>
            ) : renderGroups(todayT)}
            {tomorrowT.length > 0 && (
              <>
                <SectionHeader label="Demain" count={tomorrowT.length} />
                {renderGroups(tomorrowT)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Calendrier column ────────────────────────────────────────────────────────

function BlocCalendar({ allTaches, selectedDate, onSelectDate }) {
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const prevMonth = () => setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });

  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, color: '#0F1F4B', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        📅 Calendrier
      </div>
      <MiniCalendar
        allTaches={allTaches}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        calMonth={calMonth}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
      />
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
          <span>Tâche planifiée</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <span>En retard</span>
        </div>
      </div>
    </div>
  );
}

// ─── Temps column ─────────────────────────────────────────────────────────────

function BlocTemps({ allTaches, totalMin, onTimeAdded }) {
  const activeTaches = allTaches.filter(t => t.statut !== 'termine');
  const [form, setForm] = useState({ taskId: '', hours: '', minutes: '', date: todayISO(), comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const pct   = Math.min(150, Math.round((totalMin / TARGET_MIN) * 100));
  const color = pct > 100 ? '#d63031' : pct >= 95 ? '#e67e22' : '#00897b';
  const reste = TARGET_MIN - totalMin;
  const isOver = totalMin > TARGET_MIN;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.taskId) { setError('Sélectionnez une tâche'); return; }
    const total = parseInt(form.hours || '0', 10) * 60 + parseInt(form.minutes || '0', 10);
    if (total <= 0) { setError('Durée invalide'); return; }
    setSubmitting(true);
    try {
      await api.post(`/tache-temps/tache/${form.taskId}`, {
        duree_minutes: total,
        date_travail: form.date || todayISO(),
        commentaire: form.comment.trim() || null,
        source: 'feuille_temps',
      });
      setForm(f => ({ ...f, hours: '', minutes: '', comment: '' }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      onTimeAdded();
    } catch (e) {
      setError(e.response?.data?.message || 'Erreur lors de la saisie');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#0F1F4B', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        ⏱ Saisir mon temps
      </div>

      {/* Time entry form */}
      <form onSubmit={handleSubmit} style={{ flex: 1 }}>
        {/* Task select */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Tâche / Dossier</label>
          <select
            className="form-control"
            value={form.taskId}
            onChange={e => setForm(f => ({ ...f, taskId: e.target.value }))}
            style={{ fontSize: 12 }}
          >
            <option value="">Sélectionner une tâche…</option>
            {activeTaches.map(t => (
              <option key={t.id} value={t.id}>
                {t.client_nom ? `[${t.client_nom}] ` : ''}{t.titre || t.description}
              </option>
            ))}
          </select>
        </div>

        {/* Duration */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>Heures</label>
            <input type="number" min="0" max="23" placeholder="0" className="form-control"
              style={{ fontSize: 13, textAlign: 'center' }}
              value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelSt}>Minutes</label>
            <input type="number" min="0" max="59" step="5" placeholder="30" className="form-control"
              style={{ fontSize: 13, textAlign: 'center' }}
              value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={labelSt}>Date</label>
            <input type="date" className="form-control" style={{ fontSize: 12 }}
              value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
        </div>

        {/* Comment */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelSt}>Commentaire</label>
          <textarea
            value={form.comment}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            rows={2}
            placeholder="Optionnel…"
            style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>

        {error && <div style={{ fontSize: 11, color: '#d63031', marginBottom: 8, fontWeight: 600 }}>{error}</div>}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', fontSize: 13 }}
          disabled={submitting}
        >
          {submitting ? 'Enregistrement…' : success ? '✓ Enregistré !' : '+ Enregistrer'}
        </button>
      </form>

      {/* Weekly meter */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Semaine en cours</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5 }}>{fmtH(totalMin)}</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>/ {fmtH(TARGET_MIN)}</span>
          </div>
        </div>
        <div style={{ height: 12, background: '#e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 8, transition: 'width .5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
          <span>0h</span>
          <span style={{ fontWeight: 700, color }}>{Math.round(Math.min(100, pct))}%</span>
          <span>35h</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: isOver ? '#d63031' : '#64748b', fontWeight: isOver ? 600 : 400 }}>
          {isOver ? `⚠ Dépassement de ${fmtH(Math.abs(reste))}` : `Reste ${fmtH(reste)} cette semaine`}
        </div>
      </div>
    </div>
  );
}

const labelSt = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 3 };

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MaJournee() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const today = todayISO();
  const dateLabel = (() => {
    const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const [allTaches, setAllTaches]       = useState([]);
  const [totalMin, setTotalMin]         = useState(0);
  const [alertes, setAlertes]           = useState([]);
  const [evenements, setEvenements]     = useState([]);
  const [factuAlertes, setFactuAlertes] = useState([]);
  const [clientBudgets, setClientBudgets] = useState({});
  const [loading, setLoading]           = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const loadTaches = useCallback(async () => {
    const { data } = await api.get(`/taches?utilisateur_id=${user.id}`);
    setAllTaches(data || []);
  }, [user.id]);

  const loadTemps = useCallback(async () => {
    const semaine = getMondayStr();
    const { data } = await api.get(`/tache-temps/feuille?semaine=${semaine}`);
    setTotalMin(data?.total_semaine || 0);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, ttRes, actRes, factuRes, clientsRes] = await Promise.all([
        api.get(`/taches?utilisateur_id=${user.id}`),
        api.get(`/tache-temps/feuille?semaine=${getMondayStr()}`),
        api.get('/activite-cabinet').catch(() => ({ data: { alertes: [], evenements: [] } })),
        api.get('/alertes-facturation').catch(() => ({ data: [] })),
        api.get('/clients').catch(() => ({ data: [] })),
      ]);
      setAllTaches(tRes.data || []);
      setTotalMin(ttRes.data?.total_semaine || 0);
      setAlertes(actRes.data?.alertes || []);
      setEvenements(actRes.data?.evenements || []);
      setFactuAlertes(factuRes.data || []);
      const map = {};
      for (const c of (clientsRes.data || [])) {
        map[c.id] = {
          budget_minutes:   parseInt(c.ldm_budget_minutes_total) || 0,
          consomme_minutes: parseInt(c.temps_consomme_minutes)   || 0,
        };
      }
      setClientBudgets(map);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <>
      <style>{`
        .mj-grid {
          display: grid;
          grid-template-columns: 1fr 280px 1fr;
          gap: 20px;
          align-items: start;
        }
        .mj-col1, .mj-col2, .mj-col3 { min-width: 0; }
        @media (max-width: 1100px) { .mj-grid { grid-template-columns: 1fr 1fr; } .mj-col3 { grid-column: 1 / -1; } }
        @media (max-width: 680px)  { .mj-grid { grid-template-columns: 1fr; } .mj-col2,.mj-col3 { grid-column: auto; } }
      `}</style>

      {/* Page header — sticky, flush avec le pattern global */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>Ma journée</h1>
          <p className="page-subtitle" style={{ fontSize: 14, color: '#64748b', margin: 0 }}>{dateLabel}</p>
        </div>
        <CabinetBell alertes={alertes} factuAlertes={factuAlertes} evenements={evenements} />
      </div>

      {/* Content */}
      <div className="page-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div className="spinner"><div className="spinner-ring" /></div>
          </div>
        ) : (
          <div className="mj-grid">
            <div className="mj-col1">
              <BlocTaches allTaches={allTaches} selectedDate={selectedDate} onSelectDate={setSelectedDate} clientBudgets={clientBudgets} />
            </div>
            <div className="mj-col2">
              <BlocCalendar allTaches={allTaches} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            </div>
            <div className="mj-col3">
              <BlocTemps allTaches={allTaches} totalMin={totalMin} onTimeAdded={loadTemps} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
