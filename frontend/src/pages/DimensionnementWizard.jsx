import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ── Taux horaires par défaut (fallback si grille non chargée) ─────────────────
const TAUX_HORAIRES_DEFAULT = {
  'Expert-comptable':        84,
  'Collaborateur':           42,
  'Collaborateur Social':    42,
  'Collaborateur Juridique': 42,
  'Aide comptable':          28,
};

// Mapping catégorie grille_tarifaire → labels intervenant du wizard
const CATEGORIE_TO_INTERVENANTS = {
  expert:        ['Expert-comptable'],
  chef_mission:  [],
  collaborateur: ['Collaborateur', 'Collaborateur Social', 'Collaborateur Juridique'],
  stagiaire:     ['Aide comptable'],
  secretaire:    [],
};

function buildTauxFromGrille(grille) {
  const taux = { ...TAUX_HORAIRES_DEFAULT };
  for (const g of grille) {
    const targets = CATEGORIE_TO_INTERVENANTS[g.categorie] || [];
    for (const t of targets) {
      if (!taux[t] || taux[t] === TAUX_HORAIRES_DEFAULT[t]) {
        taux[t] = Number(g.taux_horaire);
      }
    }
  }
  return taux;
}

const makeTarif = (taux) => (min, interv) =>
  Math.round(((min / 60) * (taux[interv] || 42)) * 100) / 100;

