import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function PortalLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await api.post('/portal/login', form);
      localStorage.setItem('portal_token', r.data.token);
      localStorage.setItem('portal_client', JSON.stringify(r.data.client));
      navigate('/portail/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Identifiants incorrects');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4f8' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', width: 400, boxShadow: '0 10px 40px rgba(15,31,75,.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#0f1f4b' }}>ParFi<span style={{ color: '#00b4d8' }}>.</span></div>
          <div style={{ fontSize: 13, color: '#6b7c93', marginTop: 4 }}>Espace client sécurisé</div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={login}>
          <div className="form-group">
            <label className="form-label">Adresse e-mail</label>
            <input type="email" className="form-control" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input type="password" className="form-control" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <a href="/login" style={{ fontSize: 12, color: '#6b7c93', textDecoration: 'none' }}>Accès collaborateurs →</a>
        </div>
      </div>
    </div>
  );
}
