import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Pipeline from './Pipeline';
import Prospects from './Prospects';

export default function ProspectsPipeline() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(
    searchParams.get('tab') === 'prospects' ? 'prospects' : 'pipeline'
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'prospects' || t === 'pipeline') setTab(t);
  }, [searchParams]);

  const switchTab = (t) => {
    setTab(t);
    setSearchParams({ tab: t }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '2px solid var(--border)',
        background: 'var(--bg-primary)',
        padding: '0 24px',
        flexShrink: 0,
      }}>
        {[
          { key: 'pipeline',  icon: '📊', label: 'Pipeline' },
          { key: 'prospects', icon: '📡', label: 'Prospects' },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              background: 'none',
              cursor: 'pointer',
              fontWeight: tab === key ? 700 : 400,
              color: tab === key ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'color .15s',
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'pipeline'  && <Pipeline />}
        {tab === 'prospects' && <Prospects />}
      </div>
    </div>
  );
}
