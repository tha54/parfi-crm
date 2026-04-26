import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Parametres() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    nom: '', adresse: '', ville: '', codePostal: '', pays: 'France',
    telephone: '', email: '', siteWeb: '', siret: '',
    numeroOrdre: '', assuranceRCP: '',
    tvaTaux: '20', mentionsLegales: '', iban: '', bic: '',
    logoUrl: '',
    couleurPrimaire: '#0f1f4b', couleurSecondaire: '#00b4d8',
    emailSignature: '', relanceAutomatique: false, delaiRelance1: 15, delaiRelance2: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/parametres').then(r => {
      if (r.data) setForm(f => ({ ...f, ...r.data }));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await api.put('/parametres', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { alert('Erreur lors de la sauvegarde'); }
    finally { setSaving(false); }
  };

  if (user?.role !== 'expert') {
    return (
      <div className="page-body">
        <div className="empty-state"><div className="empty-state-icon">🔒</div><p>Accès réservé à l'expert-comptable</p></div>
      </div>
    );
  }

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  const F = ({ label, name, type = 'text', placeholder, rows }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {rows ? (
        <textarea className="form-control" rows={rows} placeholder={placeholder}
          value={form[name] || ''} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      ) : (
        <input type={type} className="form-control" placeholder={placeholder}
          value={form[name] || ''} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} />
      )}
    </div>
  );

  return (
    <>
      <div className="page-header">
        <h1>Paramètres du cabinet</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Enregistrement…' : saved ? '✅ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      <div className="page-body">
        {saved && <div className="alert alert-success" style={{ marginBottom: 16 }}>Paramètres sauvegardés avec succès.</div>}

        {/* Identité cabinet */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Identité du cabinet</h3></div>
          <div className="card-body">
            <F label="Nom du cabinet *" name="nom" placeholder="ParFi France" />
            <div className="form-row">
              <F label="SIRET" name="siret" placeholder="00000000000000" />
              <F label="N° d'ordre" name="numeroOrdre" placeholder="REG-XXXX" />
            </div>
            <F label="Adresse" name="adresse" placeholder="12 rue de la Paix" />
            <div className="form-row">
              <F label="Code postal" name="codePostal" placeholder="75000" />
              <F label="Ville" name="ville" placeholder="Paris" />
            </div>
            <div className="form-row">
              <F label="Téléphone" name="telephone" placeholder="+33 1 23 45 67 89" />
              <F label="Email" name="email" type="email" placeholder="contact@parfi-france.fr" />
            </div>
            <F label="Site web" name="siteWeb" placeholder="https://www.parfi-france.fr" />
            <F label="Assurance RCP" name="assuranceRCP" placeholder="Compagnie / N° de police" />
          </div>
        </div>

        {/* Facturation */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3 className="card-title">Facturation & relances</h3></div>
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Taux TVA par défaut (%)</label>
                <select className="form-control" value={form.tvaTaux} onChange={e => setForm(f => ({ ...f, tvaTaux: e.target.value }))}>
                  <option value="0">0%</option>
                  <option value="5.5">5.5%</option>
                  <option value="10">10%</option>
                  <option value="20">20%</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Relances automatiques</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form.relanceAutomatique} onChange={e => setForm(f => ({ ...f, relanceAutomatique: e.target.checked }))} />
                  Activer les relances automatiques
                </label>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Délai relance 1 (jours)</label>
                <input type="number" className="form-control" value={form.delaiRelance1} onChange={e => setForm(f => ({ ...f, delaiRelance1: e.target.value }))} min="1" />
              </div>
              <div className="form-group">
                <label className="form-label">Délai relance 2 (jours)</label>
                <input type="number" className="form-control" value={form.delaiRelance2} onChange={e => setForm(f => ({ ...f, delaiRelance2: e.target.value }))} min="1" />
              </div>
            </div>
            <div className="form-row">
              <F label="IBAN" name="iban" placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX" />
              <F label="BIC" name="bic" placeholder="BNPAFRPPXXX" />
            </div>
            <F label="Mentions légales" name="mentionsLegales" rows={3} placeholder="Mentions légales figurant sur les factures et devis…" />
            <F label="Signature email" name="emailSignature" rows={3} placeholder="Cordialement,\nParFi France…" />
          </div>
        </div>

        {/* Apparence */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">Apparence</h3></div>
          <div className="card-body">
            <F label="URL du logo" name="logoUrl" placeholder="https://..." />
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Couleur principale</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.couleurPrimaire || '#0f1f4b'} onChange={e => setForm(f => ({ ...f, couleurPrimaire: e.target.value }))} style={{ width: 48, height: 38, padding: 2, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  <input className="form-control" value={form.couleurPrimaire || ''} onChange={e => setForm(f => ({ ...f, couleurPrimaire: e.target.value }))} placeholder="#0f1f4b" style={{ width: 120 }} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Couleur secondaire</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.couleurSecondaire || '#00b4d8'} onChange={e => setForm(f => ({ ...f, couleurSecondaire: e.target.value }))} style={{ width: 48, height: 38, padding: 2, borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  <input className="form-control" value={form.couleurSecondaire || ''} onChange={e => setForm(f => ({ ...f, couleurSecondaire: e.target.value }))} placeholder="#00b4d8" style={{ width: 120 }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
