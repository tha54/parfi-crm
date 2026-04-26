import { useState, useEffect } from 'react';
import api from '../services/api';

const NIVEAUX = {
  1: { label: 'Niveau 1 — Rappel amiable', color: '#e67e22' },
  2: { label: 'Niveau 2 — Mise en demeure', color: '#d63031' },
  3: { label: 'Niveau 3 — Contentieux',     color: '#7f0000' },
};

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

function RelanceModal({ facture, onSave, onClose }) {
  const [form, setForm] = useState({ niveau: 1, emailDestinataire: facture.emailDirigeant || '', notes: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post('/relances', {
        factureId: facture.id,
        niveau: Number(form.niveau),
        emailDestinataire: form.emailDestinataire,
        montantRelance: facture.resteARegler,
        notes: form.notes,
      });
      onSave();
    } finally { setSending(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Relancer — {facture.numero}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div style={{ background: '#fff8e1', border: '1px solid #ffc107', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
            <strong>{facture.clientNom}</strong><br />
            Facture {facture.numero} — Reste dû : <strong style={{ color: '#d63031' }}>{fmt(facture.resteARegler)}</strong><br />
            Échéance : {fmtDate(facture.dateEcheance)} — {facture.joursRetard} jour(s) de retard
          </div>
          <div className="form-group">
            <label>Niveau de relance</label>
            <select className="form-control" value={form.niveau} onChange={e => setForm(p => ({ ...p, niveau: e.target.value }))}>
              {Object.entries(NIVEAUX).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Email destinataire</label>
            <input className="form-control" type="email" value={form.emailDestinataire} onChange={e => setForm(p => ({ ...p, emailDestinataire: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Notes internes</label>
            <textarea className="form-control" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={sending}>
              {sending ? 'Envoi…' : '📨 Enregistrer la relance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Relances() {
  const [factures, setFactures] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('retard');

  const load = async () => {
    setLoading(true);
    try {
      const [fRes, hRes] = await Promise.all([
        api.get('/relances/en-retard'),
        api.get('/relances'),
      ]);
      setFactures(fRes.data);
      setHistorique(hRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalImpaye = factures.reduce((s, f) => s + Number(f.resteARegler || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Relances</h1>
          <p className="page-subtitle">Suivi des impayés et relances clients</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card" style={{ borderLeft: '4px solid #d63031' }}>
          <div className="kpi-value" style={{ color: '#d63031' }}>{fmt(totalImpaye)}</div>
          <div className="kpi-label">Total impayé</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #e67e22' }}>
          <div className="kpi-value">{factures.length}</div>
          <div className="kpi-label">Factures en retard</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #5bb8e8' }}>
          <div className="kpi-value">{historique.length}</div>
          <div className="kpi-label">Relances émises</div>
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn btn-sm ${tab === 'retard' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('retard')}>
          Factures en retard ({factures.length})
        </button>
        <button className={`btn btn-sm ${tab === 'historique' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('historique')}>
          Historique ({historique.length})
        </button>
      </div>

      {tab === 'retard' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client</th>
                  <th>Échéance</th>
                  <th>Retard</th>
                  <th>Reste dû</th>
                  <th>Nb relances</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Chargement…</td></tr>
                ) : factures.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#00897b' }}>✓ Aucune facture en retard</td></tr>
                ) : factures.map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 500 }}>{f.numero}</td>
                    <td>{f.clientNom || '—'}</td>
                    <td>{fmtDate(f.dateEcheance)}</td>
                    <td>
                      <span style={{ color: f.joursRetard > 30 ? '#d63031' : '#e67e22', fontWeight: 600 }}>
                        {f.joursRetard} j
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: '#d63031' }}>{fmt(f.resteARegler)}</td>
                    <td>{f.nbRelances || 0}</td>
                    <td>
                      <button className="btn btn-sm" style={{ background: '#d63031', color: '#fff', border: 'none' }} onClick={() => setModal(f)}>
                        📨 Relancer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'historique' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Facture</th>
                  <th>Niveau</th>
                  <th>Destinataire</th>
                  <th>Montant relancé</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>Chargement…</td></tr>
                ) : historique.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Aucune relance</td></tr>
                ) : historique.map(r => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.dateEnvoi)}</td>
                    <td>{r.factureNumero || r.factureId}</td>
                    <td>
                      <span className="badge" style={{ background: NIVEAUX[r.niveau]?.color + '20', color: NIVEAUX[r.niveau]?.color }}>
                        Niv. {r.niveau}
                      </span>
                    </td>
                    <td>{r.emailDestinataire || '—'}</td>
                    <td>{fmt(r.montantRelance)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <RelanceModal
          facture={modal}
          onSave={() => { setModal(null); load(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
