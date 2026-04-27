import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const TYPE_ICONS = {
  client: '👥', prospect: '📡', tache: '✅',
  devis: '📄', interaction: '💬', document: '📁',
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Debounced search
  const search = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const go = (link) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(link);
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) go(results[selected].link);
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: 6,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.65)', fontSize: 12, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left',
        }}
      >
        <span>🔍</span>
        <span style={{ flex: 1 }}>Rechercher…</span>
        <kbd style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 4px', fontSize: 10 }}>Ctrl+K</kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: '10vh',
          }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560,
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            {/* Input */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔍</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Rechercher clients, tâches, devis, interactions…"
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: 16,
                  background: 'transparent', color: '#1e293b',
                }}
                autoComplete="off"
              />
              {loading && <div style={{ fontSize: 12, color: '#94a3b8' }}>…</div>}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 18 }}>×</button>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => go(r.link)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 16px',
                      background: i === selected ? '#f0f9ff' : 'transparent',
                      border: 'none', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    }}
                    onMouseEnter={() => setSelected(i)}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[r.type] || '📄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label}
                      </div>
                      {r.sub && (
                        <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.sub}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>
                      {r.type}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                Aucun résultat pour « {query} »
              </div>
            )}

            {query.length < 2 && (
              <div style={{ padding: '16px', color: '#94a3b8', fontSize: 12 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#64748b' }}>Raccourcis</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['clients', 'pipeline', 'taches', 'devis', 'prospects'].map(p => (
                    <button key={p} onClick={() => { navigate(`/${p}`); setOpen(false); }}
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                      /{p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
