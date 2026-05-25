import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../context/MicroPortalAuthContext';
import MicroPortalLayout from '../components/MicroPortalLayout';

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const STATUT_FACTURE = {
  brouillon:           { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoyee:             { label: 'Envoyée', bg: '#dbeafe', color: '#1d4ed8' },
  partiellement_payee: { label: 'Part. payée', bg: '#fef9c3', color: '#854d0e' },
  payee:               { label: 'Payée', bg: '#dcfce7', color: '#166534' },
  en_retard:           { label: 'En retard', bg: '#fee2e2', color: '#dc2626' },
  annulee:             { label: 'Annulée', bg: '#f3f4f6', color: '#9ca3af' },
};

const STATUT_DEVIS = {
  brouillon: { label: 'Brouillon', bg: '#f3f4f6', color: '#6b7280' },
  envoye:    { label: 'Envoyé', bg: '#dbeafe', color: '#1d4ed8' },
  signe:     { label: 'Signé', bg: '#dcfce7', color: '#166534' },
  refuse:    { label: 'Refusé', bg: '#fee2e2', color: '#dc2626' },
  expire:    { label: 'Expiré', bg: '#f3f4f6', color: '#9ca3af' },
  converti:  { label: 'Converti', bg: '#f0fdf4', color: '#166534' },
};

function Badge({ statut, map }) {
  const s = map[statut] || { label: statut, bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CaChart({ data }) {
  if (!data) return null;
  const max = Math.max(...data.mois.map(m => m.ca), 1);
  const H = 100, barW = 26, gap = 8;
  const totalW = 12 * (barW + gap) - gap;
  const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${n}€`;
  const curMois = new Date().getMonth() + 1;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px' }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>CA mensuel encaissé {data.annee}</div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={totalW + 10} height={H + 44} style={{ display: 'block', margin: '0 auto' }}>
          {[0, 0.5, 1].map(r => (
            <line key={r} x1={0} y1={H * (1 - r) + 8} x2={totalW} y2={H * (1 - r) + 8}
              stroke="#f3f4f6" strokeWidth={1} />
          ))}
          {data.mois.map((m, i) => {
            const barH = m.ca > 0 ? Math.max(4, (m.ca / max) * H) : 0;
            const x = i * (barW + gap);
            const y = H - barH + 8;
            const active = m.mois === curMois;
            return (
              <g key={m.mois}>
                <rect x={x} y={y} width={barW} height={barH} rx={4}
                  fill={active ? '#0F1F4B' : '#bfdbfe'} />
                {m.ca > 0 && (
                  <text x={x + barW / 2} y={y - 3} fontSize={7.5} fill="#6b7280" textAnchor="middle">
                    {fmtK(m.ca)}
                  </text>
                )}
                <text x={x + barW / 2} y={H + 22} fontSize={9} textAnchor="middle"
                  fill={active ? '#0F1F4B' : '#9ca3af'} fontWeight={active ? 700 : 400}>
                  {MOIS[m.mois - 1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function MicroPortalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.get('/dashboard'),
      portalApi.get('/ca-mensuel'),
    ]).then(([d, c]) => {
      setData(d.data);
      setChart(c.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <MicroPortalLayout><div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div></MicroPortalLayout>;

  const { kpis, dernieresFactures, derniersDevis } = data;

  return (
    <MicroPortalLayout>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#111827' }}>Tableau de bord</h1>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 13 }}>Vue d'ensemble de votre activité</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard icon="💰" label="CA encaissé (année)" value={fmtEur(kpis.ca_ytd)} color="#059669" />
        <KpiCard icon="📥" label="Encaissé ce mois" value={fmtEur(kpis.encaisse_mois)} color="#2563eb" />
        <KpiCard icon="⏳" label="Factures en attente" value={kpis.factures_attente}
          sub={kpis.factures_retard > 0 ? `dont ${kpis.factures_retard} en retard` : null} color="#d97706" />
        <KpiCard icon="🔴" label="Impayés" value={fmtEur(kpis.impayes)} color="#dc2626" />
      </div>

      {/* Chart */}
      <div style={{ marginBottom: 24 }}>
        <CaChart data={chart} />
      </div>

      {/* Tables dernières factures / devis */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Dernières factures */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Dernières factures</div>
            <button onClick={() => navigate('/micro-portail/factures')}
              style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
              Voir tout →
            </button>
          </div>
          {dernieresFactures.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucune facture</div>
          ) : (
            <div>
              {dernieresFactures.map(f => (
                <div key={f.id}
                  onClick={() => navigate(`/micro-portail/factures/${f.id}`)}
                  style={{ padding: '12px 18px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{f.numero}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{f.societe || `${f.prenom || ''} ${f.nom}`} · échéance {fmtDate(f.date_echeance)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtEur(f.montant_ttc)}</div>
                    <Badge statut={f.statut} map={STATUT_FACTURE} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Derniers devis */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Derniers devis</div>
            <button onClick={() => navigate('/micro-portail/devis')}
              style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
              Voir tout →
            </button>
          </div>
          {derniersDevis.length === 0 ? (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucun devis</div>
          ) : (
            <div>
              {derniersDevis.map(d => (
                <div key={d.id}
                  onClick={() => navigate(`/micro-portail/devis/${d.id}`)}
                  style={{ padding: '12px 18px', borderBottom: '1px solid #f9fafb', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{d.numero}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{d.societe || `${d.prenom || ''} ${d.nom}`} · valide jusqu'au {fmtDate(d.date_validite)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtEur(d.montant_ttc)}</div>
                    <Badge statut={d.statut} map={STATUT_DEVIS} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MicroPortalLayout>
  );
}
