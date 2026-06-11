import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmApi, useMicroPortalAuth } from '../context/MicroPortalAuthContext';
import MicroPortalLayout from '../components/MicroPortalLayout';

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

// ─── Liste ───────────────────────────────────────────────────────────────────
export function MicroPortalDevisList() {
  const navigate = useNavigate();
  const { portalUser, portalToken } = useMicroPortalAuth();
  const mcId = portalUser?.id;
  const [devis, setDevis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    if (!mcId) return;
    crmApi.get(`/micro-devis?micro_client_id=${mcId}`)
      .then(r => setDevis(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mcId]);

  const filtered = devis.filter(d => {
    const q = search.toLowerCase();
    const matchQ = !q || d.numero?.toLowerCase().includes(q)
      || (d.contact_societe || '').toLowerCase().includes(q)
      || (d.contact_nom || '').toLowerCase().includes(q);
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
        <button onClick={() => navigate('/micro-portail/devis/nouveau')}
          style={{ padding: '9px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + Nouveau devis
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }} />
        <select value={filtre} onChange={e => setFiltre(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUT_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
                  <td style={{ padding: '11px 14px' }}>{d.contact_societe || [d.contact_prenom, d.contact_nom].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmtDate(d.date_emission)}</td>
                  <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmtDate(d.date_validite)}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmtEur(d.montant_ttc)}</td>
                  <td style={{ padding: '11px 14px' }}><StatutBadge statut={d.statut} /></td>
                  <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => window.open(`/api/micro-devis/${d.id}/pdf?token=${portalToken}`, '_blank')}
                      style={{ padding: '4px 10px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      PDF
                    </button>
                  </td>
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
  const { id: devisId } = useParams();
  const navigate = useNavigate();
  const { portalToken } = useMicroPortalAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [echeance, setEcheance] = useState(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmApi.get(`/micro-devis/${devisId}`);
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
      const res = await crmApi.post(`/micro-devis/${devisId}/${type}`, body);
      if (type === 'convertir-facture') {
        navigate(`/micro-portail/factures/${res.data.facture_id}`);
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

  if (loading) return <MicroPortalLayout><div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div></MicroPortalLayout>;
  if (!data) return <MicroPortalLayout><div style={{ padding: 40, color: '#dc2626' }}>Devis introuvable</div></MicroPortalLayout>;

  const { lignes = [], ...devis } = data;

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13 }}>
        <button onClick={() => navigate('/micro-portail/devis')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, padding: 0 }}>
          ← Mes devis
        </button>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ color: '#6b7280' }}>{devis.numero}</span>
      </div>

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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => window.open(`/api/micro-devis/${devisId}/pdf?token=${portalToken}`, '_blank')}
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            📄 PDF
          </button>

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

      {devis.signature_date && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#15803d' }}>
          ✓ Signé le {fmtDateTime(devis.signature_date)} (IP : {devis.signature_ip})
        </div>
      )}

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

      {devis.conditions_paiement && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Conditions de paiement</div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-line' }}>{devis.conditions_paiement}</div>
        </div>
      )}

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
    </MicroPortalLayout>
  );
}
