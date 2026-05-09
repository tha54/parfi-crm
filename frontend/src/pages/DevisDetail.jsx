import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

const STATUTS = {
  brouillon: 'Brouillon',
  envoye: 'Envoyé pour signature',
  accepte: 'Signé — LDM créée',
  refuse: 'Refusé',
  expire: 'Expiré',
};
const STATUT_COLORS = {
  brouillon: '#6b7c93',
  envoye: '#f59e0b',
  accepte: '#00897b',
  refuse: '#e74c3c',
  expire: '#9ca3af',
};

const ENTITE_LABELS = { ei: 'EI', societe: 'Société', association: 'Association' };
const FISCAL_LABELS = { micro: 'Micro', reel_simplifie: 'Réel simplifié', reel_normal: 'Réel normal', bnc: 'BNC', ba: 'BA', sci: 'SCI (IR)', ir: 'IR', is: 'IS' };
const TVA_LABELS    = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', franchise: 'Franchise', neant: 'Néant' };
const SECTION_COLORS = { Comptabilité: '#1d4ed8', Fiscalité: '#b45309', Social: '#15803d', Juridique: '#7c3aed' };

function StatutBadge({ s }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: (STATUT_COLORS[s] || '#6b7c93') + '18', color: STATUT_COLORS[s] || '#6b7c93', border: `1px solid ${(STATUT_COLORS[s] || '#6b7c93')}40` }}>
      {STATUTS[s] || s}
    </span>
  );
}

/** Bandeau "Prochaine étape" — guide l'utilisateur dans le workflow Devis. */
function NextStepCard({ title, subtitle, description, primary, secondaries = [], color = 'var(--accent)' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 18,
      padding: '16px 20px', marginBottom: 20,
      borderRadius: 10, border: `1px solid ${color}40`,
      background: `${color}0d`, borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color, padding: '2px 8px', background: `${color}1a`, borderRadius: 10 }}>
            {subtitle}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{description}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {secondaries.map((b, i) => (
          <button key={i} className="btn btn-ghost btn-sm" onClick={b.onClick} disabled={b.disabled}
            style={b.color ? { borderColor: b.color, color: b.color } : undefined}>
            {b.label}
          </button>
        ))}
        {primary && (
          <button className="btn btn-primary" onClick={primary.onClick} disabled={primary.disabled}
            style={{ background: primary.color || color, borderColor: primary.color || color }}>
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}

function RubriqueRow({ rub }) {
  const [open, setOpen] = useState(false);
  const color = SECTION_COLORS[rub.section] || '#6b7280';
  return (
    <>
      <tr onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer', background: '#f8fafc' }}>
        <td style={{ padding: '11px 14px', fontWeight: 600, fontSize: 13 }}>
          <span style={{ display: 'inline-block', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : '', marginRight: 8, color: 'var(--text-muted)', fontSize: 10 }}>▶</span>
          {rub.rubrique}
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, background: color + '15', color, padding: '2px 8px', borderRadius: 10 }}>{rub.section}</span>
        </td>
        <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>{rub.lignes.length}</td>
        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(rub.total)}</td>
      </tr>
      {open && rub.lignes.map((l, i) => (
        <tr key={i} style={{ background: '#fff', borderTop: '1px solid #f0f4f8' }}>
          <td style={{ padding: '7px 14px 7px 38px', fontSize: 12, color: '#4b5563' }}>{l.libelle || l.description}</td>
          <td style={{ padding: '7px 14px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{l.periodicite || '—'}</td>
          <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, color: '#4b5563' }}>{fmt(l.tarif_ht || l.totalHT)}</td>
        </tr>
      ))}
    </>
  );
}

