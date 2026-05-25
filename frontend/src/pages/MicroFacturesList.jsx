import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const STATUT_STYLE = {
  brouillon:           { label: 'Brouillon',           bg: '#f3f4f6', color: '#6b7280' },
  envoyee:             { label: 'Envoyée',              bg: '#dbeafe', color: '#1d4ed8' },
  partiellement_payee: { label: 'Partiel.',             bg: '#fef3c7', color: '#d97706' },
  payee:               { label: 'Payée ✓',             bg: '#dcfce7', color: '#15803d' },
  en_retard:           { label: 'En retard',            bg: '#fee2e2', color: '#dc2626' },
  annulee:             { label: 'Annulée',              bg: '#f3f4f6', color: '#9ca3af' },
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

export default function MicroFacturesList() {
  const { id: clientId } = useParams();
  const navigate = useNavigate();
  const [factures, setFactures] = useState([]);
  const [microClient, setMicroClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('tous');
  const [anneeExport, setAnneeExport] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mcRes = await api.get(`/micro-clients/by-client/${clientId}`);
      setMicroClient(mcRes.data);
      if (mcRes.data) {
        const res = await api.get(`/micro-factures?micro_client_id=${mcRes.data.id}`);
        setFactures(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const exportFEC = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/micro-factures/export-fec/${microClient.id}?annee=${anneeExport}&token=${token}`, '_blank');
  };

  const FILTERS = ['tous', 'brouillon', 'envoyee', 'partiellement_payee', 'en_retard', 'payee', 'annulee'];
  const filtered = filter === 'tous' ? factures : factures.filter(f => f.statut === filter);

  const stats = {
    ca_paye: factures.filter(f => f.statut === 'payee').reduce((s, f) => s + Number(f.montant_ttc), 0),
    en_attente: factures.filter(f => ['envoyee', 'partiellement_payee'].includes(f.statut))
                        .reduce((s, f) => s + Number(f.solde_restant || f.montant_ttc), 0),
    en_retard: factures.filter(f => f.statut === 'en_retard').reduce((s, f) => s + Number(f.solde_restant || f.montant_ttc), 0),
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>← Micro</Link>
        <span>/</span>
        <span>Factures</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Factures</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{microClient?.nom_commercial || '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Export FEC */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #d1d5db', borderRadius: 7, padding: '5px 12px', background: '#fff' }}>
            <select value={anneeExport} onChange={e => setAnneeExport(e.target.value)}
              style={{ border: 'none', fontSize: 13, background: 'transparent', cursor: 'pointer' }}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportFEC}
              style={{ padding: '3px 10px', background: '#0F1F4B', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              Export FEC
            </button>
          </div>
          <button onClick={() => navigate(`/clients/${clientId}/micro/factures/nouvelle`)}
            style={{ padding: '9px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            + Nouvelle facture
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{fmt(stats.ca_paye)}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>CA encaissé</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{fmt(stats.en_attente)}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>En attente de paiement</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{fmt(stats.en_retard)}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>En retard</div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const cnt = f === 'tous' ? factures.length : factures.filter(x => x.statut === f).length;
          return (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 20,
              background: filter === f ? '#2563eb' : '#f3f4f6',
              color: filter === f ? '#fff' : '#374151',
              border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}>
              {f === 'tous' ? 'Toutes' : (STATUT_STYLE[f]?.label || f)} <span style={{ opacity: 0.7 }}>({cnt})</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>Aucune facture</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Numéro', 'Client', 'Objet', 'Émission', 'Échéance', 'Montant TTC', 'Réglé', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => {
                const retard = ['envoyee', 'partiellement_payee'].includes(f.statut) && new Date(f.date_echeance) < new Date();
                return (
                  <tr key={f.id} onClick={() => navigate(`/clients/${clientId}/micro/factures/${f.id}`)}
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: retard ? '#fff5f5' : '#fff' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#2563eb' }}>{f.numero}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{f.contact_societe || [f.contact_prenom, f.contact_nom].filter(Boolean).join(' ')}</div>
                    </td>
                    <td style={{ padding: '11px 14px', color: '#6b7280', maxWidth: 160 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.objet || '—'}</div>
                    </td>
                    <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(f.date_emission)}</td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', color: retard ? '#dc2626' : '#6b7280', fontWeight: retard ? 600 : 400 }}>
                      {fmtDate(f.date_echeance)}
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 600 }}>{fmt(f.montant_ttc)}</td>
                    <td style={{ padding: '11px 14px', color: '#059669' }}>{Number(f.montant_regle) > 0 ? fmt(f.montant_regle) : '—'}</td>
                    <td style={{ padding: '11px 14px' }}><StatutBadge statut={f.statut} /></td>
                    <td style={{ padding: '11px 14px' }}>
                      <button onClick={e => { e.stopPropagation(); navigate(`/clients/${clientId}/micro/factures/${f.id}`); }}
                        style={{ padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        Voir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
