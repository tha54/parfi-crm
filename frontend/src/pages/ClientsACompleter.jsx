import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const ANOMALIE_TYPES = {
  'SCI sans précision': 'SCI ambiguë',
  'non_soumis':         'TVA incohérente',
  'trimestriel incohér':'TVA incohérente',
  'BARN':               'BA hors périmètre',
  'MICRO':              'Micro non précisé',
  'non renseigné':      'Manquant',
  'non reconnu':        'Non reconnu',
};

function anomalieShort(texte) {
  if (!texte) return null;
  for (const [k, v] of Object.entries(ANOMALIE_TYPES)) {
    if (texte.includes(k)) return v;
  }
  return texte.substring(0, 50) + (texte.length > 50 ? '…' : '');
}

const REGIME_FISCAL_LABEL = {
  IS: 'IS', IR_BIC: 'IR BIC', IR_BNC: 'IR BNC',
  IR_translucide: 'IR translucide', micro_bic: 'Micro-BIC', micro_bnc: 'Micro-BNC',
};
const REGIME_TVA_LABEL = {
  reel_normal: 'RN', reel_simplifie: 'RS', franchise: 'Franchise', hors_champ: 'HC',
};
const PERIODICITE_TVA_LABEL = {
  mensuelle: 'Mens.', trimestrielle: 'Trim.', annuelle: 'Ann.', sans_objet: 'S/O',
};

function ChampStatut({ valeur, label }) {
  if (valeur) {
    return <span style={{ fontSize: 11, color: '#16a34a' }}>{label}</span>;
  }
  return <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>! {label || '—'}</span>;
}

export default function ClientsACompleter() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAnomalie, setFilterAnomalie] = useState('');
  const [filterReferent, setFilterReferent] = useState('');
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/clients/a-completer');
      setClients(data);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const referents = [...new Set(clients.map(c => c.referent_nom).filter(Boolean))].sort();

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.nom.toLowerCase().includes(search.toLowerCase());
    const matchRef    = !filterReferent || c.referent_nom === filterReferent;
    const matchAnom   = !filterAnomalie ||
      (filterAnomalie === 'critique' && (!c.forme_juridique || !c.regime_fiscal || !c.regime_tva || !c.periodicite_tva)) ||
      (filterAnomalie === 'anomalie' && c.migration_anomalie);
    return matchSearch && matchRef && matchAnom;
  });

  const nbCritique = clients.filter(c => !c.forme_juridique || !c.regime_fiscal || !c.regime_tva || !c.periodicite_tva).length;

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Clients à compléter</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            {clients.length} fiches à qualifier — dont{' '}
            <strong style={{ color: '#dc2626' }}>{nbCritique} bloquantes</strong> pour le wizard de dimensionnement
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}>← Clients</button>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="Rechercher un client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-control" style={{ maxWidth: 200 }} value={filterAnomalie} onChange={e => setFilterAnomalie(e.target.value)}>
          <option value="">Tous types</option>
          <option value="critique">Champs critiques manquants</option>
          <option value="anomalie">Avec anomalie migration</option>
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={filterReferent} onChange={e => setFilterReferent(e.target.value)}>
          <option value="">Tous les référents</option>
          {referents.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Actualiser</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <p style={{ color: 'var(--text-muted)' }}>Aucune fiche à compléter avec ces filtres.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Référent</th>
                <th style={{ textAlign: 'center' }}>FJ</th>
                <th style={{ textAlign: 'center' }}>Fiscal</th>
                <th style={{ textAlign: 'center' }}>TVA</th>
                <th style={{ textAlign: 'center' }}>Périodicité</th>
                <th>Anomalie</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const bloquant = !c.forme_juridique || !c.regime_fiscal || !c.regime_tva || !c.periodicite_tva;
                return (
                  <tr key={c.id} style={{ background: bloquant ? '#fff7ed' : undefined }}>
                    <td style={{ fontWeight: 500 }}>
                      {bloquant && <span title="Bloque le wizard" style={{ marginRight: 4 }}>🔴</span>}
                      {c.nom}
                      {c.siren && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{c.siren}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.referent_nom || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <ChampStatut valeur={c.forme_juridique} label={c.forme_juridique || '—'} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ChampStatut valeur={c.regime_fiscal} label={REGIME_FISCAL_LABEL[c.regime_fiscal] || c.regime_fiscal || '—'} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ChampStatut valeur={c.regime_tva} label={REGIME_TVA_LABEL[c.regime_tva] || c.regime_tva || '—'} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ChampStatut valeur={c.periodicite_tva} label={PERIODICITE_TVA_LABEL[c.periodicite_tva] || c.periodicite_tva || '—'} />
                    </td>
                    <td style={{ fontSize: 11, color: '#92400e', maxWidth: 220 }}>
                      {c.migration_anomalie ? anomalieShort(c.migration_anomalie) : '—'}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: 11 }}
                        onClick={() => navigate(`/clients/${c.id}?tab=overview`)}
                      >
                        Compléter
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
