import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { portalApi, useMicroPortalAuth } from '../context/MicroPortalAuthContext';
import MicroPortalLayout from '../components/MicroPortalLayout';

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const MODES_LABEL = {
  virement: 'Virement', cheque: 'Chèque', especes: 'Espèces',
  carte: 'Carte', prelevement: 'Prélèvement', autre: 'Autre',
};

const STATUT = {
  brouillon:           { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoyee:             { label: 'Envoyée', bg: '#dbeafe', color: '#1d4ed8' },
  partiellement_payee: { label: 'Part. payée', bg: '#fef9c3', color: '#854d0e' },
  payee:               { label: 'Payée ✓', bg: '#dcfce7', color: '#166534' },
  en_retard:           { label: 'En retard ⚠', bg: '#fee2e2', color: '#dc2626' },
  annulee:             { label: 'Annulée', bg: '#f3f4f6', color: '#9ca3af' },
};

function Badge({ statut }) {
  const s = STATUT[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

// ─── Liste ───────────────────────────────────────────────────────────────────
export function MicroPortalFacturesList() {
  const navigate = useNavigate();
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    portalApi.get('/factures').then(r => setFactures(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = factures.filter(f => {
    const q = search.toLowerCase();
    const matchQ = !q || f.numero.toLowerCase().includes(q)
      || (f.societe || '').toLowerCase().includes(q)
      || (f.nom || '').toLowerCase().includes(q);
    const matchF = !filtre || f.statut === filtre;
    return matchQ && matchF;
  });

  const total = filtered.reduce((s, f) => s + Number(f.montant_ttc), 0);
  const impayes = filtered.filter(f => ['envoyee', 'partiellement_payee', 'en_retard'].includes(f.statut))
    .reduce((s, f) => s + Number(f.solde_restant || 0), 0);

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Mes factures</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{factures.length} factures au total</p>
        </div>
      </div>

      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Total facturé (filtre)</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtEur(total)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>Impayés (filtre)</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: impayes > 0 ? '#dc2626' : '#059669' }}>{fmtEur(impayes)}</div>
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
            <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
            <div>Aucune facture trouvée</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Numéro', 'Client', 'Émission', 'Échéance', 'Montant', 'Solde dû', 'Statut', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const retard = ['en_retard'].includes(f.statut);
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6', background: retard ? '#fff8f8' : (i % 2 ? '#fafafa' : '#fff'), cursor: 'pointer' }}
                    onClick={() => navigate(`/micro-portail/factures/${f.id}`)}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#2563eb' }}>{f.numero}</td>
                    <td style={{ padding: '11px 14px' }}>{f.societe || `${f.prenom || ''} ${f.nom}`}</td>
                    <td style={{ padding: '11px 14px', color: '#6b7280' }}>{fmtDate(f.date_emission)}</td>
                    <td style={{ padding: '11px 14px', color: retard ? '#dc2626' : '#6b7280', fontWeight: retard ? 700 : 400 }}>{fmtDate(f.date_echeance)}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>{fmtEur(f.montant_ttc)}</td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, color: Number(f.solde_restant) > 0 ? '#dc2626' : '#059669' }}>
                      {fmtEur(f.solde_restant)}
                    </td>
                    <td style={{ padding: '11px 14px' }}><Badge statut={f.statut} /></td>
                    <td style={{ padding: '11px 14px', color: '#6b7280' }}>→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </MicroPortalLayout>
  );
}

// ─── Détail ──────────────────────────────────────────────────────────────────
export function MicroPortalFactureDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { portalToken } = useMicroPortalAuth();
  const [facture, setFacture] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get(`/factures/${id}`).then(r => setFacture(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <MicroPortalLayout><div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div></MicroPortalLayout>;
  if (!facture) return <MicroPortalLayout><div style={{ padding: 40, color: '#dc2626' }}>Facture introuvable.</div></MicroPortalLayout>;

  const retard = facture.statut === 'en_retard';
  const today = new Date();
  const echeance = facture.date_echeance ? new Date(facture.date_echeance) : null;
  const joursRetard = echeance ? Math.max(0, Math.floor((today - echeance) / 86400000)) : 0;

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => navigate('/micro-portail/factures')}
          style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13 }}>
          ← Retour
        </button>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{facture.numero}</span>
      </div>

      {retard && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          ⚠ Cette facture est en retard de paiement de <strong>{joursRetard} jour(s)</strong>. Merci de contacter votre cabinet comptable.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{facture.numero}</h1>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
            <Badge statut={facture.statut} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              Émise le {fmtDate(facture.date_emission)} · Échéance {fmtDate(facture.date_echeance)}
            </span>
          </div>
        </div>
        <button
          onClick={() => window.open(`/api/micro-portail/factures/${id}/pdf?token=${portalToken}`, '_blank')}
          style={{ padding: '9px 18px', background: '#0F1F4B', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          ⬇ Télécharger PDF
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Total facturé</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>{fmtEur(facture.montant_ttc)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Déjà réglé</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#059669' }}>{fmtEur(facture.montant_regle)}</div>
        </div>
        <div style={{ background: retard ? '#fef2f2' : '#fff', border: `1px solid ${retard ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 10, padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Solde restant dû</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: Number(facture.solde_restant) > 0 ? '#dc2626' : '#059669' }}>
            {fmtEur(facture.solde_restant)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>CLIENT</div>
          <div style={{ fontWeight: 700 }}>{facture.contact_societe || `${facture.contact_prenom || ''} ${facture.contact_nom}`}</div>
          {facture.contact_adresse && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-line' }}>{facture.contact_adresse}</div>}
          {facture.contact_email && <div style={{ fontSize: 13, color: '#2563eb', marginTop: 4 }}>{facture.contact_email}</div>}
        </div>
        {facture.iban && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 8 }}>COORDONNÉES BANCAIRES</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#166534' }}>{facture.iban}</div>
            {facture.bic && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>BIC : {facture.bic}</div>}
          </div>
        )}
      </div>

      {/* Lignes */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14 }}>Détail des prestations</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Prestation', 'Qté', 'Prix unitaire', 'Remise', 'Total HT'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(facture.lignes || []).map((l, i) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600 }}>{l.libelle}</div>
                  {l.description && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{l.description}</div>}
                </td>
                <td style={{ padding: '10px 14px' }}>{l.quantite} {l.unite}</td>
                <td style={{ padding: '10px 14px' }}>{fmtEur(l.prix_unitaire)}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{l.remise_pct > 0 ? `${l.remise_pct}%` : '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmtEur(l.montant_ht)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
              <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 700, color: '#374151', fontSize: 12 }}>
                TVA non applicable, art. 293 B du CGI
              </td>
              <td style={{ padding: '12px 14px', fontWeight: 700, fontSize: 15, color: '#0F1F4B' }}>
                {fmtEur(facture.montant_ttc)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Historique paiements */}
      {facture.paiements?.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 14 }}>Règlements reçus</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Date', 'Mode', 'Référence', 'Montant'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facture.paiements.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(p.date_paiement)}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{MODES_LABEL[p.mode] || p.mode}</td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af' }}>{p.reference || '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#059669' }}>{fmtEur(p.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MicroPortalLayout>
  );
}
