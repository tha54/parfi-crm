import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const FORMES = {
  micro_bic_vente: 'Micro BIC vente',
  micro_bic_prestation: 'Micro BIC prestation',
  micro_bnc: 'Micro BNC',
};

const UNITES = ['forfait', 'heure', 'jour', 'unité', 'mois', 'km'];

const MOIS_COURTS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// ─── Graphique CA mensuel (SVG pur, pas de dépendance) ───────────────────────
function CaMensuelChart({ microClientId }) {
  const [data, setData] = useState(null);
  const [annee, setAnnee] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!microClientId) return;
    api.get(`/micro-clients/${microClientId}/ca-mensuel?annee=${annee}`)
      .then(r => setData(r.data))
      .catch(() => {});
  }, [microClientId, annee]);

  if (!data) return null;

  const max = Math.max(...data.mois.map(m => m.ca), 1);
  const H = 120;
  const barW = 28;
  const gap = 10;
  const totalW = data.mois.length * (barW + gap) - gap;
  const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k€` : `${n}€`;
  const annees = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 22px', marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>CA mensuel encaissé</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>D'après le livre des recettes</div>
        </div>
        <select value={annee} onChange={e => setAnnee(Number(e.target.value))}
          style={{ padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={totalW + 20} height={H + 48} style={{ display: 'block', margin: '0 auto' }}>
          {/* Lignes de grille */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = 8 + (H - 8) * (1 - ratio);
            return (
              <g key={ratio}>
                <line x1={0} y1={y} x2={totalW + 20} y2={y} stroke="#f3f4f6" strokeWidth={1} />
                {ratio > 0 && (
                  <text x={0} y={y - 2} fontSize={9} fill="#d1d5db" textAnchor="start">
                    {fmtK(max * ratio)}
                  </text>
                )}
              </g>
            );
          })}
          {/* Barres */}
          {data.mois.map((m, i) => {
            const barH = m.ca > 0 ? Math.max(4, (m.ca / max) * (H - 8)) : 0;
            const x = i * (barW + gap);
            const y = H - barH + 8;
            const isCurrent = m.mois === new Date().getMonth() + 1 && annee === new Date().getFullYear();
            return (
              <g key={m.mois}>
                <rect x={x} y={y} width={barW} height={barH}
                  rx={4} fill={isCurrent ? '#0F1F4B' : '#93c5fd'} />
                {m.ca > 0 && (
                  <text x={x + barW / 2} y={y - 4} fontSize={8} fill="#6b7280" textAnchor="middle">
                    {fmtK(m.ca)}
                  </text>
                )}
                <text x={x + barW / 2} y={H + 22} fontSize={9} fill={isCurrent ? '#0F1F4B' : '#9ca3af'}
                  textAnchor="middle" fontWeight={isCurrent ? 700 : 400}>
                  {MOIS_COURTS[m.mois - 1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#0F1F4B' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Mois en cours</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#93c5fd' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Autres mois</span>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = '#2563eb', icon }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 22, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: '#6b7280' }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#111827' }}>{title}</h3>
      {action}
    </div>
  );
}

// ─── Profil form ──────────────────────────────────────────────────────────────
function ProfilMicro({ microClientId, clientId, initial, onSaved }) {
  const [form, setForm] = useState(initial || {
    siren: '', siret: '', nom_commercial: '', forme_juridique: 'micro_bic_prestation',
    regime_tva: 'franchise', numero_tva_intra: '', adresse_facturation: '',
    iban: '', bic: '', prefixe_devis: 'DEV', prefixe_facture: 'FAC',
  });
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(!microClientId);

  useEffect(() => { if (initial) setForm(initial); }, [initial]);

  const save = async () => {
    setSaving(true);
    try {
      let res;
      if (microClientId) {
        res = await api.put(`/micro-clients/${microClientId}`, form);
      } else {
        res = await api.post('/micro-clients', { ...form, client_id: clientId });
      }
      onSaved(res.data);
      setEdit(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  if (!edit) {
    return (
      <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, fontSize: 13 }}>
          <div><span style={{ color: '#6b7280' }}>SIREN</span><br /><strong>{form.siren || '—'}</strong></div>
          <div><span style={{ color: '#6b7280' }}>SIRET</span><br /><strong>{form.siret || '—'}</strong></div>
          <div><span style={{ color: '#6b7280' }}>Nom commercial</span><br /><strong>{form.nom_commercial || '—'}</strong></div>
          <div><span style={{ color: '#6b7280' }}>Forme</span><br /><strong>{FORMES[form.forme_juridique] || '—'}</strong></div>
          <div><span style={{ color: '#6b7280' }}>Régime TVA</span><br /><strong>{form.regime_tva === 'franchise' ? 'Franchise en base' : 'TVA normale'}</strong></div>
          <div><span style={{ color: '#6b7280' }}>IBAN</span><br /><strong>{form.iban || '—'}</strong></div>
          <div style={{ gridColumn: '1/-1' }}><span style={{ color: '#6b7280' }}>Adresse facturation</span><br /><strong>{form.adresse_facturation || '—'}</strong></div>
        </div>
        <button onClick={() => setEdit(true)} style={{
          marginTop: 12, padding: '6px 16px', background: '#fff', border: '1px solid #d1d5db',
          borderRadius: 6, cursor: 'pointer', fontSize: 13,
        }}>Modifier</button>
      </div>
    );
  }

  return (
    <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {[
          ['siren', 'SIREN (9 chiffres)'],
          ['siret', 'SIRET (14 chiffres)'],
          ['nom_commercial', 'Nom commercial'],
          ['numero_tva_intra', 'N° TVA intra (si applicable)'],
          ['iban', 'IBAN'],
          ['bic', 'BIC'],
          ['prefixe_devis', 'Préfixe devis'],
          ['prefixe_facture', 'Préfixe facture'],
        ].map(([k, label]) => (
          <div key={k}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
            <input
              value={form[k] || ''}
              onChange={e => f(k, e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Forme juridique</label>
          <select value={form.forme_juridique} onChange={e => f('forme_juridique', e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
            {Object.entries(FORMES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Régime TVA</label>
          <select value={form.regime_tva} onChange={e => f('regime_tva', e.target.value)}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
            <option value="franchise">Franchise en base (art. 293 B CGI)</option>
            <option value="tva_normale">TVA normale</option>
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Adresse de facturation</label>
          <textarea
            value={form.adresse_facturation || ''}
            onChange={e => f('adresse_facturation', e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '7px 20px', background: '#2563eb', color: '#fff', border: 'none',
          borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        {microClientId && (
          <button onClick={() => setEdit(false)} style={{
            padding: '7px 16px', background: '#fff', border: '1px solid #d1d5db',
            borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}>Annuler</button>
        )}
      </div>
    </div>
  );
}

// ─── Contacts section ─────────────────────────────────────────────────────────
function ContactsSection({ microClientId }) {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ nom: '', prenom: '', societe: '', email: '', telephone: '', adresse: '' });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/micro-contacts?micro_client_id=${microClientId}`);
    setContacts(res.data);
  }, [microClientId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editId) {
        await api.put(`/micro-contacts/${editId}`, form);
      } else {
        await api.post('/micro-contacts', { ...form, micro_client_id: microClientId });
      }
      setForm({ nom: '', prenom: '', societe: '', email: '', telephone: '', adresse: '' });
      setEditId(null);
      setShowForm(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const del = async (id) => {
    if (!confirm('Supprimer ce contact ?')) return;
    try {
      await api.delete(`/micro-contacts/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const startEdit = (c) => {
    setForm({ nom: c.nom, prenom: c.prenom || '', societe: c.societe || '', email: c.email || '', telephone: c.telephone || '', adresse: c.adresse || '' });
    setEditId(c.id);
    setShowForm(true);
  };

  return (
    <div>
      <SectionHeader
        title="Contacts (clients du micro-entrepreneur)"
        action={
          <button onClick={() => { setShowForm(s => !s); setEditId(null); setForm({ nom: '', prenom: '', societe: '', email: '', telephone: '', adresse: '' }); }}
            style={{ padding: '5px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            + Ajouter
          </button>
        }
      />

      {showForm && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            {[['nom', 'Nom *'], ['prenom', 'Prénom'], ['societe', 'Société'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([k, l]) => (
              <div key={k}>
                <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>{l}</label>
                <input value={form[k] || ''} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Adresse</label>
              <input value={form.adresse || ''} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} style={{ padding: '5px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>
              {editId ? 'Mettre à jour' : 'Ajouter'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ padding: '5px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucun contact enregistré</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Nom', 'Société', 'Email', 'Téléphone', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px' }}>{c.prenom ? `${c.prenom} ${c.nom}` : c.nom}</td>
                <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.societe || '—'}</td>
                <td style={{ padding: '8px 12px' }}>{c.email ? <a href={`mailto:${c.email}`} style={{ color: '#2563eb' }}>{c.email}</a> : '—'}</td>
                <td style={{ padding: '8px 12px', color: '#6b7280' }}>{c.telephone || '—'}</td>
                <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(c)} style={{ padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Éditer</button>
                  <button onClick={() => del(c.id)} style={{ padding: '3px 10px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Accès portail micro ──────────────────────────────────────────────────────
function PortailAccesSection({ microClientId }) {
  const [acc, setAcc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.get(`/micro-portail/admin/access/${microClientId}`)
      .then(r => { setAcc(r.data); if (r.data?.email) setEmail(r.data.email); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [microClientId]);

  const save = async () => {
    if (!email || !password) return setMsg({ type: 'error', text: 'Email et mot de passe requis' });
    setSaving(true); setMsg(null);
    try {
      await api.post('/micro-portail/admin/create-access', { micro_client_id: microClientId, email, password });
      const r = await api.get(`/micro-portail/admin/access/${microClientId}`);
      setAcc(r.data); setPassword('');
      setMsg({ type: 'success', text: 'Accès portail créé / mis à jour' });
    } catch (e) { setMsg({ type: 'error', text: e.response?.data?.error || 'Erreur' }); }
    finally { setSaving(false); }
  };

  const revoke = async () => {
    if (!confirm('Révoquer l\'accès portail ?')) return;
    await api.delete(`/micro-portail/admin/revoke/${microClientId}`).catch(() => {});
    setAcc(prev => prev ? { ...prev, actif: 0 } : null);
  };

  if (!loaded) return null;

  return (
    <div>
      <SectionHeader title="Accès portail micro-entrepreneur" />
      {acc?.actif ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#166534' }}>✓ Accès actif — {acc.email}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Dernière connexion : {acc.derniere_connexion ? new Date(acc.derniere_connexion).toLocaleString('fr-FR') : 'Jamais'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/micro-portail/login" target="_blank" rel="noreferrer"
              style={{ padding: '6px 12px', background: '#0F1F4B', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
              Ouvrir portail ↗
            </a>
            <button onClick={revoke}
              style={{ padding: '6px 12px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              Révoquer
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#854d0e' }}>
          {acc ? 'Accès portail révoqué.' : 'Aucun accès portail configuré pour ce client.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Email de connexion</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="client@email.fr"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
            {acc?.actif ? 'Nouveau mot de passe' : 'Mot de passe'}
          </label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Min. 8 caractères"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <button onClick={save} disabled={saving}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {saving ? '…' : acc?.actif ? 'Mettre à jour' : 'Créer l\'accès'}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 10, fontSize: 13, color: msg.type === 'error' ? '#dc2626' : '#059669', fontWeight: 600 }}>
          {msg.type === 'success' ? '✓ ' : '✗ '}{msg.text}
        </div>
      )}
    </div>
  );
}

// ─── Prestations catalogue ────────────────────────────────────────────────────
function PrestationsSection({ microClientId }) {
  const [prestations, setPrestations] = useState([]);
  const [form, setForm] = useState({ libelle: '', description: '', unite: 'forfait', prix_unitaire: '' });
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get(`/micro-prestations?micro_client_id=${microClientId}`);
    setPrestations(res.data);
  }, [microClientId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editId) {
        await api.put(`/micro-prestations/${editId}`, form);
      } else {
        await api.post('/micro-prestations', { ...form, micro_client_id: microClientId });
      }
      setForm({ libelle: '', description: '', unite: 'forfait', prix_unitaire: '' });
      setEditId(null);
      setShowForm(false);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const del = async (id) => {
    if (!confirm('Supprimer cette prestation ?')) return;
    try {
      await api.delete(`/micro-prestations/${id}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const startEdit = (p) => {
    setForm({ libelle: p.libelle, description: p.description || '', unite: p.unite || 'forfait', prix_unitaire: p.prix_unitaire });
    setEditId(p.id);
    setShowForm(true);
  };

  return (
    <div>
      <SectionHeader
        title="Catalogue prestations"
        action={
          <button onClick={() => { setShowForm(s => !s); setEditId(null); setForm({ libelle: '', description: '', unite: 'forfait', prix_unitaire: '' }); }}
            style={{ padding: '5px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            + Ajouter
          </button>
        }
      />

      {showForm && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Libellé *</label>
              <input value={form.libelle} onChange={e => setForm(p => ({ ...p, libelle: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Unité</label>
              <select value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13 }}>
                {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Prix unitaire (€ HT)</label>
              <input type="number" min="0" step="0.01" value={form.prix_unitaire} onChange={e => setForm(p => ({ ...p, prix_unitaire: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Description</label>
              <input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                style={{ width: '100%', padding: '6px 9px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={save} style={{ padding: '5px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>
              {editId ? 'Mettre à jour' : 'Ajouter'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ padding: '5px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {prestations.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Aucune prestation dans le catalogue</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Libellé', 'Unité', 'Prix HT', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prestations.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 500 }}>{p.libelle}</div>
                  {p.description && <div style={{ color: '#6b7280', fontSize: 12 }}>{p.description}</div>}
                </td>
                <td style={{ padding: '8px 12px', color: '#6b7280' }}>{p.unite}</td>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>
                  {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(p.prix_unitaire)}
                </td>
                <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(p)} style={{ padding: '3px 10px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Éditer</button>
                  <button onClick={() => del(p.id)} style={{ padding: '3px 10px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MicroDashboard() {
  const { id: clientId } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [microClient, setMicroClient] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Infos client CRM
      const [clientRes, mcRes] = await Promise.all([
        api.get(`/clients/${clientId}`),
        api.get(`/micro-clients/by-client/${clientId}`),
      ]);
      setClient(clientRes.data);
      setMicroClient(mcRes.data);

      // KPIs si profil micro existe
      if (mcRes.data) {
        const kRes = await api.get(`/micro-clients/${mcRes.data.id}/kpis`);
        setKpis(kRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onMicroSaved = (mc) => {
    setMicroClient(mc);
    loadData();
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6, alignItems: 'center' }}>
        <Link to={`/clients/${clientId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
          ← {client?.nom || 'Client'}
        </Link>
        <span>/</span>
        <span>Micro-entrepreneur</span>
      </div>

      {/* Titre */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
            Module Micro-Entrepreneur
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 14 }}>
            {client?.nom} — {microClient?.nom_commercial || 'Profil à configurer'}
          </p>
        </div>

        {microClient && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => navigate(`/clients/${clientId}/micro/devis/nouveau`)}
              style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              + Nouveau devis
            </button>
            <button
              onClick={() => navigate(`/clients/${clientId}/micro/factures/nouvelle`)}
              style={{ padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              + Nouvelle facture
            </button>
          </div>
        )}
      </div>

      {/* KPIs — seulement si profil existe */}
      {microClient && kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
          <KpiCard
            icon="💰" label="CA encaissé (année en cours)" value={fmt(kpis.ca_ytd)} color="#059669"
          />
          <KpiCard
            icon="📥" label="Encaissé ce mois" value={fmt(kpis.encaisse_mois)} color="#2563eb"
          />
          <KpiCard
            icon="⏳" label="Factures en attente" value={kpis.factures_attente} color="#d97706"
            sub={kpis.factures_attente > 0 ? `dont ${kpis.factures_retard} en retard` : null}
          />
          <KpiCard
            icon="🔴" label="Impayés" value={fmt(kpis['impayés'] || kpis.impayes || 0)} color="#dc2626"
          />
        </div>
      )}

      {/* Graphique CA mensuel */}
      {microClient && <CaMensuelChart microClientId={microClient.id} />}

      {/* Accès rapide — seulement si profil existe */}
      {microClient && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {[
            { label: '📄 Devis', path: `/clients/${clientId}/micro/devis` },
            { label: '🧾 Factures', path: `/clients/${clientId}/micro/factures` },
            { label: '📖 Livre des recettes', path: `/clients/${clientId}/micro/livre-recettes` },
            { label: '🔔 Relances', path: `/clients/${clientId}/micro/relances` },
          ].map(({ label, path }) => (
            <button key={path} onClick={() => navigate(path)}
              style={{ padding: '10px 18px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151' }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Profil micro */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
          <SectionHeader title="Profil micro-entrepreneur" />
          {!microClient && (
            <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>
              Ce client n'a pas encore de profil micro-entrepreneur. Remplissez le formulaire ci-dessous pour activer le module.
            </div>
          )}
          <ProfilMicro
            microClientId={microClient?.id}
            clientId={parseInt(clientId)}
            initial={microClient}
            onSaved={onMicroSaved}
          />
        </div>

        {/* Contacts + Prestations — seulement si profil existe */}
        {microClient && (
          <>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <ContactsSection microClientId={microClient.id} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <PrestationsSection microClientId={microClient.id} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
              <PortailAccesSection microClientId={microClient.id} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
