import { useState, useRef } from 'react';
import api from '../services/api';

const CRM_FIELDS = ['nom', 'siren', 'type', 'regime', 'collaborateur', '(ignorer)'];

const FIELD_LABELS = {
  nom: 'Raison sociale',
  siren: 'SIREN',
  type: 'Type client',
  regime: 'Régime TVA',
  collaborateur: 'Collaborateur',
};

function StepIndicator({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {[1, 2].map((n, i) => (
        <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: step >= n ? '#0F1F4B' : '#e2e8f0',
            color: step >= n ? '#fff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            transition: 'background 0.2s',
          }}>
            {n}
          </div>
          <span style={{ marginLeft: 8, marginRight: i === 0 ? 0 : 0, fontSize: 13, fontWeight: step === n ? 600 : 400, color: step >= n ? '#0F1F4B' : '#94a3b8' }}>
            {n === 1 ? 'Analyse' : 'Import'}
          </span>
          {i === 0 && (
            <div style={{ width: 48, height: 2, background: step > 1 ? '#0F1F4B' : '#e2e8f0', margin: '0 12px', transition: 'background 0.2s' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function TiimeImport() {
  const [step, setStep] = useState(1);
  const [csvText, setCsvText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState(null); // { headers, rows, validRows, errorRows }
  const [mapping, setMapping] = useState({}); // header -> CRM field
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { created, ignored, errors }
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file, 'UTF-8');
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const handleAnalyze = async () => {
    if (!csvText.trim()) { setError('Veuillez coller ou charger un fichier CSV.'); return; }
    setError('');
    setAnalyzing(true);
    try {
      const { data } = await api.post('/tiime/preview', { csv: csvText });
      setPreview(data);
      // Auto-build mapping from detected headers
      const autoMap = {};
      (data.headers || []).forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes('nom') || lower.includes('raison') || lower.includes('client')) autoMap[h] = 'nom';
        else if (lower.includes('siren')) autoMap[h] = 'siren';
        else if (lower.includes('type') || lower.includes('forme')) autoMap[h] = 'type';
        else if (lower.includes('regime') || lower.includes('régime') || lower.includes('tva')) autoMap[h] = 'regime';
        else if (lower.includes('collab') || lower.includes('gestionnaire')) autoMap[h] = 'collaborateur';
        else autoMap[h] = '(ignorer)';
      });
      setMapping(autoMap);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'analyse du CSV');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      // Apply mapping to valid rows
      const mappedRows = (preview.validRows || preview.rows?.filter((r) => !r._error) || []).map((row) => {
        const mapped = {};
        Object.entries(mapping).forEach(([header, field]) => {
          if (field && field !== '(ignorer)') mapped[field] = row[header] ?? row;
        });
        return Object.keys(mapped).length > 0 ? mapped : row;
      });

      const { data } = await api.post('/tiime/import', { rows: mappedRows });
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Erreur lors de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const restart = () => {
    setStep(1);
    setCsvText('');
    setPreview(null);
    setMapping({});
    setResult(null);
    setError('');
  };

  const allRows = preview?.rows || [];
  const validRows = preview?.validRows || allRows.filter((r) => !r._error);
  const errorRows = preview?.errorRows || allRows.filter((r) => r._error);
  const headers = preview?.headers || [];

  return (
    <>
      <div className="page-header">
        <h1>Import Tiime</h1>
      </div>

      <div className="page-body">
        <StepIndicator step={step > 2 ? 3 : step} />

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
            {error}
            <button style={{ marginLeft: 12, cursor: 'pointer', border: 'none', background: 'none', color: '#991b1b', fontWeight: 600 }} onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* ── STEP 1: Upload & Preview ── */}
        {step === 1 && (
          <div className="card">
            <div className="card-header"><strong>Étape 1 — Charger le fichier CSV Tiime</strong></div>
            <div className="card-body">
              {/* Drop zone */}
              <div
                onDrop={handleFileDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#0F1F4B' : '#cbd5e1'}`,
                  borderRadius: 12,
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? '#f0f4ff' : '#f8fafc',
                  transition: 'all 0.15s',
                  marginBottom: 20,
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 10 }}>📥</div>
                <div style={{ fontWeight: 600, color: '#0F1F4B', marginBottom: 6 }}>
                  Glissez-déposez votre fichier CSV ici
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  ou cliquez pour sélectionner un fichier
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleFileDrop}
                />
              </div>

              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                — ou collez le contenu CSV directement —
              </div>

              <div className="form-group">
                <textarea
                  className="form-control"
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={'nom,siren,type,regime,collaborateur\n"SARL Exemple","123456789","BIC","mensuel","Martin"\n…'}
                  style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleAnalyze}
                  disabled={analyzing || !csvText.trim()}
                >
                  {analyzing ? 'Analyse en cours…' : '🔍 Analyser'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Confirm mapping & import ── */}
        {step === 2 && preview && (
          <>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <div className="kpi-card" style={{ flex: 1, borderTop: '3px solid #10b981' }}>
                <div className="kpi-value" style={{ color: '#10b981' }}>{validRows.length}</div>
                <div className="kpi-label">Lignes valides</div>
              </div>
              <div className="kpi-card" style={{ flex: 1, borderTop: '3px solid #ef4444' }}>
                <div className="kpi-value" style={{ color: '#ef4444' }}>{errorRows.length}</div>
                <div className="kpi-label">Erreurs</div>
              </div>
              <div className="kpi-card" style={{ flex: 1, borderTop: '3px solid #0F1F4B' }}>
                <div className="kpi-value" style={{ color: '#0F1F4B' }}>{allRows.length}</div>
                <div className="kpi-label">Total lignes</div>
              </div>
            </div>

            {/* Column mapping */}
            {headers.length > 0 && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><strong>Correspondance des colonnes</strong></div>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                    {headers.map((h) => (
                      <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace', color: '#0F1F4B', fontWeight: 600 }}>{h}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
                        <select
                          className="form-control"
                          style={{ flex: 1 }}
                          value={mapping[h] || '(ignorer)'}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                        >
                          {CRM_FIELDS.map((f) => (
                            <option key={f} value={f}>{f === '(ignorer)' ? '(ignorer)' : FIELD_LABELS[f] || f}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Preview table */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><strong>Aperçu des données</strong></div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      {headers.map((h) => <th key={h}>{h}</th>)}
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.slice(0, 50).map((row, i) => (
                      <tr
                        key={i}
                        style={{ background: row._error ? '#fef2f2' : undefined }}
                        title={row._error || undefined}
                      >
                        {headers.map((h) => (
                          <td key={h} style={{ fontSize: 13 }}>{row[h] ?? '—'}</td>
                        ))}
                        <td>
                          {row._error ? (
                            <span className="badge" style={{ background: '#fef2f2', color: '#991b1b' }} title={row._error}>
                              ⚠️ Erreur
                            </span>
                          ) : (
                            <span className="badge" style={{ background: '#f0fdf4', color: '#166534' }}>✓ Valide</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {allRows.length > 50 && (
                  <div style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                    … et {allRows.length - 50} ligne(s) supplémentaire(s) non affichées.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>← Retour</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
              >
                {importing ? 'Import en cours…' : `Importer ${validRows.length} client(s)`}
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: Result ── */}
        {step === 3 && result && (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ color: '#0F1F4B', marginBottom: 24 }}>Import terminé</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 32 }}>
                <div className="kpi-card" style={{ minWidth: 120, borderTop: '3px solid #10b981' }}>
                  <div className="kpi-value" style={{ color: '#10b981' }}>{result.created ?? 0}</div>
                  <div className="kpi-label">Créés</div>
                </div>
                <div className="kpi-card" style={{ minWidth: 120, borderTop: '3px solid #f59e0b' }}>
                  <div className="kpi-value" style={{ color: '#f59e0b' }}>{result.ignored ?? 0}</div>
                  <div className="kpi-label">Ignorés</div>
                </div>
                <div className="kpi-card" style={{ minWidth: 120, borderTop: '3px solid #ef4444' }}>
                  <div className="kpi-value" style={{ color: '#ef4444' }}>{result.errors ?? 0}</div>
                  <div className="kpi-label">Erreurs</div>
                </div>
              </div>
              <button className="btn btn-primary" onClick={restart}>🔄 Recommencer</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
