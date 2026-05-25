import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { portalApi } from '../context/MicroPortalAuthContext';
import { useMicroPortalAuth } from '../context/MicroPortalAuthContext';
import MicroPortalLayout from '../components/MicroPortalLayout';

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUT = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoye:    { label: 'Envoyé', bg: '#dbeafe', color: '#1d4ed8' },
  signe:     { label: 'Signé ✓', bg: '#dcfce7', color: '#166534' },
  refuse:    { label: 'Refusé', bg: '#fee2e2', color: '#dc2626' },
  expire:    { label: 'Expiré', bg: '#f3f4f6', color: '#9ca3af' },
  converti:  { label: 'Converti en facture', bg: '#f0fdf4', color: '#166534' },
};

function Badge({ statut }) {
  const s = STATUT[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

// ─── Liste ───────────────────────────────────────────────────────────────────
export function MicroPortalDevisList() {
  const navigate = useNavigate();
  const [devis, setDevis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    portalApi.get('/devis').then(r => setDevis(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = devis.filter(d => {
    const q = search.toLowerCase();
    const matchQ = !q || d.numero.toLowerCase().includes(q)
      || (d.societe || '').toLowerCase().includes(q)
      || (d.nom || '').toLowerCase().includes(q);
    const matchF = !filtre || d.statut === filtre;
    return matchQ && matchF;
  });

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Mes devis</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{devis.length} devis au total</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }} />
        <select value={filtre} onChange={e => setFiltre(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div>Aucun devis trouvé</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Numéro', 'Client', 'Émission', 'Validité', 'Montant', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff', cursor: 'pointer' }}
                  onClick={() => navigate(`/micro-portail/devis/${d.id}`)}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: '#2563eb' }}>{d.numero}</td>
                  <td style={{ padding: '11px 14px' }}>{d.societe || `${d.prenom || ''} ${d.nom}`}</td>
                  <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmtDate(d.date_emission)}</td>
                  <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmtDate(d.date_validite)}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmtEur(d.montant_ttc)}</td>
                  <td style={{ padding: '11px 14px' }}><Badge statut={d.statut} /></td>
                  <td style={{ padding: '11px 14px', color: '#6b7280' }}>→</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </MicroPortalLayout>
  );
}

// ─── Détail ──────────────────────────────────────────────────────────────────
export function MicroPortalDevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { portalToken } = useMicroPortalAuth();
  const [devis, setDevis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get(`/devis/${id}`).then(r => setDevis(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <MicroPortalLayout><div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div></MicroPortalLayout>;
  if (!devis) return <MicroPortalLayout><div style={{ padding: 40, color: '#dc2626' }}>Devis introuvable.</div></MicroPortalLayout>;

  const s = STATUT[devis.statut] || {};

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/micro-portail/devis')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13 }}>
          ← Retour
        </button>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{devis.numero}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{devis.numero}</h1>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Badge statut={devis.statut} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              Émis le {fmtDate(devis.date_emission)} · Valide jusqu'au {fmtDate(devis.date_validite)}
            </span>
          </div>
        </div>
        <button
          onClick={() => window.open(`/api/micro-portail/devis/${id}/pdf?token=${portalToken}`, '_blank')}
          style={{ padding: '9px 18px', background: '#0F1F4B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ⬇ Télécharger PDF
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>CLIENT</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{devis.societe || `${devis.prenom || ''} ${devis.nom}`}</div>
          {devis.adresse && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-line' }}>{devis.adresse}</div>}
          {devis.email && <div style={{ fontSize: 13, color: '#2563eb', marginTop: 4 }}>{devis.email}</div>}
        </div>
        <div style={{ background: '#0F1F4B', borderRadius: 10, padding: '16px 20px', color: '#fff' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: 8 }}>MONTANT</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{fmtEur(devis.montant_ttc)}</div>
          {devis.objet && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>{devis.objet}</div>}
        </div>
      </div>

      {/* Lignes */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14 }}>Détail des prestations</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Prestation', 'Qté', 'Unité', 'Prix unitaire', 'Remise', 'Total HT'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(devis.lignes || []).map((l, i) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600 }}>{l.libelle}</div>
                  {l.description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{l.description}</div>}
                </td>
                <td style={{ padding: '10px 14px', color: '#374151' }}>{l.quantite}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{l.unite}</td>
                <td style={{ padding: '10px 14px' }}>{fmtEur(l.prix_unitaire)}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{l.remise_pct > 0 ? `${l.remise_pct}%` : '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmtEur(l.montant_ht)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
              <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 700, color: '#374151' }}>
                {devis.regime_tva === 'franchise'
                  ? 'TVA non applicable, art. 293 B du CGI'
                  : `Total HT`}
              </td>
              <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 15, color: '#0F1F4B' }}>
                {fmtEur(devis.montant_ttc)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {devis.conditions_paiement && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#854d0e' }}>
          <strong>Conditions de paiement :</strong> {devis.conditions_paiement}
        </div>
      )}
    </MicroPortalLayout>
  );
}
