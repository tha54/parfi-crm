import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const STATUT_STYLE = {
  brouillon:  { label: 'Brouillon',  bg: '#f3f4f6', color: '#6b7280' },
  envoye:     { label: 'Envoyé',     bg: '#dbeafe', color: '#1d4ed8' },
  signe:      { label: 'Signé',      bg: '#dcfce7', color: '#15803d' },
  refuse:     { label: 'Refusé',     bg: '#fee2e2', color: '#dc2626' },
  expire:     { label: 'Expiré',     bg: '#fef3c7', color: '#d97706' },
  converti:   { label: 'Converti',   bg: '#f3e8ff', color: '#7c3aed' },
};

const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

function StatutBadge({ statut }) {
  const s = STATUT_STYLE[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

export default function MicroDevisList() {
  const { id: clientId } = useParams();
  const navigate = useNavigate();
  const [devis, setDevis] = useState([]);
  const [microClient, setMicroClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('tous');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mcRes = await api.get(`/micro-clients/by-client/${clientId}`);
      setMicroClient(mcRes.data);
      if (mcRes.data) {
        const res = await api.get(`/micro-devis?micro_client_id=${mcRes.data.id}`);
        setDevis(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const dupliquer = async (id) => {
    try {
      const res = await api.post(`/micro-devis/${id}/dupliquer`);
      navigate(`/clients/${clientId}/micro/devis/${res.data.id}`);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const supprimer = async (id) => {
    if (!confirm('Supprimer ce devis brouillon ?')) return;
    try {
      await api.delete(`/micro-devis/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Impossible de supprimer');
    }
  };

  const FILTERS = ['tous', 'brouillon', 'envoye', 'signe', 'converti', 'refuse'];
  const filtered = filter === 'tous' ? devis : devis.filter(d => d.statut === filter);

  const totals = {
    ca: devis.filter(d => d.statut === 'signe').reduce((s, d) => s + Number(d.montant_ttc), 0),
    en_attente: devis.filter(d => d.statut === 'envoye').reduce((s, d) => s + Number(d.montant_ttc), 0),
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>← Client</Link>
        <span>/</span>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>Micro</Link>
        <span>/</span>
        <span>Devis</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Devis</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{microClient?.nom_commercial || '—'}</p>
        </div>
        <button onClick={() => navigate(`/clients/${clientId}/micro/devis/nouveau`)}
          style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + Nouveau devis
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Signés', val: fmt(totals.ca), color: '#059669' },
          { label: 'En attente de signature', val: fmt(totals.en_attente), color: '#2563eb' },
          { label: 'Total devis', val: devis.length, color: '#374151' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 20,
            background: filter === f ? '#2563eb' : '#f3f4f6',
            color: filter === f ? '#fff' : '#374151',
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>
            {f === 'tous' ? 'Tous' : (STATUT_STYLE[f]?.label || f)}
            {' '}
            <span style={{ opacity: 0.7 }}>({f === 'tous' ? devis.length : devis.filter(d => d.statut === f).length})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
            Aucun devis {filter !== 'tous' ? `(${STATUT_STYLE[filter]?.label})` : ''}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Numéro', 'Contact / Société', 'Objet', 'Date', 'Validité', 'Montant HT', 'Statut', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                  onClick={() => navigate(`/clients/${clientId}/micro/devis/${d.id}`)}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: '#2563eb' }}>{d.numero}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{d.contact_societe || [d.contact_prenom, d.contact_nom].filter(Boolean).join(' ')}</div>
                    {d.contact_societe && <div style={{ fontSize: 11, color: '#6b7280' }}>{[d.contact_prenom, d.contact_nom].filter(Boolean).join(' ')}</div>}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#374151', maxWidth: 200 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.objet || '—'}</div>
                  </td>
                  <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(d.date_emission)}</td>
                  <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(d.date_validite)}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{fmt(d.montant_ht)}</td>
                  <td style={{ padding: '11px 14px' }}><StatutBadge statut={d.statut} /></td>
                  <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => navigate(`/clients/${clientId}/micro/devis/${d.id}`)}
                        style={{ padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        Voir
                      </button>
                      <button onClick={() => dupliquer(d.id)}
                        style={{ padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        Dupliquer
                      </button>
                      {d.statut === 'brouillon' && (
                        <button onClick={() => supprimer(d.id)}
                          style={{ padding: '3px 10px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                          Suppr.
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