// ── Calcul de toutes les lignes ───────────────────────────────────────────────
function calculerLignes({ type_entite, regime_fiscal, regime_tva, factures_achat, factures_vente, lignes_banque, immobilisations, effectif, operations_diverses: opDivParam = null, tauxHoraires }) {
  const tarif = makeTarif(tauxHoraires || TAUX_HORAIRES_DEFAULT);
  const isSociete     = type_entite === 'societe';
  const isAssociation = type_entite === 'association';
  const fa  = Number(factures_achat)  || 0;
  const fv  = Number(factures_vente)  || 0;
  const lb  = Number(lignes_banque)   || 0;
  const imm = Number(immobilisations) || 0;
  const eff = Number(effectif)        || 0;
  const od  = opDivParam != null ? Number(opDivParam) : Math.round((fa + fv) * 0.1);
  const nb_decl_tva = regime_tva === 'mensuel' ? 12 : regime_tva === 'trimestriel' ? 4 : 0;

  const l = (section, libelle, intervenant, periodicite, temps_minutes) => ({
    section, libelle, intervenant, periodicite, temps_minutes,
    tarif_ht: tarif(temps_minutes, intervenant),
    actif: true,
  });

  const lignes = [];

  // TENUE COMPTABLE
  if (fa > 0) {
    const m = Math.max(30, Math.round((fa / 30) * 60));
    lignes.push(l('Tenue comptable', "Journaux d'achats", 'Aide comptable', 'Mensuel', m));
  }
  if (fv > 0) {
    const m = Math.max(30, Math.round((fv / 30) * 60));
    lignes.push(l('Tenue comptable', 'Journaux de ventes', 'Aide comptable', 'Mensuel', m));
  }
  if (lb > 0) {
    const m = Math.max(30, Math.round((lb / 60) * 60));
    lignes.push(l('Tenue comptable', 'Journaux de trésorerie', 'Aide comptable', 'Mensuel', m));
  }
  lignes.push(l('Tenue comptable', "Journaux d'OD", 'Aide comptable', 'Mensuel', Math.max(30, Math.round((od / 30) * 60))));

  // DILIGENCES COMPTABLES
  lignes.push(l('Diligences comptables', 'Constitution dossier permanent',          'Collaborateur', 'Ponctuel Jan',      30));
  lignes.push(l('Diligences comptables', 'Collecte éléments dossier permanent',     'Collaborateur', 'Récurrent clôture', 30));
  lignes.push(l('Diligences comptables', 'Collecte pièces contrôle annuel',          'Collaborateur', 'Récurrent clôture', 60));
  lignes.push(l('Diligences comptables', 'Constitution dossier de contrôle annuel', 'Collaborateur', 'Récurrent clôture', 300));
  lignes.push(l('Diligences comptables', 'Constitution FEC exercice clos',           'Collaborateur', 'Ponctuel Jan',      5));
  lignes.push(l('Diligences comptables', 'Constitution FEC exercice en cours',       'Collaborateur', 'Ponctuel Jan',      5));
  lignes.push(l('Diligences comptables', 'Archivage FEC',                            'Collaborateur', 'Suite clôture',     5));
  lignes.push(l('Diligences comptables', 'Traitement des immobilisations',           'Collaborateur', 'Récurrent clôture', Math.max(5, imm * 2)));
  lignes.push(l('Diligences comptables', 'Fournisseurs – factures non parvenues',    'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(l('Diligences comptables', 'Clients – factures à établir',             'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(l('Diligences comptables', 'État & organismes sociaux',                'Collaborateur', 'Récurrent clôture', 15));
  lignes.push(l('Diligences comptables', 'Divers à payer & à recevoir',              'Collaborateur', 'Récurrent clôture', 10));
  lignes.push(l('Diligences comptables', "Charges & produits constatés d'avance",   'Collaborateur', 'Récurrent clôture', 10));
  lignes.push(l('Diligences comptables', 'Bilan, Compte de résultat, Annexe',        'Collaborateur', 'Récurrent clôture', 240));
  lignes.push(l('Diligences comptables', 'Supervision du dossier',                   'Expert-comptable', 'Récurrent clôture', 60));
  lignes.push(l('Diligences comptables', 'Entretien annuel présentation comptes',    'Expert-comptable', 'Récurrent clôture', 90));
  lignes.push(l('Diligences comptables', 'Grand livre, Balance (×3)',                 'Collaborateur', 'Récurrent clôture', 45));

  // FISCALITÉ
  if (regime_fiscal !== 'micro') {
    lignes.push(l('Fiscalité', 'Liasses fiscales', 'Collaborateur', 'Annuel', 120));
  }
  if (isSociete) {
    lignes.push(l('Fiscalité', 'Acomptes IS (×4)',             'Collaborateur', 'Trimestriel', 60));
    lignes.push(l('Fiscalité', 'Liquidation IS',               'Collaborateur', 'Annuel',      30));
    lignes.push(l('Fiscalité', 'Détermination résultat fiscal','Collaborateur', 'Annuel',      30));
  }
  if (!isAssociation) {
    lignes.push(l('Fiscalité', 'Déclaration annuelle CET', 'Collaborateur', 'Annuel', 30));
    lignes.push(l('Fiscalité', 'Contrôle avis CET',        'Collaborateur', 'Annuel', 30));
    lignes.push(l('Fiscalité', 'Demandes dégrèvements CET','Collaborateur', 'Annuel', 30));
  }
  if (nb_decl_tva > 0) {
    const per = regime_tva === 'mensuel' ? 'Mensuel' : 'Trimestriel';
    lignes.push(l('Fiscalité', `Déclarations TVA (×${nb_decl_tva})`, 'Collaborateur', per, 20 * nb_decl_tva));
    lignes.push(l('Fiscalité', 'Contrôle TVA bilan', 'Collaborateur', 'Annuel', 60));
  }
  if (eff > 0 && !isAssociation) {
    lignes.push(l('Fiscalité', "Taxe d'apprentissage",   'Collaborateur Social', 'Annuel', 30));
  }
  if (eff > 0) {
    lignes.push(l('Fiscalité', 'Formation professionnelle', 'Collaborateur Social', 'Annuel', 30));
  }
  lignes.push(l('Fiscalité', 'DAS2', 'Collaborateur', 'Annuel', 30));

  // SOCIAL
  if (eff > 0) {
    lignes.push(l('Social', `Bulletins de paie (×${eff}×12)`, 'Collaborateur Social', 'Mensuel', 5 * eff * 12));
    lignes.push(l('Social', `DSN mensuelle (×${eff}×12)`,     'Collaborateur Social', 'Mensuel', 10 * eff * 12));
    lignes.push(l('Social', 'Tableaux récap. nets imposables', 'Collaborateur Social', 'Annuel',  10));
    lignes.push(l('Social', 'Calcul IFC',                      'Collaborateur',        'Annuel',  30));
    lignes.push(l('Social', 'Registres légaux sociaux',        'Collaborateur Social', 'Annuel',  60));
  }

  // JURIDIQUE
  if (isSociete || isAssociation) {
    lignes.push(l('Juridique', 'Rédaction AGO',  'Collaborateur Juridique', 'Annuel', 240));
    lignes.push(l('Juridique', 'Formalités AGO', 'Collaborateur Juridique', 'Annuel', 60));
  }

  return lignes;
}

const fmt = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v ?? 0);
const fmtMin = m => {
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h === 0) return `${mn}min`;
  if (mn === 0) return `${h}h`;
  return `${h}h${String(mn).padStart(2, '0')}`;
};

const INTERVENANT_COLORS = {
  'Expert-comptable':        '#0f1f4b',
  'Collaborateur':           '#2563eb',
  'Collaborateur Social':    '#059669',
  'Collaborateur Juridique': '#7c3aed',
  'Aide comptable':          '#d97706',
};

