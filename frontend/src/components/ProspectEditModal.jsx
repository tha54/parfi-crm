import { useState, useEffect } from 'react';
import api from '../services/api';

const EMPTY = {
  type_prospect: 'entreprise',
  nom: '', siren: '', siret: '', forme_juridique: '', adresse: '', code_postal: '', ville: '',
  capital: '', code_naf: '', activite: '', date_creation_ent: '',
  email: '', telephone: '',
  contact_prenom: '', contact_nom: '', contact_email: '', contact_telephone: '',
  notes: '', statut: 'nouveau', source: '',
};

function SirenSearch({ onResult }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useState(null);

  const search = async (val) => {
    const clean = val.trim();
    if (!clean || clean.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = /^\d{9}$/.test(clean.replace(/\s/g, ''))
        ? await api.get(`/pappers/siren/${clean.replace(/\s/g, '')}`)
        : await api.get(`/pappers/search?q=${encodeURIComponent(clean)}`);
      setResults(Array.isArray(data) ? data : [data]);
    } catch { setResults([]); }
    setLoading(false);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQ(val);
    setResults([]);
    if (timer[0]) clearTimeout(timer[0]);
    if (val.trim().length >= 2) timer[0] = setTimeout(() => search(val), 400);
  };

  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Recherche INSEE / Pappers (enrichissement automatique)
      </div>
      <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
        <input className="form-control" placeholder="Nom ou SIREN…" value={q} onChange={handleChange}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), search(q))} style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => search(q)} disabled={loading}>
          {loading ? '…' : '🔍'}
        </button>
        {results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 60, zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)', marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
            {results.map((r, i) => (
              <button key={r.siren || i} type="button" onClick={() => { onResult(r); setResults([]); setQ(r.nom || ''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <strong>{r.nom}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
                  {r.siren && `SIREN ${r.siren}`}{r.ville && ` · ${r.code_postal} ${r.ville}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProspectEditModal({ prospectId, onSaved, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/prospects/${prospectId}`)
      .then(r => setForm({ ...EMPTY, ...r.data }))
      .catch(() => setErr('Impossible de charger la fiche prospect'))
      .finally(() => setLoading(false));
  }, [prospectId]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handlePappers = (data) => setForm(f => ({
    ...f,
    nom:             data.nom             || f.nom,
    siren:           data.siren           || f.siren,
    siret:           data.siret           || f.siret,
    forme_juridique: data.forme_juridique || f.forme_juridique,
    adresse:         data.adresse         || f.adresse,
    code_postal:     data.code_postal     || f.code_postal,
    ville:           data.ville           || f.ville,
    code_naf:        data.code_naf        || f.code_naf,
    activite:        data.activite        || f.activite,
    capital:         data.capital != null ? String(data.capital) : f.capital,
    date_creation_ent: data.date_creation_ent || f.date_creation_ent,
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim()) { setErr('Nom requis'); return; }
    setSaving(true); setErr('');
    try {
      const { data } = await api.put(`/prospects/${prospectId}`, {
        ...form,
        siren:   form.siren?.replace(/\s/g, '') || null,
        capital: form.capital ? parseFloat(form.capital) : null,
      });
      onSaved(data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const isEnt = form.type_prospect !== 'particulier';
  const S = { margin: '18px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <span className="modal-title">✏️ Modifier la fiche prospect</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="spinner"><div className="spinner-ring" /></div>
          ) : (
            <form onSubmit={handleSubmit}>
              {err && <div className="alert alert-error" style={{ marginBottom: 14 }}>{err}</div>}

              <SirenSearch onResult={handlePappers} />

              {/* Type */}
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-control" value={form.type_prospect} onChange={set('type_prospect')}>
                  <option value="particulier">Particulier / futur créateur</option>
                  <option value="entreprise">Entreprise existante</option>
                  <option value="association">Association</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              {/* Identité */}
              <div style={S}>Identité</div>
              <div className="form-group">
                <label className="form-label">Raison sociale / Nom *</label>
                <input className="form-control" value={form.nom} onChange={set('nom')} placeholder="SARL Exemple…" />
              </div>

              {isEnt && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">SIREN</label>
                    <input className="form-control" value={form.siren || ''} onChange={set('siren')}
                      placeholder="123456789" maxLength={9} style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Forme juridique</label>
                    <input className="form-control" value={form.forme_juridique || ''} onChange={set('forme_juridique')} placeholder="SARL, SAS…" />
                  </div>
                </div>
              )}

              {/* Adresse */}
              <div style={S}>Adresse</div>
              <div className="form-group">
                <label className="form-label">Adresse</label>
                <input className="form-control" value={form.adresse || ''} onChange={set('adresse')} placeholder="29 boulevard Haussmann" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Code postal</label>
                  <input className="form-control" value={form.code_postal || ''} onChange={set('code_postal')} placeholder="75009" maxLength={10} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ville</label>
                  <input className="form-control" value={form.ville || ''} onChange={set('ville')} placeholder="Paris" />
                </div>
              </div>

              {/* Contact */}
              <div style={S}>Contact</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={form.email || ''} onChange={set('email')} placeholder="contact@exemple.fr" />
                </div>
                <div className="form-group">
                  <label className="form-label">Téléphone</label>
                  <input className="form-control" value={form.telephone || ''} onChange={set('telephone')} placeholder="+33 1 23 45 67 89" />
                </div>
              </div>

              {isEnt && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Prénom interlocuteur</label>
                    <input className="form-control" value={form.contact_prenom || ''} onChange={set('contact_prenom')} placeholder="Jean" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nom interlocuteur</label>
                    <input className="form-control" value={form.contact_nom || ''} onChange={set('contact_nom')} placeholder="Dupont" />
                  </div>
                </div>
              )}
              {isEnt && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Email interlocuteur</label>
                    <input type="email" className="form-control" value={form.contact_email || ''} onChange={set('contact_email')} placeholder="jean.dupont@exemple.fr" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Tél. interlocuteur</label>
                    <input className="form-control" value={form.contact_telephone || ''} onChange={set('contact_telephone')} placeholder="+33 6 12 34 56 78" />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={S}>Notes</div>
              <div className="form-group">
                <textarea className="form-control" rows={3} value={form.notes || ''} onChange={set('notes')} placeholder="Observations, besoins…" />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement…' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
