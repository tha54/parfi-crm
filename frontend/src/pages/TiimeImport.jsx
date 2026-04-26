import { useState, useRef } from 'react';
import api from '../services/api';

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ step }) {
  const labels = ['Chargement', 'Aperçu', 'Résultat'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {labels.map((label, i) => {
        const n = i + 1;
        const active = step >= n;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: active ? '#0F1F4B' : '#e2e8f0',
              color: active ? '#fff' : '#94a3b8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, flexShrink: 0,
            }}>{n}</div>
            <span style={{
              margin: '0 12px', fontSize: 13,
              fontWeight: step === n ? 600 : 400,
              color: active ? '#0F1F4B' : '#94a3b8',
            }}>{label}</span>
            {i < labels.length - 1 && (
              <div style={{ width: 32, height: 2, background: step > n ? '#0F1F4B' : '#e2e8f0', marginRight: 12 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function KPI({ value, label, color }) {
  return (
    <div className="kpi-card" style={{ flex: 1, minWidth: 100, borderTop: `3px solid ${color}` }}>
      <div className="kpi-value" style={{ color, fontSize: 26 }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function Alert({ type, children, onClose }) {
  const styles = {
    warning: { bg: '#fffbeb', border: '#fbbf24', color: '#92400e' },
    error:   { bg: '#fef2f2', border: '#f87171', color: '#991b1b' },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
      padding: '12px 16px', marginBottom: 16, fontSize: 13, color: s.color,
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && (
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.color, fontWeight: 700, fontSize: 16, padding: 0 }}>×</button>
      )}
    </div>
  );
}

export default function TiimeImport() {
  const [step, setStep] = useState(1);
  const [csvText, setCsvText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef(null);

  // ── File loading ────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target?.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file, 'ISO-8859-1'); // Tiime exports ISO-8859-1
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFileChange(e);
  };

  const loadServerFile = async () => {
    setLoadingFile(true);
    setError('');
    try {
      const { data } = await api.get('/tiime/server-file');
      setCsvText(data.text);
    } catch (err) {
      setError(err.response?.data?.message || 'Impossible de charger le fichier serveur');
    } finally {
      setLoadingFile(false);
    }
  };

  // ── Step 1 → 2: analyze ─────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!csvText.trim()) { setError('Veuillez charger ou coller un fichier CSV.'); return; }
    setError('');
    setAnalyzing(true);
    try {
      const { data } = await api.post('/tiime/analyze', { csv: csvText });
      setAnalysis(data);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Step 2 → 3: import ──────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      const { data } = await api.post('/tiime/import', {
        csv: csvText,
        options: { includeArchived },
      });
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const restart = () => {
    setStep(1); setCsvText(''); setAnalysis(null);
    setResult(null); setError(''); setShowErrors(false);
  };

  const downloadErrorLog = () => {
    if (!result?.errorLog?.length) return;
    const content = result.errorLog
      .map(e => `Ligne ${e.row} | ${e.nom} | SIREN ${e.siren} | ${e.reason}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tiime-import-erreurs.txt';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page-header">
        <h1>Import Tiime</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
          Import du fichier export dossiers CSV
        </span>
      </div>

      <div className="page-body">
        <Steps step={step} />

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {/* ════════════════════════════════════════════════════════════════════
            STEP 1 — Load file
        ════════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Drop zone */}
            <div className="card">
              <div className="card-header"><strong>Charger le fichier CSV Tiime</strong></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? '#0F1F4B' : '#cbd5e1'}`,
                    borderRadius: 12, padding: '36px 24px', textAlign: 'center',
                    cursor: 'pointer', background: dragging ? '#f0f4ff' : '#f8fafc',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📥</div>
                  <div style={{ fontWeight: 600, color: '#0F1F4B', marginBottom: 4 }}>
                    Glissez votre fichier CSV ici
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ou cliquez pour sélectionner — encodage ISO-8859-1 géré automatiquement
                  </div>
                  <input
                    ref={fileInputRef} type="file" accept=".csv,text/csv"
                    style={{ display: 'none' }} onChange={handleFileChange}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <hr style={{ flex: 1, borderColor: '#e2e8f0' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ou</span>
                  <hr style={{ flex: 1, borderColor: '#e2e8f0' }} />
                </div>

                <button
                  className="btn btn-ghost"
                  onClick={loadServerFile}
                  disabled={loadingFile}
                  style={{ alignSelf: 'center' }}
                >
                  {loadingFile ? '⏳ Chargement…' : '🖥️ Charger le fichier serveur (export_dossiers_20260426.csv)'}
                </button>

                {csvText && (
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
                    padding: '10px 14px', fontSize: 13, color: '#166534',
                  }}>
                    ✓ Fichier chargé — {csvText.split('\n').length} lignes brutes détectées
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            <div className="card">
              <div className="card-header"><strong>Options d'import</strong></div>
              <div className="card-body">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={e => setIncludeArchived(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>Importer aussi les dossiers <strong>Fin de mission</strong> (archivés, actif = 0)</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={analyzing || !csvText.trim()}
              >
                {analyzing ? '⏳ Analyse en cours…' : '🔍 Analyser le fichier'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            STEP 2 — Preview & confirm
        ════════════════════════════════════════════════════════════════════ */}
        {step === 2 && analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <KPI value={analysis.total}     label="Total dossiers"          color="#0F1F4B" />
              <KPI value={analysis.actif}     label="Actifs à importer"       color="#10b981" />
              <KPI value={analysis.archive}   label="Archivés (Fin mission)"  color="#f59e0b" />
              <KPI value={analysis.prospects} label="Prospects (Création)"    color="#8b5cf6" />
              <KPI value={analysis.duplicates} label="Doublons (SIREN exist.)" color="#ef4444" />
            </div>

            {/* Sensitive notes warning */}
            {analysis.hasSensitiveNotes && (
              <Alert type="warning">
                <strong>⚠️ Données sensibles détectées</strong><br />
                Le champ "Note dossier" contient des données potentiellement sensibles (identifiants, mots de passe, numéros URSSAF…).
                Ces notes seront stockées chiffrées (AES-256-GCM) dans le champ <code>notes_sensibles</code>.
                Vérifiez les droits d'accès à votre base de données avant de continuer.
              </Alert>
            )}

            {/* Unmatched users warning */}
            {analysis.unmatchedUsers?.length > 0 && (
              <Alert type="info">
                <strong>Collaborateurs non reconnus</strong> — les noms suivants ne correspondent à aucun utilisateur CRM et ne seront pas attribués :<br />
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {analysis.unmatchedUsers.join(', ')}
                </span>
              </Alert>
            )}

            {/* Preview table */}
            <div className="card">
              <div className="card-header">
                <strong>Aperçu — 10 premiers dossiers actifs</strong>
                <span className="text-muted text-sm">{analysis.actif} dossiers actifs au total</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Nom / Code</th>
                      <th>Raison sociale</th>
                      <th>SIREN</th>
                      <th>Forme jur.</th>
                      <th>Ville</th>
                      <th>Type CRM</th>
                      <th>Régime TVA</th>
                      <th>Régime fiscal</th>
                      <th>Groupe</th>
                      <th>Expert</th>
                      <th>Doublon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.preview.map((row, i) => (
                      <tr key={i} style={{ background: row.isDuplicate ? '#fff7ed' : undefined }}>
                        <td><strong style={{ fontSize: 13 }}>{row.nom}</strong></td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.raison_sociale || '—'}</td>
                        <td><code style={{ fontSize: 11 }}>{row.siren || '—'}</code></td>
                        <td style={{ fontSize: 12 }}>{row.forme_juridique || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.ville || '—'}</td>
                        <td>
                          <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 11 }}>
                            {row.type}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{row.regime_tva || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.regime_fiscal || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.groupe || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.expert || '—'}</td>
                        <td>
                          {row.isDuplicate
                            ? <span className="badge" style={{ background: '#fff7ed', color: '#c2410c', fontSize: 11 }}>⚠️ Doublon</span>
                            : <span className="badge" style={{ background: '#f0fdf4', color: '#166534', fontSize: 11 }}>✓ Nouveau</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import summary */}
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
              padding: '16px 20px', fontSize: 13,
            }}>
              <strong style={{ display: 'block', marginBottom: 8, color: '#0F1F4B' }}>Résumé de l'import prévu</strong>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                <li><strong style={{ color: '#10b981' }}>{analysis.actif - analysis.duplicates}</strong> dossiers actifs seront créés comme clients</li>
                {includeArchived && <li><strong style={{ color: '#f59e0b' }}>{analysis.archive}</strong> dossiers archivés seront créés (actif = 0)</li>}
                {analysis.prospects > 0 && <li><strong style={{ color: '#8b5cf6' }}>{analysis.prospects}</strong> dossier(s) en création seront importés comme prospects</li>}
                <li><strong style={{ color: '#ef4444' }}>{analysis.duplicates}</strong> doublon(s) SIREN seront ignorés</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Retour</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing}
                style={{ minWidth: 200 }}
              >
                {importing
                  ? '⏳ Import en cours…'
                  : `Importer ${analysis.actif - analysis.duplicates + (includeArchived ? analysis.archive : 0)} dossiers`
                }
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            STEP 3 — Result
        ════════════════════════════════════════════════════════════════════ */}
        {step === 3 && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <h2 style={{ color: '#0F1F4B', marginBottom: 24 }}>Import terminé</h2>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                  <KPI value={result.created}   label="Clients créés"    color="#10b981" />
                  {result.archived > 0 && <KPI value={result.archived} label="Archivés créés" color="#f59e0b" />}
                  {result.prospects > 0 && <KPI value={result.prospects} label="Prospects créés" color="#8b5cf6" />}
                  <KPI value={result.skipped}   label="Ignorés (doublons / archivés)" color="#94a3b8" />
                  <KPI value={result.errors}    label="Erreurs"          color={result.errors > 0 ? '#ef4444' : '#94a3b8'} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  {result.created} client(s) importés · {result.skipped} ignoré(s) · {result.errors} erreur(s)
                </div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={restart}>🔄 Nouvel import</button>
                  {result.errors > 0 && (
                    <button className="btn btn-ghost" onClick={downloadErrorLog}>
                      📄 Télécharger le rapport d'erreurs
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Error log */}
            {result.errorLog?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <strong style={{ color: '#991b1b' }}>Journal des erreurs ({result.errorLog.length})</strong>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowErrors(v => !v)}
                  >
                    {showErrors ? 'Masquer' : 'Afficher'}
                  </button>
                </div>
                {showErrors && (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Ligne CSV</th>
                          <th>Nom</th>
                          <th>SIREN</th>
                          <th>Raison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errorLog.map((e, i) => (
                          <tr key={i} style={{ background: '#fef2f2' }}>
                            <td style={{ fontSize: 12, fontFamily: 'monospace' }}>#{e.row}</td>
                            <td style={{ fontSize: 13 }}>{e.nom}</td>
                            <td><code style={{ fontSize: 11 }}>{e.siren}</code></td>
                            <td style={{ fontSize: 12, color: '#991b1b' }}>{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
