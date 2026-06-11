import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const MicroPortalAuthContext = createContext(null);

const portalApi = axios.create({ baseURL: '/api/micro-portail' });

portalApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('parfi_micro_portail_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export const crmApi = axios.create({ baseURL: '/api' });

crmApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('parfi_micro_portail_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export function MicroPortalAuthProvider({ children }) {
  const [portalUser, setPortalUser] = useState(null);
  const [portalToken, setPortalToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('parfi_micro_portail_token');
    const storedUser = localStorage.getItem('parfi_micro_portail_user');
    if (stored && storedUser) {
      setPortalToken(stored);
      try { setPortalUser(JSON.parse(storedUser)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const res = await portalApi.post('/login', { email, password });
    const { token, micro_client } = res.data;
    localStorage.setItem('parfi_micro_portail_token', token);
    localStorage.setItem('parfi_micro_portail_user', JSON.stringify(micro_client));
    setPortalToken(token);
    setPortalUser(micro_client);
    return micro_client;
  };

  const logout = () => {
    localStorage.removeItem('parfi_micro_portail_token');
    localStorage.removeItem('parfi_micro_portail_user');
    setPortalToken(null);
    setPortalUser(null);
  };

  return (
    <MicroPortalAuthContext.Provider value={{ portalUser, portalToken, login, logout, loading, portalApi }}>
      {children}
    </MicroPortalAuthContext.Provider>
  );
}

export const useMicroPortalAuth = () => useContext(MicroPortalAuthContext);
export { portalApi };
