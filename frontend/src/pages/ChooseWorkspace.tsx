import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const API_URL = 'http://localhost:3000';

interface Workspace {
  type: 'central_kitchen' | 'restaurant';
  restaurantId?: number;
  restaurantName?: string;
  roleId: number;
  roleName: string;
  roleCode: string;
}

export default function ChooseWorkspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setAuth, logout } = useAuth();

  // Retrieve state passed from Login page
  const { workspaceToken, workspaces, user, tenantId } = (location.state || {
    workspaceToken: '',
    workspaces: [] as Workspace[],
    user: null,
    tenantId: ''
  }) as {
    workspaceToken: string;
    workspaces: Workspace[];
    user: any;
    tenantId: string;
  };

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    const selected = workspaces[selectedIdx];
    if (!selected) return;

    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/select-workspace`, {
        workspaceToken,
        type: selected.type,
        restaurantId: selected.restaurantId,
      });

      setAuth({
        user: res.data.user,
        tenantId,
        accessToken: res.data.accessToken,
        activePortal: selected.type,
        workspaces: res.data.workspaces,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to select workspace. Please try logging in again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    logout();
    navigate('/login');
  };

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: '450px', borderRadius: '8px', textAlign: 'center' }}>
          <p>No active workspaces found. Please login again.</p>
          <button className="login-btn" onClick={handleCancel} style={{ marginTop: '1rem' }}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '500px', width: '100%', borderRadius: '8px', padding: '2.5rem' }}>
        <div className="login-brand" style={{ marginBottom: '2rem' }}>
          <div className="login-logo" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            🍽 Central Kitchen ERP
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
            Welcome back, {user?.name}. Please select a workspace to continue.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
          {workspaces.map((ws, idx) => {
            const isSelected = selectedIdx === idx;
            const isCK = ws.type === 'central_kitchen';
            const title = isCK ? 'Central Kitchen' : ws.restaurantName || 'Restaurant Branch';
            const subtitle = ws.roleName;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                style={{
                  width: '100%',
                  padding: '1.25rem',
                  textAlign: 'left',
                  border: isSelected ? '1px solid var(--blue)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--blue-pale)' : 'var(--white)',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.15s, background-color 0.15s'
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: isSelected ? '5px solid var(--blue)' : '2px solid var(--border)',
                  boxSizing: 'border-box',
                  backgroundColor: 'white',
                  flexShrink: 0
                }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>{isCK ? '🏭' : '🍽'}</span>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{title}</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem', marginLeft: '1.7rem' }}>
                    {subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="login-error" style={{ color: 'var(--error)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleCancel}
            className="btn-ghost"
            style={{ flex: 1, padding: '0.75rem', borderColor: 'var(--border)', color: 'var(--text-light)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleContinue}
            className="login-btn"
            disabled={loading}
            style={{ flex: 2 }}
          >
            {loading ? <span className="spinner" /> : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
