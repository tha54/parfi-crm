import { useState, useEffect, useCallback } from 'react';
import { portalApi, useMicroPortalAuth } from '../context/MicroPortalAuthContext';
import MicroPortalLayout from '../components/MicroPortalLayout';

const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const MODES_LABEL = {
  virement: 'Virement', cheque: 'Chèque', especes: 'Espèces',
  carte: 'Carte', prelevement: 'Prélèvement', autre: 'Autre',
};
const TRIMESTRES = ['T1 (Jan-Mar)', 'T2 (Avr-Jun)', 'T3 (Jul-Sep)', 'T4 (Oct-Déc)'];

export default function MicroPortalLivreRecettes() {
  const { portalToken } = useMicroPortalAuth();
  const [data, setData] = useState({ rows: [], total: 0, trimestres: [0, 0, 0, 0] });
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [mcId, setMcId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, lrRes] = await Promise.all([
        portalApi.get('/me'),
        portalApi.get(`/livre-recettes?annee=${annee}`),
      ]);
      setMcId(meRes.data?.id);
      setData(lrRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [annee]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    if (!data.rows.length) return;
    const cols = ['Date', 'N° Facture', 'Client', 'Nature de la prestation', 'Montant encaissé', 'Mode de règlement'];
    const lines = [
      cols.join(';'),
      ...data.rows.map(r => [
        fmtDate(r.date_encaissement), r.reference_facture, r.client_nom,
        r.nature_prestation,
        Number(r.montant_encaisse).toFixed(2).replace('.', ','),
        MODES_LABEL[r.mode_reglement] || r.mode_reglement,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')),
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `Livre_Recettes_${annee}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const annees = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <MicroPortalLayout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Livre des recettes</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Exercice {annee} · Données conformes BOFiP</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={exportCSV} disabled={!data.rows.length}
            style={{ padding: '8px 14px', background: '#fff', color: '#0F1F4B', border: '1px solid #d1d5db', borderRadius: 6, cursor: data.rows.length ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: data.rows.length ? 1 : 0.5 }}>
            ⬇ CSV
          </button>
          {mcId && (
            <button
              onClick={() => window.open(`/api/micro-portail/livre-recettes?annee=${annee}&token=${portalToken}`, '_blank')}
              disabled={!data.rows.length}
              style={{ padding: '8px 14px', background: '#0F1F4B', color: '#fff', border: 'none', borderRadius: 6, cursor: data.rows.length ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: data.rows.length ? 1 : 0.5 }}>
              ⬇ PDF
            </button>
          )}
        </div>
      </div>

      {/* Trimestres */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {TRIMESTRES.map((t, i) => (
          <div key={t} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, fontWeight: 600 }}>{t}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: data.trimestres[i] > 0 ? '#0F1F4B' : '#d1d5db' }}>
              {fmtEur(data.trimestres[i])}
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>Base déclaration URSSAF</div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div style={{ background: '#0F1F4B', borderRadius: 10, padding: '16px 22px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>CA total encaissé {annee}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{fmtEur(data.total)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{data.rows.length} encaissement{data.rows.length !== 1 ? 's' : ''}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Données conformes BOFiP</div>
        </div>
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>
        ) : data.rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📖</div>
            <div style={{ fontSize: 15, marginBottom: 6 }}>Aucun encaissement pour {annee}</div>
            <div style={{ fontSize: 13 }}>Les entrées apparaissent automatiquement lors des enregistrements de paiement.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#0F1F4B' }}>
                {['#', 'Date', 'N° Facture', 'Client', 'Nature de la prestation', 'Montant', 'Mode'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Montant' ? 'right' : 'left', color: '#fff', fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(r.date_encaissement)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#2563eb' }}>{r.reference_facture}</td>
                  <td style={{ padding: '10px 14px' }}>{r.client_nom}</td>
                  <td style={{ padding: '10px 14px', color: '#374151', maxWidth: 220 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nature_prestation}</div>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmtEur(r.montant_encaisse)}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>{MODES_LABEL[r.mode_reglement] || r.mode_reglement}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 700, color: '#374151' }}>Total {annee}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#0F1F4B' }}>{fmtEur(data.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 14, textAlign: 'center' }}>
        Livre des recettes généré automatiquement · Données conformes BOFiP · Aucune suppression possible
      </p>
    </MicroPortalLayout>
  );
}
