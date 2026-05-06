import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const TYPE_ICONS = {
  tache_assignee:  '📋',
  tache_retard:    '⚠️',
  tache_terminee:  '✅',
  budget_alerte:   '🟡',
  budget_depasse:  '🔴',
  ldm_signee:      '🖊',
  ldm_affectee:    '📋',
  mention:         '💬',
  facture_impayee: '🧾',
  appel:           '📞',
  prospect:        '📡',
  absence:         '🏖️',
  interaction:     '💬',
  autre:           '🔔',
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
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const nonLues = notifications.filter(n => !n.lue).length;

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      const list = Array.isArray(data) ? data : (data.notifications || []);
      setNotifications(list);
    } catch {
      // non-critical
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
    const handle = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const panelHeight = 400;
      const panelWidth = 340;
      // Open to the right of the sidebar, aligned vertically with the button
      // but clamp so it doesn't go off the bottom of the screen
      const top = Math.min(rect.top, window.innerHeight - panelHeight - 8);
      const left = rect.right + 8;
      setDropPos({ top: Math.max(8, top), left });
    }
    setOpen(o => !o);
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/lire-tout');
      setNotifications(list => list.map(n => ({ ...n, lue: true })));
    } catch { /* ignore */ }
  };

  const handleClick = async (notif) => {
    if (!notif.lue) {
      try {
        await api.put(`/notifications/${notif.id}/lire`);
        setNotifications(list => list.map(n => n.id === notif.id ? { ...n, lue: true } : n));
      } catch { /* ignore */ }
    }
    setOpen(false);
    if (notif.lien) navigate(notif.lien);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        style={{
          position: 'relative',
          background: open ? 'rgba(255,255,255,0.15)' : 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 8,
          fontSize: 20,
          lineHeight: 1,
          color: 'rgba(255,255,255,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title="Notifications"
      >
        🔔
        {nonLues > 0 && (
          <span style={{
            position: 'absolute',
            top: 2, right: 2,
            minWidth: 16, height: 16,
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
          }}>
            {nonLues > 99 ? '99+' : nonLues}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 9999,
            width: 340,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
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
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
            background: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ color: '#0F1F4B', fontSize: 14 }}>Notifications</strong>
              {nonLues > 0 && (
                <span style={{ fontSize: 11, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontWeight: 700 }}>
                  {nonLues}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {nonLues > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5BB8E8', fontSize: 12, fontWeight: 600, padding: 0 }}
                >
                  Tout lire
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16, padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                Aucune notification
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
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
                  onMouseEnter={e => { if (n.lien) e.currentTarget.style.background = n.lue ? '#f8fafc' : '#e8f2ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.lue ? '#fff' : '#f0f6ff'; }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: n.lue ? 400 : 600, fontSize: 13, color: '#0F1F4B', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.titre}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                      {relativeTime(n.createdAt || n.cree_le || n.created_at)}
                    </div>
                  </div>
                  {!n.lue && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5BB8E8', flexShrink: 0, marginTop: 5 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
