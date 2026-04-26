import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  bilan: '📊 Bilan', liasse: '📋 Liasse', facture: '🧾 Facture', ldm: '📄 LDM',
  courrier: '✉️ Courrier', contrat: '📝 Contrat', releve_bancaire: '🏦 Relevé bancaire',
  bulletin_paie: '💸 Bulletin paie', autre: '📁 Autre',
};
const MIME_ICONS = { 'application/pdf': '📄', 'image/': '🖼', 'application/vnd.openxmlformats': '📝' };

function getMimeIcon(mime) {
  for (const [k, v] of Object.entries(MIME_ICONS)) {
    if (mime?.startsWith(k)) return v;
  }
  return '📁';
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} Ko`;
  return `${(bytes/1048576).toFixed(1)} Mo`;
}

function UploadZone({ clientId, clients, onUploaded }) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [selClient, setSelClient] = useState(clientId || '');
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...dropped]);
  };

  const uploadAll = async () => {
    if (!files.length) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(p => ({ ...p, [i]: 'uploading' }));
      const fd = new FormData();
      fd.append('file', file);
      if (selClient) fd.append('client_id', selClient);
      try {
        await api.post('/ged/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setProgress(p => ({ ...p, [i]: 'done' }));
      } catch {
        setProgress(p => ({ ...p, [i]: 'error' }));
      }
    }
    setUploading(false);
    setTimeout(() => { setFiles([]); setProgress({}); onUploaded(); }, 1000);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {!clientId && (
        <div style={{ marginBottom: 12 }}>
          <select className="form-control" style={{ width: 250 }} value={selClient} onChange={e => setSelClient(e.target.value)}>
            <option value="">Sélectionner un client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? '#00b4d8' : '#e5e7eb'}`,
          borderRadius: 12, padding: '32px 20px', textAlign: 'center',
          cursor: 'pointer', background: dragging ? '#f0fdff' : '#fafafa',
          transition: 'all .2s',
        }}
      >
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }}
          onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files)])} />
        <div style={{ fontSize: 32 }}>📁</div>
        <div style={{ fontWeight: 600, color: '#0f1f4b', marginTop: 8 }}>Glissez-déposez vos fichiers</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>PDF, Word, Excel, images — 50 Mo max par fichier</div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', background: '#f9fafb', borderRadius: 6, marginBottom: 4 }}>
              <span>{getMimeIcon(f.type)}</span>
              <span style={{ flex: 1, fontSize: 12 }}>{f.name}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{formatSize(f.size)}</span>
              <span style={{ fontSize: 11 }}>
                {progress[i] === 'done' ? '✅' : progress[i] === 'error' ? '❌' : progress[i] === 'uploading' ? '⏳' : ''}
              </span>
            </div>
          ))}
          <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }}
            onClick={uploadAll} disabled={uploading}>
            {uploading ? '⏳ Upload en cours…' : `📤 Uploader ${files.length} fichier(s)`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function GED({ clientId: propClientId }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterAnnee, setFilterAnnee] = useState('');
  const [filterClient, setFilterClient] = useState(propClientId || '');
  const [sharing, setSharing] = useState(null);
  const [shareResult, setShareResult] = useState(null);

  const canManage = ['expert', 'chef_mission'].includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.type_document = filterType;
      if (filterAnnee) params.annee_fiscale = filterAnnee;
      if (filterClient) params.client_id = filterClient;
      const [docs, cl] = await Promise.all([
        api.get('/ged', { params }).then(r => r.data),
        api.get('/clients').then(r => r.data).catch(() => []),
      ]);
      setDocuments(docs);
      setClients(cl);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterType, filterAnnee, filterClient]);

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults(null); return; }
    const r = await api.get('/ged/search', { params: { q: search } }).catch(() => ({ data: [] }));
    setSearchResults(r.data);
  };

  const download = (id) => {
    window.open(`/api/ged/${id}/download?token=${localStorage.getItem('token')}`, '_blank');
  };

  const share = async (id) => {
    setSharing(id);
    const r = await api.post(`/ged/${id}/share`, { duree: '7d' }).catch(() => null);
    if (r) setShareResult({ id, url: `${window.location.origin}${r.data.shareUrl}`, expires: r.data.expires });
    setSharing(null);
  };

  const deleteDoc = async (id) => {
    if (!confirm('Supprimer ce document ?')) return;
    await api.delete(`/ged/${id}`).catch(() => {});
    load();
  };

  const displayDocs = searchResults || documents;

  if (loading) return <div className="spinner"><div className="spinner-ring" /></div>;

  return (
    <>
      {!propClientId && (
        <div className="page-header">
          <h1>GED — Documents</h1>
        </div>
      )}

      <div className={propClientId ? '' : 'page-body'}>
        <UploadZone clientId={propClientId} clients={clients} onUploaded={load} />

        {/* Search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="form-control search-input" placeholder="Rechercher dans les documents…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={handleSearch}>🔍</button>
          {searchResults && <button className="btn btn-ghost btn-sm" onClick={() => { setSearchResults(null); setSearch(''); }}>✕</button>}
        </div>

        {/* Filters */}
        {!propClientId && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ paddingTop: 12, paddingBottom: 12 }}>
              <div className="filters-bar">
                <select className="form-control" style={{ width: 200 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
                  <option value="">Tous les clients</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
                <select className="form-control" style={{ width: 180 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">Tous les types</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select className="form-control" style={{ width: 120 }} value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}>
                  <option value="">Toutes années</option>
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {shareResult && (
          <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#166534', marginBottom: 4 }}>✅ Lien de partage créé (7 jours)</div>
            <input className="form-control" value={shareResult.url} readOnly style={{ fontSize: 11 }} onClick={e => e.target.select()} />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setShareResult(null)}>Fermer</button>
          </div>
        )}

        {/* Document list */}
        {displayDocs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📁</div>
            <p>{searchResults ? 'Aucun résultat' : 'Aucun document'}</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Type</th>
                      <th>Année</th>
                      {!propClientId && <th>Client</th>}
                      <th>Taille</th>
                      <th>Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDocs.map(doc => (
                      <tr key={doc.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{getMimeIcon(doc.mimeType)}</span>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{doc.nom}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>{TYPE_LABELS[doc.type_document] || doc.type_document || doc.type}</span>
                        </td>
                        <td>{doc.annee_fiscale || '—'}</td>
                        {!propClientId && <td>{doc.client_nom || '—'}</td>}
                        <td style={{ fontSize: 12, color: '#6b7c93' }}>{formatSize(doc.taille)}</td>
                        <td style={{ fontSize: 12 }}>{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td>
                          <div className="td-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/api/ged/${doc.id}/download`, '_blank')}>📥</button>
                            {canManage && (
                              <>
                                <button className="btn btn-ghost btn-sm" title="Partager" onClick={() => share(doc.id)} disabled={sharing === doc.id}>🔗</button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc.id)}>🗑</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
