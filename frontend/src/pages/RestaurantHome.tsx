import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function RestaurantHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="dash-page">
      <nav className="dash-nav">
        <div className="dash-nav-brand">
          <span>🍴</span> Restaurant Portal
        </div>
        <div className="dash-nav-actions">
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-light)' }}>{user?.name}</span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main className="dash-body fade-in">
        <div className="dash-welcome">
          <h1>Welcome, {user?.name} 👋</h1>
          <p>Your restaurant dashboard is coming soon.</p>
        </div>
      </main>
    </div>
  );
}
