import { useState, useRef } from 'react';
import api from '../services/api';

// ─── Step indicator ───────────────────────────────────────────────────────────
function Steps({ step }) {
  const labels = ['Chargement', 'Aperçu', 'Résultat'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: step >= n ? '#0F1F4B' : '#e2e8f0',
              color: step >= n ? '#fff' : '#94a3b8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14,
            }}>
              {done ? '✓' : n}
            </div>
            <span style={{
              margin: '0 10px', fontSize: 13,
              fontWeight: active ? 700 : 400,
              color: step >= n ? '#0F1F4B' : '#94a3b8',
            }}>{label}</span>
            {i < labels.length - 1 && (
              <div style={{ width: 40, height: 2, background: step > n ? '#0F1F4B' : '#e2e8f0', marginRight: 10 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function KPI({ value, label, color, sub }) {
  return (
    <div className="kpi-card" style={{ flex: '1 1 120px', borderTop: `3px solid ${color}` }}>
      <div className="kpi-value" style={{ color, fontSize: 28 }}>{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Alert({ type, children }) {
  const styles = {
    warning: { bg: '#fffbeb', border: '#fbbf24', color: '#92400e', icon: '⚠️' },
    error:   { bg: '#fef2f2', border: '#f87171', color: '#991b1b', icon: '❌' },
    info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: '✓' },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8,
      padding: '12px 16px', marginBottom: 14, fontSize: 13, color: s.color,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <span>{s.icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

export default function TiimeImport() {
  const [step, setStep]                   = useState(1);
  const [source, setSource]               = useState(null); // 'server' | 'upload'
  const [uploadedFile, setUploadedFile]   = useState(null); // File object
  const [dragging, setDragging]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [importing, setImporting]         = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [analysis, setAnalysis]           = useState(null);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState('');
  const [showErrors, setShowErrors]       = useState(false);
  const fileInputRef = useRef(null);

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const analyzeServerFile = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/tiime/server-analyze');
      setAnalysis(data);
      setSource('server');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'analyse du fichier serveur');
    } finally {
      setLoading(false);
    }
  };

  const analyzeUploadedFile = async (file) => {
    if (!file) return;
    setLoading(true); setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/tiime/upload-analyze', fd);
      setAnalysis(data);
      setUploadedFile(file);
      setSource('upload');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'analyse du fichier');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (file) => {
    if (file) analyzeUploadedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) analyzeUploadedFile(file);
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true); setError('');
    try {
      let data;
      if (source === 'server') {
        const resp = await api.get(`/tiime/server-import?includeArchived=${includeArchived}`);
        data = resp.data;
      } else {
        const fd = new FormData();
        fd.append('file', uploadedFile);
        const resp = await api.post(`/tiime/upload-import?includeArchived=${includeArchived}`, fd);
        data = resp.data;
      }
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || "Erreur lors de l'import");
    } finally {
      setImporting(false);
    }
  };

  const restart = () => {
    setStep(1); setSource(null); setUploadedFile(null);
    setAnalysis(null); setResult(null); setError(''); setShowErrors(false);
  };

  const downloadErrors = () => {
    if (!result?.errorLog?.length) return;
    const lines = result.errorLog.map(e => `Ligne ${e.row}\t${e.nom}\t${e.siren}\t${e.reason}`);
    const blob = new Blob([['Ligne\tNom\tSIREN\tRaison', ...lines].join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tiime-erreurs.txt';
    a.click();
  };

  const expectedImport = analysis
    ? (analysis.actif - analysis.duplicates) + (includeArchived ? analysis.archive : 0)
    : 0;

  return (
    <>
      <div className="page-header">
        <h1>Import Tiime</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Encodage ISO-8859-1 · Séparateur point-virgule · csv-parse RFC 4180
        </span>
      </div>

      <div className="page-body">
        <Steps step={step} />

        {error && <Alert type="error">{error}</Alert>}

        {/* ════════════════════════════ STEP 1 ════════════════════════════ */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Server file shortcut */}
            <div className="card">
              <div className="card-header"><strong>🖥️ Fichier serveur</strong></div>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>export_dossiers_20260426.csv</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    /opt/parfi-crm/ · ISO-8859-1 · ~1 500 lignes
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={analyzeServerFile}
                  disabled={loading}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {loading ? '⏳ Analyse…' : '🔍 Analyser ce fichier'}
                </button>
              </div>
            </div>

            {/* Upload zone */}
            <div className="card">
              <div className="card-header"><strong>📁 Importer un autre fichier CSV</strong></div>
              <div className="card-body">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? '#0F1F4B' : '#cbd5e1'}`,
                    borderRadius: 10, padding: '32px 24px', textAlign: 'center',
                    cursor: 'pointer', background: dragging ? '#f0f4ff' : '#f8fafc',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
                  <div style={{ fontWeight: 600, color: '#0F1F4B', marginBottom: 4 }}>
                    Glissez votre fichier CSV ici
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ou cliquez — l'encodage ISO-8859-1 est géré automatiquement côté serveur
                  </div>
                  <input
                    ref={fileInputRef} type="file" accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={e => handleFileChange(e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="card">
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
          </div>
        )}

        {/* ════════════════════════════ STEP 2 ════════════════════════════ */}
        {step === 2 && analysis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <KPI value={analysis.total}     label="Dossiers total"        color="#0F1F4B" />
              <KPI value={analysis.actif}     label="Actifs"                color="#10b981" sub="→ clients" />
              <KPI value={analysis.archive}   label="Fin de mission"        color="#f59e0b" sub={includeArchived ? '→ archivés' : '→ ignorés'} />
              <KPI value={analysis.prospects} label="Création"              color="#8b5cf6" sub="→ prospects" />
              <KPI value={analysis.duplicates}label="Doublons SIREN"        color="#ef4444" sub="→ ignorés" />
            </div>

            {/* Warnings */}
            {analysis.hasSensitiveNotes && (
              <Alert type="warning">
                <strong>Données sensibles détectées dans "Note dossier"</strong><br />
                Ce champ contient des identifiants, mots de passe et numéros personnels.
                Les notes seront <strong>chiffrées (AES-256-GCM)</strong> avant stockage dans la colonne <code>notes_sensibles</code>.
                Le contenu brut ne sera jamais affiché. Seul l'expert-comptable peut les déchiffrer.
              </Alert>
            )}

            {analysis.unmatchedUsers?.length > 0 && (
              <Alert type="info">
                <strong>Collaborateurs non reconnus dans le CRM</strong> — ils ne seront pas attribués :<br />
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {analysis.unmatchedUsers.join(' · ')}
                </span>
              </Alert>
            )}

            {/* Preview table — 5 rows */}
            <div className="card">
              <div className="card-header">
                <strong>Aperçu — 5 premiers dossiers actifs</strong>
                <span className="text-muted text-sm">Données telles qu'elles seront importées</span>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Code / Nom</th>
                      <th>Raison sociale</th>
                      <th>SIREN</th>
                      <th>Forme jur.</th>
                      <th>Ville</th>
                      <th>Type CRM</th>
                      <th>Régime TVA</th>
                      <th>Régime fiscal</th>
                      <th>Expert</th>
                      <th>Groupe</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.preview.map((row, i) => (
                      <tr key={i} style={{ background: row.isDuplicate ? '#fff7ed' : undefined }}>
                        <td>
                          <strong style={{ fontSize: 13 }}>{row.nom}</strong>
                          {row.isDuplicate && (
                            <div>
                              <span style={{ fontSize: 10, background: '#fff7ed', color: '#c2410c', padding: '1px 5px', borderRadius: 4 }}>
                                doublon
                              </span>
                            </div>
                          )}
                        </td>
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
                        <td style={{ fontSize: 12 }}>{row.expert || '—'}</td>
                        <td style={{ fontSize: 12 }}>{row.groupe || '—'}</td>
                        <td>
                          {row.hasNote
                            ? <span title="Contient des notes sensibles — chiffrées au stockage" style={{ fontSize: 14 }}>🔒</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
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
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 10, padding: '16px 20px', fontSize: 13,
            }}>
              <strong style={{ color: '#0F1F4B', display: 'block', marginBottom: 8 }}>
                Résumé — ce qui sera créé
              </strong>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2.2 }}>
                <li>
                  <strong style={{ color: '#10b981' }}>{analysis.actif - analysis.duplicates}</strong>
                  {' '}clients actifs créés
                  {analysis.duplicates > 0 && (
                    <span style={{ color: '#ef4444', marginLeft: 6 }}>
                      ({analysis.duplicates} doublon(s) SIREN ignoré(s))
                    </span>
                  )}
                </li>
                {includeArchived && analysis.archive > 0 && (
                  <li>
                    <strong style={{ color: '#f59e0b' }}>{analysis.archive}</strong>
                    {' '}dossiers archivés créés (actif = 0)
                  </li>
                )}
                {!includeArchived && analysis.archive > 0 && (
                  <li style={{ color: 'var(--text-muted)' }}>
                    {analysis.archive} dossier(s) Fin de mission ignorés
                    <span style={{ marginLeft: 6, fontSize: 11 }}>(cochez l'option pour les inclure)</span>
                  </li>
                )}
                {analysis.prospects > 0 && (
                  <li>
                    <strong style={{ color: '#8b5cf6' }}>{analysis.prospects}</strong>
                    {' '}dossier(s) "Création" → prospects
                  </li>
                )}
                {analysis.hasSensitiveNotes && (
                  <li style={{ color: '#92400e' }}>
                    🔒 Notes sensibles chiffrées avant stockage
                  </li>
                )}
              </ul>

              <div style={{ marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={e => setIncludeArchived(e.target.checked)}
                    style={{ width: 15, height: 15 }}
                  />
                  Inclure les dossiers Fin de mission ({analysis.archive})
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Retour</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || expectedImport === 0}
                style={{ minWidth: 220 }}
              >
                {importing
                  ? '⏳ Import en cours…'
                  : `▶ Importer ${expectedImport} dossier(s)`
                }
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════ STEP 3 ════════════════════════════ */}
        {step === 3 && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-body" style={{ padding: '32px 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ fontSize: 52, marginBottom: 10 }}>
                    {result.errors === 0 ? '✅' : '⚠️'}
                  </div>
                  <h2 style={{ color: '#0F1F4B', marginBottom: 6 }}>Import terminé</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {result.created} client(s) importé(s) ·{' '}
                    {result.skipped} ignoré(s) ·{' '}
                    {result.errors} erreur(s)
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 28 }}>
                  <KPI value={result.created}   label="Clients créés"   color="#10b981" />
                  {result.archived > 0  && <KPI value={result.archived}  label="Archivés créés" color="#f59e0b" />}
                  {result.prospects > 0 && <KPI value={result.prospects} label="Prospects créés" color="#8b5cf6" />}
                  <KPI value={result.skipped}   label="Ignorés"          color="#94a3b8" sub="doublons + archivés" />
                  <KPI value={result.errors}    label="Erreurs"          color={result.errors > 0 ? '#ef4444' : '#94a3b8'} />
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={restart}>🔄 Nouvel import</button>
                  {result.errors > 0 && (
                    <button className="btn btn-ghost" onClick={downloadErrors}>
                      📄 Télécharger rapport d'erreurs
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Error log */}
            {result.errorLog?.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <strong style={{ color: '#991b1b' }}>
                    Erreurs d'import ({result.errorLog.length})
                  </strong>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowErrors(v => !v)}>
                    {showErrors ? 'Masquer' : 'Voir le détail'}
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
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>#{e.row}</td>
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
