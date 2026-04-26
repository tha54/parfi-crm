import { useState, useEffect } from 'react';
import api from '../services/api';

const ACTION_ICONS = {
  create: '🟢',
  update: '✏️',
  delete: '🔴',
  statut_change: '🔄',
};

const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/**
 * AuditLog — reusable audit history component.
 *
 * Props:
 *   entityType  string  e.g. "client", "devis"
 *   entityId    number  the entity's primary key
 *   compact     bool    shows a shorter version (max 5 entries, no toggle)
 */
export default function AuditLog({ entityType, entityId, compact = false }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError('');
    api
      .get(`/audit?entity_type=${entityType}&entity_id=${entityId}`)
      .then((r) => setEntries(r.data || []))
      .catch(() => setError('Impossible de charger l\'historique.'))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Chargement de l'historique…
      </div>
    );
  }

  if (error) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{error}</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: compact ? '8px 0' : '16px 0' }}>
        Aucun historique.
      </div>
    );
  }

  const maxDefault = compact ? 5 : 10;
  const displayed = showAll ? entries : entries.slice(0, maxDefault);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
        {displayed.map((entry, idx) => {
          const icon = ACTION_ICONS[entry.action] || '📌';
          let champs = null;
          if (entry.champs_modifies) {
            try {
              const parsed =
                typeof entry.champs_modifies === 'string'
                  ? JSON.parse(entry.champs_modifies)
                  : entry.champs_modifies;
              champs = Array.isArray(parsed) ? parsed : Object.keys(parsed);
            } catch {
              champs = [String(entry.champs_modifies)];
            }
          }

          return (
            <div
              key={entry.id || idx}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                padding: compact ? '6px 0' : '10px 0',
                borderBottom: idx < displayed.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}
            >
              <span style={{ fontSize: compact ? 13 : 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: compact ? 11 : 12, color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {entry.utilisateur_nom || 'Système'}
                  </strong>
                  {' · '}
                  <span>{entry.action}</span>
                  {' · '}
                  <span>{fmtDateTime(entry.cree_le || entry.date || entry.created_at)}</span>
                </div>
                {champs && champs.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Modifié : {champs.join(', ')}
                  </div>
                )}
                {entry.description && (
                  <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 2 }}>
                    {entry.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && entries.length > maxDefault && (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? '▲ Réduire' : `Voir tout (${entries.length} entrées)`}
          </button>
        </div>
      )}
    </div>
  );
}
