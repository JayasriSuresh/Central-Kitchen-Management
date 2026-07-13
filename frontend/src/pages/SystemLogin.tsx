import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const API_URL = 'http://localhost:3000';

export default function SystemLogin() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        tenant_id: null,
        email_or_mobile: identifier,
        password,
      });

      // Verify that this is indeed a system admin user
      if (res.data.user.role_type !== 'system') {
        setError('Unauthorized: This portal is for System Administrators only.');
        setLoading(false);
        return;
      }

      setAuth({
        user: res.data.user,
        tenantId: null,
        accessToken: res.data.accessToken,
        activePortal: 'system',
      });
      navigate('/system');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid system administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '400px', borderRadius: '8px' }}>
        <div className="login-brand" style={{ marginBottom: '2rem' }}>
          <div className="login-logo" style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            <img src="/Qken_logo.svg" alt="Qken" className="login-logo-img" />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
            Enterprise Administration
          </p>
        </div>

        <form onSubmit={handleLogin} className="fade-in">
          <div className="login-field">
            <input
              type="text"
              className="login-input"
              placeholder="Admin Email / Username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="login-field">
            <input
              type="password"
              className="login-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="login-error" style={{ color: 'var(--error)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={loading || !identifier || !password}
            style={{ marginTop: '1rem', background: '#1e293b' }}
          >
            {loading ? <span className="spinner" /> : 'Log In as Master Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