export default function DevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [devis, setDevis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [acceptConfirmModal, setAcceptConfirmModal] = useState(false);
  const [emailModal, setEmailModal] = useState(null); // { nomContact, resolve }
  const [emailInput, setEmailInput] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);
  const [evenements, setEvenements] = useState([]);

  const canEdit = ['expert', 'chef_mission'].includes(user?.role);

  const load = () =>
    api.get(`/devis/${id}`)
      .then(r => setDevis(r.data))
      .catch(() => navigate('/devis'))
      .finally(() => setLoading(false));

  const loadEvenements = () =>
    api.get(`/devis/evenements/${id}`)
      .then(r => setEvenements(r.data || []))
      .catch(() => {});

  useEffect(() => { load(); loadEvenements(); }, [id]);
  useEffect(() => {
    if (!devis) return;
    if (devis.pdf_path) { setPdfReady(true); return; }
    // Auto-generate PDF on first view
    api.post(`/devis/${id}/generer-pdf`)
      .then(() => setPdfReady(true))
      .catch(() => {});
  }, [devis?.id]);

  const action = async (fn, successMsg) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: successMsg }); await load(); loadEvenements(); }
    catch (e) { setMsg({ ok: false, text: e.response?.data?.message || 'Erreur' }); }
    finally { setBusy(false); }
  };

  const askEmail = (nomContact) => new Promise(resolve => {
    setEmailInput('');
    setEmailModal({ nomContact, resolve });
  });

  const envoyer = async (emailOverride) => {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post(`/devis/${id}/envoyer`, emailOverride ? { emailOverride } : {});
      if (data.missingEmail) {
        setBusy(false);
        const email = await askEmail(data.nomContact);
        if (!email) return;
        return envoyer(email);
      }
      if (data.emailError) {
        setMsg({ ok: false, text: `Statut mis à jour, mais l'email n'a pas pu être envoyé : ${data.emailError}` });
      } else if (data.email) {
        setMsg({ ok: true, text: `✓ Devis envoyé par email à ${data.email}` });
      } else {
        setMsg({ ok: true, text: data.message || 'Devis envoyé' });
      }
      await load(); loadEvenements();
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.message || 'Erreur' }); }
    finally { setBusy(false); }
  };
  const accepter = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post(`/devis/${id}/accepter`);
      if (data.ldmId) {
        navigate(`/lettres-mission/${data.ldmId}?fromDevis=1`);
      } else {
        setMsg({ ok: true, text: 'Devis signé ✓' });
        await load();
      }
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Erreur' });
      setBusy(false);
    }
  };
  const refuser = () => action(() => api.post(`/devis/${id}/refuser`), 'Devis refusé');
  const dupliquer = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data: r } = await api.post(`/devis/${id}/dupliquer`);
      navigate(`/devis/${r.id}`);
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.message || 'Erreur duplication' }); setBusy(false); }
  };
  const convertirLDM = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data: r } = await api.post(`/devis/${id}/convertir-ldm`);
      navigate(`/lettres-mission/${r.id}`);
    } catch (e) { setMsg({ ok: false, text: e.response?.data?.message || 'Erreur création LDM' }); setBusy(false); }
  };
  const genererPlanFacturation = async () => {
    setGeneratingPlan(true); setMsg(null);
    try {
      const { data } = await api.post(`/devis/${id}/generer-plan-facturation`);
      setMsg({ ok: true, text: `✓ ${data.message}` });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Erreur génération du plan' });
    } finally { setGeneratingPlan(false); }
  };

  const genererPdf = async () => {
    setGeneratingPdf(true); setMsg(null);
    try {
      await api.post(`/devis/${id}/generer-pdf`);
      setPdfReady(true);
      setMsg({ ok: true, text: '✓ PDF généré avec succès' });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Erreur génération PDF' });
    } finally { setGeneratingPdf(false); }
  };

  const voirPdf = () => {
    const token = localStorage.getItem('parfi_token');
    window.open(`/api/devis/${id}/pdf?token=${token}`, '_blank');
  };

  const deleteDevis = async () => {
    if (!confirm(`Supprimer le devis ${devis?.numero} ?`)) return;
    try { await api.delete(`/devis/${id}`); navigate('/devis'); }
    catch (e) { setMsg({ ok: false, text: 'Erreur suppression' }); }
  };

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;
  if (!devis) return null;

  const nom = devis.display_nom || devis.client_nom || devis.prospect_nom || '—';
  const rubriques = devis.lignes_grouped || [];
  const totalHT = parseFloat(devis.totalHT || 0);
  const totalHTNet = parseFloat(devis.total_ht_net || devis.totalHT || 0);
  const remise = parseFloat(devis.remise_pct || 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/devis')}>← Devis</button>
            <h1 style={{ margin: 0 }}>{devis.numero}</h1>
            <StatutBadge s={devis.statut} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {nom}
            {devis.dateValidite && ` · Validité : ${new Date(devis.dateValidite).toLocaleDateString('fr-FR')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {pdfReady
            ? <>
                <button className="btn btn-ghost btn-sm" onClick={voirPdf} style={{ borderColor: '#1a3a5c', color: '#1a3a5c' }}>📑 Voir le PDF</button>
                {canEdit && (
                  <button className="btn btn-ghost btn-sm" onClick={genererPdf} disabled={generatingPdf} title="Regénérer le PDF" style={{ fontSize: 12, borderColor: '#1a3a5c', color: '#1a3a5c' }}>
                    {generatingPdf ? '⏳' : '↺ Regénérer'}
                  </button>
                )}
              </>
            : <button className="btn btn-ghost btn-sm" disabled style={{ borderColor: '#1a3a5c', color: '#1a3a5c' }}>
                ⏳ Génération PDF…
              </button>
          }
          <button className="btn btn-ghost btn-sm" onClick={dupliquer} disabled={busy}>📋 Dupliquer</button>
          {user?.role === 'expert' && devis.statut === 'brouillon' && (
            <button className="btn btn-danger btn-sm" onClick={deleteDevis}>🗑</button>
          )}
        </div>
      </div>

      <div className="page-body">
        {msg && (
          <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20 }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Bandeau "Prochaine étape" — guide le workflow */}
        {canEdit && devis.statut === 'brouillon' && (
          <NextStepCard
            subtitle="Étape 1 / 3"
            title="Brouillon — pas encore envoyé"
            description="Le devis est en cours d'édition. Tu peux encore le modifier librement. Quand tu cliques « Envoyer pour signature », un email part automatiquement au client."
            primary={{ label: '📤 Envoyer pour signature', onClick: () => envoyer(), disabled: busy }}
            secondaries={[
              { label: '✏️ Modifier le devis', onClick: () => navigate(`/devis?edit=${id}`) },
            ]}
            color="#6b7c93"
          />
        )}
        {canEdit && devis.statut === 'envoye' && (
          <NextStepCard
            subtitle="Étape 2 / 3"
            title={devis.yousign_request_id
              ? '✍️ Signature électronique en cours (Yousign)'
              : 'Envoyé — en attente du devis signé du client'}
            description={devis.yousign_request_id
              ? `Le document a été envoyé via Yousign pour signature électronique. La LDM sera créée automatiquement dès que le client aura signé en ligne.`
              : "Le devis a été envoyé au client par email. Tant que tu n'as pas reçu le devis signé en retour, la lettre de mission ne peut pas être créée."}
            primary={{
              label: '✓ Devis signé reçu — créer la LDM',
              onClick: () => setAcceptConfirmModal(true),
              disabled: busy,
              color: '#00897b',
            }}
            secondaries={[
              { label: '↻ Renvoyer', onClick: () => envoyer(), disabled: busy },
              { label: '✗ Refusé', onClick: refuser, disabled: busy, color: '#e74c3c' },
            ]}
            color="#f59e0b"
          />
        )}
        {canEdit && devis.statut === 'accepte' && devis.ldm_id && (
          <NextStepCard
            subtitle="Étape 3 / 3"
            title="Signé ✓ — LDM créée"
            description={`La lettre de mission ${devis.ldm_numero ? `« ${devis.ldm_numero} » ` : ''}a été générée. La suite du workflow (envoi, signature, échéancier) se passe sur la LDM.`}
            primary={{ label: 'Voir la LDM →', onClick: () => navigate(`/lettres-mission/${devis.ldm_id}`), color: '#0f1f4b' }}
            secondaries={[
              { label: generatingPlan ? '⏳ Génération…' : '💳 Générer plan de facturation', onClick: genererPlanFacturation, disabled: generatingPlan, color: '#00897b' },
            ]}
            color="#00897b"
          />
        )}
        {canEdit && devis.statut === 'accepte' && !devis.ldm_id && (
          <NextStepCard
            subtitle="Étape 3 / 3"
            title="Signé — LDM à créer"
            description="Le devis est signé mais la lettre de mission n'a pas encore été créée. Lance la création pour passer à l'étape suivante."
            primary={{ label: '📋 Créer la LDM', onClick: convertirLDM, disabled: busy, color: '#0f1f4b' }}
            color="#00897b"
          />
        )}
        {canEdit && devis.statut === 'refuse' && (
          <NextStepCard
            subtitle="Refusé"
            title="Le client n'a pas donné suite"
            description="Tu peux dupliquer ce devis pour repartir d'une nouvelle base avec un prix ou un périmètre ajusté."
            primary={{ label: '📋 Dupliquer pour repartir', onClick: dupliquer, disabled: busy }}
            color="#e74c3c"
          />
        )}
        {canEdit && devis.statut === 'expire' && (
          <NextStepCard
            subtitle="Expiré"
            title="Validité dépassée"
            description="La date de validité est passée. Duplique pour créer une nouvelle version à jour."
            primary={{ label: '📋 Dupliquer', onClick: dupliquer, disabled: busy }}
            color="#9ca3af"
          />
        )}

        {/* Pipeline statut visuel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
          {[
            { key: 'brouillon', label: 'Brouillon' },
            { key: 'envoye', label: 'En attente de signature' },
            { key: 'accepte', label: 'Signé' },
          ].map((step, i, arr) => {
            const statuts = ['brouillon', 'envoye', 'accepte'];
            const currentIdx = statuts.indexOf(devis.statut);
            const stepIdx = statuts.indexOf(step.key);
            const done = stepIdx <= currentIdx;
            return (
              <React.Fragment key={step.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--accent)' : 'var(--border)', color: done ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {done && stepIdx < currentIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: done ? 700 : 400, color: done ? 'var(--primary)' : 'var(--text-muted)' }}>{step.label}</span>
                </div>
                {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: stepIdx < currentIdx ? 'var(--accent)' : 'var(--border)', margin: '0 8px' }} />}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

          {/* Colonne principale — rubriques */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Prestations par rubrique</span>
                <span className="text-muted text-sm" style={{ fontSize: 12 }}>Cliquer pour détailler</span>
              </div>
              {rubriques.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}><p>Aucune prestation</p></div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead><tr>
                      <th>Rubrique</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Nb</th>
                      <th style={{ textAlign: 'right', width: 130 }}>Montant HT</th>
                    </tr></thead>
                    <tbody>
                      {rubriques.map((r, i) => <RubriqueRow key={i} rub={r} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paramètres dimensionnement */}
            {devis.type_entite && (
              <div className="card">
                <div className="card-header"><span className="card-title">Paramètres de dimensionnement</span></div>
                <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {[
                      { label: 'Type entité',   val: ENTITE_LABELS[devis.type_entite] || devis.type_entite },
                      { label: 'Régime fiscal',  val: FISCAL_LABELS[devis.regime_fiscal] || devis.regime_fiscal },
                      { label: 'Régime TVA',     val: TVA_LABELS[devis.regime_tva] || devis.regime_tva },
                      { label: 'Nb établissements', val: devis.nb_etablissements ?? '—' },
                      { label: 'Factures achat', val: `${devis.factures_achat || 0}/mois` },
                      { label: 'Factures vente', val: `${devis.factures_vente || 0}/mois` },
                      { label: 'Lignes banque',  val: `${devis.lignes_banque || 0}/mois` },
                      { label: 'Immobilisations',val: devis.immobilisations || 0 },
                      { label: 'Effectif',       val: `${devis.effectif || 0} salarié(s)` },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(devis.notesClient || devis.notesInternes) && (
              <div className="card">
                <div className="card-header"><span className="card-title">Notes</span></div>
                <div className="card-body">
                  {devis.notesClient && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes client</div><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{devis.notesClient}</div></div>}
                  {devis.notesInternes && <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Notes internes</div><div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{devis.notesInternes}</div></div>}
                </div>
              </div>
            )}

            {/* Journal des événements */}
            {evenements.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Journal des événements</span>
                  <span className="text-muted text-sm">{evenements.length} événement{evenements.length > 1 ? 's' : ''}</span>
                </div>
                <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                  {evenements.map((ev, i) => {
                    const evLabels = {
                      envoi: 'Envoi au client',
                      renvoi: 'Renvoi au client',
                      signature_yousign: 'Signé via Yousign',
                      signature_manuelle: 'Signé manuellement',
                      refus: 'Refusé',
                    };
                    const evIcons = {
                      envoi: '📤',
                      renvoi: '📤',
                      signature_yousign: '✍️',
                      signature_manuelle: '✍️',
                      refus: '✗',
                    };
                    const evColors = {
                      envoi: '#f59e0b',
                      renvoi: '#f59e0b',
                      signature_yousign: '#059669',
                      signature_manuelle: '#059669',
                      refus: '#dc2626',
                    };
                    const color = evColors[ev.type] || '#6b7280';
                    return (
                      <div key={ev.id || i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < evenements.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: color + '18', border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {evIcons[ev.type] || '•'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 600, color }}>{evLabels[ev.type] || ev.type?.replace(/_/g, ' ')}</span>
                              {ev.acteur_nom && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>par {ev.acteur_nom}</span>}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {new Date(ev.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {ev.commentaire && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ev.commentaire}</div>}
                          {ev.statut_avant && ev.statut_apres && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              <span style={{ color: STATUT_COLORS[ev.statut_avant] }}>{STATUTS[ev.statut_avant] || ev.statut_avant}</span>
                              <span style={{ margin: '0 4px' }}>→</span>
                              <span style={{ color: STATUT_COLORS[ev.statut_apres], fontWeight: 600 }}>{STATUTS[ev.statut_apres] || ev.statut_apres}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Totaux */}
            <div className="card">
              <div className="card-header"><span className="card-title">Totaux</span></div>
              <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
                {[
                  { label: 'Total HT brut', val: fmt(totalHT) },
                  remise > 0 && { label: `Remise (${remise}%)`, val: `− ${fmt(totalHT * remise / 100)}`, red: true },
                  remise > 0 && { label: 'Total HT net', val: fmt(totalHTNet), bold: true },
                  { label: 'TVA 20%', val: fmt(devis.totalTVA) },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span className="text-muted" style={{ fontWeight: r.bold ? 600 : 400 }}>{r.label}</span>
                    <strong style={{ color: r.red ? '#e74c3c' : 'inherit', fontWeight: r.bold ? 700 : 600 }}>{r.val}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 12px', marginTop: 8, background: 'var(--primary)', color: '#fff', borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
                  <span>Total TTC</span><span>{fmt(devis.totalTTC)}</span>
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--accent-hover)', fontWeight: 600 }}>
                  {fmt(totalHTNet / 12)} / mois HT
                </div>
              </div>
            </div>

            {/* Infos */}
            <div className="card">
              <div className="card-header"><span className="card-title">Informations</span></div>
              <div className="card-body" style={{ paddingTop: 10, paddingBottom: 10 }}>
                {[
                  { label: 'Référence', value: <code style={{ fontSize: 12 }}>{devis.numero}</code> },
                  { label: 'Client / Prospect', value: devis.client_id ? <Link to={`/clients/${devis.client_id}`} style={{ color: 'var(--accent)' }}>{nom}</Link> : nom },
                  { label: 'Statut', value: <span style={{ color: STATUT_COLORS[devis.statut] }}>{STATUTS[devis.statut]}</span> },
                  { label: 'Émis le', value: new Date(devis.createdAt || devis.dateEmission).toLocaleDateString('fr-FR') },
                  devis.dateValidite && { label: 'Validité', value: new Date(devis.dateValidite).toLocaleDateString('fr-FR') },
                  devis.cree_par_prenom && { label: 'Créé par', value: `${devis.cree_par_prenom} ${devis.cree_par_nom}` },
                  devis.duplique_de && { label: 'Copie de', value: <Link to={`/devis/${devis.duplique_de}`} style={{ color: 'var(--accent)' }}>Voir original</Link> },
                  devis.ldm_id && { label: 'LDM liée', value: <Link to={`/lettres-mission/${devis.ldm_id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{devis.ldm_numero || `LDM #${devis.ldm_id}`} →</Link> },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span className="text-muted">{label}</span>
                    <span style={{ fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* PDF inline preview */}
        {pdfReady && (
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="card-title">📑 Document PDF — {devis.numero}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={voirPdf}>Ouvrir dans un onglet ↗</button>
                <a href={`/api/devis/${id}/pdf?token=${localStorage.getItem('parfi_token')}`}
                   download={`${devis.numero}.pdf`} className="btn btn-ghost btn-sm">
                  ⬇ Télécharger
                </a>
              </div>
            </div>
            <div style={{ padding: 0, borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              <iframe
                src={`/api/devis/${id}/pdf?token=${localStorage.getItem('parfi_token')}`}
                style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }}
                title={`PDF ${devis.numero}`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmation — réception du devis signé */}
      {acceptConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAcceptConfirmModal(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 10, padding: 28, width: 460, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 12px', color: '#0f1f4b', fontSize: 16 }}>
              Confirmation — devis signé reçu ?
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
              Tu t'apprêtes à marquer le devis <strong>{devis.numero}</strong> comme accepté.
            </p>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                ⚠️ Cette action est définitive
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
                <li>Le devis sera verrouillé (plus modifiable)</li>
                <li>La lettre de mission sera créée automatiquement</li>
                <li>L'opportunité passera en « Devis accepté »</li>
              </ul>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: '#374151' }}>
              Confirmes-tu avoir bien <strong>reçu le devis signé</strong> du client ?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAcceptConfirmModal(false)} disabled={busy}>
                Annuler
              </button>
              <button className="btn btn-primary" disabled={busy}
                style={{ background: '#00897b', borderColor: '#00897b' }}
                onClick={() => { setAcceptConfirmModal(false); accepter(); }}>
                {busy ? 'Création…' : '✓ Oui, créer la LDM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal email manquant */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: '#1a3a5c' }}>Email du destinataire</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              Aucun email renseigné pour <strong>{emailModal.nomContact || 'ce contact'}</strong>.<br />
              Saisissez l'adresse pour envoyer le devis.
            </p>
            <input
              type="email"
              className="form-control"
              placeholder="contact@exemple.fr"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && emailInput) { const r = emailModal.resolve; setEmailModal(null); r(emailInput); } }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { const r = emailModal.resolve; setEmailModal(null); r(null); }}>Annuler</button>
              <button className="btn btn-primary" disabled={!emailInput} onClick={() => { const r = emailModal.resolve; setEmailModal(null); r(emailInput); }}>
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
