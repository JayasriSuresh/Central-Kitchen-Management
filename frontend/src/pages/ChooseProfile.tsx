
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function ChooseProfile() {
  const { user, setAuth, logout } = useAuth();
  const navigate = useNavigate();

  const selectPortal = (portal: string) => {
    setAuth({ activePortal: portal });
    if (portal === 'system') navigate('/system');
    else if (portal === 'restaurant') navigate('/restaurant');
    else navigate('/central-kitchen');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const portals = user?.portals || [];

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '500px', width: '100%', borderRadius: '8px', padding: '2.5rem' }}>
        <div className="login-brand" style={{ marginBottom: '2.5rem' }}>
          <div className="login-logo" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            🍽 Central Kitchen ERP
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
            Select a portal to continue
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          {portals.includes('system') && (
            <button
              onClick={() => selectPortal('system')}
              className="ck-list-item"
              style={{
                width: '100%',
                padding: '1.25rem',
                textAlign: 'left',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                cursor: 'pointer',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '2rem' }}>👑</span>
              <div>
                <strong style={{ fontSize: '1rem', color: 'var(--text)' }}>System Administration</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                  Manage multiple kitchen tenants and system configurations
                </div>
              </div>
            </button>
          )}

          {portals.includes('central_kitchen') && (
            <button
              onClick={() => selectPortal('central_kitchen')}
              className="ck-list-item"
              style={{
                width: '100%',
                padding: '1.25rem',
                textAlign: 'left',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                cursor: 'pointer',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '2rem' }}>🏭</span>
              <div>
                <strong style={{ fontSize: '1rem', color: 'var(--text)' }}>Central Kitchen ERP</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                  Manage inventory, production plans, and restaurant orders
                </div>
              </div>
            </button>
          )}

          {portals.includes('restaurant') && (
            <button
              onClick={() => selectPortal('restaurant')}
              className="ck-list-item"
              style={{
                width: '100%',
                padding: '1.25rem',
                textAlign: 'left',
                border: '1px solid var(--border)',
                background: 'var(--white)',
                cursor: 'pointer',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '2rem' }}>🍽</span>
              <div>
                <strong style={{ fontSize: '1rem', color: 'var(--text)' }}>Restaurant Portal</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                  Place dispatch orders and manage branch inventory
                </div>
              </div>
            </button>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="btn-ghost"
          style={{ width: '100%', padding: '0.75rem', borderColor: 'var(--border)', color: 'var(--text-light)' }}
        >
          Sign Out of Account
        </button>
      </div>
    </div>
  );
}
