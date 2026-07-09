import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function SystemAdminHome() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const API = 'http://localhost:3000';
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    ck_no: '',
    address: '',
    adminName: '',
    adminEmail: '',
    adminMobile: '',
    adminPassword: '',
  });
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (accessToken) fetchTenants();
  }, [accessToken]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/system/tenants`, { headers: authHeader });
      setTenants(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      await axios.post(`${API}/system/tenants`, formData, { headers: authHeader });
      setShowModal(false);
      setFormData({
        name: '', code: '', ck_no: '', address: '',
        adminName: '', adminEmail: '', adminMobile: '', adminPassword: ''
      });
      fetchTenants();
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to create Central Kitchen');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ck-page">
      {/* ── TOP BAR ── */}
      <header className="ck-topbar">
        <div className="ck-topbar-left">
          <button className="ck-burger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
            <span /><span /><span />
          </button>
          <div className="ck-topbar-brand">👑 System Administration</div>
        </div>
        <div className="ck-topbar-right">
          <div className="ck-user-menu-wrap">
            <button className="ck-user-btn" onClick={() => setShowUserMenu(m => !m)}>
              <span className="ck-user-avatar">{user?.name?.charAt(0).toUpperCase()}</span>
              <span className="ck-user-name-top">{user?.name}</span>
              <span className="ck-user-caret">▾</span>
            </button>
            {showUserMenu && (
              <div className="ck-user-dropdown">
                <div className="ck-user-dropdown-info">
                  <div className="ck-user-dropdown-name">{user?.name}</div>
                  <div className="ck-user-dropdown-role">Master Admin</div>
                </div>
                <div className="ck-user-dropdown-divider" />
                <button className="ck-user-dropdown-item ck-user-dropdown-item--danger" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── LAYOUT: sidebar + content ── */}
      <div className={`ck-layout ${sidebarOpen ? '' : 'ck-layout--collapsed'}`}>
        
        {/* ── SIDEBAR ── */}
        <aside className="ck-sidebar">
          <nav className="ck-nav">
            <button className="ck-nav-item ck-nav-item--active">
              <span className="ck-nav-icon">🏢</span>
              <span className="ck-nav-label">Central Kitchens</span>
            </button>
            <button className="ck-nav-item ck-nav-item--soon">
              <span className="ck-nav-icon">⚙️</span>
              <span className="ck-nav-label">Global Settings</span>
              <span className="ck-soon-tag">Soon</span>
            </button>
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="ck-body fade-in">
          <div className="ck-section-header">
            <div>
              <h1 className="ck-section-title">Central Kitchens (Tenants)</h1>
              <p className="ck-section-subtitle">Manage multiple kitchens across your enterprise</p>
            </div>
            <button className="ck-btn-add" onClick={() => setShowModal(true)}>
              + Onboard Central Kitchen
            </button>
          </div>

          {loading ? (
            <div className="ck-empty">Loading tenants...</div>
          ) : tenants.length === 0 ? (
            <div className="ck-empty">No Central Kitchens found.</div>
          ) : (
            <div className="ck-list">
              {tenants.map(t => (
                <div key={t.id} className="ck-list-item">
                  <div className="ck-list-item-main">
                    <div className="ck-list-item-title">
                      {t.name}
                      <span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.75rem' }}>{t.status.toUpperCase()}</span>
                    </div>
                    <div className="ck-list-item-meta" style={{ marginTop: '0.5rem' }}>
                      <span>Code: <strong>{t.code}</strong></span>
                      <span>ID: <strong>#{t.ck_no}</strong></span>
                      {t.address && <span className="truncate" style={{ maxWidth: '250px' }}>📍 {t.address}</span>}
                    </div>
                    <div className="ck-list-item-meta" style={{ marginTop: '0.5rem', color: 'var(--text-light)' }}>
                      <span>Users: <strong>{t._count?.users || 0}</strong></span>
                      <span>Products: <strong>{t._count?.products || 0}</strong></span>
                      <span>Restaurants: <strong>{t._count?.restaurant_tenants || 0}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* CREATE MODAL */}
      {showModal && (
        <div className="plan-overlay" onClick={() => setShowModal(false)}>
          <div className="plan-modal" style={{ maxWidth: '750px' }} onClick={e => e.stopPropagation()}>
            <div className="plan-modal-header">
              <h3>Onboard New Central Kitchen</h3>
              <button className="inv-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <div className="plan-modal-body">
              <form onSubmit={handleCreate}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                  
                  {/* Left Col: Tenant Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h4 style={{ fontSize: '1.05rem', marginBottom: '0.25rem', color: 'var(--text)' }}>Kitchen Details</h4>
                    <div className="ck-field">
                      <label>Kitchen Name <span className="req">*</span></label>
                      <input type="text" className="ck-input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. North Region CK" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="ck-field">
                        <label>Kitchen Code <span className="req">*</span></label>
                        <input type="text" className="ck-input" required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})} placeholder="e.g. NRCK" />
                      </div>
                      <div className="ck-field">
                        <label>CK Number (ID) <span className="req">*</span></label>
                        <input type="number" className="ck-input" required value={formData.ck_no} onChange={e => setFormData({...formData, ck_no: e.target.value})} placeholder="e.g. 101" />
                      </div>
                    </div>
                    <div className="ck-field">
                      <label>Address</label>
                      <textarea className="ck-input" rows={3} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Full address..." />
                    </div>
                  </div>

                  {/* Right Col: Admin Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h4 style={{ fontSize: '1.05rem', marginBottom: '0.25rem', color: 'var(--text)' }}>Primary Admin User</h4>
                    <div className="ck-field">
                      <label>Admin Name <span className="req">*</span></label>
                      <input type="text" className="ck-input" required value={formData.adminName} onChange={e => setFormData({...formData, adminName: e.target.value})} placeholder="e.g. John Doe" />
                    </div>
                    <div className="ck-field">
                      <label>Admin Email <span className="req">*</span></label>
                      <input type="email" className="ck-input" required value={formData.adminEmail} onChange={e => setFormData({...formData, adminEmail: e.target.value})} placeholder="john@company.com" />
                    </div>
                    <div className="ck-field">
                      <label>Admin Mobile <span className="req">*</span></label>
                      <input type="tel" className="ck-input" required value={formData.adminMobile} onChange={e => setFormData({...formData, adminMobile: e.target.value})} placeholder="e.g. 9876543210" />
                    </div>
                    <div className="ck-field">
                      <label>Admin Password <span className="req">*</span></label>
                      <input type="password" className="ck-input" required value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} placeholder="Min 6 chars" minLength={6} />
                    </div>
                  </div>
                </div>

                {submitError && <div className="plan-error" style={{ marginTop: '1rem' }}>{submitError}</div>}
                
                <div className="plan-modal-footer" style={{ marginTop: '2rem' }}>
                  <button type="button" className="ck-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="ck-btn-submit" disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create Kitchen & Admin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
