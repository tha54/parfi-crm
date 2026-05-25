import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);

const NIVEAU_LABEL = { 1: 'Niveau 1 — Amiable', 2: 'Niveau 2 — Ferme', 3: 'Niveau 3 — Mise en demeure' };
const NIVEAU_COLOR = { 1: '#2563eb', 2: '#d97706', 3: '#dc2626' };
const NIVEAU_BG = { 1: '#eff6ff', 2: '#fffbeb', 3: '#fef2f2' };
const NIVEAU_DESC = {
  1: 'Rappel cordial avec coordonnées bancaires',
  2: 'Relance ferme avec mention des jours de retard',
  3: 'Mise en demeure avec pénalités légales (indemnité 40€)',
};

function NiveauCard({ niveau, cfg, onChange }) {
  const joursKey = `niveau${niveau}_jours`;
  const actifKey = `niveau${niveau}_actif`;
  return (
    <div style={{
      background: NIVEAU_BG[niveau], border: `1px solid ${NIVEAU_COLOR[niveau]}30`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, color: NIVEAU_COLOR[niveau], fontSize: 14 }}>{NIVEAU_LABEL[niveau]}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{NIVEAU_DESC[niveau]}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{cfg[actifKey] ? 'Actif' : 'Inactif'}</span>
          <div
            onClick={() => onChange(actifKey, cfg[actifKey] ? 0 : 1)}
            style={{
              width: 40, height: 22, borderRadius: 11,
              background: cfg[actifKey] ? NIVEAU_COLOR[niveau] : '#d1d5db',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: cfg[actifKey] ? 21 : 3,
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#374151' }}>Envoyer après</span>
        <input
          type="number" min={1} max={90} value={cfg[joursKey] || ''}
          onChange={e => onChange(joursKey, Number(e.target.value))}
          style={{
            width: 64, padding: '5px 10px', border: `1px solid ${NIVEAU_COLOR[niveau]}60`,
            borderRadius: 6, fontSize: 14, fontWeight: 700, color: NIVEAU_COLOR[niveau],
            textAlign: 'center', background: '#fff',
          }}
          disabled={!cfg[actifKey]}
        />
        <span style={{ fontSize: 13, color: '#374151' }}>jours de retard</span>
      </div>
    </div>
  );
}

const STATUT_STYLE = {
  envoyee: { label: 'Envoyée', bg: '#dbeafe', color: '#1d4ed8' },
  remis_en_question: { label: 'À relancer', bg: '#fef9c3', color: '#854d0e' },
  en_retard: { label: 'En retard', bg: '#fee2e2', color: '#dc2626' },
};

export default function MicroRelances() {
  const { id: clientId } = useParams();
  const [microClient, setMicroClient] = useState(null);
  const [cfg, setCfg] = useState({
    niveau1_jours: 7, niveau1_actif: 1,
    niveau2_jours: 21, niveau2_actif: 1,
    niveau3_jours: 35, niveau3_actif: 1,
  });
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mcRes = await api.get(`/micro-clients/by-client/${clientId}`);
      setMicroClient(mcRes.data);
      if (mcRes.data) {
        const [cfgRes, histRes] = await Promise.all([
          api.get(`/micro-relances/config/${mcRes.data.id}`),
          api.get(`/micro-relances/historique/${mcRes.data.id}`),
        ]);
        if (cfgRes.data) setCfg(cfgRes.data);
        setHistorique(histRes.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const saveCfg = async () => {
    setSaving(true);
    try {
      await api.put(`/micro-relances/config/${microClient.id}`, cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await api.post('/micro-relances/check-and-send');
      alert(`Vérification terminée : ${res.data.sent} relance(s) envoyée(s) sur ${res.data.processed} facture(s) analysée(s).`);
      await load();
    } catch (e) {
      alert('Erreur lors de la vérification');
    } finally {
      setChecking(false);
    }
  };

  const envoyerManuel = async (factureId, niveau) => {
    if (!confirm(`Envoyer une relance niveau ${niveau} manuellement ?`)) return;
    try {
      await api.post(`/micro-relances/envoyer-manuel/${factureId}`, { niveau });
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur envoi relance');
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>← Micro</Link>
        <span>/</span>
        <span>Relances automatiques</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Relances automatiques</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
            {microClient?.nom_commercial || '—'} · Configuration et historique
          </p>
        </div>
        <button
          onClick={runCheck}
          disabled={checking}
          style={{
            padding: '9px 18px', background: '#0F1F4B', color: '#fff',
            border: 'none', borderRadius: 8, cursor: checking ? 'wait' : 'pointer',
            fontSize: 13, fontWeight: 600, opacity: checking ? 0.7 : 1,
          }}
        >
          {checking ? 'Vérification…' : '▶ Lancer vérification maintenant'}
        </button>
      </div>

      {/* Config section */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Configuration des niveaux de relance</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Les emails sont envoyés automatiquement chaque matin à 08h10</div>
          </div>
          <button
            onClick={saveCfg}
            disabled={saving}
            style={{
              padding: '8px 18px',
              background: saved ? '#059669' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 7,
              cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600,
              transition: 'background 0.3s',
            }}
          >
            {saved ? '✓ Sauvegardé' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {[1, 2, 3].map(n => (
            <NiveauCard key={n} niveau={n} cfg={cfg} onChange={handleChange} />
          ))}
        </div>
      </div>

      {/* Historique */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Historique des relances</div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>{historique.length} relance{historique.length !== 1 ? 's' : ''}</div>
        </div>

        {historique.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📬</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>Aucune relance envoyée</div>
            <div style={{ fontSize: 13 }}>Les relances apparaîtront ici au fur et à mesure des envois automatiques ou manuels.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Date', 'Facture', 'Montant', 'Destinataire', 'Niveau', 'Mode', 'Résultat'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historique.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#374151' }}>{fmtDate(r.date_envoi)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#2563eb' }}>{r.facture_reference}</td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{fmtEur(r.montant_facture)}</td>
                  <td style={{ padding: '10px 14px', color: '#374151' }}>{r.email_destinataire}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                      fontSize: 11, fontWeight: 700,
                      background: NIVEAU_BG[r.niveau] || '#f3f4f6',
                      color: NIVEAU_COLOR[r.niveau] || '#374151',
                    }}>N{r.niveau}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{r.mode_envoi === 'auto' ? '🤖 Auto' : '✉️ Manuel'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {r.statut === 'envoye' ? (
                      <span style={{ color: '#059669', fontWeight: 600 }}>✓ Envoyé</span>
                    ) : r.statut === 'erreur' ? (
                      <span style={{ color: '#dc2626' }} title={r.message_erreur}>✗ Erreur</span>
                    ) : (
                      <span style={{ color: '#9ca3af' }}>{r.statut}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Factures en retard avec actions manuelles */}
      <FacturesEnRetard microClientId={microClient?.id} onEnvoyer={envoyerManuel} />
    </div>
  );
}

function FacturesEnRetard({ microClientId, onEnvoyer }) {
  const [factures, setFactures] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!microClientId) return;
    api.get(`/micro-factures?micro_client_id=${microClientId}&statut=en_retard`)
      .then(r => { setFactures(r.data || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [microClientId]);

  if (!loaded || factures.length === 0) return null;

  const today = new Date();
  return (
    <div style={{ marginTop: 24, background: '#fff', border: '1px solid #fca5a5', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 22px', background: '#fef2f2', borderBottom: '1px solid #fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>
          ⚠ {factures.length} facture{factures.length > 1 ? 's' : ''} en retard
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Envoi manuel possible</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            {['Référence', 'Montant dû', 'Échéance', 'Retard', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factures.map((f, i) => {
            const echeance = f.date_echeance ? new Date(f.date_echeance) : null;
            const joursRetard = echeance ? Math.floor((today - echeance) / 86400000) : 0;
            return (
              <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: '#dc2626' }}>{f.reference}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(f.solde_restant || 0)}
                </td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{echeance ? echeance.toLocaleDateString('fr-FR') : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{joursRetard}j</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3].map(n => (
                      <button key={n}
                        onClick={() => onEnvoyer(f.id, n)}
                        style={{
                          padding: '4px 10px', border: `1px solid ${NIVEAU_COLOR[n]}`,
                          background: NIVEAU_BG[n], color: NIVEAU_COLOR[n],
                          borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                        }}
                      >N{n}</button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
