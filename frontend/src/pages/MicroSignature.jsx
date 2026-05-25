import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

export default function MicroSignature() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    api.get(`/micro-devis/signature/${token}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(e => { setError(e.response?.data?.error || 'Lien invalide ou expiré'); setLoading(false); });
  }, [token]);

  const sign = async () => {
    if (!accepted) return;
    setSigning(true);
    try {
      await api.post(`/micro-devis/signature/${token}/signer`);
      setSigned(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors de la signature');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ color: '#6b7280', fontSize: 16 }}>Chargement du devis…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 10px', color: '#dc2626' }}>Lien invalide</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, maxWidth: 520, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>✅</div>
          <h2 style={{ margin: '0 0 12px', color: '#15803d', fontSize: 24 }}>Devis signé !</h2>
          <p style={{ color: '#374151', fontSize: 15, lineHeight: 1.6 }}>
            Merci, votre signature a bien été enregistrée.<br />
            Un exemplaire vous sera transmis prochainement.
          </p>
          <div style={{ marginTop: 24, padding: '12px 20px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534' }}>
            Devis <strong>{data?.devis?.numero}</strong> · Signé le {new Date().toLocaleDateString('fr-FR')}
          </div>
        </div>
      </div>
    );
  }

  const { devis, lignes = [] } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header vendeur */}
        <div style={{ background: '#0F1F4B', borderRadius: '12px 12px 0 0', padding: '24px 32px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{devis.nom_commercial || devis.client_nom}</h1>
              {devis.adresse_facturation && (
                <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
                  {devis.adresse_facturation}
                </p>
              )}
              {devis.siren && <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.6 }}>SIREN : {devis.siren}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>DEVIS</div>
              <div style={{ fontSize: 14, opacity: 0.8, marginTop: 2 }}>{devis.numero}</div>
            </div>
          </div>
        </div>

        {/* Infos */}
        <div style={{ background: '#fff', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Date d'émission</div>
            <div style={{ fontSize: 14 }}>{fmtDate(devis.date_emission)}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, marginTop: 12 }}>Valable jusqu'au</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#d97706' }}>{fmtDate(devis.date_validite)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Destinataire</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {devis.contact_societe || [devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' ')}
            </div>
            {devis.contact_societe && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>{[devis.contact_prenom, devis.contact_nom].filter(Boolean).join(' ')}</div>
            )}
            {devis.contact_adresse && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-line' }}>{devis.contact_adresse}</div>
            )}
          </div>
        </div>

        {devis.objet && (
          <div style={{ background: '#fff', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', padding: '0 32px 16px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Objet</div>
            <div style={{ fontSize: 14, fontStyle: 'italic', color: '#374151' }}>{devis.objet}</div>
          </div>
        )}

        {/* Lignes */}
        <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Prestation', 'Qté', 'Unité', 'Prix HT', 'Total HT'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Total HT' ? 'right' : 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
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
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(l.montant_ht)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totaux */}
          <div style={{ padding: '14px 20px', background: '#f9fafb', borderTop: '1px solid #e5e7eb', textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total HT : <strong style={{ color: '#111' }}>{fmtEur(devis.montant_ht)}</strong></div>
            {Number(devis.taux_tva) > 0 && (
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>TVA ({devis.taux_tva}%) : <strong>{fmtEur(devis.montant_tva)}</strong></div>
            )}
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0F1F4B' }}>Total : {fmtEur(devis.montant_ttc)}</div>
          </div>
        </div>

        {/* Mention franchise */}
        {(devis.regime_tva === 'franchise' || !Number(devis.taux_tva)) && (
          <div style={{ border: '1px solid #fde68a', borderTop: 'none', background: '#fef9c3', padding: '10px 20px', fontSize: 12, color: '#854d0e', fontStyle: 'italic' }}>
            TVA non applicable, art. 293 B du CGI
          </div>
        )}

        {/* Conditions */}
        {devis.conditions_paiement && (
          <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', background: '#fff', padding: '14px 20px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Conditions de paiement</div>
            <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{devis.conditions_paiement}</p>
          </div>
        )}

        {/* Signature block */}
        {devis.statut === 'signe' ? (
          <div style={{ marginTop: 20, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 16 }}>Ce devis a déjà été signé</div>
            <div style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>Signé le {fmtDate(devis.signature_date)}</div>
          </div>
        ) : (
          <div style={{ marginTop: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 28 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0F1F4B' }}>Signature électronique</h3>
            <p style={{ fontSize: 13, color: '#374151', margin: '0 0 20px', lineHeight: 1.6 }}>
              En cochant la case ci-dessous et en cliquant sur "Signer le devis", vous acceptez les termes de ce devis.
              Cette validation électronique vaut acceptation et constitue un commencement de preuve suffisant.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 20 }}>
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 1, cursor: 'pointer', accentColor: '#059669', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: '#111827', lineHeight: 1.5 }}>
                J'ai lu et j'approuve le devis <strong>{devis.numero}</strong> d'un montant de{' '}
                <strong>{fmtEur(devis.montant_ttc)}</strong>.
                La validation de ce devis en ligne vaut acceptation.
              </span>
            </label>
            <button onClick={sign} disabled={!accepted || signing}
              style={{
                width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 700,
                background: accepted ? '#059669' : '#e5e7eb',
                color: accepted ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: 8, cursor: accepted ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}>
              {signing ? 'Signature en cours…' : '✍️ Signer le devis'}
            </button>
            <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 12, textAlign: 'center' }}>
              Votre adresse IP sera enregistrée comme preuve de signature. Date et heure horodatées.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
