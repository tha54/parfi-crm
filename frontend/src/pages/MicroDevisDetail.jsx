import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const STATUT_STYLE = {
  brouillon:  { label: 'Brouillon',  bg: '#f3f4f6', color: '#6b7280' },
  envoye:     { label: 'Envoyé',     bg: '#dbeafe', color: '#1d4ed8' },
  signe:      { label: 'Signé ✓',   bg: '#dcfce7', color: '#15803d' },
  refuse:     { label: 'Refusé',     bg: '#fee2e2', color: '#dc2626' },
  expire:     { label: 'Expiré',     bg: '#fef3c7', color: '#d97706' },
  converti:   { label: 'Converti →', bg: '#f3e8ff', color: '#7c3aed' },
};

const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function StatutBadge({ statut }) {
  const s = STATUT_STYLE[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '5px 14px', borderRadius: 16, fontSize: 13, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

export default function MicroDevisDetail() {
  const { id: clientId, devisId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [echeance, setEcheance] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/micro-devis/${devisId}`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [devisId]);

  useEffect(() => { load(); }, [load]);

  const action = async (type, body = {}) => {
    setActionLoading(type);
    try {
      const res = await api.post(`/micro-devis/${devisId}/${type}`, body);
      if (type === 'convertir-facture') {
        navigate(`/clients/${clientId}/micro/factures/${res.data.facture_id}`);
        return;
      }
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    } finally {
      setActionLoading('');
      setShowConvertModal(false);
    }
  };

  const openPdf = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/micro-devis/${devisId}/pdf?token=${token}`, '_blank');
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;
  if (!data) return <div style={{ padding: 40, color: '#dc2626' }}>Devis introuvable</div>;

  const { lignes = [], ...devis } = data;
  const s = STATUT_STYLE[devis.statut] || {};

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>Micro</Link>
        <span>/</span>
        <Link to={`/clients/${clientId}/micro/devis`} style={{ color: '#2563eb', textDecoration: 'none' }}>Devis</Link>
        <span>/</span>
        <span>{devis.numero}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{devis.numero}</h1>
            <StatutBadge statut={devis.statut} />
          </div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            {devis.nom_commercial || devis.client_nom} · {devis.contact_societe || [devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' ')}
          </div>
          {devis.objet && <div style={{ color: '#374151', fontSize: 14, marginTop: 4, fontStyle: 'italic' }}>{devis.objet}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={openPdf}
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            📄 PDF
          </button>

          {['brouillon', 'envoye'].includes(devis.statut) && (
            <button onClick={() => navigate(`/clients/${clientId}/micro/devis/${devisId}/modifier`)}
              style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              ✏️ Modifier
            </button>
          )}

          <button onClick={() => action('dupliquer')} disabled={actionLoading === 'dupliquer'}
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            📋 Dupliquer
          </button>

          {devis.statut === 'brouillon' && (
            <button onClick={() => action('envoyer')} disabled={actionLoading === 'envoyer'}
              style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {actionLoading === 'envoyer' ? 'Envoi…' : '📧 Envoyer'}
            </button>
          )}

          {devis.statut === 'envoye' && (
            <button onClick={() => action('envoyer')} disabled={actionLoading === 'envoyer'}
              style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              {actionLoading === 'envoyer' ? 'Envoi…' : '📧 Renvoyer'}
            </button>
          )}

          {['signe', 'envoye'].includes(devis.statut) && (
            <button onClick={() => setShowConvertModal(true)}
              style={{ padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              → Facturer
            </button>
          )}

          {['brouillon', 'envoye'].includes(devis.statut) && (
            <button onClick={() => { if (confirm('Marquer comme refusé ?')) action('refuser'); }} disabled={actionLoading === 'refuser'}
              style={{ padding: '8px 14px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Refuser
            </button>
          )}
        </div>
      </div>

      {/* Signature info */}
      {devis.signature_date && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#15803d' }}>
          ✓ Signé le {fmtDateTime(devis.signature_date)} (IP : {devis.signature_ip})
        </div>
      )}

      {devis.signature_token && devis.statut === 'envoye' && (
        <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
          <span style={{ color: '#1d4ed8', fontWeight: 500 }}>Lien de signature : </span>
          <a href={`/signature/${devis.signature_token}`} target="_blank" rel="noreferrer"
            style={{ color: '#1d4ed8', wordBreak: 'break-all' }}>
            /signature/{devis.signature_token}
          </a>
        </div>
      )}

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          ['Émission', fmtDate(devis.date_emission)],
          ['Validité', fmtDate(devis.date_validite)],
          ['Contact email', devis.contact_email || '—'],
        ].map(([l, v]) => (
          <div key={l} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Lignes */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0F1F4B' }}>
              {['Prestation', 'Qté', 'Unité', 'Prix HT', 'Remise', 'Total HT'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Total HT' ? 'right' : 'left', color: '#fff', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id || i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 500 }}>{l.libelle}</div>
                  {l.description && <div style={{ fontSize: 11, color: '#6b7280' }}>{l.description}</div>}
                </td>
                <td style={{ padding: '10px 14px', color: '#374151' }}>{Number(l.quantite).toLocaleString('fr-FR')}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{l.unite}</td>
                <td style={{ padding: '10px 14px' }}>{fmtEur(l.prix_unitaire)}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{Number(l.remise_pct) > 0 ? `${l.remise_pct}%` : '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.montant_ht)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totaux */}
        <div style={{ padding: '14px 20px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total HT : <strong style={{ color: '#111' }}>{fmtEur(devis.montant_ht)}</strong></div>
          {Number(devis.taux_tva) > 0 && (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              TVA ({devis.taux_tva}%) : <strong style={{ color: '#111' }}>{fmtEur(devis.montant_tva)}</strong>
            </div>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F1F4B' }}>Total : {fmtEur(devis.montant_ttc)}</div>
          {(devis.regime_tva === 'franchise' || !Number(devis.taux_tva)) && (
            <div style={{ fontSize: 11, color: '#854d0e', marginTop: 4, fontStyle: 'italic' }}>TVA non applicable, art. 293 B du CGI</div>
          )}
        </div>
      </div>

      {/* Conditions */}
      {devis.conditions_paiement && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Conditions de paiement</div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-line' }}>{devis.conditions_paiement}</div>
        </div>
      )}

      {/* Modal convertir */}
      {showConvertModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Convertir en facture</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
              Une facture sera créée à partir de ce devis ({devis.numero}).
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 5 }}>Date d'échéance</label>
              <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => action('convertir-facture', { date_echeance: echeance })}
                disabled={actionLoading === 'convertir-facture'}
                style={{ flex: 1, padding: '9px 0', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {actionLoading === 'convertir-facture' ? 'Conversion…' : 'Créer la facture'}
              </button>
              <button onClick={() => setShowConvertModal(false)}
                style={{ padding: '9px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
