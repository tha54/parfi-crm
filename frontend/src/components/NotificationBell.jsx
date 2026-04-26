import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const TYPE_ICONS = {
  tache_assignee: '📋',
  tache_retard:   '⚠️',
  ldm_signee:     '✅',
  mention:        '@',
  facture_impayee:'🧾',
  autre:          '🔔',
};

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const nonLues = notifications.filter((n) => !n.lue).length;

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(Array.isArray(data) ? data : (data.notifications || []));
    } catch {
      // Silently fail — bell is non-critical
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const markAllRead = async () => {
    try {
      await api.put('/notifications/lire-tout');
      setNotifications((list) => list.map((n) => ({ ...n, lue: true })));
    } catch {
      // ignore
    }
  };

  const handleNotifClick = async (notif) => {
    if (!notif.lue) {
      try {
        await api.put(`/notifications/${notif.id}/lire`);
        setNotifications((list) =>
          list.map((n) => (n.id === notif.id ? { ...n, lue: true } : n))
        );
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (notif.lien) navigate(notif.lien);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 8,
          fontSize: 20,
          lineHeight: 1,
          color: 'rgba(255,255,255,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Notifications"
      >
        🔔
        {nonLues > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              lineHeight: 1,
            }}
          >
            {nonLues > 99 ? '99+' : nonLues}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'fixed',
            // Position below the bell — we use a fixed panel aligned to the sidebar
            bottom: 'auto',
            left: 220,
            // Dynamically calculated; fall back to absolute-ish approximation
            top: 'auto',
            zIndex: 200,
            width: 340,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            border: '1px solid var(--border)',
            maxHeight: 400,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <strong style={{ color: '#0F1F4B', fontSize: 14 }}>Notifications</strong>
            {nonLues > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#5BB8E8',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                Aucune notification
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 16px',
                    cursor: n.lien ? 'pointer' : 'default',
                    background: n.lue ? '#fff' : '#f0f6ff',
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.12s',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.lue ? 400 : 600, fontSize: 13, color: '#0F1F4B', marginBottom: 2 }}>
                      {n.titre}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                      {relativeTime(n.cree_le || n.created_at)}
                    </div>
                  </div>
                  {!n.lue && (
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#5BB8E8',
                      flexShrink: 0,
                      marginTop: 5,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
