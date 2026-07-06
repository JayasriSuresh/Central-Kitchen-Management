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

type Tab = 'new-order' | 'history';

export default function RestaurantHome() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('new-order');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

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
      <nav className="dash-nav">
        <div className="dash-nav-brand">
          <span>🍴</span> Restaurant Order Portal
        </div>
        <div className="dash-nav-actions">
          <span className="ck-user-name">{user?.name}</span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {/* Tabs */}
      <div className="ck-tabs">
        <button
          className={`ck-tab ${tab === 'new-order' ? 'ck-tab--active' : ''}`}
          onClick={() => setTab('new-order')}
        >
          🛍 Place Order
        </button>
        <button
          className={`ck-tab ${tab === 'history' ? 'ck-tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          📋 Order History ({orders.length})
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
    </div>
  );
}
