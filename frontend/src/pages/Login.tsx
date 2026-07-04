import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = 'http://localhost:3000';

interface Tenant {
  id: number;
  name: string;
  code: string;
}

export default function Login() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | ''>('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { setAuth } = useAuth();
  const navigate = useNavigate();

  // Fetch tenants on mount
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/tenants`);
        setTenants(res.data.tenants);
        if (res.data.tenants.length > 0) {
          setSelectedTenantId(res.data.tenants[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch tenants:', err);
      }
    };
    fetchTenants();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !identifier || !password) return;
    setError('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        tenant_id: Number(selectedTenantId),
        email_or_mobile: identifier,
        password,
      });

      setAuth({
        user: res.data.user,
        tenantId: String(selectedTenantId),
        accessToken: res.data.accessToken,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Sorry, your password was incorrect. Please double-check your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <span className="login-logo-icon">🍽</span>
            Central Kitchen
          </div>
        </div>

        <form onSubmit={handleLogin} noValidate>
          {/* Central Kitchen Dropdown */}
          <div className="login-field">
            <div className="login-select-wrap">
              <select
                className="login-select"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(Number(e.target.value))}
                required
              >
                {tenants.length === 0 ? (
                  <option value="" disabled>Loading kitchens...</option>
                ) : (
                  tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Email / Mobile */}
          <div className="login-field">
            <input
              type="text"
              className="login-input"
              placeholder="Email or Mobile number"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          {/* Password */}
          <div className="login-field">
            <input
              type="password"
              className="login-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="login-btn"
            disabled={loading || !identifier || !password || !selectedTenantId}
          >
            {loading ? <span className="spinner" /> : 'Log In'}
          </button>

          {/* Error message */}
          <div className="login-error">
            {error && <span>{error}</span>}
          </div>

          <div className="login-divider">or</div>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.75rem' }}>
          <Link to="/forgot-password" style={{ textDecoration: 'none', color: 'var(--blue)' }}>Forgot password?</Link>
        </div>
      </div>

      {/* <div className="login-footer-card">
        Don't have an account? <strong>Sign up</strong>
      </div> */}

      <div className="login-tagline">
        © 2026 Central Kitchen
      </div>
    </div>
  );
}
