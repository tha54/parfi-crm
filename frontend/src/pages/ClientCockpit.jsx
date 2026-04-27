import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import GED from './GED';
import { marked } from 'marked';
import AuditLog from '../components/AuditLog';
import React from 'react';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

// ─── Static maps ──────────────────────────────────────────────────────────────
const TYPE_BADGE = { BIC: 'bic', BNC: 'bnc', SCI: 'sci', SA: 'sa', Association: 'assoc', Autre: 'autre' };
const REGIME_BADGE = { mensuel: 'mensuel', trimestriel: 'trim', annuel: 'annuel' };
const REGIME_LABEL = { mensuel: 'Mensuel', trimestriel: 'Trimestriel', annuel: 'Annuel' };

const INTERACTION_ICONS = {
  appel: '📞', email_entrant: '📨', email_sortant: '📤',
  courrier: '✉️', reunion: '🤝', note: '📝', sms: '💬',
};
const INTERACTION_LABELS = {
  appel: 'Appel', email_entrant: 'E-mail entrant', email_sortant: 'E-mail sortant',
  courrier: 'Courrier', reunion: 'Réunion', note: 'Note', sms: 'SMS',
};
const URGENCE_COLORS = { normale: '#6b7c93', elevee: '#e67e22', critique: '#d63031' };

const MISSION_STATUTS = {
  en_cours: { label: 'En cours', color: '#00b4d8' },
  suspendue: { label: 'Suspendue', color: '#e67e22' },
  terminee: { label: 'Terminée', color: '#00897b' },
  annulee: { label: 'Annulée', color: '#d63031' },
};
const CAT_LABELS = {
  tenue_comptable: 'Tenue comptable', revision: 'Révision', etablissement_comptes: 'Comptes annuels',
  fiscal: 'Fiscal', social: 'Social', paie: 'Paie', juridique: 'Juridique', conseil: 'Conseil', autre: 'Autre',
};

const TACHE_STATUTS = ['a_faire', 'en_cours', 'termine', 'reporte'];
const TACHE_STATUT_LABEL = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé', reporte: 'Reporté' };
const TACHE_STATUT_BADGE = { a_faire: 'a_faire', en_cours: 'en_cours', termine: 'termine', reporte: 'reporte' };

const FACTURE_STATUTS = {
  brouillon: { label: 'Brouillon', badge: 'autre', color: '#6b7c93' },
  envoyee: { label: 'Envoyée', badge: 'en_cours', color: '#5bb8e8' },
  payee: { label: 'Payée', badge: 'termine', color: '#00897b' },
  partielle: { label: 'Partielle', badge: 'responsable', color: '#0288d1' },
  retard: { label: 'En retard', badge: 'reporte', color: '#d63031' },
  annulee: { label: 'Annulée', badge: 'inactif', color: '#9b9b9b' },
};

// ─── Pipeline contrats ────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { key: 'prospect',       label: 'Prospect' },
  { key: 'devis_envoye',   label: 'Devis envoyé' },
  { key: 'devis_accepte',  label: 'Devis accepté' },
  { key: 'ldm_generee',    label: 'LDM générée' },
  { key: 'ldm_signee',     label: 'LDM signée' },
  { key: 'mission_active', label: 'Mission active' },
];

const PIPELINE_COLOR = {
  prospect: '#6b7c93', devis_envoye: '#5bb8e8', devis_accepte: '#0288d1',
  ldm_generee: '#7c3aed', ldm_signee: '#e67e22', mission_active: '#00897b',
};

const CONTRAT_STATUT_LABELS = {
  prospect: 'Prospect', devis_envoye: 'Devis envoyé', devis_accepte: 'Devis accepté',
  ldm_generee: 'LDM générée', ldm_signee: 'LDM signée', mission_active: 'Mission active',
};

const REVISION_STATUT = {
  proposee: { label: 'Proposée', badge: 'en_cours' },
  acceptee: { label: 'Acceptée', badge: 'termine' },
  refusee:  { label: 'Refusée',  badge: 'reporte' },
};

