import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

const STATUT_STYLE = {
  brouillon:           { label: 'Brouillon',     bg: '#f3f4f6', color: '#6b7280' },
  envoyee:             { label: 'Envoyée',        bg: '#dbeafe', color: '#1d4ed8' },
  partiellement_payee: { label: 'Partiel.',       bg: '#fef3c7', color: '#d97706' },
  payee:               { label: 'Payée ✓',       bg: '#dcfce7', color: '#15803d' },
  en_retard:           { label: 'En retard',      bg: '#fee2e2', color: '#dc2626' },
  annulee:             { label: 'Annulée',        bg: '#f3f4f6', color: '#9ca3af' },
};

const MODES_LABEL = {
  virement: 'Virement', cheque: 'Chèque', especes: 'Espèces',
  carte: 'Carte', prelevement: 'Prélèvement', autre: 'Autre',
};

const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

function StatutBadge({ statut }) {
  const s = STATUT_STYLE[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ background: s.bg, color: s.color, padding: '5px 14px', borderRadius: 16, fontSize: 13, fontWeight: 700 }}>{s.label}</span>;
}

function PaiementModal({ factureTTC, montantRegle, onClose, onSave }) {
  const reste = Math.max(0, Number(factureTTC) - Number(montantRegle));
  const [form, setForm] = useState({
    date_paiement: new Date().toISOString().split('T')[0],
    montant: reste.toFixed(2),
    mode: 'virement',
    reference: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.montant || Number(form.montant) <= 0) { alert('Montant requis'); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Enregistrer un paiement</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            ['date_paiement', 'Date du paiement', 'date'],
            ['montant', 'Montant reçu (€)', 'number'],
            ['reference', 'Référence (optionnel)', 'text'],
          ].map(([k, l, t]) => (
            <div key={k}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{l}</label>
              <input type={t} value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                min={t === 'number' ? 0 : undefined} step={t === 'number' ? '0.01' : undefined}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Mode de règlement</label>
            <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
              {Object.entries(MODES_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Notes</label>
            <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, fontSize: 13 }}>
          Solde restant : <strong style={{ color: '#059669' }}>{fmtEur(reste)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={submit} disabled={saving}
            style={{ flex: 1, padding: '10px 0', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
          <button onClick={onClose}
            style={{ padding: '10px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MicroFactureDetail() {
  const { id: clientId, factureId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showPaiementModal, setShowPaiementModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/micro-factures/${factureId}`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [factureId]);

  useEffect(() => { load(); }, [load]);

  const action = async (type) => {
    setActionLoading(type);
    try {
      await api.post(`/micro-factures/${factureId}/${type}`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    } finally {
      setActionLoading('');
    }
  };

  const enregistrerPaiement = async (form) => {
    await api.post(`/micro-factures/${factureId}/enregistrer-paiement`, form);
    await load();
  };

  const openPdf = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/micro-factures/${factureId}/pdf?token=${token}`, '_blank');
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;
  if (!data) return <div style={{ padding: 40, color: '#dc2626' }}>Facture introuvable</div>;

  const { lignes = [], paiements = [], ...facture } = data;
  const retard = ['envoyee', 'partiellement_payee'].includes(facture.statut) && new Date(facture.date_echeance) < new Date();

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>Micro</Link>
        <span>/</span>
        <Link to={`/clients/${clientId}/micro/factures`} style={{ color: '#2563eb', textDecoration: 'none' }}>Factures</Link>
        <span>/</span>
        <span>{facture.numero}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{facture.numero}</h1>
            <StatutBadge statut={facture.statut} />
            {retard && <span style={{ background: '#fee2e2', color: '#dc2626', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>⚠ En retard</span>}
          </div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>
            {facture.nom_commercial || facture.client_nom} · {facture.contact_societe || [facture.contact_prenom, facture.contact_nom].filter(Boolean).join(' ')}
          </div>
          {facture.objet && <div style={{ color: '#374151', fontSize: 14, marginTop: 4, fontStyle: 'italic' }}>{facture.objet}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={openPdf}
            style={{ padding: '8px 16px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            📄 PDF
          </button>

          {facture.statut === 'brouillon' && (
            <button onClick={() => action('envoyer')} disabled={actionLoading === 'envoyer'}
              style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {actionLoading === 'envoyer' ? 'Envoi…' : '📧 Envoyer'}
            </button>
          )}

          {facture.statut === 'envoyee' && (
            <button onClick={() => action('envoyer')} disabled={actionLoading === 'envoyer'}
              style={{ padding: '8px 16px', background: '#fff', border: '1px solid #2563eb', color: '#2563eb', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              📧 Renvoyer
            </button>
          )}

          {!['payee', 'annulee'].includes(facture.statut) && (
            <button onClick={() => setShowPaiementModal(true)}
              style={{ padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              💰 Paiement reçu
            </button>
          )}

          {!['payee', 'annulee'].includes(facture.statut) && (
            <button onClick={() => { if (confirm('Annuler cette facture ?')) action('annuler'); }}
              style={{ padding: '8px 14px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          )}
        </div>
      </div>

      {/* KPIs paiement */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Total facturé</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0F1F4B' }}>{fmtEur(facture.montant_ttc)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Déjà réglé</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{fmtEur(facture.montant_regle)}</div>
        </div>
        <div style={{ background: facture.solde_restant > 0 ? '#fff5f5' : '#f0fdf4', border: `1px solid ${facture.solde_restant > 0 ? '#fca5a5' : '#86efac'}`, borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Solde restant dû</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: facture.solde_restant > 0 ? '#dc2626' : '#15803d' }}>
            {fmtEur(facture.solde_restant)}
          </div>
        </div>
      </div>

      {/* Infos dates */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Date d'émission</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(facture.date_emission)}</span>
        </div>
        <div style={{ background: retard ? '#fff5f5' : '#f9fafb', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: retard ? '#dc2626' : '#6b7280' }}>Date d'échéance</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: retard ? '#dc2626' : '#111' }}>{fmtDate(facture.date_echeance)}</span>
        </div>
      </div>

      {/* Lignes */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0F1F4B' }}>
              {['Désignation', 'Qté', 'Unité', 'P.U. HT', 'Remise', 'Total HT'].map(h => (
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
                <td style={{ padding: '10px 14px' }}>{Number(l.quantite).toLocaleString('fr-FR')}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{l.unite}</td>
                <td style={{ padding: '10px 14px' }}>{fmtEur(l.prix_unitaire)}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{Number(l.remise_pct) > 0 ? `${l.remise_pct}%` : '—'}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.montant_ht)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '14px 20px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total HT : <strong style={{ color: '#111' }}>{fmtEur(facture.montant_ht)}</strong></div>
          {Number(facture.taux_tva) > 0 && (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>TVA ({facture.taux_tva}%) : <strong>{fmtEur(facture.montant_tva)}</strong></div>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0F1F4B' }}>Total : {fmtEur(facture.montant_ttc)}</div>
          {(!Number(facture.taux_tva) || facture.regime_tva === 'franchise') && (
            <div style={{ fontSize: 11, color: '#854d0e', marginTop: 4, fontStyle: 'italic' }}>TVA non applicable, art. 293 B du CGI</div>
          )}
        </div>
      </div>

      {/* Historique paiements */}
      {paiements.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Règlements reçus</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Montant' ? 'right' : 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paiements.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '8px 12px' }}>{fmtDate(p.date_paiement)}</td>
                  <td style={{ padding: '8px 12px' }}>{MODES_LABEL[p.mode] || p.mode}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{p.reference || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{fmtEur(p.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Conditions */}
      {facture.conditions_paiement && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Conditions de paiement</div>
          <div style={{ fontSize: 13, color: '#374151' }}>{facture.conditions_paiement}</div>
        </div>
      )}

      {showPaiementModal && (
        <PaiementModal
          factureTTC={facture.montant_ttc}
          montantRegle={facture.montant_regle}
          onClose={() => setShowPaiementModal(false)}
          onSave={enregistrerPaiement}
        />
      )}
    </div>
  );
}
