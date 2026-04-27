const fmtMin = (min) => {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

export default function TaskBudgetBar({ budgetMinutes, consumedMinutes, compact = false }) {
  if (!budgetMinutes) return null;

  const clamped = Math.min(Math.round((consumedMinutes / budgetMinutes) * 100), 999);
  const color =
    clamped >= 100 ? '#d63031' :
    clamped >= 80  ? '#e67e22' : '#00897b';

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', fontSize: compact ? 11 : 12, marginBottom: 4,
      }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Budget temps</span>
        <span style={{ fontWeight: 700, color }}>
          {fmtMin(consumedMinutes)} / {fmtMin(budgetMinutes)}
          {' '}
          <span style={{
            background: color + '20', color, borderRadius: 8,
            padding: '1px 6px', fontSize: 10, fontWeight: 800,
          }}>
            {clamped}%
          </span>
        </span>
      </div>

      <div style={{ height: compact ? 6 : 8, borderRadius: 4, background: '#e9ecef', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4,
          width: `${Math.min(clamped, 100)}%`,
          background: color,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {!compact && clamped >= 100 && (
        <div style={{ fontSize: 11, marginTop: 5, color: '#d63031', fontWeight: 600 }}>
          🔴 Budget dépassé — commentaire obligatoire pour toute nouvelle saisie
        </div>
      )}
      {!compact && clamped >= 80 && clamped < 100 && (
        <div style={{ fontSize: 11, marginTop: 5, color: '#e67e22', fontWeight: 600 }}>
          🟡 Attention : {clamped}% du budget consommé
        </div>
      )}
    </div>
  );
}
