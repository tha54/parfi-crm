import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import GED from './GED';

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

const DEVIS_STATUT_BADGE = { brouillon: 'autre', envoye: 'en_cours', accepte: 'termine', refuse: 'inactif', expire: 'reporte' };
const DEVIS_STATUT_LABEL = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', expire: 'Expiré' };
const LDM_STATUT_BADGE = { brouillon: 'autre', envoyee: 'en_cours', signee: 'termine', archivee: 'inactif' };
const LDM_STATUT_LABEL = { brouillon: 'Brouillon', envoyee: 'Envoyée', signee: 'Signée', archivee: 'Archivée' };

const TABS = [
  { key: 'overview', label: 'Vue d\'ensemble' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'travaux', label: 'Travaux' },
  { key: 'taches', label: 'Tâches' },
  { key: 'facturation', label: 'Facturation' },
  { key: 'documents', label: 'Documents' },
  { key: 'devis', label: 'Devis & LDM' },
  { key: 'contacts', label: 'Contacts' },
];

// ─── Modal helper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Tâche creation modal (from timeline) ─────────────────────────────────────
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

// ─── Tab: Vue d'ensemble ──────────────────────────────────────────────────────
function TabOverview({ client, attributions, factures, taches, missions }) {
  const caFacture = factures.filter((f) => f.statut !== 'brouillon' && f.statut !== 'annulee')
    .reduce((s, f) => s + parseFloat(f.totalHT || 0), 0);
  const impayes = factures.filter((f) => f.statut === 'retard' || f.statut === 'envoyee')
    .reduce((s, f) => s + (parseFloat(f.totalTTC || 0) - parseFloat(f.montantPaye || 0)), 0);
  const missionsActives = missions.filter((m) => m.statut === 'en_cours').length;
  const tachesEnRetard = taches.filter(
    (t) => t.statut !== 'termine' && t.date_echeance && new Date(t.date_echeance) < new Date()
  ).length;

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
        {/* Identity card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Identité</span>
          </div>
          <div className="card-body">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Nom', client.nom],
                  ['SIREN', client.siren || '—'],
                  ['Type', <span key="t" className={`badge badge-${TYPE_BADGE[client.type] || 'autre'}`}>{client.type}</span>],
                  ['Régime', <span key="r" className={`badge badge-${REGIME_BADGE[client.regime] || 'autre'}`}>{REGIME_LABEL[client.regime] || client.regime}</span>],
                  ['Statut', <span key="s" className={`badge badge-${client.actif ? 'actif' : 'inactif'}`}>{client.actif ? 'Actif' : 'Inactif'}</span>],
                  ['Client depuis', fmtDate(client.cree_le)],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12, width: 120, fontWeight: 600 }}>{label}</td>
                    <td style={{ padding: '8px 0', fontSize: 13 }}>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Collaborateurs */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Équipe assignée</span>
          </div>
          <div className="card-body">
            {attributions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun collaborateur assigné.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {attributions.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(a.prenom?.[0] || '').toUpperCase()}{(a.nom?.[0] || '').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{a.prenom} {a.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.email}</div>
                    </div>
                    <span className={`badge badge-${a.role_sur_dossier === 'responsable' ? 'responsable' : 'assistant'}`} style={{ marginLeft: 'auto' }}>
                      {a.role_sur_dossier === 'responsable' ? 'Responsable' : 'Assistant'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Paramètres fiscaux */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Paramètres fiscaux</span>
          </div>
          <div className="card-body">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Type d\'entité', client.type || '—'],
                  ['Régime fiscal', REGIME_LABEL[client.regime] || client.regime || '—'],
                  ['E-mail portail', client.portal_email || '—'],
                ].map(([label, val]) => (
                  <tr key={label} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12, width: 160, fontWeight: 600 }}>{label}</td>
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
                {missions.slice(0, 4).map((m) => (
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
      </div>
    </div>
  );
}

// ─── Tab: Timeline ────────────────────────────────────────────────────────────
function TabTimeline({ interactions, clientId, users, currentUser, onTacheCreated }) {
  const [tacheModal, setTacheModal] = useState(null); // interaction objet string

  const handleTacheSaved = () => {
    setTacheModal(null);
    onTacheCreated();
  };

  if (interactions.length === 0) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucune interaction enregistrée.</div></div>;
  }

  return (
    <>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ position: 'relative', paddingLeft: 32 }}>
            {/* Vertical line */}
            <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 2, background: 'var(--border)' }} />

            {interactions.map((interaction) => (
              <div key={interaction.id} style={{ position: 'relative', padding: '20px 24px 20px 0', borderBottom: '1px solid var(--border-light)' }}>
                {/* Circle on the line */}
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
        </div>
      </div>

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

// ─── Tab: Travaux (Missions) ──────────────────────────────────────────────────
function TabTravaux({ missions }) {
  if (missions.length === 0) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucune mission pour ce client.</div></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                    <span className={`badge badge-${TACHE_STATUT_BADGE[m.statut] || 'autre'}`}
                      style={{ background: MISSION_STATUTS[m.statut]?.color || '#ccc', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
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

              {/* Progress bar */}
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
function TabTaches({ taches: initialTaches, clientId }) {
  const [taches, setTaches] = useState(initialTaches);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => { setTaches(initialTaches); }, [initialTaches]);

  const toggleTache = async (tache) => {
    const newStatut = tache.statut === 'termine' ? 'a_faire' : 'termine';
    setTogglingId(tache.id);
    try {
      await api.put(`/taches/${tache.id}`, { statut: newStatut });
      setTaches((prev) => prev.map((t) => t.id === tache.id ? { ...t, statut: newStatut } : t));
    } catch {
      // silent fail
    } finally {
      setTogglingId(null);
    }
  };

  const grouped = TACHE_STATUTS.reduce((acc, s) => {
    acc[s] = taches.filter((t) => t.statut === s);
    return acc;
  }, {});

  const hasAny = taches.length > 0;

  if (!hasAny) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucune tâche pour ce client.</div></div>;
  }

  return (
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
                        width: 20, height: 20, borderRadius: 4, border: `2px solid ${isDone ? 'var(--success)' : 'var(--border)'}`,
                        background: isDone ? 'var(--success)' : '#fff', color: '#fff', fontSize: 12,
                        cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  );
}

// ─── Tab: Facturation ─────────────────────────────────────────────────────────
function TabFacturation({ factures }) {
  const totalHT = factures.reduce((s, f) => s + parseFloat(f.totalHT || 0), 0);
  const totalPaye = factures.reduce((s, f) => s + parseFloat(f.montantPaye || 0), 0);
  const totalDu = factures.filter((f) => ['envoyee', 'retard', 'partielle'].includes(f.statut))
    .reduce((s, f) => s + (parseFloat(f.totalTTC || 0) - parseFloat(f.montantPaye || 0)), 0);

  if (factures.length === 0) {
    return <div className="card"><div className="card-body" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Aucune facture pour ce client.</div></div>;
  }

  return (
    <div>
      {/* KPI row */}
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

      {/* Timeline list */}
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

// ─── Tab: Devis & LDM ────────────────────────────────────────────────────────
function TabDevisLdm({ devis, ldm }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Devis */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Devis ({devis.length})</span>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {devis.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun devis.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Titre</th>
                    <th>Statut</th>
                    <th>Émis le</th>
                    <th>Validité</th>
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

      {/* Lettres de mission */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Lettres de mission ({ldm.length})</span>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {ldm.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune lettre de mission.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Type de mission</th>
                    <th>Statut</th>
                    <th>Début</th>
                    <th>Fin</th>
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
                <th>Nom</th>
                <th>Poste</th>
                <th>Email</th>
                <th>Téléphone</th>
                <th>Principal</th>
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
                    {c.email ? (
                      <a href={`mailto:${c.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{c.email}</a>
                    ) : '—'}
                  </td>
                  <td>{c.telephone || c.mobile || '—'}</td>
                  <td>
                    {c.principal ? <span className="badge badge-actif">Principal</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
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
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [
        clientRes, attrRes, intRes, missRes, tachRes,
        factRes, devisRes, ldmRes,
      ] = await Promise.all([
        api.get(`/clients/${clientId}`),
        api.get(`/attributions?client_id=${clientId}`),
        api.get(`/interactions?client_id=${clientId}&limit=100`),
        api.get(`/missions?client_id=${clientId}`),
        api.get(`/taches?client_id=${clientId}`),
        api.get(`/factures?client_id=${clientId}`),
        api.get(`/devis?client_id=${clientId}`),
        api.get(`/lettres-mission?client_id=${clientId}`),
      ]);

      setClient(clientRes.data);
      setAttributions(attrRes.data);
      setInteractions(intRes.data);
      setMissions(missRes.data);
      setTaches(tachRes.data);
      setFactures(factRes.data);
      setDevis(devisRes.data);
      setLdm(ldmRes.data);

      // Personnes contact via clients/:id (returns attributions inline)
      // We fetch contacts separately via contacts endpoint filtered by client
      try {
        const pcRes = await api.get(`/contacts/personnes?client_id=${clientId}`);
        setContacts(pcRes.data);
      } catch {
        // Try direct query approach — the personnes_contact table uses client_id
        setContacts([]);
      }

      // Load users for tache modal
      if (['expert', 'chef_mission'].includes(user?.role)) {
        const usersRes = await api.get('/utilisateurs');
        setUsers(usersRes.data);
      } else {
        setUsers(user ? [user] : []);
      }
    } catch (e) {
      if (e.response?.status === 404) {
        setError('Client introuvable.');
      } else {
        setError('Erreur lors du chargement du client.');
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, user]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="page-body" style={{ padding: 0 }}>
      {/* ── Client header ────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F1F4B 0%, #0a1835 100%)',
        padding: '24px 28px 0',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <button
              onClick={() => navigate('/clients')}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '4px 10px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}
            >
              ← Clients
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{client.nom}</h1>
              <span style={{
                background: TYPE_BADGE[client.type] === 'bic' ? '#00B4D8' :
                  TYPE_BADGE[client.type] === 'bnc' ? '#7c3aed' :
                  TYPE_BADGE[client.type] === 'sci' ? '#d97706' :
                  TYPE_BADGE[client.type] === 'sa' ? '#059669' : '#475569',
                color: '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
              }}>
                {client.type}
              </span>
              <span style={{
                background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)',
                padding: '3px 10px', borderRadius: 4, fontSize: 12,
              }}>
                {REGIME_LABEL[client.regime] || client.regime}
              </span>
              <span style={{
                background: client.actif ? 'rgba(0,137,123,0.3)' : 'rgba(214,48,49,0.3)',
                color: client.actif ? '#4dd0c4' : '#ff8a80',
                padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
              }}>
                {client.actif ? 'Actif' : 'Inactif'}
              </span>
            </div>
            {client.siren && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                SIREN : {client.siren}
              </div>
            )}
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? 'var(--primary)' : 'rgba(255,255,255,0.65)',
                border: 'none', cursor: 'pointer', padding: '10px 18px', fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                borderRadius: '6px 6px 0 0', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {t.label}
              {t.key === 'taches' && taches.filter((t2) => t2.statut !== 'termine').length > 0 && (
                <span style={{
                  marginLeft: 6, background: tab === t.key ? 'var(--primary)' : 'rgba(255,255,255,0.3)',
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
          />
        )}

        {tab === 'timeline' && (
          <TabTimeline
            interactions={interactions}
            clientId={clientId}
            users={users}
            currentUser={user}
            onTacheCreated={() => api.get(`/taches?client_id=${clientId}`).then((r) => setTaches(r.data))}
          />
        )}

        {tab === 'travaux' && <TabTravaux missions={missions} />}

        {tab === 'taches' && <TabTaches taches={taches} clientId={clientId} />}

        {tab === 'facturation' && <TabFacturation factures={factures} />}

        {tab === 'documents' && (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <GED clientId={clientId} />
            </div>
          </div>
        )}

        {tab === 'devis' && <TabDevisLdm devis={devis} ldm={ldm} />}

        {tab === 'contacts' && <TabContacts contacts={contacts} />}
      </div>
    </div>
  );
}
