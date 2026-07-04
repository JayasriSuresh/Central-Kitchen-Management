import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:3000';

type Step = 'request' | 'reset' | 'done';

interface Tenant {
  id: number;
  name: string;
  code: string;
}

export default function ForgotPassword() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoaded, setTenantsLoaded] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<number | ''>('');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<Step>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Load tenants on first focus of the identifier field
  const loadTenants = async () => {
    if (tenantsLoaded) return;
    try {
      const res = await axios.get(`${API_URL}/auth/tenants`);
      setTenants(res.data.tenants);
      if (res.data.tenants.length > 0) setSelectedTenantId(res.data.tenants[0].id);
      setTenantsLoaded(true);
    } catch {
      // silently fail
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId || !identifier) return;
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/forgot-password`, {
        tenant_id: Number(selectedTenantId),
        email_or_mobile: identifier,
      });
      setMessage(res.data.message);
      setStep('reset');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        tenant_id: Number(selectedTenantId),
        email_or_mobile: identifier,
        otp,
        new_password: newPassword,
      });
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid or expired OTP.');
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

        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: '0.5rem' }}>
              Password reset!
            </p>
            <p style={{ color: 'var(--text-light)', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
              Your password has been updated. You can now sign in.
            </p>
            <Link to="/login" className="login-btn" style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
              Back to Login
            </Link>
          </div>
        ) : step === 'request' ? (
          <>
            <p style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Enter your email and we'll send you a 6-digit code to reset your password.
            </p>
            <form onSubmit={handleSendOtp} noValidate>
              {/* Tenant dropdown */}
              <div className="login-field">
                <div className="login-select-wrap">
                  <select
                    className="login-select"
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(Number(e.target.value))}
                    onFocus={loadTenants}
                    required
                  >
                    {!tenantsLoaded ? (
                      <option value="" disabled>Loading kitchens...</option>
                    ) : (
                      tenants.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

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

              {error && <div className="login-error">{error}</div>}

              <button
                type="submit"
                className="login-btn"
                disabled={loading || !identifier || !selectedTenantId}
              >
                {loading ? <span className="spinner" /> : 'Send Reset Code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {message} Enter the 6-digit code below and choose a new password.
            </p>
            <form onSubmit={handleReset} noValidate>
              <div className="login-field">
                <input
                  type="text"
                  className="login-input"
                  placeholder="6-digit OTP code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{ letterSpacing: '0.2em', textAlign: 'center', fontSize: '1.125rem' }}
                  required
                />
              </div>
              <div className="login-field">
                <input
                  type="password"
                  className="login-input"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="login-field">
                <input
                  type="password"
                  className="login-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {error && <div className="login-error">{error}</div>}

              <button
                type="submit"
                className="login-btn"
                disabled={loading || otp.length < 6 || !newPassword || !confirmPassword}
              >
                {loading ? <span className="spinner" /> : 'Reset Password'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.875rem' }}>
                <button
                  type="button"
                  className="login-link"
                  onClick={() => { setStep('request'); setOtp(''); setError(''); }}
                >
                  ← Didn't receive the code? Send again
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <div className="login-footer-card">
        Remember your password? <Link to="/login" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
      </div>

      <div className="login-tagline">© 2026 Central Kitchen</div>
    </div>
  );
}
