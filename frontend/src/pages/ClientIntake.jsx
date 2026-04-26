import { useState } from 'react';
import api from '../services/api';

const ACTIVITES = ['BIC', 'BNC', 'SCI', 'SA', 'Autre'];

const EMPTY_FORM = {
  raison_sociale: '',
  siren: '',
  activite: 'BIC',
  effectif: '',
  email: '',
  telephone: '',
  ca_estime: '',
  besoins: '',
};

export default function ClientIntake() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null); // token string on success
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.raison_sociale.trim()) {
      setError('La raison sociale est obligatoire.');
      return;
    }
    if (!form.email.trim()) {
      setError("L'email de contact est obligatoire.");
      return;
    }
    if (form.siren && !/^\d{9}$/.test(form.siren.replace(/\s/g, ''))) {
      setError('Le SIREN doit contenir exactement 9 chiffres.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        raison_sociale: form.raison_sociale,
        siren: form.siren.replace(/\s/g, '') || undefined,
        activite: form.activite,
        effectif: form.effectif ? Number(form.effectif) : undefined,
        email: form.email,
        telephone: form.telephone || undefined,
        ca_estime: form.ca_estime ? Number(form.ca_estime) : undefined,
        besoins: form.besoins || undefined,
      };
      const { data } = await api.post('/intake/submit', payload);
      setSuccess(data.token || data.reference || '—');
    } catch (err) {
      setError(err.response?.data?.message || 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: '#0F1F4B',
        padding: '0 32px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#5BB8E8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 18,
            color: '#0F1F4B',
            letterSpacing: '-0.03em',
          }}>
            P
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>ParFi Group</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, letterSpacing: '0.04em' }}>Cabinet d'expertise comptable</div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px 60px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>
          {success ? (
            /* Success state */
            <div className="card" style={{ textAlign: 'center', padding: '48px 32px' }}>
              <div style={{ fontSize: 56, marginBottom: 20 }}>✅</div>
              <h2 style={{ color: '#0F1F4B', marginBottom: 12 }}>Demande transmise !</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                Votre demande a bien été transmise. Notre équipe vous contactera sous <strong>48h</strong>.
              </p>
              <div style={{
                display: 'inline-block',
                background: '#f0f6ff',
                border: '1px solid #bee3ed',
                borderRadius: 8,
                padding: '10px 20px',
                fontFamily: 'monospace',
                fontSize: 14,
                color: '#0F1F4B',
                fontWeight: 600,
              }}>
                Référence : {success}
              </div>
            </div>
          ) : (
            /* Form */
            <div className="card">
              <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px 28px 20px' }}>
                <h2 style={{ margin: 0, color: '#0F1F4B', fontSize: 22 }}>Demande de renseignements</h2>
                <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  Remplissez ce formulaire, notre équipe vous contactera sous 48h.
                </p>
              </div>

              <div className="card-body" style={{ padding: '4px 28px 28px' }}>
                {error && (
                  <div style={{
                    marginBottom: 16,
                    padding: '10px 14px',
                    background: '#fef2f2',
                    color: '#991b1b',
                    borderRadius: 8,
                    fontSize: 13,
                    border: '1px solid #fecaca',
                  }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Section: Entreprise */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 12px' }}>
                    Votre entreprise
                  </div>

                  <div className="form-group">
                    <label className="form-label">Raison sociale *</label>
                    <input
                      className="form-control"
                      value={form.raison_sociale}
                      onChange={set('raison_sociale')}
                      placeholder="SARL Exemple, SAS Dupont…"
                      required
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">SIREN</label>
                      <input
                        className="form-control"
                        value={form.siren}
                        onChange={set('siren')}
                        placeholder="123456789"
                        maxLength={9}
                        style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Activité principale</label>
                      <select className="form-control" value={form.activite} onChange={set('activite')}>
                        {ACTIVITES.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Effectif (nombre de salariés)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={form.effectif}
                      onChange={set('effectif')}
                      placeholder="Ex : 5"
                      min="0"
                    />
                  </div>

                  {/* Section: Contact */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 12px' }}>
                    Vos coordonnées
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email de contact *</label>
                    <input
                      type="email"
                      className="form-control"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="contact@monentreprise.fr"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Téléphone</label>
                    <input
                      type="tel"
                      className="form-control"
                      value={form.telephone}
                      onChange={set('telephone')}
                      placeholder="+33 1 23 45 67 89"
                    />
                  </div>

                  {/* Section: Besoins */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 12px' }}>
                    Vos besoins
                  </div>

                  <div className="form-group">
                    <label className="form-label">CA estimé (€)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={form.ca_estime}
                      onChange={set('ca_estime')}
                      placeholder="Ex : 250000"
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Vos besoins</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={form.besoins}
                      onChange={set('besoins')}
                      placeholder="Décrivez vos besoins : tenue comptable, bilan, conseil fiscal, création de société…"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting}
                    style={{ width: '100%', marginTop: 8, justifyContent: 'center', padding: '12px 0', fontSize: 15 }}
                  >
                    {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
                  </button>

                  <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Vos données sont traitées conformément au RGPD. Elles ne seront pas transmises à des tiers.
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
