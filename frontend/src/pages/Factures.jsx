import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUTS = {
  brouillon: 'Brouillon', vu: 'Validé', emise: 'Émise',
  envoyee: 'Envoyée', payee: 'Payée', partielle: 'Partielle',
  retard: 'En retard', annulee: 'Annulée',
};
const STATUT_COLORS = {
  brouillon: 'autre', vu: 'en_cours', emise: 'responsable',
  envoyee: 'en_cours', payee: 'termine', partielle: 'responsable',
  retard: 'reporte', annulee: 'inactif',
};

function StatutBadge({ s }) {
  return <span className={`badge badge-${STATUT_COLORS[s] || 'autre'}`}>{STATUTS[s] || s}</span>;
}

function fmt(v) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMois(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ─── Drawer détail ─────────────────────────────────────────────────────────

function FactureDrawer({ factureId, onClose, onRefresh, canEdit }) {
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [aide, setAide] = useState(null);
  const [showAide, setShowAide] = useState(false);
  const [motifAnnul, setMotifAnnul] = useState('');
  const [showAnnulForm, setShowAnnulForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await api.get(`/factures/${factureId}`);
    setF(r.data);
  }, [factureId]);

  useEffect(() => { if (factureId) load(); }, [factureId, load]);

  const [successMsg, setSuccessMsg] = useState('');

  const action = async (endpoint, body) => {
    setBusy(true); setErr(''); setSuccessMsg('');
    try {
      const r = await api.post(`/factures/${factureId}/${endpoint}`, body || {});
      if (endpoint === 'emettre') {
        if (r.data.email_envoye) {
          setSuccessMsg(`✅ Facture émise et envoyée par email à ${r.data.email_destinataire}`);
        } else if (r.data.email_destinataire === null) {
          setSuccessMsg('⚠️ Facture émise — aucun email client renseigné, envoi impossible');
        } else {
          setSuccessMsg('⚠️ Facture émise — échec de l\'envoi email (vérifiez la config Brevo)');
        }
      }
      await load();
      onRefresh();
    } catch (e) { setErr(e.response?.data?.message || 'Erreur'); }
    finally { setBusy(false); }
  };

  const loadAide = async () => {
    if (aide) { setShowAide(s => !s); return; }
    try {
      const r = await api.get(`/factures/${factureId}/aide-decision`);
      setAide(r.data); setShowAide(true);
    } catch { setErr('Impossible de charger l\'aide à la décision'); }
  };

  if (!f) return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header"><h3>Chargement…</h3></div>
      </div>
    </div>
  );

  const isExpert = canEdit;
  const isDraft = ['brouillon', 'vu'].includes(f.statut);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" style={{ width: 580 }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>
            {f.numero_fiscal ? `${f.numero_fiscal}` : f.numero}
            {f.numero_fiscal && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>({f.numero})</span>}
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body" style={{ overflowY: 'auto' }}>
          {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
          {successMsg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{successMsg}</div>}

          {/* En-tête */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Client</div><strong>{f.client_nom || '—'}</strong></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Statut</div><StatutBadge s={f.statut} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Mois</div>{fmtMois(f.mois_facturation)}</div>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LDM</div>{f.ldm_numero ? <a onClick={() => window.open(`/api/lettres-mission/${f.lettre_mission_id}/pdf?token=${localStorage.getItem('parfi_token')}`, '_blank')} style={{ color: '#0891b2', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>📋 {f.ldm_numero}</a> : '—'}</div>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Devis</div>{f.devis_numero ? <a onClick={() => window.open(`/api/devis/${f.devis_id_resolved}/pdf?token=${localStorage.getItem('parfi_token')}`, '_blank')} style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>📄 {f.devis_numero}</a> : '—'}</div>
            <div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Collaborateur</div>{f.collab_prenom ? `${f.collab_prenom} ${f.collab_nom}` : '—'}</div>
          </div>

          {/* Montants */}
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total HT</span>
              <strong>{fmt(f.totalHT)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>TVA {f.tauxTVA}%</span>
              <span>{fmt(f.totalTVA)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <strong>Total TTC</strong>
              <strong style={{ fontSize: 18 }}>{fmt(f.totalTTC)}</strong>
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-secondary)' }}>Émission prévue:</span> {fmtDate(f.date_emission_prevue)}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Émis le:</span> {fmtDate(f.date_emission_effective)}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Échéance:</span> {fmtDate(f.dateEcheance)}</div>
            <div><span style={{ color: 'var(--text-secondary)' }}>Payé le:</span> {fmtDate(f.datePaiement)}</div>
          </div>

          {/* Lignes */}
          {f.lignes?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Prestations</div>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Description</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px' }}>Qté</th>
                    <th style={{ textAlign: 'right', padding: '4px 0' }}>PU HT</th>
                    <th style={{ textAlign: 'right', padding: '4px 0' }}>Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lignes.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-light, #f0f0f0)' }}>
                      <td style={{ padding: '6px 0' }}>{l.description}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{l.quantite}</td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }}>{fmt(l.prixUnitaireHT)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 0' }}>{fmt(l.totalHT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Motif modification */}
          {f.motif_modification && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12 }}>
              <strong>Motif de modification:</strong> {f.motif_modification}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            {/* Changement de statut rapide — experts */}
            {isExpert && !['payee', 'annulee'].includes(f.statut) && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 10px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Changer statut :</span>
                {['brouillon', 'vu'].includes(f.statut) && (
                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => action('emettre')}>🚀 Émettre</button>
                )}
                {['emise', 'envoyee', 'retard'].includes(f.statut) && (
                  <button className="btn btn-success btn-sm" disabled={busy} onClick={() => action('marquer-payee')}>💰 Payée</button>
                )}
                {showAnnulForm ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input className="form-control form-control-sm" style={{ width: 180 }}
                      placeholder="Motif d'annulation" value={motifAnnul}
                      onChange={e => setMotifAnnul(e.target.value)} />
                    <button className="btn btn-danger btn-sm" disabled={busy || !motifAnnul}
                      onClick={() => action('annuler', { motif: motifAnnul })}>Confirmer</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAnnulForm(false)}>✕</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => setShowAnnulForm(true)}>🚫 Annuler</button>
                )}
              </div>
            )}
          </div>

          {/* Aide à la décision */}
          <div>
            <button className="btn btn-ghost btn-sm" onClick={loadAide} style={{ marginBottom: 8 }}>
              {showAide ? '▲' : '▼'} Aide à la décision
            </button>
            {showAide && aide && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                {/* Section A */}
                <div style={{ marginBottom: 12 }}>
                  <strong>{aide.sectionA.label}</strong>
                  <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Temps:</span>
                      <strong style={{ marginLeft: 4 }}>{Math.round(aide.sectionA.tempsTotalMinutes / 6) / 10}h</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Valorisé:</span>
                      <strong style={{ marginLeft: 4 }}>{fmt(aide.sectionA.valeurTotale)}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>Budget LDM:</span>
                      <strong style={{ marginLeft: 4 }}>{fmt(aide.sectionA.budgetLDM)}</strong>
                    </div>
                    {aide.sectionA.depassementPct !== null && (
                      <div>
                        <span style={{ color: 'var(--text-secondary)' }}>Écart:</span>
                        <strong style={{
                          marginLeft: 4,
                          color: aide.sectionA.depassementPct > 20 ? 'var(--danger)' : aide.sectionA.depassementPct > 0 ? 'var(--warning)' : 'var(--success)',
                        }}>
                          {aide.sectionA.depassementPct > 0 ? '+' : ''}{aide.sectionA.depassementPct}%
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section B */}
                {aide.sectionB.taches?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>{aide.sectionB.label}</strong>
                    <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                      {aide.sectionB.taches.slice(0, 5).map((t, i) => (
                        <li key={i} style={{ marginBottom: 2 }}>
                          {t.titre}
                          {t.temps_passe_minutes > 0 && (
                            <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                              ({Math.round(t.temps_passe_minutes / 6) / 10}h)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Section C */}
                {aide.sectionC.historique?.length > 0 && (
                  <div>
                    <strong>{aide.sectionC.label}</strong>
                    <table style={{ width: '100%', marginTop: 6, fontSize: 12 }}>
                      <thead>
                        <tr style={{ color: 'var(--text-secondary)' }}>
                          <th style={{ textAlign: 'left' }}>Mois</th>
                          <th style={{ textAlign: 'right' }}>HT</th>
                          <th style={{ textAlign: 'center' }}>Statut</th>
                          <th style={{ textAlign: 'center' }}>Payé le</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aide.sectionC.historique.map((h, i) => (
                          <tr key={i}>
                            <td>{fmtMois(h.mois_facturation)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(h.totalHT)}</td>
                            <td style={{ textAlign: 'center' }}><StatutBadge s={h.statut} /></td>
                            <td style={{ textAlign: 'center' }}>{fmtDate(h.datePaiement)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Historique événements */}
          {f.evenements?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Historique</div>
              {f.evenements.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(e.date).toLocaleDateString('fr-FR')}
                  </span>
                  <span>{e.description}</span>
                  {e.prenom && <span style={{ color: 'var(--text-secondary)' }}>— {e.prenom} {e.nom}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Factures() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterMois, setFilterMois] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [sepaMonth, setSepaMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [sepaExporting, setSepaExporting] = useState(false);
  const [depassements, setDepassements] = useState([]);
  const [showDepassements, setShowDepassements] = useState(false);

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatut) params.statut = filterStatut;
      if (filterMois) params.mois = filterMois;
      const r = await api.get('/factures', { params });
      setFactures(r.data);
    } finally { setLoading(false); }
  }, [filterStatut, filterMois]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (canEdit) {
      api.get('/factures/depassements').then(r => setDepassements(r.data)).catch(() => {});
    }
  }, [canEdit]);

  const handleSepaExport = async () => {
    setSepaExporting(true);
    try {
      const r = await api.post('/factures/sepa-export', { mois: sepaMonth }, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `sepa-${sepaMonth}.xml`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Aucune facture éligible ce mois'); }
    finally { setSepaExporting(false); }
  };

  const filtered = factures.filter(f => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (f.client_nom || '').toLowerCase().includes(q) ||
      (f.numero || '').toLowerCase().includes(q) ||
      (f.numero_fiscal || '').toLowerCase().includes(q)
    );
  });

  // Stats
  const stats = {
    total:     filtered.length,
    brouillon: filtered.filter(f => ['brouillon', 'vu'].includes(f.statut)).length,
    aEmettre:  filtered.filter(f => f.statut === 'vu').length,
    emises:    filtered.filter(f => ['emise', 'envoyee'].includes(f.statut)).length,
    retard:    filtered.filter(f => f.statut === 'retard').length,
    caHT:      filtered.filter(f => !['annulee', 'brouillon'].includes(f.statut)).reduce((s, f) => s + Number(f.totalHT), 0),
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Factures</h1>
          <p className="page-subtitle">Gestion de la facturation récurrente</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {canEdit && depassements.length > 0 && (
            <button className="btn btn-sm" style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffc107' }}
              onClick={() => setShowDepassements(s => !s)}>
              ⚠️ {depassements.length} dépassement{depassements.length > 1 ? 's' : ''}
            </button>
          )}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="month" className="form-control form-control-sm" style={{ width: 150 }}
                value={sepaMonth} onChange={e => setSepaMonth(e.target.value)} />
              <button className="btn btn-ghost btn-sm" onClick={handleSepaExport} disabled={sepaExporting}>
                {sepaExporting ? '…' : '🏦'} SEPA
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alerte dépassements */}
      {showDepassements && depassements.length > 0 && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <strong style={{ display: 'block', marginBottom: 8 }}>⚠️ Clients avec dépassement budgétaire (mois précédent)</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {depassements.map((d, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, border: '1px solid #ffc107' }}>
                <strong>{d.client_nom}</strong>
                <span style={{ color: '#dc3545', marginLeft: 6 }}>+{d.depassementPct}%</span>
                <span style={{ color: '#6c757d', marginLeft: 6 }}>{fmt(d.valeurReelle)} / {fmt(d.budgetMois)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-bar" style={{ marginBottom: 16 }}>
        {[
          { label: 'Total', value: stats.total, icon: '📄' },
          { label: 'Brouillons', value: stats.brouillon, icon: '📝', color: '#6c757d' },
          { label: 'À émettre', value: stats.aEmettre, icon: '🚀', color: '#0d6efd' },
          { label: 'Émises', value: stats.emises, icon: '✅', color: '#198754' },
          { label: 'En retard', value: stats.retard, icon: '⚠️', color: '#dc3545' },
          { label: 'CA HT (filtré)', value: fmt(stats.caHT), icon: '💶', isText: true },
        ].map((k, i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-value" style={k.color ? { color: k.color } : {}}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ width: 240 }} placeholder="Rechercher client, numéro…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{ width: 160 }}
          value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="month" className="form-control" style={{ width: 160 }}
          value={filterMois} onChange={e => setFilterMois(e.target.value)} />
        {(filterStatut || filterMois || search) && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => { setFilterStatut(''); setFilterMois(''); setSearch(''); }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="spinner"><div className="spinner-ring" /></div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Mois</th>
                <th>Origine</th>
                <th>Collaborateur</th>
                <th>Émission prévue</th>
                <th style={{ textAlign: 'right' }}>HT</th>
                <th style={{ textAlign: 'right' }}>TTC</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>Aucune facture</td></tr>
              )}
              {filtered.map(f => (
                <tr key={f.id} onClick={() => setSelectedId(f.id)} style={{ cursor: 'pointer' }}
                  className={selectedId === f.id ? 'selected' : ''}>
                  <td>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                      {f.numero_fiscal || f.numero}
                    </div>
                    {f.numero_fiscal && (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{f.numero}</div>
                    )}
                  </td>
                  <td><strong>{f.client_nom || '—'}</strong></td>
                  <td style={{ fontSize: 13 }}>{fmtMois(f.mois_facturation)}</td>
                  <td style={{ fontSize: 11 }}>
                    {f.ldm_numero && (
                      <a
                        onClick={e => { e.stopPropagation(); navigate(`/lettres-mission/${f.lettre_mission_id}`); }}
                        style={{ display: 'inline-block', fontWeight: 600, color: '#0891b2', background: '#0891b210',
                                 border: '1px solid #0891b240', borderRadius: 10, padding: '1px 7px',
                                 cursor: 'pointer', textDecoration: 'none', marginRight: 4 }}
                      >📋 {f.ldm_numero}</a>
                    )}
                    {f.devis_numero && (
                      <a
                        onClick={e => { e.stopPropagation(); navigate(`/devis/${f.devis_id_resolved}`); }}
                        style={{ display: 'inline-block', fontWeight: 600, color: '#8b5cf6', background: '#8b5cf610',
                                 border: '1px solid #8b5cf640', borderRadius: 10, padding: '1px 7px',
                                 cursor: 'pointer', textDecoration: 'none' }}
                      >📄 {f.devis_numero}</a>
                    )}
                    {!f.ldm_numero && !f.devis_numero && <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {f.collab_prenom ? `${f.collab_prenom} ${f.collab_nom}` : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtDate(f.date_emission_prevue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(f.totalHT)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(f.totalTTC)}</td>
                  <td><StatutBadge s={f.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drawer */}
      {selectedId && (
        <FactureDrawer
          factureId={selectedId}
          onClose={() => setSelectedId(null)}
          onRefresh={load}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
