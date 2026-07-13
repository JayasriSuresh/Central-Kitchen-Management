import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../index.css';

type SysSection = 'tenants' | 'roles' | 'permissions';
type RolesTab = 'global' | 'ck-roles' | 'restaurant-roles' | 'requests';

const API = 'http://localhost:3000';

export default function SystemAdminHome() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const authHeader = { Authorization: `Bearer ${accessToken}` };
  const authHeaderJSON = { ...authHeader, 'Content-Type': 'application/json' };

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sysSection, setSysSection] = useState<SysSection>('tenants');

  // ── Tenants ──────────────────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '', ck_no: '', address: '', adminName: '', adminEmail: '', adminMobile: '', adminPassword: '' });
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Roles ─────────────────────────────────────────────────────────────────────
  const [rolesTab, setRolesTab] = useState<RolesTab>('global');
  const [globalRoles, setGlobalRoles] = useState<any[]>([]);
  const [ckRoles, setCkRoles] = useState<any[]>([]);
  const [restRoles, setRestRoles] = useState<any[]>([]);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // Global role form
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editRoleId, setEditRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', type: 'CENTRAL_KITCHEN', permission_codes: [] as string[] });
  const [roleFormError, setRoleFormError] = useState('');
  const [roleFormSuccess, setRoleFormSuccess] = useState('');
  const [roleFormSubmitting, setRoleFormSubmitting] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<number | null>(null);

  // Role request review
  const [reviewRequest, setReviewRequest] = useState<any | null>(null);
  const [reviewPermCodes, setReviewPermCodes] = useState<string[]>([]);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [reviewActionMsg, setReviewActionMsg] = useState('');
  const [reviewActionErr, setReviewActionErr] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // ── Permissions ───────────────────────────────────────────────────────────────
  const [permissions, setPermissions] = useState<any[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [showPermForm, setShowPermForm] = useState(false);
  const [permForm, setPermForm] = useState({ module: '', action: '', description: '' });
  const [permFormError, setPermFormError] = useState('');
  const [permFormSuccess, setPermFormSuccess] = useState('');
  const [permFormSubmitting, setPermFormSubmitting] = useState(false);
  const [permsLoading, setPermsLoading] = useState(false);

  useEffect(() => { if (accessToken) fetchTenants(); }, [accessToken]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/system/tenants`, { headers: authHeader });
      setTenants(res.data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadRolesSection = useCallback(async () => {
    setRolesLoading(true);
    try {
      const [gRes, rReqRes, permsRes] = await Promise.all([
        fetch(`${API}/roles/global`, { headers: authHeader }),
        fetch(`${API}/system/roles/requests`, { headers: authHeader }),
        fetch(`${API}/roles/permissions`, { headers: authHeader }),
      ]);
      const [gData, rReqData, permsData] = await Promise.all([gRes.json(), rReqRes.json(), permsRes.json()]);
      setGlobalRoles(gData.data || []);
      setRoleRequests(rReqData.data || []);
      setAllPermissions(permsData.data || []);
      // Filter for tab views — all GLOBAL roles are shown globally; tenant split by type
      setCkRoles((gData.data || []).filter((r: any) => r.type === 'CENTRAL_KITCHEN'));
      setRestRoles((gData.data || []).filter((r: any) => r.type === 'RESTAURANT'));
    } catch (err) { console.error('Failed to load roles', err); }
    finally { setRolesLoading(false); }
  }, [accessToken]);

  const loadPermissions = useCallback(async () => {
    setPermsLoading(true);
    try {
      const res = await fetch(`${API}/roles/permissions`, { headers: authHeader });
      const data = await res.json();
      setPermissions(data.data || []);
    } catch { } finally { setPermsLoading(false); }
  }, [accessToken]);

  useEffect(() => {
    if (sysSection === 'roles') loadRolesSection();
    if (sysSection === 'permissions') loadPermissions();
  }, [sysSection]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(''); setSubmitting(true);
    try {
      await axios.post(`${API}/system/tenants`, formData, { headers: authHeader });
      setShowModal(false);
      setFormData({ name: '', code: '', ck_no: '', address: '', adminName: '', adminEmail: '', adminMobile: '', adminPassword: '' });
      fetchTenants();
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to create Central Kitchen');
    } finally { setSubmitting(false); }
  };

  // ── Role form helpers ──────────────────────────────────────────────────────────

  const openCreateRole = () => {
    setEditRoleId(null);
    setRoleForm({ name: '', description: '', type: 'CENTRAL_KITCHEN', permission_codes: [] });
    setRoleFormError(''); setRoleFormSuccess('');
    setShowRoleForm(true);
  };

  const openEditRole = (role: any) => {
    setEditRoleId(role.id);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      type: role.type,
      permission_codes: (role.role_permissions || []).map((rp: any) => rp.permission.code),
    });
    setRoleFormError(''); setRoleFormSuccess('');
    setShowRoleForm(true);
  };

  const submitRoleForm = async () => {
    setRoleFormError(''); setRoleFormSuccess('');
    if (!roleForm.name) { setRoleFormError('Role name is required'); return; }
    setRoleFormSubmitting(true);
    try {
      if (editRoleId) {
        await fetch(`${API}/roles/global/${editRoleId}`, {
          method: 'PUT',
          headers: authHeaderJSON,
          body: JSON.stringify({ name: roleForm.name, description: roleForm.description, permission_codes: roleForm.permission_codes }),
        });
        setRoleFormSuccess('✓ Role updated');
      } else {
        await fetch(`${API}/roles/global`, {
          method: 'POST',
          headers: authHeaderJSON,
          body: JSON.stringify(roleForm),
        });
        setRoleFormSuccess('✓ Global role created');
      }
      await loadRolesSection();
      setTimeout(() => setShowRoleForm(false), 1200);
    } catch (err: any) {
      setRoleFormError(err.message || 'Failed');
    } finally { setRoleFormSubmitting(false); }
  };

  const deleteGlobalRole = async (id: number) => {
    if (!confirm('Archive this global role?')) return;
    await fetch(`${API}/roles/global/${id}`, { method: 'DELETE', headers: authHeader });
    await loadRolesSection();
  };

  // ── Request review ─────────────────────────────────────────────────────────────

  const openReview = (req: any) => {
    setReviewRequest(req);
    setReviewPermCodes((req.requested_permissions as string[]) || []);
    setRejectRemarks(''); setShowRejectInput(false);
    setReviewActionMsg(''); setReviewActionErr('');
  };

  const approveRequest = async () => {
    setReviewSubmitting(true);
    setReviewActionErr('');
    try {
      await fetch(`${API}/roles/requests/${reviewRequest.id}/approve`, {
        method: 'POST', headers: authHeaderJSON,
        body: JSON.stringify({ permission_codes: reviewPermCodes }),
      });
      setReviewActionMsg('✓ Request approved — role created!');
      await loadRolesSection();
      setTimeout(() => setReviewRequest(null), 1500);
    } catch (err: any) { setReviewActionErr(err.message || 'Failed'); }
    finally { setReviewSubmitting(false); }
  };

  const rejectRequest = async () => {
    if (!rejectRemarks.trim()) { setReviewActionErr('Rejection reason is required'); return; }
    setReviewSubmitting(true); setReviewActionErr('');
    try {
      await fetch(`${API}/roles/requests/${reviewRequest.id}/reject`, {
        method: 'POST', headers: authHeaderJSON,
        body: JSON.stringify({ remarks: rejectRemarks }),
      });
      setReviewActionMsg('✓ Request rejected');
      await loadRolesSection();
      setTimeout(() => setReviewRequest(null), 1500);
    } catch (err: any) { setReviewActionErr(err.message || 'Failed'); }
    finally { setReviewSubmitting(false); }
  };

  // ── Permission helpers ─────────────────────────────────────────────────────────

  const submitPermForm = async () => {
    setPermFormError(''); setPermFormSuccess('');
    if (!permForm.module || !permForm.action) { setPermFormError('Module and action are required'); return; }
    setPermFormSubmitting(true);
    try {
      await fetch(`${API}/roles/permissions`, {
        method: 'POST', headers: authHeaderJSON,
        body: JSON.stringify(permForm),
      });
      setPermFormSuccess('✓ Permission created');
      setPermForm({ module: '', action: '', description: '' });
      await loadPermissions();
      setTimeout(() => setShowPermForm(false), 1200);
    } catch (err: any) { setPermFormError(err.message || 'Failed'); }
    finally { setPermFormSubmitting(false); }
  };

  const deletePermission = async (id: number, usedBy: number) => {
    if (usedBy > 0) { alert(`Cannot delete: used by ${usedBy} role(s)`); return; }
    if (!confirm('Delete this permission?')) return;
    await fetch(`${API}/roles/permissions/${id}`, { method: 'DELETE', headers: authHeader });
    await loadPermissions();
  };

  // ── Permission matrix toggle ──────────────────────────────────────────────────

  const togglePerm = (code: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const renderPermMatrix = (selectedCodes: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    const grouped = allPermissions.reduce((acc: any, p: any) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {});
    return Object.entries(grouped).map(([mod, perms]: any) => (
      <div key={mod} style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{mod.replace(/_/g, ' ')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {perms.map((p: any) => {
            const checked = selectedCodes.includes(p.code);
            return (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer',
                background: checked ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
                border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: '6px', padding: '0.28rem 0.6rem', fontSize: '0.75rem', transition: 'all 0.15s',
              }}>
                <input type="checkbox" checked={checked} onChange={() => togglePerm(p.code, setter)} style={{ accentColor: 'var(--primary)' }} />
                {p.action}
              </label>
            );
          })}
        </div>
      </div>
    ));
  };

  const pendingRequests = roleRequests.filter(r => r.status === 'PENDING');

  return (
    <div className="ck-page">
      {/* ── TOP BAR ── */}
      <header className="ck-topbar">
        <div className="ck-topbar-left">
          <button className="ck-burger" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
            <span /><span /><span />
          </button>
          <div className="ck-topbar-brand"><img src="/Qken_logo.svg" alt="Qken" className="ck-topbar-logo" /></div>
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
                <button className="ck-user-dropdown-item ck-user-dropdown-item--danger" onClick={handleLogout}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── LAYOUT ── */}
      <div className={`ck-layout ${sidebarOpen ? '' : 'ck-layout--collapsed'}`}>

        {/* ── SIDEBAR ── */}
        <aside className="ck-sidebar">
          <nav className="ck-nav">
            <button className={`ck-nav-item ${sysSection === 'tenants' ? 'ck-nav-item--active' : ''}`}
              onClick={() => setSysSection('tenants')}>
              <span className="ck-nav-icon">🏢</span>
              <span className="ck-nav-label">Central Kitchens</span>
            </button>
            <button className={`ck-nav-item ${sysSection === 'roles' ? 'ck-nav-item--active' : ''}`}
              onClick={() => setSysSection('roles')}>
              <span className="ck-nav-icon">🔐</span>
              <span className="ck-nav-label">Role Management</span>
              {pendingRequests.length > 0 && <span className="ck-nav-badge">{pendingRequests.length}</span>}
            </button>
            <button className={`ck-nav-item ${sysSection === 'permissions' ? 'ck-nav-item--active' : ''}`}
              onClick={() => setSysSection('permissions')}>
              <span className="ck-nav-icon">🔑</span>
              <span className="ck-nav-label">Permission Centre</span>
            </button>
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main className="ck-body fade-in">

          {/* ══ TENANTS SECTION ══ */}
          {sysSection === 'tenants' && (
            <>
              <div className="ck-section-header">
                <div>
                  <h1 className="ck-section-title">Central Kitchens (Tenants)</h1>
                  <p className="ck-section-subtitle">Manage multiple kitchens across your enterprise</p>
                </div>
                <button className="ck-btn-add" onClick={() => setShowModal(true)}>+ Onboard Central Kitchen</button>
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
            </>
          )}

          {/* ══ ROLES SECTION ══ */}
          {sysSection === 'roles' && (
            <>
              <div className="ck-section-header">
                <div>
                  <h1 className="ck-section-title">🔐 Role Management</h1>
                  <p className="ck-section-subtitle">Create and manage global roles, review tenant role requests</p>
                </div>
                {rolesTab === 'global' && (
                  <button className="ck-btn-add" onClick={openCreateRole}>+ Create Global Role</button>
                )}
              </div>

              {/* Tabs */}
              <div className="ck-tabs" style={{ marginBottom: '1.5rem' }}>
                {([
                  { key: 'global', label: 'Global Roles' },
                  { key: 'ck-roles', label: 'CK Roles' },
                  { key: 'restaurant-roles', label: 'Restaurant Roles' },
                  { key: 'requests', label: `Pending Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
                ] as const).map(t => (
                  <button key={t.key}
                    className={`ck-tab ${rolesTab === t.key ? 'ck-tab--active' : ''}`}
                    onClick={() => { setRolesTab(t.key); loadRolesSection(); }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {rolesLoading && <div className="ck-empty">Loading…</div>}

              {/* ── Global Roles Tab ── */}
              {!rolesLoading && rolesTab === 'global' && (
                <div className="ck-list">
                  {globalRoles.length === 0
                    ? <div className="ck-empty">No global roles yet.</div>
                    : globalRoles.map(role => (
                      <div key={role.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="ck-list-item-main">
                            <div className="ck-list-item-title">
                              {role.name}
                              <span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{role.type}</span>
                              <span style={{ marginLeft: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px', padding: '0.1rem 0.45rem', fontSize: '0.7rem', color: 'var(--text-light)' }}>v{role.current_version}</span>
                            </div>
                            <div className="ck-list-item-meta">
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{role.role_permissions?.length ?? 0} permissions · {role._count?.versions ?? 0} versions</span>
                              {role.description && <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>— {role.description}</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="ck-btn-edit" onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}>
                              {expandedRoleId === role.id ? 'Hide ▲' : 'Permissions ▼'}
                            </button>
                            <button className="ck-btn-edit" onClick={() => openEditRole(role)}>✏ Edit</button>
                            <button className="ck-btn-delete" onClick={() => deleteGlobalRole(role.id)}>🗑</button>
                          </div>
                        </div>
                        {expandedRoleId === role.id && (
                          <div style={{ marginTop: '1rem', width: '100%' }}>
                            {Object.entries(
                              (role.role_permissions || []).reduce((acc: any, rp: any) => {
                                const m = rp.permission.module;
                                if (!acc[m]) acc[m] = [];
                                acc[m].push(rp.permission);
                                return acc;
                              }, {})
                            ).map(([mod, perms]: any) => (
                              <div key={mod} style={{ marginBottom: '0.65rem' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{mod.replace(/_/g, ' ')}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  {perms.map((p: any) => <span key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.12rem 0.45rem', fontSize: '0.72rem' }}>{p.action}</span>)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* ── CK Roles Tab ── */}
              {!rolesLoading && rolesTab === 'ck-roles' && (
                <div className="ck-list">
                  {ckRoles.length === 0 ? <div className="ck-empty">No CK roles found.</div>
                    : ckRoles.map(role => (
                      <div key={role.id} className="ck-list-item">
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">{role.name}
                            <span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{role.role_scope}</span>
                          </div>
                          <div className="ck-list-item-meta">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>v{role.current_version} · {role.role_permissions?.length ?? 0} permissions · {role.owner_type}</span>
                          </div>
                        </div>
                        <button className="ck-btn-edit" onClick={() => openEditRole(role)}>✏ Edit</button>
                      </div>
                    ))}
                </div>
              )}

              {/* ── Restaurant Roles Tab ── */}
              {!rolesLoading && rolesTab === 'restaurant-roles' && (
                <div className="ck-list">
                  {restRoles.length === 0 ? <div className="ck-empty">No restaurant roles found.</div>
                    : restRoles.map(role => (
                      <div key={role.id} className="ck-list-item">
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">{role.name}
                            <span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{role.role_scope}</span>
                          </div>
                          <div className="ck-list-item-meta">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>v{role.current_version} · {role.role_permissions?.length ?? 0} permissions</span>
                          </div>
                        </div>
                        <button className="ck-btn-edit" onClick={() => openEditRole(role)}>✏ Edit</button>
                      </div>
                    ))}
                </div>
              )}

              {/* ── Pending Requests Tab ── */}
              {!rolesLoading && rolesTab === 'requests' && (
                <div className="ck-list">
                  {roleRequests.length === 0 ? <div className="ck-empty">No role requests.</div>
                    : roleRequests.map(req => (
                      <div key={req.id} className="ck-list-item">
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">
                            {req.role_name}
                            <span style={{ marginLeft: '0.5rem', borderRadius: '999px', padding: '0.12rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                              background: req.status === 'PENDING' ? '#fff8e1' : req.status === 'APPROVED' ? '#e8f5e9' : '#fce4ec',
                              color: req.status === 'PENDING' ? '#f57c00' : req.status === 'APPROVED' ? '#388e3c' : '#c62828' }}>
                              {req.status}
                            </span>
                          </div>
                          <div className="ck-list-item-meta">
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
                              Tenant: {req.tenant?.name || '—'} · By: {req.requestedBy?.name || '—'} · {new Date(req.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        {req.status === 'PENDING' && (
                          <button className="ck-btn-add" style={{ fontSize: '0.8rem', padding: '0.4rem 0.9rem' }} onClick={() => openReview(req)}>
                            Review →
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}

          {/* ══ PERMISSIONS SECTION ══ */}
          {sysSection === 'permissions' && (
            <>
              <div className="ck-section-header">
                <div>
                  <h1 className="ck-section-title">🔑 Permission Centre</h1>
                  <p className="ck-section-subtitle">All permission codes used across the RBAC system</p>
                </div>
                <button className="ck-btn-add" onClick={() => { setShowPermForm(true); setPermForm({ module: '', action: '', description: '' }); setPermFormError(''); setPermFormSuccess(''); }}>
                  + Create Permission
                </button>
              </div>

              {/* Search */}
              <input className="ck-input" style={{ maxWidth: '320px', marginBottom: '1.25rem' }}
                placeholder="Search permissions…" value={permSearch} onChange={e => setPermSearch(e.target.value)} />

              {permsLoading ? <div className="ck-empty">Loading…</div> : (
                Object.entries(
                  permissions
                    .filter(p => !permSearch || p.code.toLowerCase().includes(permSearch.toLowerCase()) || (p.description || '').toLowerCase().includes(permSearch.toLowerCase()))
                    .reduce((acc: any, p: any) => { if (!acc[p.module]) acc[p.module] = []; acc[p.module].push(p); return acc; }, {})
                ).map(([mod, perms]: any) => (
                  <div key={mod} style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.65rem' }}>
                      {mod.replace(/_/g, ' ')}
                    </h3>
                    <div className="ck-list">
                      {perms.map((p: any) => (
                        <div key={p.id} className="ck-list-item" style={{ padding: '0.6rem 1rem' }}>
                          <div className="ck-list-item-main">
                            <div className="ck-list-item-title" style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{p.code}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{p.description || '—'}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>Used by {p.used_by_count ?? 0} role(s)</span>
                            <button className="ck-btn-delete" title={(p.used_by_count ?? 0) > 0 ? 'In use — cannot delete' : 'Delete'} disabled={(p.used_by_count ?? 0) > 0}
                              onClick={() => deletePermission(p.id, p.used_by_count ?? 0)}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )}

        </main>
      </div>

      {/* ══ CREATE TENANT MODAL ══ */}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h4 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>Kitchen Details</h4>
                    <div className="ck-field"><label>Kitchen Name <span className="req">*</span></label><input type="text" className="ck-input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. North Region CK" /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="ck-field"><label>Code <span className="req">*</span></label><input type="text" className="ck-input" required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="NRCK" /></div>
                      <div className="ck-field"><label>CK Number <span className="req">*</span></label><input type="number" className="ck-input" required value={formData.ck_no} onChange={e => setFormData({ ...formData, ck_no: e.target.value })} placeholder="101" /></div>
                    </div>
                    <div className="ck-field"><label>Address</label><textarea className="ck-input" rows={3} value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h4 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>Primary Admin User</h4>
                    <div className="ck-field"><label>Admin Name <span className="req">*</span></label><input type="text" className="ck-input" required value={formData.adminName} onChange={e => setFormData({ ...formData, adminName: e.target.value })} /></div>
                    <div className="ck-field"><label>Admin Email <span className="req">*</span></label><input type="email" className="ck-input" required value={formData.adminEmail} onChange={e => setFormData({ ...formData, adminEmail: e.target.value })} /></div>
                    <div className="ck-field"><label>Admin Mobile <span className="req">*</span></label><input type="tel" className="ck-input" required value={formData.adminMobile} onChange={e => setFormData({ ...formData, adminMobile: e.target.value })} /></div>
                    <div className="ck-field"><label>Admin Password <span className="req">*</span></label><input type="password" className="ck-input" required value={formData.adminPassword} onChange={e => setFormData({ ...formData, adminPassword: e.target.value })} minLength={6} /></div>
                  </div>
                </div>
                {submitError && <div className="plan-error" style={{ marginTop: '1rem' }}>{submitError}</div>}
                <div className="plan-modal-footer" style={{ marginTop: '2rem' }}>
                  <button type="button" className="ck-btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="ck-btn-submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Kitchen & Admin'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══ GLOBAL ROLE FORM MODAL ══ */}
      {showRoleForm && (
        <div className="plan-overlay" onClick={() => setShowRoleForm(false)}>
          <div className="plan-modal" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="plan-modal-header">
              <h3>{editRoleId ? '✏ Edit Global Role' : '+ Create Global Role'}</h3>
              <button className="inv-modal-close" onClick={() => setShowRoleForm(false)}>✕</button>
            </div>
            <div className="plan-modal-body">
              {roleFormSuccess && <div style={{ padding: '0.65rem', background: '#e8f5e9', color: '#388e3c', borderRadius: '8px', marginBottom: '1rem' }}>{roleFormSuccess}</div>}
              {roleFormError && <div style={{ padding: '0.65rem', background: '#fce4ec', color: '#c62828', borderRadius: '8px', marginBottom: '1rem' }}>{roleFormError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                  <div className="ck-field"><label>Role Name *</label><input className="ck-input" value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="ck-field"><label>Type</label>
                    <select className="ck-input" value={roleForm.type} onChange={e => setRoleForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="CENTRAL_KITCHEN">Central Kitchen</option>
                      <option value="RESTAURANT">Restaurant</option>
                    </select>
                  </div>
                </div>
                <div className="ck-field"><label>Description</label><textarea className="ck-input" rows={2} value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div className="ck-field">
                  <label style={{ marginBottom: '0.6rem', display: 'block', fontWeight: 600 }}>Permission Matrix</label>
                  {renderPermMatrix(roleForm.permission_codes, (updater) => {
                    setRoleForm(f => ({ ...f, permission_codes: typeof updater === 'function' ? updater(f.permission_codes) : updater }));
                  })}
                </div>
              </div>
            </div>
            <div className="plan-modal-footer">
              <button className="ck-btn-cancel" onClick={() => setShowRoleForm(false)}>Cancel</button>
              <button className="ck-btn-submit" disabled={roleFormSubmitting} onClick={submitRoleForm}>
                {roleFormSubmitting ? 'Saving…' : editRoleId ? 'Save Changes' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ ROLE REQUEST REVIEW MODAL ══ */}
      {reviewRequest && (
        <div className="plan-overlay" onClick={() => setReviewRequest(null)}>
          <div className="plan-modal" style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }} onClick={e => e.stopPropagation()}>
            <div className="plan-modal-header">
              <h3>📋 Review Role Request — {reviewRequest.role_name}</h3>
              <button className="inv-modal-close" onClick={() => setReviewRequest(null)}>✕</button>
            </div>
            <div className="plan-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
              {/* Left: metadata */}
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>TENANT</div>
                  <div style={{ fontWeight: 600 }}>{reviewRequest.tenant?.name || '—'}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>REQUESTED BY</div>
                  <div>{reviewRequest.requestedBy?.name || '—'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{reviewRequest.requestedBy?.email}</div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>ROLE TYPE</div>
                  <div>{reviewRequest.role_type}</div>
                </div>
                {reviewRequest.description && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>DESCRIPTION</div>
                    <div style={{ fontSize: '0.85rem' }}>{reviewRequest.description}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '0.2rem' }}>SUBMITTED</div>
                  <div style={{ fontSize: '0.85rem' }}>{new Date(reviewRequest.created_at).toLocaleString()}</div>
                </div>
              </div>

              {/* Right: permission matrix (editable) */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Permission Matrix <span style={{ fontSize: '0.78rem', color: 'var(--text-light)', fontWeight: 400 }}>(editable before approval)</span></div>
                {renderPermMatrix(reviewPermCodes, setReviewPermCodes)}
              </div>
            </div>

            {/* Footer actions */}
            <div className="plan-modal-footer" style={{ flexDirection: 'column', gap: '0.75rem' }}>
              {reviewActionMsg && <div style={{ color: '#388e3c', fontWeight: 600 }}>{reviewActionMsg}</div>}
              {reviewActionErr && <div style={{ color: '#c62828' }}>{reviewActionErr}</div>}

              {showRejectInput && (
                <div style={{ width: '100%' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem', display: 'block' }}>Rejection Reason *</label>
                  <textarea className="ck-input" rows={2} style={{ width: '100%' }} value={rejectRemarks} onChange={e => setRejectRemarks(e.target.value)} placeholder="Explain why this request is being rejected…" />
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', width: '100%', justifyContent: 'flex-end' }}>
                <button className="ck-btn-cancel" onClick={() => setReviewRequest(null)}>Close</button>
                {!showRejectInput && (
                  <button className="ck-btn-delete" style={{ padding: '0.5rem 1.25rem' }} onClick={() => setShowRejectInput(true)}>Reject</button>
                )}
                {showRejectInput && (
                  <button className="ck-btn-delete" style={{ padding: '0.5rem 1.25rem' }} disabled={reviewSubmitting} onClick={rejectRequest}>
                    {reviewSubmitting ? '…' : 'Confirm Rejection'}
                  </button>
                )}
                <button className="ck-btn-submit" disabled={reviewSubmitting} onClick={approveRequest}>
                  {reviewSubmitting ? 'Processing…' : '✓ Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ CREATE PERMISSION SLIDE-OUT ══ */}
      {showPermForm && (
        <div className="plan-overlay" onClick={() => setShowPermForm(false)}>
          <div className="plan-modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="plan-modal-header">
              <h3>+ Create Permission</h3>
              <button className="inv-modal-close" onClick={() => setShowPermForm(false)}>✕</button>
            </div>
            <div className="plan-modal-body">
              {permFormSuccess && <div style={{ padding: '0.65rem', background: '#e8f5e9', color: '#388e3c', borderRadius: '8px', marginBottom: '1rem' }}>{permFormSuccess}</div>}
              {permFormError && <div style={{ padding: '0.65rem', background: '#fce4ec', color: '#c62828', borderRadius: '8px', marginBottom: '1rem' }}>{permFormError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="ck-field">
                  <label>Module *</label>
                  <input className="ck-input" value={permForm.module} onChange={e => setPermForm(f => ({ ...f, module: e.target.value.toLowerCase().replace(/ /g, '_') }))} placeholder="e.g. stock_inventory" />
                </div>
                <div className="ck-field">
                  <label>Action *</label>
                  <input className="ck-input" value={permForm.action} onChange={e => setPermForm(f => ({ ...f, action: e.target.value.toLowerCase().replace(/ /g, '_') }))} placeholder="e.g. export" />
                </div>
                {permForm.module && permForm.action && (
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--primary)' }}>
                    Code preview: {permForm.module.toUpperCase()}_{permForm.action.toUpperCase()}
                  </div>
                )}
                <div className="ck-field">
                  <label>Description</label>
                  <input className="ck-input" value={permForm.description} onChange={e => setPermForm(f => ({ ...f, description: e.target.value }))} placeholder="Human-readable label" />
                </div>
              </div>
            </div>
            <div className="plan-modal-footer">
              <button className="ck-btn-cancel" onClick={() => setShowPermForm(false)}>Cancel</button>
              <button className="ck-btn-submit" disabled={permFormSubmitting} onClick={submitPermForm}>
                {permFormSubmitting ? 'Creating…' : 'Create Permission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
