import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const API_URL = 'http://localhost:3000';

interface Tenant {
  id: number;
  name: string;
  code: string;
}

type LoginMode = 'password' | 'otp';
type OtpStep = 'send' | 'verify';

export default function Login() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | ''>('');
  const [identifier, setIdentifier] = useState('');

  // Password login
  const [password, setPassword] = useState('');

  // OTP login
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState<OtpStep>('send');
  const [otpSentMessage, setOtpSentMessage] = useState('');

  // Shared
  const [mode, setMode] = useState<LoginMode>('password');
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


  const switchMode = (m: LoginMode) => {
    setMode(m);
    setError('');
    setOtp('');
    setOtpStep('send');
    setOtpSentMessage('');
    setPassword('');
  };

  // ── Password login ──────────────────────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
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

      if (res.data.requireWorkspaceSelect) {
        navigate('/choose-workspace', {
          state: {
            workspaceToken: res.data.workspaceToken,
            workspaces: res.data.workspaces,
            user: res.data.user,
            tenantId: String(selectedTenantId),
          }
        });
        return;
      }

      setAuth({
        user: res.data.user,
        tenantId: String(selectedTenantId),
        accessToken: res.data.accessToken,
        activePortal: res.data.user.role_type,
        workspaces: res.data.workspaces,
        permissionCodes: res.data.permissionCodes,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Sorry, your password was incorrect. Please double-check your password.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP login — step 1: send ────────────────────────────────────────────────
  const handleOtpSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !identifier) return;
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login-otp/send`, {
        tenant_id: Number(selectedTenantId),
        email_or_mobile: identifier,
      });
      setOtpSentMessage(res.data.message || 'A 6-digit code has been sent to your email.');
      setOtpStep('verify');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP login — step 2: verify ──────────────────────────────────────────────
  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !identifier || otp.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login-otp/verify`, {
        tenant_id: Number(selectedTenantId),
        email_or_mobile: identifier,
        otp,
      });

      if (res.data.requireWorkspaceSelect) {
        navigate('/choose-workspace', {
          state: {
            workspaceToken: res.data.workspaceToken,
            workspaces: res.data.workspaces,
            user: res.data.user,
            tenantId: String(selectedTenantId),
          }
        });
        return;
      }

      setAuth({
        user: res.data.user,
        tenantId: String(selectedTenantId),
        accessToken: res.data.accessToken,
        activePortal: res.data.user.role_type,
        workspaces: res.data.workspaces,
        permissionCodes: res.data.permissionCodes,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired login code. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  // ── Shared fields (kitchen + identifier) ───────────────────────────────────
  const sharedFields = (
    <>
      {/* Central Kitchen Dropdown */}
      <div className="login-field">
        <div className="login-select-wrap">
          <select
            id="login-tenant"
            className="login-select"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(Number(e.target.value))}
            required
          >
            {tenants.length === 0 ? (
              <option value="">Loading kitchens…</option>
            ) : (
              <>
                <option value="" disabled>Select Central Kitchen</option>
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>


      {/* Email / Mobile */}
      <div className="login-field">
        <input
          id="login-identifier"
          type="text"
          className="login-input"
          placeholder="Email or Mobile number"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
        />
      </div>
    </>
  );

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo">
            <span className="login-logo-icon">🍽</span>
            Central Kitchen
          </div>
        </div>

        {/* Mode tab switcher */}
        <div className="login-tabs" role="tablist" aria-label="Login method">
          <button
            id="tab-password"
            role="tab"
            aria-selected={mode === 'password'}
            className={`login-tab ${mode === 'password' ? 'login-tab--active' : ''}`}
            onClick={() => switchMode('password')}
            type="button"
          >
            Password
          </button>
          <button
            id="tab-otp"
            role="tab"
            aria-selected={mode === 'otp'}
            className={`login-tab ${mode === 'otp' ? 'login-tab--active' : ''}`}
            onClick={() => switchMode('otp')}
            type="button"
          >
            OTP Login
          </button>
        </div>

        {/* ── Password Login ── */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin} noValidate className="fade-in">
            {sharedFields}

            <div className="login-field">
              <input
                id="login-password"
                type="password"
                className="login-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="login-error">
              {error && <span>{error}</span>}
            </div>

            <button
              id="btn-password-login"
              type="submit"
              className="login-btn"
              disabled={loading || !identifier || !password || !selectedTenantId}
            >
              {loading ? <span className="spinner" /> : 'Log In'}
            </button>

            <div className="login-divider">or</div>

            <div style={{ textAlign: 'center', fontSize: '0.75rem' }}>
              <Link to="/forgot-password" style={{ textDecoration: 'none', color: 'var(--blue)' }}>
                Forgot password?
              </Link>
            </div>
          </form>
        )}

        {/* ── OTP Login ── */}
        {mode === 'otp' && (
          <div className="fade-in">
            {otpStep === 'send' ? (
              <form onSubmit={handleOtpSend} noValidate>
                <p className="login-otp-hint">
                  Enter your email or mobile and we'll send you a 6-digit login code.
                </p>

                {sharedFields}

                <div className="login-error">
                  {error && <span>{error}</span>}
                </div>

                <button
                  id="btn-otp-send"
                  type="submit"
                  className="login-btn"
                  disabled={loading || !identifier || !selectedTenantId}
                >
                  {loading ? <span className="spinner" /> : 'Send Login Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpVerify} noValidate>
                <p className="login-otp-hint">
                  {otpSentMessage || 'A 6-digit code has been sent to your email.'}
                </p>

                <div className="login-field">
                  <input
                    id="login-otp"
                    type="text"
                    inputMode="numeric"
                    className="login-input login-otp-input"
                    placeholder="000000"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    autoComplete="one-time-code"
                    required
                  />
                </div>

                <div className="login-error">
                  {error && <span>{error}</span>}
                </div>

                <button
                  id="btn-otp-verify"
                  type="submit"
                  className="login-btn"
                  disabled={loading || otp.length < 6}
                >
                  {loading ? <span className="spinner" /> : 'Verify & Log In'}
                </button>

                <div style={{ textAlign: 'center', marginTop: '0.875rem' }}>
                  <button
                    type="button"
                    className="login-link"
                    onClick={() => {
                      setOtpStep('send');
                      setOtp('');
                      setError('');
                      setOtpSentMessage('');
                    }}
                  >
                    ← Didn't receive the code? Send again
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="login-tagline">© 2026 Central Kitchen</div>
    </div>
  );
}
