import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dash-page">
      <nav className="dash-nav">
        <div className="dash-nav-brand">
          <span>🍽</span> Central Kitchen
        </div>
        <div className="dash-nav-actions">
          <button className="btn-ghost" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <main className="dash-body fade-in">
        <div className="dash-welcome">
          <h1>Welcome, {user.name}</h1>
          <p>Here's your account overview.</p>
        </div>

        <div className="info-grid">
          <div className="info-tile">
            <div className="info-tile-label">User ID</div>
            <div className="info-tile-value accent">{user.user_id}</div>
          </div>
          <div className="info-tile">
            <div className="info-tile-label">Central Kitchen ID</div>
            <div className="info-tile-value">{user.tenant_id}</div>
          </div>
          <div className="info-tile">
            <div className="info-tile-label">Role ID</div>
            <div className="info-tile-value">{user.role_id}</div>
          </div>
          <div className="info-tile">
            <div className="info-tile-label">Email</div>
            <div className="info-tile-value" style={{ fontSize: '0.875rem' }}>{user.email}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