const SECTIONS_ORDER = ['Tenue comptable', 'Diligences comptables', 'Fiscalité', 'Social', 'Juridique'];

// ── Champ numérique volumétrie ────────────────────────────────────────────────
function NumField({ label, value, onChange, min = 0, unit = '', badge = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <label style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number" min={min} value={value}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          style={{ width: 90, textAlign: 'right', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}
        />
        {unit && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{unit}</span>}
        {badge}
      </div>
    </div>
  );
}

// ── Étape 1 : Entité + SIREN ──────────────────────────────────────────────────
function Step1({ data, onChange, clients }) {
  const [sirenQuery, setSirenQuery] = useState(data.siren || '');
  const [sirenResults, setSirenResults] = useState([]);
  const [sirenLoading, setSirenLoading] = useState(false);

  const searchSiren = useCallback(async (q) => {
    if (q.length < 3) { setSirenResults([]); return; }
    setSirenLoading(true);
    try {
      const r = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=6`
      );
      const data = await r.json();
      setSirenResults(data.results || []);
    } catch {
      setSirenResults([]);
    } finally {
      setSirenLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchSiren(sirenQuery), 400);
    return () => clearTimeout(t);
  }, [sirenQuery, searchSiren]);

  const selectEntreprise = (e) => {
    const siren   = e.siren || '';
    const nom     = e.nom_complet || e.nom_raison_sociale || '';
    const nature  = e.nature_juridique_libelle || '';
    const isSociete     = /SAS|SARL|SA|SNC|SCI|SASU|EURL|société/i.test(nature);
    const isAssociation = /association/i.test(nature);
    const type_entite   = isAssociation ? 'association' : isSociete ? 'societe' : 'ei';

    onChange({ siren, nom_client_libre: nom, type_entite });
    setSirenQuery(siren);
    setSirenResults([]);

    // Tenter de lier à un client CRM existant
    const found = clients.find(c => c.siren && c.siren.replace(/\s/g, '') === siren);
    if (found) onChange({ siren, nom_client_libre: nom, type_entite, client_id: String(found.id) });
  };

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 1 — Entité & identification</h3>

      {/* Type d'entité */}
      <div style={{ marginBottom: 28 }}>
        <label className="form-label">Type d'entité</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
          {[
            { value: 'ei',           label: 'EI',          sub: 'Entrepreneur individuel', icon: '👤' },
            { value: 'societe',      label: 'Société',      sub: 'SARL / SAS / SA / SCI…', icon: '🏢' },
            { value: 'association',  label: 'Association',  sub: 'Loi 1901',                icon: '🤝' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ type_entite: opt.value })}
              style={{
                padding: '16px 12px', borderRadius: 10, border: '2px solid',
                borderColor: data.type_entite === opt.value ? 'var(--accent)' : 'var(--border)',
                background: data.type_entite === opt.value ? 'var(--accent-light)' : 'var(--surface)',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{opt.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: data.type_entite === opt.value ? 'var(--accent-hover)' : 'var(--text)' }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Recherche SIREN */}
      <div className="form-group" style={{ position: 'relative' }}>
        <label className="form-label">Recherche SIREN / Nom d'entreprise</label>
        <input
          className="form-control"
          placeholder="Saisir SIREN ou nom…"
          value={sirenQuery}
          onChange={e => setSirenQuery(e.target.value)}
          style={{ paddingRight: 36 }}
        />
        {sirenLoading && (
          <span style={{ position: 'absolute', right: 12, top: 38, fontSize: 14, color: 'var(--text-muted)' }}>⏳</span>
        )}
        {sirenResults.length > 0 && (
          <div style={{
            position: 'absolute', zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: '100%', top: '100%', marginTop: 4, maxHeight: 280, overflowY: 'auto'
          }}>
            {sirenResults.map((e, i) => (
              <div
                key={i}
                onClick={() => selectEntreprise(e)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13 }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'var(--accent-light)'}
                onMouseLeave={ev => ev.currentTarget.style.background = ''}
              >
                <div style={{ fontWeight: 600 }}>{e.nom_complet || e.nom_raison_sociale}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  SIREN {e.siren} · {e.siege?.code_postal} {e.siege?.libelle_commune} · {e.nature_juridique_libelle}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.siren && (
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent-hover)', fontWeight: 500 }}>
          ✓ SIREN sélectionné : {data.siren}
        </div>
      )}

      {/* Lien client CRM */}
      <div className="form-group" style={{ marginTop: 20 }}>
        <label className="form-label">Client CRM (optionnel)</label>
        <select
          className="form-control"
          value={data.client_id || ''}
          onChange={e => onChange({ client_id: e.target.value || null })}
        >
          <option value="">— Aucun (dimensionnement libre) —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.nom}{c.siren ? ` — ${c.siren}` : ''}</option>
          ))}
        </select>
        {!data.client_id && (
          <div style={{ fontSize: 11, color: '#e67e22', marginTop: 3 }}>
            ⚠ La signature de la LDM et l'injection des tâches nécessitent un client CRM lié.
          </div>
        )}
      </div>

      {!data.client_id && (
        <div className="form-group">
          <label className="form-label">Nom libre (pour le PDF)</label>
          <input
            className="form-control"
            placeholder="SARL Exemple…"
            value={data.nom_client_libre || ''}
            onChange={e => onChange({ nom_client_libre: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ── Étape 2 : Paramètres + Volumétrie ─────────────────────────────────────────
function Step2({ data, onChange }) {
  const sp = (k) => (v) => onChange({ [k]: v });

  const AutoBadge = () => (
    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-hover)', whiteSpace: 'nowrap', padding: '2px 6px', background: 'var(--accent-light)', borderRadius: 4 }}>
      ⚡ auto
    </span>
  );
  const ResetBtn = ({ onClick }) => (
    <button type="button" onClick={onClick} title="Rétablir le calcul automatique"
      style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', color: 'var(--accent-hover)' }}>
      ↺
    </button>
  );

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 2 — Paramètres & volumétrie</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="form-group">
          <label className="form-label">Régime fiscal</label>
          <select className="form-control" value={data.regime_fiscal} onChange={e => onChange({ regime_fiscal: e.target.value })}>
            <option value="micro">Micro-entreprise</option>
            <option value="reel_simplifie">Réel simplifié</option>
            <option value="reel_normal">Réel normal</option>
            <option value="bnc">BNC</option>
            <option value="ba">BA</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Régime de TVA</label>
          <select className="form-control" value={data.regime_tva} onChange={e => onChange({ regime_tva: e.target.value })}>
            <option value="mensuel">Mensuel (12 décl./an)</option>
            <option value="trimestriel">Trimestriel (4 décl./an)</option>
            <option value="franchise">Franchise en base</option>
            <option value="neant">Néant (exonéré)</option>
          </select>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 24 }}>
        <label className="form-label">Nombre d'établissements</label>
        <input
          type="number" className="form-control" min={1} max={20}
          value={data.nb_etablissements}
          onChange={e => onChange({ nb_etablissements: Math.max(1, Number(e.target.value)) })}
          style={{ width: 120 }}
        />
      </div>

      <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '20px 24px', marginTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-hover)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Volumétrie mensuelle
        </div>

        <NumField label="Factures d'achat / mois"  value={data.factures_achat}  onChange={sp('factures_achat')}  unit="pièces" />
        <NumField label="Factures de vente / mois"  value={data.factures_vente}  onChange={sp('factures_vente')}  unit="pièces" />
        <NumField
          label="Lignes de banque / mois"
          value={data.lignes_banque}
          onChange={v => onChange({ lignes_banque: v, _lockLignesBanque: true })}
          unit="lignes"
          badge={data._lockLignesBanque
            ? <ResetBtn onClick={() => onChange({ _lockLignesBanque: false, lignes_banque: Math.round((data.factures_achat + data.factures_vente) * 1.2) })} />
            : <AutoBadge />}
        />
        <NumField
          label="Opérations diverses / mois"
          value={data.operations_diverses}
          onChange={v => onChange({ operations_diverses: v, _lockOpDiv: true })}
          unit="pièces"
          badge={data._lockOpDiv
            ? <ResetBtn onClick={() => onChange({ _lockOpDiv: false, operations_diverses: Math.round((data.factures_achat + data.factures_vente) * 0.1) })} />
            : <AutoBadge />}
        />
        <NumField label="Immobilisations (total)"   value={data.immobilisations} onChange={sp('immobilisations')} unit="immos" />
        <NumField label="Effectif salarié"          value={data.effectif}        onChange={sp('effectif')}        unit="salariés" />
      </div>

      {/* Résumé rapide */}
      <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>Résumé paramétrage :</strong>
        {data.type_entite === 'ei' ? 'EI' : data.type_entite === 'societe' ? 'Société' : 'Association'} ·
        Fiscal : {data.regime_fiscal} · TVA : {data.regime_tva}
        {data.effectif > 0 ? ` · ${data.effectif} salarié${data.effectif > 1 ? 's' : ''}` : ''}
      </div>
    </div>
  );
}

// ── Étape 3 : Résultats + Remise ──────────────────────────────────────────────
function Step3({ data, lignes, onChange, onSave, onCreateDevis, onCreateLdm, saving, savedId, tauxHoraires }) {
  const [expandedSections, setExpandedSections] = useState(new Set(SECTIONS_ORDER));
  const [editingLignes, setEditingLignes] = useState(null);

  const tarif = makeTarif(tauxHoraires || TAUX_HORAIRES_DEFAULT);

  const displayLignes = editingLignes || lignes;

  const applyUpdate = (updated) => {
    setEditingLignes(updated);
    onChange({ lignes_override: updated });
  };

  const toggleActif = (idx) => {
    applyUpdate(displayLignes.map((l, i) => i === idx ? { ...l, actif: !l.actif } : l));
  };

  const updateTemps = (idx, newVal) => {
    const mins = Math.max(0, parseInt(newVal) || 0);
    applyUpdate(displayLignes.map((l, i) =>
      i === idx ? { ...l, temps_minutes: mins, tarif_ht: tarif(mins, l.intervenant) } : l
    ));
  };

  const updateTarif = (idx, val) => {
    const amount = Math.max(0, parseFloat(val) || 0);
    applyUpdate(displayLignes.map((l, i) => i === idx ? { ...l, tarif_ht: amount } : l));
  };

  const updateTarifMensuel = (idx, val) => {
    const monthly = Math.max(0, parseFloat(val) || 0);
    applyUpdate(displayLignes.map((l, i) =>
      i === idx ? { ...l, montant_mensuel: monthly, tarif_ht: Math.round(monthly * 12 * 100) / 100 } : l
    ));
  };

  const updateMode = (idx, mode) => {
    applyUpdate(displayLignes.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, mode_saisie: mode };
      if (mode === 'temps') {
        updated.tarif_ht = tarif(l.temps_minutes, l.intervenant);
        delete updated.montant_mensuel;
      } else if (mode === 'forfait_mensuel') {
        updated.montant_mensuel = Math.round(l.tarif_ht / 12 * 100) / 100;
      }
      return updated;
    }));
  };

  const resetOverrides = () => {
    setEditingLignes(null);
    onChange({ lignes_override: null });
  };

  const hasOverrides = editingLignes !== null;

  const toggleSection = (section) => {
    setExpandedSections(s => {
      const next = new Set(s);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  };

  const remise = Number(data.remise_pct) || 0;
  const activeLines = displayLignes.filter(l => l.actif !== false);
  const total_ht     = activeLines.reduce((s, l) => s + Number(l.tarif_ht), 0);
  const total_ht_net = Math.round(total_ht * (1 - remise / 100) * 100) / 100;
  const total_tva    = Math.round(total_ht_net * 0.20 * 100) / 100;
  const total_ttc    = total_ht_net + total_tva;

  const sections = SECTIONS_ORDER.filter(s => displayLignes.some(l => l.section === s));
  const totalMin  = activeLines.reduce((s, l) => s + l.temps_minutes, 0);

  return (
    <div>
      <h3 style={{ marginBottom: 20, color: 'var(--primary)' }}>Étape 3 — Résultat & validation</h3>

      {/* Bouton reset si des valeurs ont été modifiées manuellement */}
      {hasOverrides && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={resetOverrides}
            style={{ fontSize: 12, color: 'var(--accent-hover)' }}
          >
            ↺ Rétablir les valeurs automatiques
          </button>
        </div>
      )}

      {/* Tableau des missions par section */}
      {sections.map(section => {
        const sectionLines = displayLignes.filter(l => l.section === section);
        const isOpen = expandedSections.has(section);
        const sectionTotal = sectionLines.filter(l => l.actif).reduce((s, l) => s + l.tarif_ht, 0);

        return (
          <div key={section} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div
              onClick={() => toggleSection(section)}
              style={{
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', cursor: 'pointer', background: 'var(--surface)',
                borderBottom: isOpen ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>
                {isOpen ? '▼' : '▶'} {section}
                <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
                  ({sectionLines.filter(l => l.actif).length}/{sectionLines.length} tâches)
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-hover)' }}>
                {fmt(sectionTotal)}
              </div>
            </div>

            {isOpen && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', width: 36 }}></th>
                    <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Tâche</th>
                    <th style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', width: 130 }}>Intervenant</th>
                    <th style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', width: 80 }}>Périodicité</th>
                    <th style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', width: 80 }}>Mode</th>
                    <th style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 90 }}>Temps (min)</th>
                    <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', width: 110 }}>Tarif HT</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionLines.map((ligne, idx) => {
                    const globalIdx = displayLignes.indexOf(ligne);
                    const mode = ligne.mode_saisie || 'temps';
                    const origLigne = lignes[globalIdx];
                    const tempsModified = hasOverrides && editingLignes[globalIdx]?.temps_minutes !== origLigne?.temps_minutes;
                    const tarifModified = hasOverrides && editingLignes[globalIdx]?.tarif_ht !== origLigne?.tarif_ht;
                    const modeChanged   = hasOverrides && (editingLignes[globalIdx]?.mode_saisie || 'temps') !== 'temps';

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderTop: '1px solid var(--border)',
                          background: ligne.actif ? '' : 'rgba(0,0,0,0.03)',
                          opacity: ligne.actif ? 1 : 0.45,
                        }}
                      >
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox" checked={ligne.actif !== false}
                            onChange={() => toggleActif(globalIdx)}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '7px 12px', color: 'var(--text)' }}>{ligne.libelle}</td>
                        <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 12,
                            background: INTERVENANT_COLORS[ligne.intervenant] + '18',
                            color: INTERVENANT_COLORS[ligne.intervenant] || 'var(--text)',
                          }}>
                            {ligne.intervenant}
                          </span>
                        </td>
                        <td style={{ padding: '7px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                          {ligne.periodicite}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <select
                            value={mode}
                            onChange={e => updateMode(globalIdx, e.target.value)}
                            style={{
                              fontSize: 10, padding: '3px 4px',
                              border: `1px solid ${modeChanged ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 4, background: 'var(--surface)',
                              color: modeChanged ? 'var(--accent-hover)' : 'var(--text)',
                            }}
                          >
                            <option value="temps">⏱ Temps</option>
                            <option value="forfait_annuel">€/an</option>
                            <option value="forfait_mensuel">€/mois</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                          {mode === 'temps' ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              <input
                                type="number" min={0}
                                value={ligne.temps_minutes}
                                onChange={e => updateTemps(globalIdx, e.target.value)}
                                style={{
                                  width: 60, textAlign: 'right', padding: '3px 6px',
                                  border: `1px solid ${tempsModified ? 'var(--accent)' : 'var(--border)'}`,
                                  borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: tempsModified ? 'var(--accent-hover)' : 'var(--primary)',
                                  background: 'var(--surface)',
                                }}
                              />
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>min</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '4px 12px', textAlign: 'right' }}>
                          {mode === 'forfait_mensuel' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input
                                  type="number" min={0} step={0.01}
                                  value={ligne.montant_mensuel ?? Math.round(ligne.tarif_ht / 12 * 100) / 100}
                                  onChange={e => updateTarifMensuel(globalIdx, e.target.value)}
                                  style={{
                                    width: 68, textAlign: 'right', padding: '3px 6px',
                                    border: '1px solid var(--accent)', borderRadius: 4,
                                    fontSize: 12, fontWeight: 600, color: 'var(--accent-hover)', background: 'var(--surface)',
                                  }}
                                />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>€/mois</span>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt(ligne.tarif_ht)} /an</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              <input
                                type="number" min={0} step={0.01}
                                value={ligne.tarif_ht}
                                onChange={e => updateTarif(globalIdx, e.target.value)}
                                style={{
                                  width: 72, textAlign: 'right', padding: '3px 6px',
                                  border: `1px solid ${tarifModified ? 'var(--accent)' : 'var(--border)'}`,
                                  borderRadius: 4, fontSize: 12, fontWeight: 600,
                                  color: tarifModified ? 'var(--accent-hover)' : 'var(--primary)',
                                  background: 'var(--surface)',
                                }}
                              />
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>€</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Temps total */}
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, marginTop: 4 }}>
        Temps total : <strong>{fmtMin(totalMin)}</strong> ({activeLines.length} tâches actives)
      </div>

      {/* Remise */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Remise commerciale</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" min={0} max={30} value={remise}
              onChange={e => onChange({ remise_pct: Math.min(30, Math.max(0, Number(e.target.value) || 0)) })}
              style={{ width: 70, textAlign: 'right', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 14, fontWeight: 600, color: remise > 0 ? '#e74c3c' : 'var(--text)' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
          </div>
        </div>
      </div>

      {/* Totaux */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span className="text-muted">Total HT</span>
          <strong>{fmt(total_ht)}</strong>
        </div>
        {remise > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="text-muted">Remise {remise}%</span>
            <span style={{ color: '#e74c3c' }}>−{fmt(total_ht - total_ht_net)}</span>
          </div>
        )}
        {remise > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <span className="text-muted">Total HT net</span>
            <strong>{fmt(total_ht_net)}</strong>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span className="text-muted">TVA 20%</span>
          <span>{fmt(total_tva)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '12px 14px', marginTop: 8, fontSize: 15, fontWeight: 700 }}>
          <span>Total TTC</span>
          <span>{fmt(total_ttc)}</span>
        </div>
        <div style={{ marginTop: 12, background: 'var(--accent-light)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-hover)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Équivalent mensuel</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-hover)', marginTop: 4 }}>{fmt(total_ttc / 12)}</div>
          <div style={{ fontSize: 11, color: 'var(--accent-hover)' }}>TTC / mois</div>
        </div>
      </div>

      {/* Actions principales */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => onSave('brouillon')} disabled={!!saving}
          style={{ justifyContent: 'center', padding: 11 }}>
          {saving === 'brouillon' ? 'Enregistrement…' : '💾 Sauvegarder brouillon'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button className="btn" onClick={onCreateDevis} disabled={!!saving}
            style={{ justifyContent: 'center', padding: 13, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14 }}>
            {saving === 'devis' ? 'Création…' : '📄 Créer le Devis'}
          </button>
          <button className="btn" onClick={onCreateLdm} disabled={!!saving}
            style={{ justifyContent: 'center', padding: 13, background: '#0f1f4b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14 }}>
            {saving === 'ldm' ? 'Création…' : '📋 Créer la LDM'}
          </button>
        </div>
        {!data.client_id && (
          <div style={{ fontSize: 11, color: '#e67e22', textAlign: 'center' }}>
            ⚠ Liez un client CRM (étape 1) pour créer un Devis ou une LDM
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composant principal DimensionnementWizard ─────────────────────────────────
export default function DimensionnementWizard({ onBack }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState([]);
  const [tauxHoraires, setTauxHoraires] = useState(TAUX_HORAIRES_DEFAULT);
  const [saving, setSaving] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [wizardBlock, setWizardBlock] = useState(null);

  const [formData, setFormData] = useState({
    type_entite:         'societe',
    regime_fiscal:       'reel_normal',
    regime_tva:          'mensuel',
    nb_etablissements:   1,
    factures_achat:      0,
    factures_vente:      0,
    lignes_banque:       0,
    operations_diverses: 0,
    immobilisations:     0,
    effectif:            0,
    client_id:           null,
    nom_client_libre:    '',
    siren:               '',
    remise_pct:          0,
    lignes_override:     null,
    _lockLignesBanque:   false,
    _lockOpDiv:          false,
  });

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/parametres/grille-tarifaire').then(r => {
      if (r.data?.length) setTauxHoraires(buildTauxFromGrille(r.data));
    }).catch(() => {});
  }, []);

  const updateForm = useCallback((partial) => {
    setFormData(d => {
      const next = { ...d, ...partial };
      if ('factures_achat' in partial || 'factures_vente' in partial) {
        if (!next._lockLignesBanque) {
          next.lignes_banque = Math.round((next.factures_achat + next.factures_vente) * 1.2);
        }
        if (!next._lockOpDiv) {
          next.operations_diverses = Math.round((next.factures_achat + next.factures_vente) * 0.1);
        }
      }
      return next;
    });
  }, []);

  const computedLignes = useMemo(
    () => calculerLignes({ ...formData, tauxHoraires }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formData.type_entite, formData.regime_fiscal, formData.regime_tva,
     formData.factures_achat, formData.factures_vente, formData.lignes_banque,
     formData.operations_diverses, formData.immobilisations, formData.effectif, tauxHoraires]
  );

  const displayLignes = formData.lignes_override || computedLignes;

  const buildPayload = (statut) => {
    const activeLines = displayLignes.filter(l => l.actif !== false);
    const total_ht     = activeLines.reduce((s, l) => s + Number(l.tarif_ht), 0);
    const remise       = Number(formData.remise_pct) || 0;
    const total_ht_net = Math.round(total_ht * (1 - remise / 100) * 100) / 100;
    const total_ttc    = Math.round(total_ht_net * 1.20 * 100) / 100;

    return {
      client_id:         formData.client_id   || null,
      nom_client_libre:  formData.nom_client_libre || null,
      siren:             formData.siren         || null,
      type_entite:       formData.type_entite,
      regime_fiscal:     formData.regime_fiscal,
      regime_tva:        formData.regime_tva,
      nb_etablissements: formData.nb_etablissements,
      factures_achat:      formData.factures_achat,
      factures_vente:      formData.factures_vente,
      lignes_banque:       formData.lignes_banque,
      operations_diverses: formData.operations_diverses,
      immobilisations:     formData.immobilisations,
      effectif:            formData.effectif,
      remise_pct:        remise,
      total_ht, total_ht_net, total_ttc,
      statut,
      lignes: displayLignes,
    };
  };

  const handleSave = async (statut) => {
    setSaving(statut);
    setMsg(null);
    try {
      if (savedId) {
        await api.put(`/dimensionnement/${savedId}`, buildPayload(statut));
        setMsg({ type: 'ok', text: `✓ Dimensionnement mis à jour (${statut})` });
      } else {
        const { data } = await api.post('/dimensionnement', buildPayload(statut));
        setSavedId(data.id);
        setMsg({ type: 'ok', text: `✓ Dimensionnement enregistré (réf. #${data.id})` });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Erreur lors de l\'enregistrement' });
    } finally {
      setSaving(null);
    }
  };

  const handleCreateDocument = async (type) => {
    if (!formData.client_id) {
      setMsg({ type: 'err', text: 'Un client CRM est requis pour créer un Devis ou une LDM' });
      return;
    }
    setSaving(type);
    setMsg(null);
    try {
      let id = savedId;
      if (!id) {
        const { data } = await api.post('/dimensionnement', buildPayload('brouillon'));
        id = data.id;
        setSavedId(id);
      } else {
        await api.put(`/dimensionnement/${id}`, buildPayload('brouillon'));
      }
      const { data } = await api.post(`/dimensionnement/${id}/to-${type}`);
      navigate(type === 'devis' ? `/devis/${data.id}` : `/lettres-mission/${data.id}`);
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Erreur lors de la création' });
      setSaving(null);
    }
  };

  const STEPS = [
    { n: 1, label: 'Entité' },
    { n: 2, label: 'Paramètres' },
    { n: 3, label: 'Résultat' },
  ];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 0 }}>
        {onBack && (
          <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginRight: 16 }}>
            ← Retour
          </button>
        )}
        {STEPS.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div
              onClick={() => s.n < step && setStep(s.n)}
              style={{
                width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: 14, cursor: s.n < step ? 'pointer' : 'default',
                background: step === s.n ? 'var(--primary)' : step > s.n ? 'var(--accent)' : 'var(--border)',
                color: step >= s.n ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s', flexShrink: 0,
              }}
            >
              {step > s.n ? '✓' : s.n}
            </div>
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: step === s.n ? 700 : 400, color: step === s.n ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > s.n ? 'var(--accent)' : 'var(--border)', margin: '0 12px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Message flash */}
      {msg && (
        <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg.text}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {msg.type === 'ok' && savedId && (
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/taches')}>Voir les tâches →</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setMsg(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Blocage wizard — champs critiques manquants */}
      {wizardBlock && (
        <div style={{ background: '#fff7ed', border: '1px solid #f59e0b', borderRadius: 8, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🔴</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Profil client incomplet — wizard bloqué</div>
            <div style={{ fontSize: 13, color: '#78350f', marginBottom: 8 }}>
              Champs critiques manquants : <strong>{wizardBlock.manquants.join(', ')}</strong>
            </div>
            <div style={{ fontSize: 12, color: '#92400e' }}>
              Complétez la fiche client avant de lancer le dimensionnement.
            </div>
          </div>
          <a
            href={`/clients/${wizardBlock.clientId}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            style={{ background: '#f59e0b', color: '#fff', border: 'none', flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
          >
            Compléter la fiche →
          </a>
        </div>
      )}

      {/* Corps */}
      <div className="card">
        <div className="card-body">
          {step === 1 && <Step1 data={formData} onChange={updateForm} clients={clients} />}
          {step === 2 && <Step2 data={formData} onChange={updateForm} />}
          {step === 3 && (
            <Step3
              data={formData}
              lignes={displayLignes}
              onChange={updateForm}
              onSave={handleSave}
              onCreateDevis={() => handleCreateDocument('devis')}
              onCreateLdm={() => handleCreateDocument('ldm')}
              saving={saving}
              savedId={savedId}
              tauxHoraires={tauxHoraires}
            />
          )}
        </div>

        {/* Navigation */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            style={{ visibility: step === 1 ? 'hidden' : 'visible' }}
          >
            ← Précédent
          </button>

          {step < 3 ? (
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (step === 1 && formData.client_id) {
                  try {
                    const { data } = await api.get(`/clients/${formData.client_id}/wizard-readiness`);
                    if (!data.ok) {
                      const labels = { forme_juridique: 'Forme juridique', regime_fiscal: 'Régime fiscal', regime_tva: 'Régime TVA', periodicite_tva: 'Périodicité TVA' };
                      setWizardBlock({ clientId: formData.client_id, manquants: data.manquants.map(k => labels[k] || k) });
                      return;
                    }
                  } catch { /* continuer en mode dégradé si l'API échoue */ }
                }
                setWizardBlock(null);
                setStep(s => s + 1);
              }}
            >
              Suivant →
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => navigate('/taches')}
            >
              Voir les tâches →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
