import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMicroPortalAuth } from '../context/MicroPortalAuthContext';

export default function MicroPortalLogin() {
  const { login } = useMicroPortalAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/micro-portail/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0F1F4B 0%, #1e3a8a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, background: '#fff', borderRadius: 16,
            fontSize: 28, marginBottom: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}>🧾</div>
          <h1 style={{ margin: 0, color: '#fff', fontSize: 22, fontWeight: 700 }}>Espace Micro-Entrepreneur</h1>
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: 14 }}>
            Parfi France — Gestion de votre activité
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 36px', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
          <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: '#111827' }}>Connexion</h2>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 18, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Adresse e-mail
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus
                placeholder="votre@email.fr"
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
                  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Mot de passe
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
                  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
                  outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '12px', background: '#0F1F4B',
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 15,
                fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.8 : 1, transition: 'opacity 0.2s',
              }}
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 20 }}>
          Accès réservé aux clients micro-entrepreneurs du cabinet Parfi France
        </p>
      </div>
    </div>
  );
}
