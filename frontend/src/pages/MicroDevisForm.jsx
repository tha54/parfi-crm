import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

const UNITES = ['forfait', 'heure', 'jour', 'unité', 'mois', 'km'];

const fmtEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n || 0);

function today() { return new Date().toISOString().split('T')[0]; }
function inDays(n) { return new Date(Date.now() + n * 86400000).toISOString().split('T')[0]; }

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Contact', 'Prestations', 'Conditions', 'Aperçu & Envoi'];
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const active = i + 1 === step;
        const done = i + 1 < step;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#059669' : active ? '#2563eb' : '#e5e7eb',
                color: done || active ? '#fff' : '#6b7280', fontWeight: 700, fontSize: 14,
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 11, marginTop: 4, fontWeight: active ? 600 : 400, color: active ? '#2563eb' : '#6b7280', whiteSpace: 'nowrap' }}>
                {s}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#059669' : '#e5e7eb', margin: '0 8px', marginBottom: 16 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Ligne row ────────────────────────────────────────────────────────────────
function LigneRow({ l, idx, onChange, onRemove }) {
  const ht = Number(l.quantite || 0) * Number(l.prix_unitaire || 0) * (1 - (Number(l.remise_pct) || 0) / 100);

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '8px 6px' }}>
        <input value={l.libelle} onChange={e => onChange(idx, 'libelle', e.target.value)}
          placeholder="Libellé *"
          style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
        <input value={l.description || ''} onChange={e => onChange(idx, 'description', e.target.value)}
          placeholder="Description (optionnel)"
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 11, color: '#6b7280', marginTop: 3, boxSizing: 'border-box' }} />
      </td>
      <td style={{ padding: '8px 4px', width: 70 }}>
        <input type="number" min="0" step="0.001" value={l.quantite} onChange={e => onChange(idx, 'quantite', e.target.value)}
          style={{ width: '100%', padding: '6px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '8px 4px', width: 80 }}>
        <select value={l.unite} onChange={e => onChange(idx, 'unite', e.target.value)}
          style={{ width: '100%', padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }}>
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={{ padding: '8px 4px', width: 110 }}>
        <input type="number" min="0" step="0.01" value={l.prix_unitaire} onChange={e => onChange(idx, 'prix_unitaire', e.target.value)}
          style={{ width: '100%', padding: '6px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '8px 4px', width: 70 }}>
        <input type="number" min="0" max="100" step="0.1" value={l.remise_pct || ''} onChange={e => onChange(idx, 'remise_pct', e.target.value)}
          placeholder="0"
          style={{ width: '100%', padding: '6px 6px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, textAlign: 'right' }} />
      </td>
      <td style={{ padding: '8px 6px', width: 100, textAlign: 'right', fontWeight: 600, color: '#111827', fontSize: 13 }}>
        {fmtEur(ht)}
      </td>
      <td style={{ padding: '8px 4px', width: 36 }}>
        <button onClick={() => onRemove(idx)} style={{
          width: 26, height: 26, borderRadius: '50%', border: '1px solid #fca5a5',
          background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </td>
    </tr>
  );
}

export default function MicroDevisForm() {
  const { id: clientId } = useParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [microClient, setMicroClient] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [prestations, setPrestations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [contact_id, setContactId] = useState('');
  const [newContact, setNewContact] = useState({ nom: '', prenom: '', societe: '', email: '', telephone: '', adresse: '' });
  const [creatingContact, setCreatingContact] = useState(false);

  const [lignes, setLignes] = useState([{ libelle: '', description: '', quantite: 1, unite: 'forfait', prix_unitaire: '', remise_pct: '' }]);

  const [objet, setObjet] = useState('');
  const [date_emission, setDateEmission] = useState(today());
  const [date_validite, setDateValidite] = useState(inDays(30));
  const [conditions_paiement, setConditionsPaiement] = useState('Paiement à réception de facture. Pénalités de retard : taux directeur BCE + 10 points. Indemnité forfaitaire de recouvrement : 40 €.');
  const [notes, setNotes] = useState('');
  const [taux_tva, setTauxTva] = useState(0);
  const [numero, setNumero] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mcRes = await api.get(`/micro-clients/by-client/${clientId}`);
      if (!mcRes.data) { navigate(`/clients/${clientId}/micro`); return; }
      setMicroClient(mcRes.data);

      const [cRes, pRes, numRes] = await Promise.all([
        api.get(`/micro-contacts?micro_client_id=${mcRes.data.id}`),
        api.get(`/micro-prestations?micro_client_id=${mcRes.data.id}`),
        api.get(`/micro-devis/next-numero/${mcRes.data.id}`),
      ]);
      setContacts(cRes.data);
      setPrestations(pRes.data);
      setNumero(numRes.data.numero);

      if (mcRes.data.regime_tva === 'tva_normale') setTauxTva(20);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [clientId, navigate]);

  useEffect(() => { load(); }, [load]);

  // Totaux
  const totaux = lignes.reduce(
    (acc, l) => {
      const ht = Number(l.quantite || 0) * Number(l.prix_unitaire || 0) * (1 - (Number(l.remise_pct) || 0) / 100);
      acc.ht += ht;
      return acc;
    },
    { ht: 0 }
  );
  totaux.tva = totaux.ht * Number(taux_tva) / 100;
  totaux.ttc = totaux.ht + totaux.tva;

  const addLigne = (prestation = null) => {
    setLignes(prev => [...prev, {
      libelle: prestation?.libelle || '',
      description: prestation?.description || '',
      quantite: 1,
      unite: prestation?.unite || 'forfait',
      prix_unitaire: prestation?.prix_unitaire || '',
      remise_pct: '',
    }]);
  };

  const updateLigne = (idx, field, value) => {
    setLignes(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLigne = (idx) => {
    setLignes(prev => prev.filter((_, i) => i !== idx));
  };

  const createContact = async () => {
    if (!newContact.nom) { alert('Le nom est requis'); return; }
    try {
      const res = await api.post('/micro-contacts', { ...newContact, micro_client_id: microClient.id });
      setContacts(prev => [...prev, res.data]);
      setContactId(String(res.data.id));
      setCreatingContact(false);
      setNewContact({ nom: '', prenom: '', societe: '', email: '', telephone: '', adresse: '' });
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  const canGoStep2 = contact_id;
  const canGoStep3 = lignes.some(l => l.libelle && l.prix_unitaire);
  const canGoStep4 = objet || lignes.some(l => l.libelle);

  const save = async (sendAfter = false) => {
    setSaving(true);
    try {
      const payload = {
        micro_client_id: microClient.id,
        contact_id: parseInt(contact_id),
        numero, date_emission, date_validite,
        objet, conditions_paiement, notes, taux_tva,
        lignes: lignes.filter(l => l.libelle && l.prix_unitaire),
      };
      const res = await api.post('/micro-devis', payload);
      const devisId = res.data.id;

      if (sendAfter) {
        try {
          await api.post(`/micro-devis/${devisId}/envoyer`);
        } catch (e) {
          alert('Devis sauvegardé mais erreur d\'envoi : ' + (e.response?.data?.error || e.message));
        }
      }

      navigate(`/clients/${clientId}/micro/devis/${devisId}`);
    } catch (e) {
      alert(e.response?.data?.error || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#6b7280' }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, display: 'flex', gap: 6 }}>
        <Link to={`/clients/${clientId}/micro`} style={{ color: '#2563eb', textDecoration: 'none' }}>← Micro</Link>
        <span>/</span>
        <Link to={`/clients/${clientId}/micro/devis`} style={{ color: '#2563eb', textDecoration: 'none' }}>Devis</Link>
        <span>/</span>
        <span>Nouveau</span>
      </div>

      <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Nouveau devis</h1>
      <p style={{ margin: '0 0 28px', color: '#6b7280', fontSize: 13 }}>
        {microClient?.nom_commercial || microClient?.client_nom} · {numero}
      </p>

      <StepBar step={step} />

      {/* ── STEP 1 : Contact ────────────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Sélectionner le destinataire</h3>

          {!creatingContact ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 14 }}>
                {contacts.map(c => (
                  <div key={c.id} onClick={() => setContactId(String(c.id))}
                    style={{
                      padding: 14, border: `2px solid ${contact_id === String(c.id) ? '#2563eb' : '#e5e7eb'}`,
                      borderRadius: 8, cursor: 'pointer', background: contact_id === String(c.id) ? '#eff6ff' : '#fff',
                    }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>
                      {c.societe || [c.prenom, c.nom].filter(Boolean).join(' ')}
                    </div>
                    {c.societe && <div style={{ fontSize: 12, color: '#6b7280' }}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</div>}
                    {c.email && <div style={{ fontSize: 12, color: '#2563eb', marginTop: 2 }}>{c.email}</div>}
                  </div>
                ))}
                <div onClick={() => setCreatingContact(true)}
                  style={{
                    padding: 14, border: '2px dashed #d1d5db', borderRadius: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13,
                  }}>
                  <span style={{ fontSize: 20 }}>+</span> Nouveau contact
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setStep(2)} disabled={!canGoStep2}
                  style={{
                    padding: '9px 24px', background: canGoStep2 ? '#2563eb' : '#e5e7eb',
                    color: canGoStep2 ? '#fff' : '#9ca3af', border: 'none', borderRadius: 7,
                    cursor: canGoStep2 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600,
                  }}>
                  Suivant →
                </button>
              </div>
            </>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
                {[['nom', 'Nom *'], ['prenom', 'Prénom'], ['societe', 'Société'], ['email', 'Email'], ['telephone', 'Téléphone']].map(([k, l]) => (
                  <div key={k}>
                    <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>{l}</label>
                    <input value={newContact[k] || ''} onChange={e => setNewContact(p => ({ ...p, [k]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 3 }}>Adresse</label>
                  <input value={newContact.adresse || ''} onChange={e => setNewContact(p => ({ ...p, adresse: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={createContact} style={{ padding: '7px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Créer et sélectionner</button>
                <button onClick={() => setCreatingContact(false)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2 : Prestations ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div>
          {/* Catalogue */}
          {prestations.length > 0 && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', marginBottom: 10 }}>
                Importer depuis le catalogue
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {prestations.map(p => (
                  <button key={p.id} onClick={() => addLigne(p)}
                    style={{ padding: '5px 12px', background: '#fff', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#1d4ed8' }}>
                    + {p.libelle} ({new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(p.prix_unitaire)}/{p.unite})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Table lignes */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0F1F4B' }}>
                  {['Prestation', 'Qté', 'Unité', 'Prix HT', 'Remise %', 'Total HT', ''].map(h => (
                    <th key={h} style={{ padding: '10px 6px', textAlign: h === 'Total HT' ? 'right' : 'left', color: '#fff', fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <LigneRow key={i} l={l} idx={i} onChange={updateLigne} onRemove={removeLigne} />
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 14px', borderTop: '1px solid #f3f4f6' }}>
              <button onClick={() => addLigne()} style={{
                padding: '6px 14px', background: '#f9fafb', border: '1px dashed #d1d5db',
                borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#374151',
              }}>+ Ajouter une ligne</button>
            </div>
          </div>

          {/* TVA */}
          {microClient?.regime_tva === 'tva_normale' && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>Taux TVA (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={taux_tva}
                onChange={e => setTauxTva(Number(e.target.value))}
                style={{ width: 80, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 13 }} />
            </div>
          )}

          {/* Totaux */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16, textAlign: 'right' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total HT : <strong style={{ color: '#111' }}>{fmtEur(totaux.ht)}</strong></div>
            {totaux.tva > 0 && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>TVA ({taux_tva}%) : <strong style={{ color: '#111' }}>{fmtEur(totaux.tva)}</strong></div>}
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F1F4B' }}>Total TTC : {fmtEur(totaux.ttc)}</div>
            {microClient?.regime_tva === 'franchise' && (
              <div style={{ fontSize: 11, color: '#854d0e', marginTop: 6, fontStyle: 'italic' }}>TVA non applicable, art. 293 B du CGI</div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(1)} style={{ padding: '9px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>← Retour</button>
            <button onClick={() => setStep(3)} disabled={!canGoStep3}
              style={{ padding: '9px 24px', background: canGoStep3 ? '#2563eb' : '#e5e7eb', color: canGoStep3 ? '#fff' : '#9ca3af', border: 'none', borderRadius: 7, cursor: canGoStep3 ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}>
              Suivant →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3 : Conditions ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Conditions du devis</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Numéro du devis</label>
              <input value={numero} onChange={e => setNumero(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div />
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Date d'émission</label>
              <input type="date" value={date_emission} onChange={e => setDateEmission(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Date de validité</label>
              <input type="date" value={date_validite} onChange={e => setDateValidite(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Objet du devis</label>
              <input value={objet} onChange={e => setObjet(e.target.value)} placeholder="Ex: Développement site web, Conseil RH, Formation…"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Conditions de paiement</label>
              <textarea value={conditions_paiement} onChange={e => setConditionsPaiement(e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: '#374151', display: 'block', marginBottom: 4 }}>Notes internes (non visibles sur le devis)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep(2)} style={{ padding: '9px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>← Retour</button>
            <button onClick={() => setStep(4)} style={{ padding: '9px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Aperçu →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4 : Aperçu & Envoi ──────────────────────────────────────────── */}
      {step === 4 && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600 }}>Récapitulatif</h3>

            {/* Contact sélectionné */}
            {(() => {
              const c = contacts.find(c => String(c.id) === contact_id);
              return c ? (
                <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Destinataire</div>
                  <div style={{ fontWeight: 600 }}>{c.societe || [c.prenom, c.nom].filter(Boolean).join(' ')}</div>
                  {c.email && <div style={{ fontSize: 12, color: '#2563eb' }}>{c.email}</div>}
                </div>
              ) : null;
            })()}

            {/* Lignes */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['Prestation', 'Qté', 'Unité', 'Prix HT', 'Total HT'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Total HT' ? 'right' : 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.filter(l => l.libelle).map((l, i) => {
                  const ht = Number(l.quantite) * Number(l.prix_unitaire) * (1 - (Number(l.remise_pct) || 0) / 100);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 500 }}>{l.libelle}</div>
                        {l.description && <div style={{ fontSize: 11, color: '#6b7280' }}>{l.description}</div>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>{l.quantite}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>{l.unite}</td>
                      <td style={{ padding: '8px 10px' }}>{fmtEur(l.prix_unitaire)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtEur(ht)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totaux */}
            <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 12, textAlign: 'right' }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Total HT : <strong style={{ color: '#111' }}>{fmtEur(totaux.ht)}</strong></div>
              {totaux.tva > 0 && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>TVA ({taux_tva}%) : <strong>{fmtEur(totaux.tva)}</strong></div>}
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0F1F4B' }}>Total : {fmtEur(totaux.ttc)}</div>
              {microClient?.regime_tva === 'franchise' && (
                <div style={{ fontSize: 11, color: '#854d0e', marginTop: 4, fontStyle: 'italic' }}>TVA non applicable, art. 293 B du CGI</div>
              )}
            </div>

            {/* Validité */}
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
              Devis {numero} · Émis le {new Date(date_emission).toLocaleDateString('fr-FR')} · Valable jusqu'au {new Date(date_validite).toLocaleDateString('fr-FR')}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button onClick={() => setStep(3)} style={{ padding: '9px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>← Retour</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => save(false)} disabled={saving}
                style={{ padding: '9px 20px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>
                {saving ? 'Enregistrement…' : 'Sauvegarder brouillon'}
              </button>
              <button onClick={() => save(true)} disabled={saving}
                style={{ padding: '9px 24px', background: '#059669', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {saving ? 'Envoi…' : '📧 Envoyer par email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
