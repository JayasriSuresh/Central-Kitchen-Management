import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000';

interface Product {
  id: number;
  product_name: string;
  code: string;
  category_name: string;
  unit_name: string;
  selling_price: number;
  tax_percent: number;
  moq: number | null;
  batch_size: number | null;
  shelf_life_days: number | null;
  order_cutoff_hours: number;
  lead_time_days: number;
  allow_urgent_order: boolean;
  description: string;
  image: string;
}

interface OrderItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  edit_cutoff_at: string;
}

interface Order {
  id: number;
  order_number: string;
  delivery_date: string;
  status: string;
  is_urgent: boolean;
  remarks: string | null;
  created_at: string;
  items: OrderItem[];
  total_amount: number;
}

type Tab = 'new-order' | 'history' | 'roles';

export default function RestaurantHome() {
  const { user, accessToken, logout, activePortal, workspaces, setAuth } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('new-order');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSwitchWorkspace = async (ws: any) => {
    try {
      const res = await axios.post(`${API}/auth/switch-workspace`, {
        type: ws.type,
        restaurantId: ws.restaurantId,
      }, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      setAuth({
        user: res.data.user,
        accessToken: res.data.accessToken,
        activePortal: ws.type,
        workspaces: res.data.workspaces,
      });
      setShowUserMenu(false);
      
      if (ws.type === 'system') navigate('/system');
      else if (ws.type === 'restaurant') navigate('/restaurant');
      else navigate('/central-kitchen');
    } catch (err) {
      console.error('Failed to switch workspace', err);
    }
  };

  // Cart quantities state: { [productId]: quantityString }
  const [cartQuantities, setCartQuantities] = useState<{ [id: number]: string }>({});

  // Checkout inputs
  const [deliveryDate, setDeliveryDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  // Status and feedback
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Interactive UI
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // ── Roles state ─────────────────────────────────────────────────────────────
  const [rolesSubTab, setRolesSubTab] = useState<'my-roles' | 'requests' | 'new-request'>('my-roles');
  const [tenantRoles, setTenantRoles] = useState<any[]>([]);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<number | null>(null);
  const [expandedReqId, setExpandedReqId] = useState<number | null>(null);
  const [roleReqForm, setRoleReqForm] = useState({ role_name: '', description: '', role_type: 'RESTAURANT', template_role_id: '', permission_codes: [] as string[] });
  const [roleReqError, setRoleReqError] = useState('');
  const [roleReqSuccess, setRoleReqSuccess] = useState('');
  const [roleReqSubmitting, setRoleReqSubmitting] = useState(false);

  const loadRolesData = async () => {
    setRolesLoading(true);
    try {
      const [rolesRes, reqsRes, permsRes, tmplRes] = await Promise.all([
        fetch(`${API}/roles/tenant?type=RESTAURANT`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/requests`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/permissions`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/templates?type=RESTAURANT`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      const [rolesData, reqsData, permsData, tmplData] = await Promise.all([
        rolesRes.json(), reqsRes.json(), permsRes.json(), tmplRes.json(),
      ]);
      setTenantRoles(rolesData.data || []);
      setRoleRequests(reqsData.data || []);
      setAllPermissions(permsData.data || []);
      setTemplates(tmplData.data || []);
    } catch (err) {
      console.error('Failed to load roles data', err);
    } finally {
      setRolesLoading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const loadData = useCallback(async () => {
    try {
      const [pRes, oRes] = await Promise.all([
        axios.get(`${API}/restaurant/products`, { headers: authHeader }),
        axios.get(`${API}/restaurant/orders`, { headers: authHeader }),
      ]);
      setProducts(pRes.data.products);
      setOrders(oRes.data.orders);
    } catch (err: any) {
      if (err.response?.status === 401) {
        // Token expired or invalid — force re-login
        logout();
        navigate('/login');
      }
      console.error('Failed to load restaurant data', err);
    }
  }, [accessToken]);

  useEffect(() => { loadData(); }, [loadData]);

  // Cart operations
  const setQuantity = (id: number, val: string) => {
    const numericOnly = val.replace(/\D/g, '');
    setCartQuantities((prev) => ({ ...prev, [id]: numericOnly }));
  };

  const adjustQty = (id: number, offset: number, moqVal: number | null) => {
    const curr = parseInt(cartQuantities[id] || '0', 10);
    const step = moqVal || 1;
    const next = Math.max(0, curr + offset * step);
    setCartQuantities((prev) => ({ ...prev, [id]: next === 0 ? '' : String(next) }));
  };

  // Get active cart items (only those with quantity > 0)
  const cartItems = Object.keys(cartQuantities)
    .map((k) => {
      const pId = parseInt(k, 10);
      const product = products.find((p) => p.id === pId);
      const qty = parseInt(cartQuantities[pId] || '0', 10);
      return { product, qty };
    })
    .filter((item) => item.product && item.qty > 0) as { product: Product; qty: number }[];

  const cartTotal = cartItems.reduce((sum, item) => sum + item.qty * Number(item.product.selling_price), 0);

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    setFeedbackSuccess('');

    if (cartItems.length === 0) {
      setFeedbackError('Your cart is empty. Please select products to order.');
      return;
    }
    if (!deliveryDate) {
      setFeedbackError('Please select a delivery date.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        delivery_date: deliveryDate,
        remarks,
        is_urgent: isUrgent,
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.qty,
        })),
      };

      await axios.post(`${API}/restaurant/orders`, payload, { headers: authHeader });
      setFeedbackSuccess('Order placed successfully! Redirecting to history...');
      setCartQuantities({});
      setRemarks('');
      setDeliveryDate('');
      setIsUrgent(false);

      // Reload order list
      await loadData();

      // Switch tab after short delay
      setTimeout(() => {
        setTab('history');
        setFeedbackSuccess('');
      }, 1500);
    } catch (err: any) {
      setFeedbackError(err.response?.data?.message || 'Could not place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="ck-page">
      {/* Navbar */}
      <header className="ck-topbar">
        <div className="ck-topbar-left">
          <div className="ck-topbar-brand">🍽 Restaurant Order Portal</div>
        </div>
        <div className="ck-topbar-right">
          <div className="ck-user-menu-wrap">
            <button className="ck-user-btn" onClick={() => setShowUserMenu(m => !m)}>
              <span className="ck-user-avatar">{user?.name?.charAt(0).toUpperCase()}</span>
              <span className="ck-user-name-top">{user?.name}</span>
              <span className="ck-user-caret">▾</span>
            </button>
            {showUserMenu && (
              <div className="ck-user-dropdown" style={{ right: 0, left: 'auto' }}>
                <div className="ck-user-dropdown-info">
                  <div className="ck-user-dropdown-name">{user?.name}</div>
                  <div className="ck-user-dropdown-role">Restaurant Manager</div>
                </div>

                {workspaces && workspaces.length > 1 && (
                  <>
                    <div className="ck-user-dropdown-divider" />
                    <div style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: 600 }}>Switch Workspace</div>
                    {workspaces.map((ws: any, idx: number) => {
                      const isCK = ws.type === 'central_kitchen';
                      const title = isCK ? 'Central Kitchen' : ws.restaurantName || 'Restaurant Branch';
                      const isActive = (isCK && activePortal === 'central_kitchen') || (!isCK && activePortal === 'restaurant' && user?.restaurant_id === ws.restaurantId);
                      if (isActive) return null;

                      return (
                        <button key={idx} className="ck-user-dropdown-item" onClick={() => handleSwitchWorkspace(ws)} style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}>
                          {isCK ? '🏭' : '🍽'} {title}
                        </button>
                      );
                    })}
                  </>
                )}

                <div className="ck-user-dropdown-divider" />
                <button className="ck-user-dropdown-item ck-user-dropdown-item--danger" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="ck-tabs">
        <button
          className={`ck-tab ${tab === 'new-order' ? 'ck-tab--active' : ''}`}
          onClick={() => setTab('new-order')}
        >
          🛘 Place Order
        </button>
        <button
          className={`ck-tab ${tab === 'history' ? 'ck-tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          📋 Order History ({orders.length})
        </button>
        <button
          className={`ck-tab ${tab === 'roles' ? 'ck-tab--active' : ''}`}
          onClick={() => { setTab('roles'); loadRolesData(); }}
        >
          🔐 Roles
        </button>
      </div>

      <main className="ck-body">
        {tab === 'new-order' ? (
          <div className="rest-ordering-layout" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            {/* Products grid */}
            <div className="fade-in">
              <div className="ck-section-header">
                <h2 className="ck-section-title">Available Products</h2>
                <input
                  type="text"
                  className="ck-input"
                  style={{ maxWidth: '240px', padding: '0.4rem 0.75rem' }}
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredProducts.length === 0 ? (
                <div className="ck-empty">No products match your search.</div>
              ) : (
                <div className="ck-list">
                  {filteredProducts.map((p) => (
                    <div key={p.id} className="ck-list-item" style={{ padding: '0.85rem 1rem' }}>
                      <div className="ck-list-item-main">
                        <div className="ck-list-item-title" style={{ fontSize: '0.875rem' }}>
                          {p.product_name}
                          <span className="ck-cat-badge">{p.category_name}</span>
                        </div>
                        <div className="ck-list-item-meta" style={{ fontSize: '0.75rem' }}>
                          <span>₹{Number(p.selling_price).toFixed(2)} / {p.unit_name}</span>
                          {p.moq && <span>MOQ: {p.moq}</span>}
                          {p.shelf_life_days && <span>Shelf Life: {p.shelf_life_days} days</span>}
                          {!p.allow_urgent_order && <span style={{ color: 'var(--error)' }}>No Urgent Orders</span>}
                        </div>
                        {p.description && (
                          <div className="ck-list-item-desc" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                            {p.description}
                          </div>
                        )}
                      </div>
                      <div className="ck-list-item-actions" style={{ alignItems: 'center' }}>
                        <button
                          type="button"
                          className="ck-btn-cancel"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => adjustQty(p.id, -1, p.moq)}
                        >
                          -
                        </button>
                        <input
                          type="text"
                          className="ck-input"
                          style={{ width: '45px', textAlign: 'center', padding: '0.2rem 0', fontSize: '0.8125rem' }}
                          value={cartQuantities[p.id] || ''}
                          onChange={(e) => setQuantity(p.id, e.target.value)}
                          placeholder="0"
                        />
                        <button
                          type="button"
                          className="ck-btn-cancel"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => adjustQty(p.id, 1, p.moq)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart checkout Panel */}
            <div className="ck-form-card fade-in" style={{ height: 'fit-content', top: '1rem', position: 'sticky' }}>
              <div className="ck-form-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Your Order Cart
              </div>

              {cartItems.length === 0 ? (
                <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-light)', fontSize: '0.8125rem' }}>
                  No items selected. Use + buttons to add products.
                </div>
              ) : (
                <form onSubmit={handlePlaceOrder}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', margin: '0.75rem 0', maxHeight: '180px', overflowY: 'auto' }}>
                    {cartItems.map(({ product, qty }) => (
                      <div key={product.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                        <span style={{ fontWeight: 500 }}>{product.product_name} x {qty}</span>
                        <span>₹{(qty * Number(product.selling_price)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.875rem' }}>
                      <span>Subtotal</span>
                      <span>₹{cartTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="ck-field" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.6875rem' }}>Requested Delivery Date *</label>
                    <input
                      type="date"
                      className="ck-input"
                      style={{ fontSize: '0.8125rem', padding: '0.4rem' }}
                      required
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>

                  <div className="ck-field" style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.6875rem' }}>Order Remarks</label>
                    <textarea
                      className="ck-input ck-textarea"
                      style={{ fontSize: '0.8125rem', minHeight: '40px', padding: '0.4rem' }}
                      placeholder="Special packaging or delivery instructions..."
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                    />
                  </div>

                  <div className="ck-field ck-field--check" style={{ marginBottom: '0.75rem' }}>
                    <label className="ck-check-label" style={{ marginTop: '0', fontSize: '0.8125rem' }}>
                      <input
                        type="checkbox"
                        checked={isUrgent}
                        onChange={(e) => setIsUrgent(e.target.checked)}
                      />
                      Mark as Urgent Order
                    </label>
                  </div>

                  {feedbackError && <div className="ck-form-error" style={{ fontSize: '0.75rem', padding: '0.4rem' }}>{feedbackError}</div>}
                  {feedbackSuccess && <div className="ck-form-success" style={{ fontSize: '0.75rem', padding: '0.4rem' }}>{feedbackSuccess}</div>}

                  <button
                    type="submit"
                    className="ck-btn-submit"
                    style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem' }}
                    disabled={loading}
                  >
                    {loading ? <span className="spinner" /> : 'Confirm Place Order'}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* Order History */
          <div className="ck-list fade-in">
            <div className="ck-section-header">
              <h2 className="ck-section-title">Past Placed Orders</h2>
            </div>

            {orders.length === 0 ? (
              <div className="ck-empty">No orders found in history.</div>
            ) : (
              orders.map((o) => {
                const isExpanded = expandedOrderId === o.id;
                return (
                  <div key={o.id} className="ck-list-item" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="ck-list-item-main">
                        <div className="ck-list-item-title" style={{ fontSize: '0.9375rem' }}>
                          Order: <strong>{o.order_number}</strong>
                          <span className={`ck-status-badge ck-status-badge--${o.status.toLowerCase() === 'submitted' ? 'active' : 'inactive'}`}>
                            {o.status}
                          </span>
                          {o.is_urgent && <span className="ck-urgent-badge">Urgent ⚡</span>}
                        </div>
                        <div className="ck-list-item-meta" style={{ fontSize: '0.75rem' }}>
                          <span>Placed: {new Date(o.created_at).toLocaleDateString()}</span>
                          <span>Delivery Date: {new Date(o.delivery_date).toLocaleDateString()}</span>
                          <span>Items: {o.items.length}</span>
                        </div>
                      </div>
                      <div className="ck-list-item-actions" style={{ alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', marginRight: '0.75rem' }}>
                          ₹{o.total_amount.toFixed(2)}
                        </span>
                        <button
                          className="ck-btn-edit"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                        >
                          {isExpanded ? 'Hide Details ▲' : 'Show Details ▼'}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="fade-in" style={{ width: '100%', marginTop: '0.5rem', background: '#fafafa', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.4rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.2rem' }}>
                          Items Breakdown
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {o.items.map((it) => (
                            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span>{it.product_name} (x{it.quantity})</span>
                              <span>₹{(Number(it.total_price)).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        {o.remarks && (
                          <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', borderTop: '1px dashed var(--border)', paddingTop: '0.4rem', color: 'var(--text-light)' }}>
                            <strong>Remarks:</strong> {o.remarks}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* ── ROLES TAB ── */}
      {tab === 'roles' && (
        <div style={{ padding: '1.5rem 2rem' }} className="fade-in">
          <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
            <div>
              <h2 className="ck-section-title">🔐 Role Management</h2>
              <p className="ck-section-subtitle">View your restaurant roles and request custom roles</p>
            </div>
            {rolesSubTab !== 'new-request' && (
              <button className="ck-btn-add" onClick={() => { setRolesSubTab('new-request'); loadRolesData(); }}>+ Request New Role</button>
            )}
          </div>

          <div className="ck-tabs" style={{ marginBottom: '1.25rem' }}>
            {(['my-roles', 'requests'] as const).map(st => (
              <button key={st} className={`ck-tab ${rolesSubTab === st ? 'ck-tab--active' : ''}`}
                onClick={() => { setRolesSubTab(st); loadRolesData(); }}>
                {st === 'my-roles' ? 'My Roles' : 'Role Requests'}
              </button>
            ))}
          </div>

          {rolesLoading && <div className="ck-empty">Loading…</div>}

          {/* My Roles */}
          {!rolesLoading && rolesSubTab === 'my-roles' && (
            <div>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>🌐 Global Restaurant Roles</h3>
              <div className="ck-list" style={{ marginBottom: '1.5rem' }}>
                {tenantRoles.filter(r => r.role_scope === 'GLOBAL').length === 0
                  ? <div className="ck-empty">No global roles.</div>
                  : tenantRoles.filter(r => r.role_scope === 'GLOBAL').map(role => (
                    <div key={role.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">{role.name}<span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{role.type}</span></div>
                          <div className="ck-list-item-meta"><span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{role.role_permissions?.length ?? 0} permissions</span></div>
                        </div>
                        <button className="ck-btn-edit" onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}>
                          {expandedRoleId === role.id ? 'Hide ▲' : 'View ▼'}
                        </button>
                      </div>
                      {expandedRoleId === role.id && (
                        <div style={{ marginTop: '0.75rem', width: '100%' }}>
                          {Object.entries((role.role_permissions || []).reduce((acc: any, rp: any) => { const m = rp.permission.module; if (!acc[m]) acc[m] = []; acc[m].push(rp.permission); return acc; }, {})).map(([mod, perms]: any) => (
                            <div key={mod} style={{ marginBottom: '0.6rem' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{mod.replace(/_/g, ' ')}</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>{perms.map((p: any) => <span key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.12rem 0.45rem', fontSize: '0.72rem', color: 'var(--text-light)' }}>{p.action}</span>)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              <h3 style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '0.6rem', textTransform: 'uppercase' }}>🏢 Custom Roles</h3>
              <div className="ck-list">
                {tenantRoles.filter(r => r.role_scope === 'TENANT').length === 0
                  ? <div className="ck-empty">No custom roles. <button className="ck-link-btn" onClick={() => setRolesSubTab('new-request')}>Request one →</button></div>
                  : tenantRoles.filter(r => r.role_scope === 'TENANT').map(role => (
                    <div key={role.id} className="ck-list-item"><div className="ck-list-item-title">{role.name} <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: '999px', padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>v{role.current_version}</span></div></div>
                  ))}
              </div>
            </div>
          )}

          {/* Role Requests */}
          {!rolesLoading && rolesSubTab === 'requests' && (
            <div>
              {roleRequests.length === 0
                ? <div className="ck-empty">No role requests.</div>
                : <div className="ck-list">{roleRequests.map(req => (
                    <div key={req.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                      <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="ck-list-item-title">{req.role_name} <span style={{ borderRadius: '999px', padding: '0.12rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, background: req.status === 'PENDING' ? '#fff8e1' : req.status === 'APPROVED' ? '#e8f5e9' : '#fce4ec', color: req.status === 'PENDING' ? '#f57c00' : req.status === 'APPROVED' ? '#388e3c' : '#c62828' }}>{req.status === 'PENDING' ? '🟡 Pending' : req.status === 'APPROVED' ? '🟢 Approved' : '🔴 Rejected'}</span></div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>Submitted {new Date(req.created_at).toLocaleDateString()}</div>
                        </div>
                        <button className="ck-btn-edit" onClick={() => setExpandedReqId(expandedReqId === req.id ? null : req.id)}>{expandedReqId === req.id ? 'Less ▲' : 'Details ▼'}</button>
                      </div>
                      {expandedReqId === req.id && (
                        <div style={{ marginTop: '0.6rem', padding: '0.75rem', background: 'var(--surface)', borderRadius: '8px', width: '100%' }}>
                          {req.status === 'REJECTED' && req.remarks && <div style={{ background: '#fce4ec', color: '#c62828', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}><strong>Reason:</strong> {req.remarks}</div>}
                          {req.status === 'APPROVED' && req.approvedRole && <div style={{ color: '#388e3c', fontSize: '0.82rem' }}>✓ Role created: <strong>{req.approvedRole.name}</strong></div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              }
            </div>
          )}

          {/* New Request Form */}
          {rolesSubTab === 'new-request' && (
            <div style={{ maxWidth: '640px' }}>
              <h3 style={{ marginBottom: '1rem' }}>Request a New Restaurant Role</h3>
              {roleReqSuccess && <div style={{ padding: '0.65rem 1rem', background: '#e8f5e9', color: '#388e3c', borderRadius: '8px', marginBottom: '0.75rem' }}>{roleReqSuccess}</div>}
              {roleReqError && <div style={{ padding: '0.65rem 1rem', background: '#fce4ec', color: '#c62828', borderRadius: '8px', marginBottom: '0.75rem' }}>{roleReqError}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="ck-field"><label>Role Name *</label><input className="ck-input" value={roleReqForm.role_name} onChange={e => setRoleReqForm(f => ({ ...f, role_name: e.target.value }))} /></div>
                <div className="ck-field"><label>Description</label><textarea className="ck-input" rows={2} value={roleReqForm.description} onChange={e => setRoleReqForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div className="ck-field">
                  <label>Use Template</label>
                  <select className="ck-input" value={roleReqForm.template_role_id} onChange={async e => {
                    const tid = e.target.value;
                    setRoleReqForm(f => ({ ...f, template_role_id: tid }));
                    if (tid) {
                      try {
                        const res = await fetch(`${API}/roles/templates/${tid}/clone`, { headers: { Authorization: `Bearer ${accessToken}` } });
                        const data = await res.json();
                        setRoleReqForm(f => ({ ...f, permission_codes: data.data.permission_codes || [] }));
                      } catch {}
                    }
                  }}>
                    <option value="">— None —</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="ck-field">
                  <label style={{ marginBottom: '0.5rem', display: 'block' }}>Permissions</label>
                  {Object.entries(allPermissions.reduce((acc: any, p: any) => { if (!acc[p.module]) acc[p.module] = []; acc[p.module].push(p); return acc; }, {})).map(([mod, perms]: any) => (
                    <div key={mod} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>{mod.replace(/_/g, ' ')}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {perms.map((p: any) => { const checked = roleReqForm.permission_codes.includes(p.code); return (<label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', background: checked ? 'rgba(99,102,241,0.1)' : 'var(--surface)', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '6px', padding: '0.25rem 0.55rem', fontSize: '0.75rem', transition: 'all 0.15s' }}><input type="checkbox" checked={checked} onChange={e => setRoleReqForm(f => ({ ...f, permission_codes: e.target.checked ? [...f.permission_codes, p.code] : f.permission_codes.filter(c => c !== p.code) }))} style={{ accentColor: 'var(--primary)' }} />{p.action}</label>); })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="ck-btn-cancel" onClick={() => setRolesSubTab('my-roles')}>Cancel</button>
                  <button className="ck-btn-submit" disabled={roleReqSubmitting} onClick={async () => {
                    setRoleReqError(''); setRoleReqSuccess('');
                    if (!roleReqForm.role_name) { setRoleReqError('Role name required'); return; }
                    setRoleReqSubmitting(true);
                    try {
                      await fetch(`${API}/roles/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(roleReqForm) });
                      setRoleReqSuccess('✓ Request submitted!');
                      setRoleReqForm({ role_name: '', description: '', role_type: 'RESTAURANT', template_role_id: '', permission_codes: [] });
                      await loadRolesData();
                      setTimeout(() => setRolesSubTab('requests'), 1500);
                    } catch (err: any) { setRoleReqError(err.message || 'Failed'); }
                    finally { setRoleReqSubmitting(false); }
                  }}>{roleReqSubmitting ? 'Submitting…' : 'Submit Request'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
