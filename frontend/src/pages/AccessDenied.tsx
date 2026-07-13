import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function AccessDenied() {
  const navigate = useNavigate();

  const handleReturn = () => {
    navigate('/dashboard');
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '500px', width: '100%', borderRadius: '12px', padding: '3rem', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🔐</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>
          Access Restricted
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-light)', lineHeight: '1.6', marginBottom: '2rem' }}>
          You don't have permission to view this page. If you believe you should have access, please contact your administrator.
        </p>
        <button
          onClick={handleReturn}
          className="login-btn"
          style={{ width: 'auto', padding: '0.75rem 2rem', margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          ↩ Return to Dashboard
        </button>
      </div>
    </div>
  );
}