const RECURRENCE_LABEL = { none: 'Unique', monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' };
const MANDAT_TYPE_LABEL = { prelevement: 'Prélèvement SEPA', impots: 'Mandat fiscal', urssaf: 'URSSAF', autre: 'Autre' };

const DEVIS_STATUT_BADGE = { brouillon: 'autre', envoye: 'en_cours', accepte: 'termine', refuse: 'inactif', expire: 'reporte' };
const DEVIS_STATUT_LABEL = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' };
const LDM_STATUT_BADGE = { brouillon: 'autre', envoyee: 'en_cours', signee: 'termine', archivee: 'inactif' };
const LDM_STATUT_LABEL = { brouillon: 'Brouillon', envoyee: 'Envoyée', signee: 'Signée', archivee: 'Archivée' };

const ROLE_LABEL = { expert: 'Expert-comptable', chef_mission: 'Chef de mission', collaborateur: 'Collaborateur' };

const REGIME_TVA_LABEL = {
  mensuel: 'Mensuel', trimestriel: 'Trimestriel',
  non_soumis: 'Non soumis à la TVA', 'Simplifié': 'Régime simplifié',
  annuel: 'Annuel',
};
const REGIME_FISCAL_LABEL = {
  ISRS: 'IS Réel Simplifié', ISRN: 'IS Réel Normal',
  SCIC: 'SC IS Créances', SCIS: 'SC IS Simplifié',
  BNC: 'BNC', BICRS: 'BIC Réel Simplifié', BICN: 'BIC Réel Normal',
};

const TABS = [
  { key: 'overview',   label: "Vue d'ensemble" },
  { key: 'equipe',     label: 'Équipe & Portefeuille' },
  { key: 'travaux',    label: 'Travaux' },
  { key: 'taches',     label: 'Tâches' },
  { key: 'timeline',   label: 'Timeline' },
  { key: 'facturation', label: 'Facturation' },
  { key: 'documents',  label: 'Documents' },
  { key: 'notes',      label: '📝 Notes' },
  { key: 'contrats',   label: 'Contrats & LDM' },
  { key: 'devis',      label: 'Devis' },
  { key: 'contacts',   label: 'Contacts' },
];

// ─── Modal helper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Tâche creation modal ─────────────────────────────────────────────────────
function TacheModal({ clientId, interactionObjet, users, currentUser, onSave, onClose }) {
  const [form, setForm] = useState({
    utilisateur_id: currentUser?.id || '',
    description: interactionObjet ? `Suite à : ${interactionObjet}` : '',
    duree: '1',
    date_echeance: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      await api.post('/taches', {
        client_id: clientId,
        utilisateur_id: form.utilisateur_id || currentUser?.id,
        description: form.description,
        duree: parseFloat(form.duree),
        date_echeance: form.date_echeance,
        source: 'manuelle',
      });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Créer une tâche" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Description *</label>
          <input className="form-control" value={form.description} onChange={set('description')} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Durée (h) *</label>
            <input className="form-control" type="number" step="0.5" min="0.5" value={form.duree} onChange={set('duree')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Échéance *</label>
            <input className="form-control" type="date" value={form.date_echeance} onChange={set('date_echeance')} required />
          </div>
        </div>
        {['expert', 'chef_mission'].includes(currentUser?.role) && (
          <div className="form-group">
            <label className="form-label">Assignée à</label>
            <select className="form-control" value={form.utilisateur_id} onChange={set('utilisateur_id')}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
              ))}
            </select>
          </div>
        )}
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Interaction creation modal ───────────────────────────────────────────────
function InteractionModal({ clientId, onSave, onClose }) {
  const [form, setForm] = useState({
    type: 'appel',
    direction: 'entrant',
    objet: '',
    contenu: '',
    urgence: 'normale',
    duree_minutes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      await api.post('/interactions', {
        client_id: clientId,
        type: form.type,
        direction: form.direction,
        objet: form.objet || null,
        contenu: form.contenu || null,
        urgence: form.urgence,
        duree_minutes: form.duree_minutes ? parseInt(form.duree_minutes, 10) : null,
      });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nouvelle interaction" onClose={onClose} maxWidth={540}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Type *</label>
            <select className="form-control" value={form.type} onChange={set('type')} required>
              {Object.entries(INTERACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Direction</label>
            <select className="form-control" value={form.direction} onChange={set('direction')}>
              <option value="entrant">Entrant</option>
              <option value="sortant">Sortant</option>
              <option value="interne">Interne</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Urgence</label>
            <select className="form-control" value={form.urgence} onChange={set('urgence')}>
              <option value="normale">Normale</option>
              <option value="elevee">Élevée</option>
              <option value="critique">Critique</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Durée (min)</label>
            <input className="form-control" type="number" min="0" value={form.duree_minutes} onChange={set('duree_minutes')} placeholder="0" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Objet</label>
          <input className="form-control" value={form.objet} onChange={set('objet')} placeholder="Sujet de l'interaction" />
        </div>
        <div className="form-group">
          <label className="form-label">Contenu</label>
          <textarea
            className="form-control"
            value={form.contenu}
            onChange={set('contenu')}
            rows={4}
            placeholder="Détails, notes, résumé…"
            style={{ resize: 'vertical' }}
          />
        </div>
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Tab: Vue d'ensemble ──────────────────────────────────────────────────────
function TabOverview({ client, attributions, factures, taches, missions, clientId, currentUser, onClientSaved }) {
  const isExpert = currentUser?.role === 'expert';
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [sensitiveContent, setSensitiveContent] = useState('');
  const [sensitiveLoading, setSensitiveLoading] = useState(false);
  const [sensitiveErr, setSensitiveErr] = useState('');

  const caFacture = factures.filter((f) => f.statut !== 'brouillon' && f.statut !== 'annulee')
    .reduce((s, f) => s + parseFloat(f.totalHT || 0), 0);
  const impayes = factures.filter((f) => f.statut === 'retard' || f.statut === 'envoyee')
    .reduce((s, f) => s + (parseFloat(f.totalTTC || 0) - parseFloat(f.montantPaye || 0)), 0);
  const missionsActives = missions.filter((m) => m.statut === 'en_cours').length;
  const tachesEnRetard = taches.filter(
    (t) => t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) < new Date()
  ).length;

  const unlockSensitive = async () => {
    setSensitiveLoading(true);
    setSensitiveErr('');
    try {
      const res = await api.get(`/tiime/client-notes/${clientId}`);
      setSensitiveContent(res.data.notes_sensibles || '(vide)');
      setSensitiveUnlocked(true);
    } catch (e) {
      setSensitiveErr(e.response?.data?.message || 'Impossible de déchiffrer les notes');
    } finally {
      setSensitiveLoading(false);
    }
  };

  const adresseComplete = [client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ');

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-icon">💶</div>
          <div className="kpi-value">{fmt(caFacture)}</div>
          <div className="kpi-label">CA Facturé</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">⚠️</div>
          <div className="kpi-value" style={{ color: impayes > 0 ? 'var(--danger)' : undefined }}>{fmt(impayes)}</div>
          <div className="kpi-label">Impayés</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">🎯</div>
          <div className="kpi-value">{missionsActives}</div>
          <div className="kpi-label">Missions actives</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">🕐</div>
          <div className="kpi-value" style={{ color: tachesEnRetard > 0 ? 'var(--danger)' : undefined }}>{tachesEnRetard}</div>
          <div className="kpi-label">Tâches en retard</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Identity card — expanded */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Identité</span>
          </div>
          <div className="card-body">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Dénomination', client.nom],
                  client.raison_sociale && ['Dirigeant', client.raison_sociale],
                  client.forme_juridique && ['Forme juridique', client.forme_juridique],
                  ['SIREN', client.siren || '—'],
                  client.siret && ['SIRET', client.siret],
                  adresseComplete && ['Adresse', adresseComplete],
                  client.email_dirigeant && ['E-mail dirigeant',
                    <a key="em" href={`mailto:${client.email_dirigeant}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{client.email_dirigeant}</a>
                  ],
                  client.telephone_dirigeant && ['Téléphone', client.telephone_dirigeant],
                  ['Statut', <span key="s" className={`badge badge-${client.actif ? 'actif' : 'inactif'}`}>{client.actif ? 'Actif' : 'Inactif'}</span>],
                  ['Client depuis', fmtDate(client.cree_le)],
                ].filter(Boolean).map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12, width: 130, fontWeight: 600 }}>{label}</td>
                    <td style={{ padding: '8px 0', fontSize: 13 }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paramètres comptables — expanded */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <span className="card-title">Paramètres comptables</span>
            {isExpert && (
              <select
                className="form-control"
                style={{ width: 'auto', fontSize: 12, padding: '3px 8px' }}
                value={client.complexite || 'standard'}
                onChange={async (e) => {
                  await api.put(`/clients/${clientId}`, { complexite: e.target.value });
                  onClientSaved();
                }}
              >
                <option value="simple">Simple ×0.8</option>
                <option value="standard">Standard ×1.0</option>
                <option value="complexe">Complexe ×1.3</option>
                <option value="expert">Expert ×1.6</option>
              </select>
            )}
          </div>
          <div className="card-body">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Type d\'entité', client.type || '—'],
                  ['Régime TVA', REGIME_TVA_LABEL[client.regime_tva] || client.regime_tva || '—'],
                  ['Régime fiscal', REGIME_FISCAL_LABEL[client.regime_fiscal] || client.regime_fiscal || REGIME_LABEL[client.regime] || '—'],
                  client.capital != null && ['Capital', fmt(client.capital)],
                  client.code_ape && ['Code APE', client.code_ape],
                  client.activite && ['Activité', client.activite],
                  client.date_cloture && ['Date de clôture', fmtDate(client.date_cloture)],
                  client.groupe && ['Groupe', client.groupe],
                  client.complexite && ['Complexité', { simple: 'Simple ×0.8', standard: 'Standard ×1.0', complexe: 'Complexe ×1.3', expert: 'Expert ×1.6' }[client.complexite]],
                  client.source_acquisition && ['Source', client.source_acquisition.replace(/_/g, ' ')],
                  client.ca_mensuel_signe != null && ['CA mensuel signé', fmt(client.ca_mensuel_signe)],
                  ['E-mail portail', client.portal_email || '—'],
                ].filter(Boolean).map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12, width: 140, fontWeight: 600 }}>{label}</td>
                    <td style={{ padding: '8px 0', fontSize: 13 }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Missions récentes */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Missions récentes</span>
          </div>
          <div className="card-body">
            {missions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune mission.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {missions.slice(0, 5).map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: MISSION_STATUTS[m.statut]?.color || '#ccc',
                    }} />
                    <span style={{ flex: 1, fontWeight: 500 }}>{m.nom}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{CAT_LABELS[m.categorie] || m.categorie}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Notes sensibles */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="card-title">🔒 Notes sensibles</span>
            {isExpert && !sensitiveUnlocked && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={unlockSensitive}
                disabled={sensitiveLoading}
                style={{ fontSize: 12 }}
              >
                {sensitiveLoading ? 'Déchiffrement…' : '🔓 Déverrouiller'}
              </button>
            )}
            {sensitiveUnlocked && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSensitiveUnlocked(false)}
                style={{ fontSize: 12 }}
              >
                🔒 Verrouiller
              </button>
            )}
          </div>
          <div className="card-body">
            {!sensitiveUnlocked ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                <p style={{ fontSize: 13, marginBottom: 0 }}>
                  {isExpert
                    ? 'Cliquez sur "Déverrouiller" pour afficher les notes confidentielles.'
                    : 'Ces notes sont réservées à l\'expert-comptable.'}
                </p>
                {sensitiveErr && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{sensitiveErr}</p>}
              </div>
            ) : (
              <pre style={{
                fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                padding: 12, margin: 0, fontFamily: 'inherit',
              }}>
                {sensitiveContent}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Notes riches */}
      <div style={{ marginTop: 20 }}>
        <TabNotes client={client} clientId={clientId} currentUser={currentUser} onSaved={onClientSaved} />
      </div>

      {/* Audit history */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <span className="card-title">Historique des modifications</span>
        </div>
        <div className="card-body">
          <AuditLog entityType="client" entityId={clientId} />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Équipe & Portefeuille ───────────────────────────────────────────────
function TabEquipe({ attributions, clientId, currentUser, onReload, allUsers }) {
  const canManage = ['expert', 'chef_mission'].includes(currentUser?.role);
  const [showModal, setShowModal] = useState(false);
  const [modalUsers, setModalUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const openModal = () => {
    const existing = new Set(attributions.map((a) => a.utilisateur_id));
    setModalUsers(
      allUsers.map((u) => ({
        ...u,
        assigned: existing.has(u.id),
        attrId: attributions.find((a) => a.utilisateur_id === u.id)?.id || null,
        role_sur_dossier: attributions.find((a) => a.utilisateur_id === u.id)?.role_sur_dossier || 'assistant',
      }))
    );
    setErr('');
    setShowModal(true);
  };

  const toggleUser = (userId) => {
    setModalUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, assigned: !u.assigned } : u)
    );
  };

  const setRoleSurDossier = (userId, role) => {
    setModalUsers((prev) =>
      prev.map((u) => u.id === userId ? { ...u, role_sur_dossier: role } : u)
    );
  };

  const saveTeam = async () => {
    setSaving(true);
    setErr('');
    try {
      const existing = new Set(attributions.map((a) => a.utilisateur_id));
      const toAdd = modalUsers.filter((u) => u.assigned && !existing.has(u.id));
      const toRemove = attributions.filter((a) => !modalUsers.find((u) => u.id === a.utilisateur_id && u.assigned));

      await Promise.all([
        ...toAdd.map((u) => api.post('/attributions', {
          client_id: clientId,
          utilisateur_id: u.id,
          role_sur_dossier: u.role_sur_dossier,
        })),
        ...toRemove.map((a) => api.delete(`/attributions/${a.id}`)),
      ]);

      setShowModal(false);
      onReload();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Équipe assignée ({attributions.length})</span>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={openModal}>
              ✏️ Modifier l'équipe
            </button>
          )}
        </div>
        <div className="card-body">
          {attributions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
              <p style={{ fontSize: 13 }}>Aucun collaborateur assigné à ce dossier.</p>
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={openModal} style={{ marginTop: 8 }}>
                  Assigner des collaborateurs
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {attributions.map((a) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 0', borderBottom: '1px solid var(--border-light)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: a.role_sur_dossier === 'responsable' ? 'var(--primary)' : '#5BB8E8',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {(a.prenom?.[0] || '').toUpperCase()}{(a.nom?.[0] || '').toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.prenom} {a.nom}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {a.email} · {ROLE_LABEL[a.role] || a.role}
                    </div>
                  </div>
                  <span className={`badge badge-${a.role_sur_dossier === 'responsable' ? 'responsable' : 'assistant'}`}>
                    {a.role_sur_dossier === 'responsable' ? 'Responsable' : 'Assistant'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <Modal title="Modifier l'équipe" onClose={() => setShowModal(false)} maxWidth={560}>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {modalUsers.map((u) => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 0', borderBottom: '1px solid var(--border-light)',
              }}>
                <input
                  type="checkbox"
                  checked={u.assigned}
                  onChange={() => toggleUser(u.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.prenom} {u.nom}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ROLE_LABEL[u.role] || u.role}</div>
                </div>
                {u.assigned && (
                  <select
                    value={u.role_sur_dossier}
                    onChange={(e) => setRoleSurDossier(u.id, e.target.value)}
                    className="form-control"
                    style={{ width: 140, fontSize: 12, padding: '4px 8px' }}
                  >
                    <option value="responsable">Responsable</option>
                    <option value="assistant">Assistant</option>
                  </select>
                )}
              </div>
            ))}
          </div>
          {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Annuler</button>
            <button className="btn btn-primary btn-sm" onClick={saveTeam} disabled={saving}>
              {saving ? 'Enregistrement…' : '💾 Enregistrer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Tab: Timeline ────────────────────────────────────────────────────────────
function TabTimeline({ interactions, clientId, users, currentUser, onTacheCreated, onInteractionCreated }) {
  const [tacheModal, setTacheModal] = useState(null);
  const [showInteractionModal, setShowInteractionModal] = useState(false);

  const handleTacheSaved = () => {
    setTacheModal(null);
    onTacheCreated();
  };

  const handleInteractionSaved = () => {
    setShowInteractionModal(false);
    onInteractionCreated();
  };

  return (
    <>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Timeline des interactions ({interactions.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowInteractionModal(true)}>
            + Nouvelle interaction
          </button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {interactions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              Aucune interaction enregistrée.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 32 }}>
              <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
              {interactions.map((interaction) => (
                <div key={interaction.id} style={{ position: 'relative', padding: '20px 24px 20px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 22, width: 32, height: 32, borderRadius: '50%',
                    background: '#fff', border: `2px solid ${URGENCE_COLORS[interaction.urgence] || '#dce6f0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                    zIndex: 1,
                  }}>
                    {INTERACTION_ICONS[interaction.type] || '📌'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {INTERACTION_LABELS[interaction.type] || interaction.type}
                        </span>
                        {interaction.direction && interaction.direction !== 'interne' && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                            {interaction.direction === 'entrant' ? '← Entrant' : '→ Sortant'}
                          </span>
                        )}
                        {interaction.urgence && interaction.urgence !== 'normale' && (
                          <span style={{ fontSize: 11, color: '#fff', background: URGENCE_COLORS[interaction.urgence], padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {interaction.urgence === 'elevee' ? 'Élevée' : 'Critique'}
                          </span>
                        )}
                      </div>
                      {interaction.objet && (
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>
                          {interaction.objet}
                        </div>
                      )}
                      {interaction.contenu && (
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                          {interaction.contenu.length > 300 ? interaction.contenu.slice(0, 300) + '…' : interaction.contenu}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtDateTime(interaction.date_interaction)}
                        {interaction.utilisateur_nom && ` · ${interaction.utilisateur_nom}`}
                        {interaction.duree_minutes && ` · ${interaction.duree_minutes} min`}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flexShrink: 0 }}
                      onClick={() => setTacheModal(interaction.objet || '')}
                    >
                      + Tâche
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showInteractionModal && (
        <InteractionModal
          clientId={clientId}
          onSave={handleInteractionSaved}
          onClose={() => setShowInteractionModal(false)}
        />
      )}

      {tacheModal !== null && (
        <TacheModal
          clientId={clientId}
          interactionObjet={tacheModal}
          users={users}
          currentUser={currentUser}
          onSave={handleTacheSaved}
          onClose={() => setTacheModal(null)}
        />
      )}
    </>
  );
}

// ─── Prochaines tâches (used inside Travaux tab) ──────────────────────────────
function ProchainsTaches({ taches }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Prochaines tâches</span>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        {taches.map((t) => {
          const isLate = t.date_echeance && new Date(t.date_echeance) < new Date();
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 0', borderBottom: '1px solid var(--border-light)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: t.statut === 'en_cours' ? 'var(--accent)' : 'var(--border)',
              }} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.titre || t.description}</span>
              {t.prenom && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                  {t.prenom} {t.user_nom}
                </span>
              )}
              {t.date_echeance && (
                <span style={{ fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isLate ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {isLate ? '⚠️ ' : ''}{fmtDate(t.date_echeance)}
                </span>
              )}
              <span className={`badge badge-${TACHE_STATUT_BADGE[t.statut]}`} style={{ fontSize: 10 }}>
                {TACHE_STATUT_LABEL[t.statut]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Travaux (Missions) ──────────────────────────────────────────────────
function TabTravaux({ missions, taches }) {
  const prochainesTaches = (taches || [])
    .filter((t) => t.statut === 'a_faire' || t.statut === 'en_cours')
    .sort((a, b) => {
      if (!a.date_echeance) return 1;
      if (!b.date_echeance) return -1;
      return new Date(a.date_echeance) - new Date(b.date_echeance);
    })
    .slice(0, 6);

  if (missions.length === 0) {
    return (
      <>
        <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucune mission pour ce client.</div></div>
        {prochainesTaches.length > 0 && <ProchainsTaches taches={prochainesTaches} />}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {prochainesTaches.length > 0 && <ProchainsTaches taches={prochainesTaches} />}
      {missions.map((m) => {
        const budget = parseFloat(m.tempsBudgeteH) || 0;
        const passe = parseFloat(m.tempsPasseH) || 0;
        const pct = budget > 0 ? Math.min(100, Math.round((passe / budget) * 100)) : 0;
        const overBudget = budget > 0 && passe > budget;
        const honBudget = parseFloat(m.honorairesBudgetes) || 0;
        const honFacture = parseFloat(m.honorairesFactures) || 0;

        return (
          <div key={m.id} className="card">
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{m.nom}</span>
                    <span style={{ background: MISSION_STATUTS[m.statut]?.color || '#ccc', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                      {MISSION_STATUTS[m.statut]?.label || m.statut}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {CAT_LABELS[m.categorie] || m.categorie}
                    {m.dateDebut && ` · Du ${fmtDate(m.dateDebut)}`}
                    {m.dateFin && ` au ${fmtDate(m.dateFin)}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: honFacture > honBudget ? 'var(--danger)' : 'var(--success)' }}>
                    {fmt(honFacture)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {fmt(honBudget)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Honoraires facturés / budgétés</div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Temps passé</span>
                  <span style={{ color: overBudget ? 'var(--danger)' : 'var(--text-muted)', fontWeight: overBudget ? 700 : 400 }}>
                    {passe}h / {budget}h ({pct}%){overBudget ? ' ⚠️' : ''}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: overBudget ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Tâches ──────────────────────────────────────────────────────────────
function TabTaches({ taches: initialTaches, clientId, users, currentUser, onTacheCreated }) {
  const [taches, setTaches] = useState(initialTaches);
  const [togglingId, setTogglingId] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { setTaches(initialTaches); }, [initialTaches]);

  const toggleTache = async (tache) => {
    const newStatut = tache.statut === 'termine' ? 'a_faire' : 'termine';
    setTogglingId(tache.id);
    try {
      await api.put(`/taches/${tache.id}`, { statut: newStatut });
      setTaches((prev) => prev.map((t) => t.id === tache.id ? { ...t, statut: newStatut } : t));
    } catch {
      // silent
    } finally {
      setTogglingId(null);
    }
  };

  const handleTacheSaved = () => {
    setShowCreateModal(false);
    onTacheCreated();
  };

  const filtered = filterStatut ? taches.filter((t) => t.statut === filterStatut) : taches;
  const grouped = TACHE_STATUTS.reduce((acc, s) => {
    acc[s] = filtered.filter((t) => t.statut === s);
    return acc;
  }, {});

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Statut :</label>
          <select
            className="form-control"
            style={{ width: 160, fontSize: 12, padding: '5px 10px' }}
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
          >
            <option value="">Tous ({taches.length})</option>
            {TACHE_STATUTS.map((s) => (
              <option key={s} value={s}>{TACHE_STATUT_LABEL[s]} ({taches.filter((t) => t.statut === s).length})</option>
            ))}
          </select>
        </div>
        {['expert', 'chef_mission'].includes(currentUser?.role) && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>
            + Nouvelle tâche
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
            {filterStatut ? `Aucune tâche avec le statut "${TACHE_STATUT_LABEL[filterStatut]}".` : 'Aucune tâche pour ce client.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {TACHE_STATUTS.map((statut) => {
            const list = grouped[statut];
            if (list.length === 0) return null;
            return (
              <div key={statut} className="card">
                <div className="card-header">
                  <span className="card-title">
                    {TACHE_STATUT_LABEL[statut]}
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({list.length})</span>
                  </span>
                </div>
                <div className="card-body" style={{ paddingTop: 0 }}>
                  {list.map((t) => {
                    const isLate = t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) < new Date();
                    const isDone = t.statut === 'termine';
                    return (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0',
                        borderBottom: '1px solid var(--border-light)', opacity: isDone ? 0.65 : 1,
                      }}>
                        <button
                          onClick={() => toggleTache(t)}
                          disabled={togglingId === t.id}
                          style={{
                            width: 20, height: 20, borderRadius: 4,
                            border: `2px solid ${isDone ? 'var(--success)' : 'var(--border)'}`,
                            background: isDone ? 'var(--success)' : '#fff', color: '#fff', fontSize: 12,
                            cursor: 'pointer', flexShrink: 0, marginTop: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isDone ? '✓' : ''}
                        </button>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, textDecoration: isDone ? 'line-through' : 'none' }}>
                            {t.titre || t.description}
                          </div>
                          {t.titre && t.description && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {t.duree && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.duree}h</span>}
                          {t.date_echeance && (
                            <span style={{ fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isLate ? 700 : 400 }}>
                              {isLate ? '⚠️ ' : ''}{fmtDate(t.date_echeance)}
                            </span>
                          )}
                          {t.prenom && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                              {t.prenom} {t.user_nom}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <TacheModal
          clientId={clientId}
          interactionObjet=""
          users={users}
          currentUser={currentUser}
          onSave={handleTacheSaved}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

// ─── Plan de facturation (LDM actives) ────────────────────────────────────────
function PlanFacturation({ ldm }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">📋 Plan de facturation</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Basé sur les lettres de mission actives</span>
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        {ldm.map((l) => (
          <div key={l.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
            borderBottom: '1px solid var(--border-light)',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary)' }}>
                {l.numero} — {CAT_LABELS[l.typeMission] || l.typeMission || 'Mission'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {fmtDate(l.dateDebut)} → {l.dateFin ? fmtDate(l.dateFin) : 'indéfini'}
              </div>
            </div>
            <span className={`badge badge-${LDM_STATUT_BADGE[l.statut] || 'autre'}`}>
              {LDM_STATUT_LABEL[l.statut] || l.statut}
            </span>
            <div style={{ textAlign: 'right', minWidth: 90 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{fmt(l.montantHonorairesHT)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>HT / an</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Facturation ─────────────────────────────────────────────────────────
function TabFacturation({ factures, ldm }) {
  const totalHT = factures.reduce((s, f) => s + parseFloat(f.totalHT || 0), 0);
  const totalPaye = factures.reduce((s, f) => s + parseFloat(f.montantPaye || 0), 0);
  const totalDu = factures.filter((f) => ['envoyee', 'retard', 'partielle'].includes(f.statut))
    .reduce((s, f) => s + (parseFloat(f.totalTTC || 0) - parseFloat(f.montantPaye || 0)), 0);

  const ldmActives = (ldm || []).filter((l) => l.statut === 'signee' || l.statut === 'envoyee');

  if (factures.length === 0) {
    return (
      <div>
        {ldmActives.length > 0 && <PlanFacturation ldm={ldmActives} />}
        <div className="card" style={{ marginTop: ldmActives.length > 0 ? 20 : 0 }}>
          <div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
            Aucune facture pour ce client.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-icon">💶</div>
          <div className="kpi-value">{fmt(totalHT)}</div>
          <div className="kpi-label">Total HT facturé</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">✅</div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{fmt(totalPaye)}</div>
          <div className="kpi-label">Total encaissé</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">⏳</div>
          <div className="kpi-value" style={{ color: totalDu > 0 ? 'var(--danger)' : undefined }}>{fmt(totalDu)}</div>
          <div className="kpi-label">En attente de paiement</div>
        </div>
      </div>

      {ldmActives.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <PlanFacturation ldm={ldmActives} />
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ position: 'relative', paddingLeft: 32 }}>
            <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />
            {factures.map((f) => {
              const info = FACTURE_STATUTS[f.statut] || FACTURE_STATUTS.brouillon;
              return (
                <div key={f.id} style={{ position: 'relative', padding: '16px 24px 16px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 18, width: 32, height: 32, borderRadius: '50%',
                    background: info.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, color: '#fff', fontWeight: 700, zIndex: 1,
                  }}>
                    {f.type === 'avoir' ? 'A' : f.type === 'acompte' ? 'AC' : '€'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>{f.numero}</span>
                        <span className={`badge badge-${info.badge}`}>{info.label}</span>
                        {f.type && f.type !== 'facture' && (
                          <span className="badge badge-autre" style={{ textTransform: 'capitalize' }}>{f.type}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Émise le {fmtDate(f.dateEmission)}
                        {f.dateEcheance && ` · Échéance ${fmtDate(f.dateEcheance)}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{fmt(f.totalTTC)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TTC (HT: {fmt(f.totalHT)})</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => window.open(`/api/factures/${f.id}/pdf`, '_blank')}
                        title="Télécharger le PDF"
                      >
                        PDF ↓
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PipelineBar ──────────────────────────────────────────────────────────────
function PipelineBar({ contrat }) {
  if (!contrat) return null;
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === contrat.statut);

  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 14, paddingTop: 4 }}>
      {PIPELINE_STEPS.map((step, idx) => {
        const done   = idx < currentIdx;
        const active = idx === currentIdx;
        const dotBg  = done ? '#4dd0c4' : active ? '#fff' : 'rgba(255,255,255,0.18)';
        const txtColor = done ? '#4dd0c4' : active ? '#fff' : 'rgba(255,255,255,0.4)';
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
              <div style={{
                width: active ? 14 : 10,
                height: active ? 14 : 10,
                borderRadius: '50%',
                background: dotBg,
                border: active ? '2px solid #4dd0c4' : 'none',
                marginBottom: 5,
                transition: 'all 0.2s',
              }} />
              <span style={{ fontSize: 10, color: txtColor, fontWeight: active ? 700 : 400, textAlign: 'center', lineHeight: 1.2 }}>
                {step.label}
              </span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, marginBottom: 16,
                background: idx < currentIdx ? 'rgba(77,208,196,0.6)' : 'rgba(255,255,255,0.12)',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Tab: Contrats pipeline ───────────────────────────────────────────────────
function TabContrats({ contrats, clientId, currentUser, onReload }) {
  const canManage = ['expert', 'chef_mission'].includes(currentUser?.role);
  const [expanded, setExpanded] = useState(null);
  const [details, setDetails] = useState({});
  const [activating, setActivating] = useState(null);
  const [showNewContrat, setShowNewContrat] = useState(false);
  const [showNewLigne, setShowNewLigne] = useState(null);
  const [showNewMandat, setShowNewMandat] = useState(null);
  const [showRevision, setShowRevision] = useState(null);
  const [showSigner, setShowSigner] = useState(null);
  const [err, setErr] = useState('');

  const loadDetails = async (id) => {
    try {
      const r = await api.get(`/contrats/${id}`);
      setDetails((prev) => ({ ...prev, [id]: r.data }));
    } catch { /* ignore */ }
  };

  const toggle = (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!details[id]) loadDetails(id);
  };

  const activer = async (id) => {
    if (!window.confirm('Activer la mission ? Les tâches seront générées automatiquement.')) return;
    setActivating(id);
    setErr('');
    try {
      const r = await api.post(`/contrats/${id}/activer`);
      alert(`Mission activée — ${r.data.tachesCreees} tâche(s) générée(s).`);
      onReload();
      loadDetails(id);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de l\'activation');
    } finally {
      setActivating(null);
    }
  };

  const signerMandat = async (contratId, mandatId, dateSignature) => {
    try {
      await api.put(`/contrats/${contratId}/mandats/${mandatId}`, { signe: true, date_signature: dateSignature });
      loadDetails(contratId);
    } catch { /* ignore */ }
  };

  const accepterRevision = async (contratId, revId) => {
    try {
      await api.put(`/contrats/${contratId}/revisions/${revId}`, { statut: 'acceptee' });
      onReload();
      loadDetails(contratId);
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    }
  };

  const refuserRevision = async (contratId, revId) => {
    try {
      await api.put(`/contrats/${contratId}/revisions/${revId}`, { statut: 'refusee' });
      loadDetails(contratId);
    } catch { /* ignore */ }
  };

  if (contrats.length === 0 && !canManage) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucun contrat.</div></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewContrat(true)}>
            + Nouveau contrat
          </button>
        </div>
      )}
      {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}

      {contrats.length === 0 && (
        <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Aucun contrat pour ce client.</div></div>
      )}

      {contrats.map((c) => {
        const isExpanded = expanded === c.id;
        const d = details[c.id];
        const color = PIPELINE_COLOR[c.statut] || '#6b7c93';

        return (
          <div key={c.id} className="card" style={{ overflow: 'hidden' }}>
            {/* Header row */}
            <div
              className="card-body"
              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', paddingBottom: isExpanded ? 12 : undefined }}
              onClick={() => toggle(c.id)}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    {c.client_nom || c.prospect_nom || '—'}
                  </span>
                  <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                    {CONTRAT_STATUT_LABELS[c.statut] || c.statut}
                  </span>
                  {c.nb_lignes > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.nb_lignes} prestation(s)</span>
                  )}
                  {c.nb_mandats > 0 && (
                    <span style={{ fontSize: 11, color: c.nb_mandats_signes === c.nb_mandats ? 'var(--success)' : 'var(--warning)' }}>
                      {c.nb_mandats_signes}/{c.nb_mandats} mandats signés
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.honoraires_ht ? `${fmt(c.honoraires_ht)} HT/an` : 'Honoraires non définis'}
                  {c.collaborateur_nom && ` · ${c.collaborateur_nom}`}
                  {c.date_signature && ` · Signé le ${fmtDate(c.date_signature)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {canManage && c.statut === 'ldm_generee' && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); setShowSigner(c.id); }}
                  >
                    ✍️ Signer la LDM
                  </button>
                )}
                {canManage && c.statut === 'ldm_signee' && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 11 }}
                    disabled={activating === c.id}
                    onClick={(e) => { e.stopPropagation(); activer(c.id); }}
                  >
                    {activating === c.id ? 'Activation…' : '⚡ Activer'}
                  </button>
                )}
                {canManage && c.statut === 'mission_active' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11 }}
                    onClick={(e) => { e.stopPropagation(); setShowRevision(c.id); }}
                  >
                    📋 Révision
                  </button>
                )}
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border-light)', padding: '16px 20px', background: 'var(--bg)' }}>
                {!d ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chargement…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* Pipeline bar mini */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                      {PIPELINE_STEPS.map((step, idx) => {
                        const curIdx = PIPELINE_STEPS.findIndex((s) => s.key === c.statut);
                        const done = idx < curIdx;
                        const active = idx === curIdx;
                        return (
                          <React.Fragment key={step.key}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 70 }}>
                              <div style={{
                                width: active ? 12 : 8, height: active ? 12 : 8, borderRadius: '50%',
                                background: done ? 'var(--success)' : active ? color : 'var(--border)',
                                marginBottom: 4,
                              }} />
                              <span style={{ fontSize: 9, color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--text-muted)', fontWeight: active ? 700 : 400, textAlign: 'center' }}>
                                {step.label}
                              </span>
                            </div>
                            {idx < PIPELINE_STEPS.length - 1 && (
                              <div style={{ flex: 1, height: 1, background: done ? 'var(--success)' : 'var(--border)', marginBottom: 14 }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Dates */}
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                      {d.date_devis && <span>Devis : {fmtDate(d.date_devis)}</span>}
                      {d.date_acceptation && <span>Accepté : {fmtDate(d.date_acceptation)}</span>}
                      {d.date_signature && <span>Signé : {fmtDate(d.date_signature)}</span>}
                      {d.date_debut_mission && <span>Début mission : {fmtDate(d.date_debut_mission)}</span>}
                    </div>

                    {/* Lignes */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Prestations</span>
                        {canManage && c.statut !== 'mission_active' && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowNewLigne(c.id)}>
                            + Ajouter
                          </button>
                        )}
                      </div>
                      {d.lignes.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune prestation définie.</p>
                      ) : (
                        <div className="table-wrapper">
                          <table style={{ fontSize: 12 }}>
                            <thead>
                              <tr><th>Nom</th><th>Catégorie</th><th>Récurrence</th><th style={{ textAlign: 'right' }}>Budget (min)</th><th style={{ textAlign: 'right' }}>Honoraires HT</th></tr>
                            </thead>
                            <tbody>
                              {d.lignes.map((l) => (
                                <tr key={l.id}>
                                  <td style={{ fontWeight: 500 }}>{l.nom}</td>
                                  <td>{l.categorie || '—'}</td>
                                  <td>{RECURRENCE_LABEL[l.recurrence] || l.recurrence}</td>
                                  <td style={{ textAlign: 'right' }}>{l.budget_minutes} min</td>
                                  <td style={{ textAlign: 'right' }}>{fmt(l.honoraires_ht)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Mandats */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Mandats</span>
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowNewMandat(c.id)}>
                            + Ajouter
                          </button>
                        )}
                      </div>
                      {d.mandats.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun mandat.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {d.mandats.map((m) => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                              <span style={{ flex: 1 }}>{MANDAT_TYPE_LABEL[m.type] || m.type}{m.libelle ? ` — ${m.libelle}` : ''}</span>
                              {m.signe ? (
                                <span className="badge badge-termine">Signé {fmtDate(m.date_signature)}</span>
                              ) : canManage ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: 10 }}
                                  onClick={() => {
                                    const date = prompt('Date de signature (AAAA-MM-JJ) :', new Date().toISOString().split('T')[0]);
                                    if (date) signerMandat(c.id, m.id, date);
                                  }}
                                >
                                  ✍️ Signer
                                </button>
                              ) : (
                                <span className="badge badge-reporte">Non signé</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Révisions */}
                    {d.revisions.length > 0 && (
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 8 }}>Révisions annuelles</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {d.revisions.map((r) => (
                            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                              <span style={{ fontWeight: 600, minWidth: 40 }}>{r.annee}</span>
                              <span style={{ flex: 1 }}>
                                {fmt(r.anciens_honoraires)} → {fmt(r.nouveaux_honoraires)}
                                {r.motif && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.motif}</span>}
                              </span>
                              <span className={`badge badge-${REVISION_STATUT[r.statut]?.badge || 'autre'}`}>
                                {REVISION_STATUT[r.statut]?.label || r.statut}
                              </span>
                              {r.statut === 'proposee' && canManage && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="btn btn-primary btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                    onClick={() => accepterRevision(c.id, r.id)}>✓ Accepter</button>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 8px' }}
                                    onClick={() => refuserRevision(c.id, r.id)}>✗ Refuser</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modal nouveau contrat */}
      {showNewContrat && (
        <NouveauContratModal
          clientId={clientId}
          onSave={() => { setShowNewContrat(false); onReload(); }}
          onClose={() => setShowNewContrat(false)}
        />
      )}

      {/* Modal nouvelle ligne */}
      {showNewLigne && (
        <NouvelleLigneModal
          contratId={showNewLigne}
          onSave={() => { setShowNewLigne(null); loadDetails(showNewLigne); }}
          onClose={() => setShowNewLigne(null)}
        />
      )}

      {/* Modal nouveau mandat */}
      {showNewMandat && (
        <NouveauMandatModal
          contratId={showNewMandat}
          onSave={() => { setShowNewMandat(null); loadDetails(showNewMandat); }}
          onClose={() => setShowNewMandat(null)}
        />
      )}

      {/* Modal révision */}
      {showRevision && (
        <RevisionModal
          contratId={showRevision}
          contrat={contrats.find((c) => c.id === showRevision)}
          onSave={() => { setShowRevision(null); loadDetails(showRevision); onReload(); }}
          onClose={() => setShowRevision(null)}
        />
      )}

      {/* Modal signature LDM */}
      {showSigner && (
        <SignerLdmModal
          contratId={showSigner}
          contrat={contrats.find((c) => c.id === showSigner)}
          onSave={(msg) => { setShowSigner(null); alert(msg); onReload(); }}
          onClose={() => setShowSigner(null)}
        />
      )}
    </div>
  );
}

// ─── Modals pour TabContrats ──────────────────────────────────────────────────

function NouveauContratModal({ clientId, onSave, onClose }) {
  const [form, setForm] = useState({ statut: 'prospect', honoraires_ht: '', date_devis: '', collaborateur_id: '' });
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get('/utilisateurs').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.post('/contrats', {
        client_id: clientId,
        statut: form.statut,
        honoraires_ht: form.honoraires_ht ? parseFloat(form.honoraires_ht) : null,
        date_devis: form.date_devis || null,
        collaborateur_id: form.collaborateur_id || null,
      });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nouveau contrat" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Statut initial</label>
          <select className="form-control" value={form.statut} onChange={set('statut')}>
            {PIPELINE_STEPS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Honoraires HT (€/an)</label>
            <input className="form-control" type="number" step="0.01" value={form.honoraires_ht} onChange={set('honoraires_ht')} placeholder="0.00" />
          </div>
          <div className="form-group">
            <label className="form-label">Date devis</label>
            <input className="form-control" type="date" value={form.date_devis} onChange={set('date_devis')} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Collaborateur responsable</label>
          <select className="form-control" value={form.collaborateur_id} onChange={set('collaborateur_id')}>
            <option value="">— Choisir —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
          </select>
        </div>
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Création…' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  );
}

function NouvelleLigneModal({ contratId, onSave, onClose }) {
  const [form, setForm] = useState({ nom: '', categorie: '', budget_minutes: '', recurrence: 'none', honoraires_ht: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.post(`/contrats/${contratId}/lignes`, {
        nom: form.nom,
        categorie: form.categorie || null,
        budget_minutes: form.budget_minutes ? parseInt(form.budget_minutes, 10) : 0,
        recurrence: form.recurrence,
        honoraires_ht: form.honoraires_ht ? parseFloat(form.honoraires_ht) : 0,
      });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Ajouter une prestation" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Nom *</label>
          <input className="form-control" value={form.nom} onChange={set('nom')} required placeholder="Ex : Tenue comptable" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Catégorie</label>
            <select className="form-control" value={form.categorie} onChange={set('categorie')}>
              <option value="">— Choisir —</option>
              {['Fiscal','Social','Juridique','Comptabilité','Admin','Client'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Récurrence</label>
            <select className="form-control" value={form.recurrence} onChange={set('recurrence')}>
              {Object.entries(RECURRENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Budget (minutes)</label>
            <input className="form-control" type="number" min="0" value={form.budget_minutes} onChange={set('budget_minutes')} placeholder="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Honoraires HT (€/an)</label>
            <input className="form-control" type="number" step="0.01" value={form.honoraires_ht} onChange={set('honoraires_ht')} placeholder="0.00" />
          </div>
        </div>
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  );
}

function NouveauMandatModal({ contratId, onSave, onClose }) {
  const [form, setForm] = useState({ type: 'prelevement', libelle: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/contrats/${contratId}/mandats`, { type: form.type, libelle: form.libelle || null });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Ajouter un mandat" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Type *</label>
          <select className="form-control" value={form.type} onChange={set('type')}>
            {Object.entries(MANDAT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Libellé</label>
          <input className="form-control" value={form.libelle} onChange={set('libelle')} placeholder="Précisions optionnelles" />
        </div>
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  );
}

function SignerLdmModal({ contratId, contrat, onSave, onClose }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    date_signature: today,
    date_debut_mission: today,
    collaborateur_id: contrat?.collaborateur_id || '',
  });
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get('/utilisateurs').then((r) => setUsers(r.data)).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const r = await api.post(`/contrats/${contratId}/signer`, {
        date_signature: form.date_signature,
        date_debut_mission: form.date_debut_mission || null,
        collaborateur_id: form.collaborateur_id || null,
      });
      onSave(r.data.message);
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la signature');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="✍️ Enregistrer la signature LDM" onClose={onClose} maxWidth={480}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        La signature de la LDM déclenche automatiquement la génération des tâches planifiées
        pour le collaborateur désigné.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Date de signature *</label>
            <input className="form-control" type="date" value={form.date_signature} onChange={set('date_signature')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Début de mission *</label>
            <input className="form-control" type="date" value={form.date_debut_mission} onChange={set('date_debut_mission')} required />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Collaborateur responsable</label>
          <select className="form-control" value={form.collaborateur_id} onChange={set('collaborateur_id')}>
            <option value="">— Choisir —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
            ))}
          </select>
        </div>
        {contrat?.honoraires_ht && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>Honoraires annuels HT : </span>
            <strong>{new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(contrat.honoraires_ht)}</strong>
          </div>
        )}
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Signature en cours…' : '✍️ Signer et générer les tâches'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RevisionModal({ contratId, contrat, onSave, onClose }) {
  const annee = new Date().getFullYear();
  const [form, setForm] = useState({
    annee: String(annee),
    anciens_honoraires: contrat?.honoraires_ht || '',
    nouveaux_honoraires: '',
    motif: '',
    date_revision: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.post(`/contrats/${contratId}/revisions`, {
        annee: parseInt(form.annee, 10),
        anciens_honoraires: form.anciens_honoraires ? parseFloat(form.anciens_honoraires) : null,
        nouveaux_honoraires: parseFloat(form.nouveaux_honoraires),
        motif: form.motif || null,
        date_revision: form.date_revision,
      });
      onSave();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Proposer une révision annuelle" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Année *</label>
            <input className="form-control" type="number" value={form.annee} onChange={set('annee')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Date de révision</label>
            <input className="form-control" type="date" value={form.date_revision} onChange={set('date_revision')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Anciens honoraires HT (€)</label>
            <input className="form-control" type="number" step="0.01" value={form.anciens_honoraires} onChange={set('anciens_honoraires')} />
          </div>
          <div className="form-group">
            <label className="form-label">Nouveaux honoraires HT (€) *</label>
            <input className="form-control" type="number" step="0.01" value={form.nouveaux_honoraires} onChange={set('nouveaux_honoraires')} required />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Motif</label>
          <textarea className="form-control" value={form.motif} onChange={set('motif')} rows={2} placeholder="Indexation, avenant, …" />
        </div>
        {err && <p className="form-error">{err}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Enregistrement…' : 'Proposer'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Tab: Devis & LDM ────────────────────────────────────────────────────────
function TabDevisLdm({ devis, ldm, clientId }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Devis ({devis.length})</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate(`/devis/nouveau?client_id=${clientId}`)}
          >
            + Nouveau devis
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {devis.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun devis.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th><th>Titre</th><th>Statut</th><th>Émis le</th><th>Validité</th>
                    <th style={{ textAlign: 'right' }}>Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {devis.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{d.numero}</td>
                      <td>{d.titre || '—'}</td>
                      <td><span className={`badge badge-${DEVIS_STATUT_BADGE[d.statut] || 'autre'}`}>{DEVIS_STATUT_LABEL[d.statut] || d.statut}</span></td>
                      <td>{fmtDate(d.dateEmission)}</td>
                      <td>{fmtDate(d.dateValidite)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.totalHT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Lettres de mission ({ldm.length})</span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/lettres-mission/nouveau?client_id=${clientId}`)}
          >
            + Nouvelle LDM
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {ldm.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune lettre de mission.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th><th>Type de mission</th><th>Statut</th><th>Début</th><th>Fin</th>
                    <th style={{ textAlign: 'right' }}>Honoraires HT</th>
                  </tr>
                </thead>
                <tbody>
                  {ldm.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{l.numero}</td>
                      <td>{CAT_LABELS[l.typeMission] || l.typeMission || '—'}</td>
                      <td><span className={`badge badge-${LDM_STATUT_BADGE[l.statut] || 'autre'}`}>{LDM_STATUT_LABEL[l.statut] || l.statut}</span></td>
                      <td>{fmtDate(l.dateDebut)}</td>
                      <td>{fmtDate(l.dateFin)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(l.montantHonorairesHT)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Notes riches ───────────────────────────────────────────────────────
function TabNotes({ client, clientId, currentUser, onSaved }) {
  const canEdit = ['expert', 'chef_mission'].includes(currentUser?.role);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const startEdit = () => { setEditedText(client.notes_riches || ''); setEditing(true); setErr(''); };
  const cancelEdit = () => { setEditing(false); setErr(''); };

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      await api.put(`/clients/${clientId}`, { notes_riches: editedText });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const hasContent = client.notes_riches && client.notes_riches.trim().length > 0;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="card-title">📝 Notes du client</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!editing && (
            <div style={{ position: 'relative' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(v => !v)} title="Aide Markdown">
                ? Markdown
              </button>
              {showHelp && (
                <div style={{
                  position: 'absolute', top: 32, right: 0, zIndex: 50,
                  background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 16, minWidth: 220, fontSize: 12,
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f1f4b' }}>Aide Markdown</div>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <tbody>
                      {[
                        ['**gras**', 'Texte en gras'],
                        ['*italique*', 'Texte en italique'],
                        ['# Titre', 'Titre de niveau 1'],
                        ['## Sous-titre', 'Titre de niveau 2'],
                        ['- Liste', 'Élément de liste'],
                        ['| Col | Col |', 'Tableau'],
                      ].map(([syn, desc]) => (
                        <tr key={syn}>
                          <td style={{ padding: '3px 8px 3px 0', fontFamily: 'monospace', color: '#0f1f4b', whiteSpace: 'nowrap' }}>{syn}</td>
                          <td style={{ padding: '3px 0', color: 'var(--text-muted)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    style={{ marginTop: 8, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    onClick={() => setShowHelp(false)}
                  >
                    Fermer
                  </button>
                </div>
              )}
            </div>
          )}
          {canEdit && !editing && (
            <button className="btn btn-ghost btn-sm" onClick={startEdit}>✏️ Éditer</button>
          )}
        </div>
      </div>
      <div className="card-body">
        {editing ? (
          <div>
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              style={{
                width: '100%', minHeight: 500, fontFamily: 'monospace', fontSize: 13,
                border: '1px solid var(--border)', borderRadius: 6, padding: 12,
                resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
              }}
              placeholder="Rédigez vos notes en Markdown…"
            />
            {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={saving}>Annuler</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : '💾 Sauvegarder'}
              </button>
            </div>
          </div>
        ) : hasContent ? (
          <div
            dangerouslySetInnerHTML={{ __html: marked(client.notes_riches || '') }}
            style={{ padding: '8px 4px', lineHeight: 1.8, fontSize: 14, color: 'var(--text)', maxWidth: '100%', overflowWrap: 'break-word' }}
            className="notes-prose"
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <p style={{ marginBottom: 12 }}>Aucune note pour ce client.</p>
            {canEdit && (
              <button className="btn btn-primary btn-sm" onClick={startEdit}>Cliquez Éditer pour commencer</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Contacts ────────────────────────────────────────────────────────────
function TabContacts({ contacts }) {
  if (contacts.length === 0) {
    return (
      <div className="card">
        <div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          Aucun contact enregistré pour ce client.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nom</th><th>Poste</th><th>Email</th><th>Téléphone</th><th>Principal</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>
                    {c.civilite && <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{c.civilite}</span>}
                    {c.prenom} {c.nom}
                  </td>
                  <td>{c.poste || '—'}</td>
                  <td>
                    {c.email
                      ? <a href={`mailto:${c.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.email}</a>
                      : '—'}
                  </td>
                  <td>{c.telephone || c.mobile || '—'}</td>
                  <td>
                    {c.principal
                      ? <span className="badge badge-actif">Principal</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientCockpit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const clientId = parseInt(id, 10);

  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [client, setClient] = useState(null);
  const [attributions, setAttributions] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [missions, setMissions] = useState([]);
  const [taches, setTaches] = useState([]);
  const [factures, setFactures] = useState([]);
  const [devis, setDevis] = useState([]);
  const [ldm, setLdm] = useState([]);
  const [contrats, setContrats] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);

  // Quick action modals
  const [showNewTache, setShowNewTache] = useState(false);
  const [showNewInteraction, setShowNewInteraction] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clientRes, attrRes, intRes, missRes, tachRes, factRes, devisRes, ldmRes, contratsRes] = await Promise.all([
        api.get(`/clients/${clientId}`),
        api.get(`/attributions?client_id=${clientId}`),
        api.get(`/interactions?client_id=${clientId}&limit=100`),
        api.get(`/missions?client_id=${clientId}`),
        api.get(`/taches?client_id=${clientId}`),
        api.get(`/factures?client_id=${clientId}`),
        api.get(`/devis?client_id=${clientId}`),
        api.get(`/lettres-mission?client_id=${clientId}`),
        api.get(`/contrats?client_id=${clientId}`),
      ]);

      setClient(clientRes.data);
      setAttributions(attrRes.data);
      setInteractions(intRes.data);
      setMissions(missRes.data);
      setTaches(tachRes.data);
      setFactures(factRes.data);
      setDevis(devisRes.data);
      setLdm(ldmRes.data);
      setContrats(contratsRes.data);

      try {
        const pcRes = await api.get(`/contacts/personnes?client_id=${clientId}`);
        setContacts(pcRes.data);
      } catch {
        setContacts([]);
      }

      if (['expert', 'chef_mission'].includes(user?.role)) {
        const usersRes = await api.get('/utilisateurs');
        setUsers(usersRes.data);
      } else {
        setUsers(user ? [user] : []);
      }
    } catch (e) {
      setError(e.response?.status === 404 ? 'Client introuvable.' : 'Erreur lors du chargement du client.');
    } finally {
      setLoading(false);
    }
  }, [clientId, user]);

  useEffect(() => { load(); }, [load]);

  const reloadTaches = useCallback(async () => {
    const r = await api.get(`/taches?client_id=${clientId}`);
    setTaches(r.data);
  }, [clientId]);

  const reloadInteractions = useCallback(async () => {
    const r = await api.get(`/interactions?client_id=${clientId}&limit=100`);
    setInteractions(r.data);
  }, [clientId]);

  const reloadAttributions = useCallback(async () => {
    const r = await api.get(`/attributions?client_id=${clientId}`);
    setAttributions(r.data);
  }, [clientId]);

  if (loading) {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⌛</div>
          Chargement du dossier…
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="page-body">
        <div className="card" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
          <div className="card-body">
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error || 'Client introuvable.'}</p>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}>← Retour aux clients</button>
          </div>
        </div>
      </div>
    );
  }

  const responsable = attributions.find((a) => a.role_sur_dossier === 'responsable');
  const displayName = client.nom;

  return (
    <div className="page-body" style={{ padding: 0 }}>
      {/* ── Client header ──────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #0F1F4B 0%, #0a1835 100%)', padding: '20px 28px 0', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => navigate('/clients')}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '4px 10px', borderRadius: 4, fontSize: 12, marginBottom: 10 }}
            >
              ← Clients
            </button>

            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
                {displayName}
              </h1>
              {client.forme_juridique && (
                <span style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)', padding: '3px 9px', borderRadius: 4, fontSize: 12 }}>
                  {client.forme_juridique}
                </span>
              )}
              <span style={{
                background: TYPE_BADGE[client.type] === 'bic' ? '#00B4D8' :
                  TYPE_BADGE[client.type] === 'bnc' ? '#7c3aed' :
                  TYPE_BADGE[client.type] === 'sci' ? '#d97706' :
                  TYPE_BADGE[client.type] === 'sa' ? '#059669' : 'rgba(255,255,255,0.15)',
                color: '#fff', padding: '3px 9px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              }}>
                {client.type}
              </span>
              <span style={{
                background: client.actif ? 'rgba(0,180,116,0.25)' : 'rgba(214,48,49,0.25)',
                color: client.actif ? '#4dd0c4' : '#ff8a80',
                padding: '3px 9px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              }}>
                {client.actif ? '● Actif' : '● Inactif'}
              </span>
              {client.complexite && (
                <span style={{
                  background: { simple: 'rgba(34,197,94,0.2)', standard: 'rgba(59,130,246,0.2)', complexe: 'rgba(245,158,11,0.2)', expert: 'rgba(239,68,68,0.2)' }[client.complexite] || 'rgba(255,255,255,0.1)',
                  color: { simple: '#4ade80', standard: '#60a5fa', complexe: '#fbbf24', expert: '#f87171' }[client.complexite] || 'rgba(255,255,255,0.7)',
                  padding: '3px 9px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                }}>
                  {({ simple: 'Simple ×0.8', standard: 'Standard ×1.0', complexe: 'Complexe ×1.3', expert: 'Expert ×1.6' })[client.complexite]}
                </span>
              )}
            </div>

            {/* Sub-info row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
              {client.raison_sociale && (
                <span title="Dirigeant">{client.raison_sociale}</span>
              )}
              {client.siren && <span>SIREN {client.siren}</span>}
              {client.siret && !client.siren && <span>SIRET {client.siret}</span>}
              {client.ville && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  📍 {client.ville}
                </span>
              )}
              {client.groupe && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  🏢 {client.groupe}
                </span>
              )}
              {responsable && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  👤 {responsable.prenom} {responsable.nom}
                </span>
              )}
            </div>
          </div>

          {/* Quick action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 28 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)', fontSize: 12 }}
              onClick={() => { setTab('timeline'); setShowNewInteraction(true); }}
            >
              💬 Interaction
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)', fontSize: 12 }}
              onClick={() => setShowNewTache(true)}
            >
              ✅ Tâche
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)', fontSize: 12 }}
              onClick={() => setTab('documents')}
            >
              📁 Document
            </button>
            <button
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12 }}
              onClick={() => navigate(`/devis/nouveau?client_id=${clientId}`)}
            >
              📄 Devis
            </button>
          </div>
        </div>

        {/* ── Pipeline bar ─────────────────────────────────────────────────── */}
        {contrats.length > 0 && (
          <PipelineBar contrat={contrats[0]} />
        )}

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? 'var(--primary)' : 'rgba(255,255,255,0.65)',
                border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 13,
                fontWeight: tab === t.key ? 700 : 500,
                borderRadius: '6px 6px 0 0', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {t.label}
              {t.key === 'taches' && taches.filter((t2) => t2.statut !== 'termine').length > 0 && (
                <span style={{
                  marginLeft: 6,
                  background: tab === t.key ? 'var(--primary)' : 'rgba(255,255,255,0.3)',
                  color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>
                  {taches.filter((t2) => t2.statut !== 'termine').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px', background: 'var(--bg)', minHeight: 'calc(100vh - 200px)' }}>
        {tab === 'overview' && (
          <TabOverview
            client={client}
            attributions={attributions}
            factures={factures}
            taches={taches}
            missions={missions}
            clientId={clientId}
            currentUser={user}
            onClientSaved={() => api.get(`/clients/${clientId}`).then((r) => setClient(r.data))}
          />
        )}

        {tab === 'equipe' && (
          <TabEquipe
            attributions={attributions}
            clientId={clientId}
            currentUser={user}
            onReload={reloadAttributions}
            allUsers={users}
          />
        )}

        {tab === 'timeline' && (
          <TabTimeline
            interactions={interactions}
            clientId={clientId}
            users={users}
            currentUser={user}
            onTacheCreated={reloadTaches}
            onInteractionCreated={reloadInteractions}
          />
        )}

        {tab === 'travaux' && <TabTravaux missions={missions} taches={taches} />}

        {tab === 'taches' && (
          <TabTaches
            taches={taches}
            clientId={clientId}
            users={users}
            currentUser={user}
            onTacheCreated={reloadTaches}
          />
        )}

        {tab === 'facturation' && <TabFacturation factures={factures} ldm={ldm} />}

        {tab === 'documents' && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <GED clientId={clientId} />
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <TabNotes
            client={client}
            clientId={clientId}
            currentUser={user}
            onSaved={() => api.get(`/clients/${clientId}`).then((r) => setClient(r.data))}
          />
        )}

        {tab === 'contrats' && (
          <TabContrats
            contrats={contrats}
            clientId={clientId}
            currentUser={user}
            onReload={load}
          />
        )}

        {tab === 'devis' && <TabDevisLdm devis={devis} ldm={ldm} clientId={clientId} />}

        {tab === 'contacts' && <TabContacts contacts={contacts} />}
      </div>

      {/* ── Global quick-action modals ────────────────────────────────────── */}
      {showNewTache && (
        <TacheModal
          clientId={clientId}
          interactionObjet=""
          users={users}
          currentUser={user}
          onSave={() => { setShowNewTache(false); reloadTaches(); }}
          onClose={() => setShowNewTache(false)}
        />
      )}

      {showNewInteraction && (
        <InteractionModal
          clientId={clientId}
          onSave={() => { setShowNewInteraction(false); reloadInteractions(); }}
          onClose={() => setShowNewInteraction(false)}
        />
      )}
    </div>
  );
}
