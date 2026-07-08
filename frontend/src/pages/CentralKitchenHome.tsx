import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role { id: number; name: string; code: string; type: string; }
interface Category { id: number; name: string; }
interface Unit { id: number; name: string; symbol: string; }
interface RawMaterial { id: number; name: string; category: string | null; unit_id: number | null; reorder_level: number | null; standard_price: number | null; unit?: { symbol: string }; }
interface RecipeRow { raw_material_id: string; quantity: string; unit_id: string; }

interface InventoryItem {
  id: number; name: string; category: string | null; unit: string;
  availableQuantity: number; batchCount: number; isLowStock: boolean;
  reorderLevel: number; nextExpiry: string | null; standardPrice: number;
}
interface InventoryBatch {
  id: number; batch_no: string | null; quantity: number; original_quantity: number;
  purchase_price: number; manufactured_date: string | null; expiry_date: string | null;
  supplier: string | null; remarks: string | null; created_at: string;
}
interface LedgerEntry {
  id: number; created_at: string; transaction_type: string;
  quantity: number; balance: number; remarks: string | null; created_by: string | null;
}

interface Restaurant {
  id: number; restaurant_id: number; restaurant_no: number; branch_code: string;
  name: string; address: string | null; gst_number: string | null; contact_number: string | null; status: string;
}
interface CkUser {
  id: number; user_id: string; name: string; username: string; email: string;
  mobile: string; status: string; primary_role_id: number; role_name: string; created_at: string;
}
interface RecipeIngredient {
  id: number; raw_material_id: number; raw_material_name: string;
  quantity: number; unit_id: number | null; unit_name: string | null;
}
interface Product {
  id: number; product_name: string; code: string;
  category_id: number | null; category_name: string | null;
  unit_id: number | null; unit_name: string | null;
  selling_price: number; tax_percent: number;
  moq: number | null; batch_size: number | null;
  shelf_life_days: number | null; order_cutoff_hours: number;
  lead_time_days: number; allow_urgent_order: boolean;
  status: string; description: string; image: string; cost_price: number;
  recipe: RecipeIngredient[]; recipe_id: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const emptyRestaurant = () => ({ name: '', address: '', gst_number: '', contact_number: '' });
const emptyUser = () => ({ name: '', email: '', mobile: '', role_id: '', password: '', confirm_password: '' });
const emptyProduct = () => ({
  product_name: '', description: '', image: '', cost_price: '',
  category_id: '', unit_id: '', moq: '', batch_size: '', selling_price: '', tax_percent: '0',
  shelf_life_days: '', order_cutoff_hours: '0', lead_time_days: '0', allow_urgent_order: true,
});
const emptyRecipeRow = (): RecipeRow => ({ raw_material_id: '', quantity: '', unit_id: '' });
const emptyRmForm = () => ({ name: '', category: '', unit_id: '', reorder_level: '', standard_price: '', status: 'active' });
const emptyBatchForm = () => ({ raw_material_id: '', quantity: '', purchase_price: '', batch_no: '', manufactured_date: '', expiry_date: '', supplier: '', remarks: '' });
const emptyAdjForm = () => ({ raw_material_id: '', quantity: '', reason: 'Damage', remarks: '' });

const emptyInvite = () => ({ restaurant_name: '', contact_person: '', email: '', notes: '' });

const ADJUSTMENT_REASONS = ['Damage', 'Spill', 'Spoilage', 'Return', 'Count Correction', 'Other'];

const formatDateShort = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const txLabel: Record<string, string> = {
  inward: '📦 Purchase', outward: '📤 Outward', wastage: '🗑 Wastage',
  adjustment: '🔧 Adjustment', production_consumption: '🍳 Production', production_output: '✅ Output'
};

// ─── Section Tab ──────────────────────────────────────────────────────────────
type Section = 'dashboard' | 'restaurants' | 'requests' | 'users' | 'products' | 'raw-materials' | 'inventory';

interface OnboardingRequest {
  id: number;
  restaurant_name: string;
  contact_person: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  notes: string | null;
  city: string | null;
}

interface RestaurantOrderLine {
  restaurant_name: string;
  branch_code: string;
  order_number: string;
  order_id: number;
  delivery_date: string;
  status: string;
  is_urgent: boolean;
  quantity: number;
  total_price: number;
}

interface OrderSummaryItem {
  product_id: number;
  product_name: string;
  unit_symbol: string;
  total_quantity: number;
  total_orders: number;
  total_value: number;
  restaurants: RestaurantOrderLine[];
}

export default function CentralKitchenHome() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('dashboard');

  // Onboarding requests state
  const [onboardings, setOnboardings] = useState<OnboardingRequest[]>([]);
  const [selectedOnboardingDetail, setSelectedOnboardingDetail] = useState<any | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState<'approve' | 'reject' | 'changes' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [inviteForm, setInviteForm] = useState(emptyInvite());

  // Orders dashboard
  const [ordersSummary, setOrdersSummary] = useState<OrderSummaryItem[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);

  // Dropdown data
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);

  // Data lists
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [ckUsers, setCkUsers] = useState<CkUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [rForm, setRForm] = useState(emptyRestaurant());
  const [uForm, setUForm] = useState(emptyUser());
  const [pForm, setPForm] = useState(emptyProduct());
  const [recipe, setRecipe] = useState<RecipeRow[]>([emptyRecipeRow()]);

  // Inventory state
  const [inventoryDashboard, setInventoryDashboard] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [rmSearch, setRmSearch] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [batchForm, setBatchForm] = useState(emptyBatchForm());
  const [adjForm, setAdjForm] = useState(emptyAdjForm());
  const [selectedRmDetail, setSelectedRmDetail] = useState<InventoryItem | null>(null);
  const [rmBatches, setRmBatches] = useState<InventoryBatch[]>([]);
  const [rmHistory, setRmHistory] = useState<LedgerEntry[]>([]);
  const [detailTab, setDetailTab] = useState<'batches' | 'history'>('batches');
  const [rmForm, setRmForm] = useState(emptyRmForm());
  const [showRmForm, setShowRmForm] = useState(false);
  const [editRmId, setEditRmId] = useState<number | null>(null);
  const [invError, setInvError] = useState('');
  const [invSuccess, setInvSuccess] = useState('');

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const handleLogout = () => { logout(); navigate('/login'); };

  const fetchInventoryDashboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/inventory/dashboard`, { headers: authHeader });
      setInventoryDashboard(res.data.dashboard);
    } catch (err: any) {
      console.error('Failed to load inventory dashboard', err);
    }
  }, [accessToken]);

  const fetchRawMaterials = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/inventory/raw-materials`, { headers: authHeader });
      setRawMaterials(res.data.rawMaterials);
    } catch (err: any) {
      console.error('Failed to load raw materials', err);
    }
  }, [accessToken]);

  const fetchAll = useCallback(async () => {
    try {
      const [dd, rRes, uRes, pRes, sRes, oRes] = await Promise.all([
        axios.get(`${API}/admin/dropdown-data`, { headers: authHeader }),
        axios.get(`${API}/admin/restaurants`, { headers: authHeader }),
        axios.get(`${API}/admin/users/ck`, { headers: authHeader }),
        axios.get(`${API}/admin/products`, { headers: authHeader }),
        axios.get(`${API}/admin/orders/summary`, { headers: authHeader }),
        axios.get(`${API}/admin/restaurants/onboarding`, { headers: authHeader }),
      ]);
      setRoles(dd.data.roles);
      setCategories(dd.data.categories);
      setUnits(dd.data.units);
      setRawMaterials(dd.data.rawMaterials);
      setRestaurants(rRes.data.restaurants);
      setCkUsers(uRes.data.users);
      setProducts(pRes.data.products);
      setOrdersSummary(sRes.data.summary);
      setOnboardings(oRes.data.onboardings);
    } catch (err: any) {
      if (err.response?.status === 401) { logout(); navigate('/login'); }
      console.error('Failed to load data', err);
    }
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (section === 'inventory') fetchInventoryDashboard(); }, [section, fetchInventoryDashboard]);
  useEffect(() => { if (section === 'raw-materials') fetchRawMaterials(); }, [section, fetchRawMaterials]);

  const openRmDetail = async (item: InventoryItem) => {
    setSelectedRmDetail(item);
    setDetailTab('batches');
    try {
      const [bRes, hRes] = await Promise.all([
        axios.get(`${API}/inventory/raw-materials/${item.id}/batches`, { headers: authHeader }),
        axios.get(`${API}/inventory/raw-materials/${item.id}/history`, { headers: authHeader }),
      ]);
      setRmBatches(bRes.data.batches);
      setRmHistory(hRes.data.history);
    } catch (err) { console.error(err); }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(''); setLoading(true);
    try {
      await axios.post(`${API}/inventory/batches`, batchForm, { headers: authHeader });
      setInvSuccess('Inventory updated!');
      setShowBatchModal(false);
      setBatchForm(emptyBatchForm());
      await fetchInventoryDashboard();
      setTimeout(() => setInvSuccess(''), 3000);
    } catch (err: any) {
      setInvError(err.response?.data?.message ?? 'Failed to update inventory');
    } finally { setLoading(false); }
  };

  const handleAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(''); setLoading(true);
    try {
      await axios.post(`${API}/inventory/adjustments`, adjForm, { headers: authHeader });
      setInvSuccess('Stock adjusted successfully!');
      setShowAdjModal(false);
      setAdjForm(emptyAdjForm());
      await fetchInventoryDashboard();
      setTimeout(() => setInvSuccess(''), 3000);
    } catch (err: any) {
      setInvError(err.response?.data?.message ?? 'Failed to adjust stock');
    } finally { setLoading(false); }
  };

  const handleRmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(''); setLoading(true);
    try {
      if (editRmId) {
        await axios.put(`${API}/inventory/raw-materials/${editRmId}`, rmForm, { headers: authHeader });
      } else {
        await axios.post(`${API}/inventory/raw-materials`, rmForm, { headers: authHeader });
      }
      setInvSuccess(editRmId ? 'Updated!' : 'Raw material created!');
      setShowRmForm(false);
      setEditRmId(null);
      setRmForm(emptyRmForm());
      await fetchRawMaterials();
      setTimeout(() => setInvSuccess(''), 3000);
    } catch (err: any) {
      setInvError(err.response?.data?.message ?? 'Operation failed');
    } finally { setLoading(false); }
  };

  const handleDeleteRm = async (id: number) => {
    setLoading(true);
    try {
      await axios.delete(`${API}/inventory/raw-materials/${id}`, { headers: authHeader });
      setDeleteConfirm(null);
      await fetchRawMaterials();
    } catch (err: any) {
      setInvError(err.response?.data?.message ?? 'Delete failed');
    } finally { setLoading(false); }
  };

  // ── Form open helpers ──
  const openAdd = () => {
    setEditId(null); setFormError(''); setFormSuccess(''); setShowForm(true);
    setRForm(emptyRestaurant()); setUForm(emptyUser()); setPForm(emptyProduct());
    setInviteForm(emptyInvite());
    setRecipe([emptyRecipeRow()]);
  };

  const openEdit = (item: any) => {
    setEditId(item.id); setFormError(''); setFormSuccess(''); setShowForm(true);
    if (section === 'restaurants') {
      setRForm({ name: item.name, address: item.address ?? '', gst_number: item.gst_number ?? '', contact_number: item.contact_number ?? '' });
    } else if (section === 'users') {
      setUForm({ name: item.name, email: item.email, mobile: item.mobile, role_id: String(item.primary_role_id), password: '', confirm_password: '' });
    } else {
      setPForm({
        product_name: item.product_name, description: item.description, image: item.image,
        cost_price: String(item.cost_price), category_id: String(item.category_id ?? ''),
        unit_id: String(item.unit_id ?? ''), moq: String(item.moq ?? ''), batch_size: String(item.batch_size ?? ''),
        selling_price: String(item.selling_price), tax_percent: String(item.tax_percent),
        shelf_life_days: String(item.shelf_life_days ?? ''), order_cutoff_hours: String(item.order_cutoff_hours),
        lead_time_days: String(item.lead_time_days), allow_urgent_order: item.allow_urgent_order,
      });
      setRecipe(item.recipe.length > 0
        ? item.recipe.map((r: RecipeIngredient) => ({ raw_material_id: String(r.raw_material_id), quantity: String(r.quantity), unit_id: String(r.unit_id ?? '') }))
        : [emptyRecipeRow()]);
    }
  };

  const closeForm = () => { setShowForm(false); setEditId(null); setFormError(''); setFormSuccess(''); };

  // ── Submit handlers ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(''); setLoading(true);
    try {
      if (section === 'restaurants') {
        if (editId) {
          await axios.put(`${API}/admin/restaurants/${editId}`, rForm, { headers: authHeader });
        } else {
          // Invite flow for new restaurant onboarding
          await axios.post(`${API}/admin/restaurants/invite`, inviteForm, { headers: authHeader });
          setInviteForm(emptyInvite());
        }
      } else if (section === 'users') {
        if (uForm.password !== uForm.confirm_password) { setFormError('Passwords do not match'); setLoading(false); return; }
        const payload = { name: uForm.name, email: uForm.email, mobile: uForm.mobile, role_id: Number(uForm.role_id), password: uForm.password || undefined };
        if (editId) await axios.put(`${API}/admin/users/ck/${editId}`, payload, { headers: authHeader });
        else {
          if (!uForm.password) { setFormError('Password is required'); setLoading(false); return; }
          await axios.post(`${API}/admin/users/ck`, payload, { headers: authHeader });
        }
      } else {
        // Validate recipe rows
        const selectedMaterials = new Set<string>();
        for (const row of recipe) {
          if (!row.raw_material_id || !row.quantity) {
            setFormError('All recipe rows must have a raw material and quantity');
            setLoading(false);
            return;
          }
          if (selectedMaterials.has(row.raw_material_id)) {
            setFormError('Each raw material can only be selected once per recipe');
            setLoading(false);
            return;
          }
          selectedMaterials.add(row.raw_material_id);
        }
        const payload = { ...pForm, recipe };
        if (editId) await axios.put(`${API}/admin/products/${editId}`, payload, { headers: authHeader });
        else await axios.post(`${API}/admin/products`, payload, { headers: authHeader });
      }
      setFormSuccess(editId ? 'Updated successfully!' : 'Created successfully!');
      await fetchAll();
      setTimeout(closeForm, 1200);
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setLoading(true);
    try {
      if (section === 'restaurants') await axios.delete(`${API}/admin/restaurants/${id}`, { headers: authHeader });
      else if (section === 'users') await axios.delete(`${API}/admin/users/ck/${id}`, { headers: authHeader });
      else await axios.delete(`${API}/admin/products/${id}`, { headers: authHeader });
      setDeleteConfirm(null);
      await fetchAll();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Recipe row helpers ──
  const addRecipeRow = () => setRecipe([...recipe, emptyRecipeRow()]);
  const updateRecipeRow = (i: number, field: keyof RecipeRow, val: string) => {
    const next = [...recipe]; next[i] = { ...next[i], [field]: val }; setRecipe(next);
  };
  const removeRecipeRow = (i: number) => { if (recipe.length > 1) setRecipe(recipe.filter((_, idx) => idx !== i)); };

  const ckRoles = roles.filter(r => r.type === 'central_kitchen');

  return (
    <div className="ck-page">
      {/* Nav */}
      <nav className="dash-nav">
        <div className="dash-nav-brand"><span>🍽</span> Central Kitchen</div>
        <div className="dash-nav-actions">
          <span className="ck-user-name">{user?.name}</span>
          <button className="btn-ghost" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {/* Section tabs */}
      <div className="ck-tabs">
        {(['dashboard', 'restaurants', 'requests', 'users', 'products', 'raw-materials', 'inventory'] as Section[]).map(s => {
          const pendingCount = onboardings.filter(o => o.status === 'submitted' || o.status === 'submitted_again').length;
          return (
            <button
              key={s}
              id={`tab-${s}`}
              className={`ck-tab ${section === s ? 'ck-tab--active' : ''}`}
              onClick={() => { setSection(s); setShowForm(false); setDeleteConfirm(null); setExpandedProductId(null); setSelectedRmDetail(null); setShowRmForm(false); setShowBatchModal(false); setShowAdjModal(false); }}
            >
              {s === 'dashboard' && '📊 Orders'}
              {s === 'restaurants' && '🏪 Restaurants'}
              {s === 'requests' && (
                <>
                  🏪 Requests
                  {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
                </>
              )}
              {s === 'users' && '👤 Users'}
              {s === 'products' && '📦 Products'}
              {s === 'raw-materials' && '🌾 Raw Materials'}
              {s === 'inventory' && '📦 Inventory'}
            </button>
          );
        })}
      </div>

      <main className="ck-body">
        {/* ── ORDERS DASHBOARD ── */}
        {section === 'dashboard' && (
          <div className="fade-in">
            <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="ck-section-title">📊 Production Order Summary</h2>
              <button className="ck-btn-add" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-light)' }} onClick={fetchAll}>
                ↻ Refresh
              </button>
            </div>

            {ordersSummary.length === 0 ? (
              <div className="ck-empty">No active orders from restaurants yet.</div>
            ) : (
              <>
                {/* Summary stats row */}
                <div className="ck-dash-stats">
                  <div className="ck-stat-card">
                    <div className="ck-stat-value">{ordersSummary.length}</div>
                    <div className="ck-stat-label">Products Ordered</div>
                  </div>
                  <div className="ck-stat-card">
                    <div className="ck-stat-value">{ordersSummary.reduce((s, p) => s + p.total_orders, 0)}</div>
                    <div className="ck-stat-label">Total Order Lines</div>
                  </div>
                  <div className="ck-stat-card">
                    <div className="ck-stat-value">₹{ordersSummary.reduce((s, p) => s + p.total_value, 0).toFixed(0)}</div>
                    <div className="ck-stat-label">Total Order Value</div>
                  </div>
                </div>

                {/* Per-product rows */}
                <div className="ck-list">
                  {ordersSummary.map(item => {
                    const isExpanded = expandedProductId === item.product_id;
                    return (
                      <div key={item.product_id} className="ck-list-item" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                        {/* Product summary row */}
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="ck-list-item-main">
                            <div className="ck-list-item-title">{item.product_name}</div>
                            <div className="ck-list-item-meta">
                              <span>From <strong>{item.total_orders}</strong> restaurant order{item.total_orders > 1 ? 's' : ''}</span>
                              <span className="ck-urgent-badge" style={{ background: '#fff0f3', color: '#c0392b' }}>
                                Total: <strong>{item.total_quantity} {item.unit_symbol}</strong> needed
                              </span>
                              <span style={{ color: 'var(--text-light)' }}>₹{item.total_value.toFixed(2)}</span>
                            </div>
                          </div>
                          <button
                            className="ck-btn-edit"
                            style={{ flexShrink: 0 }}
                            onClick={() => setExpandedProductId(isExpanded ? null : item.product_id)}
                          >
                            {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                          </button>
                        </div>

                        {/* Per-restaurant breakdown */}
                        {isExpanded && (
                          <div className="fade-in ck-dash-breakdown">
                            <div className="ck-dash-breakdown-head">
                              <span>Restaurant</span>
                              <span>Order No.</span>
                              <span>Delivery Date</span>
                              <span>Qty</span>
                              <span>Amount</span>
                              <span>Status</span>
                            </div>
                            {item.restaurants.map((r, idx) => (
                              <div key={idx} className="ck-dash-breakdown-row">
                                <span>
                                  <strong>{r.restaurant_name}</strong>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginLeft: '0.25rem' }}>{r.branch_code}</span>
                                  {r.is_urgent && <span className="ck-urgent-badge" style={{ marginLeft: '0.25rem', fontSize: '0.65rem' }}>Urgent ⚡</span>}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>{r.order_number}</span>
                                <span>{new Date(r.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                <span><strong>{r.quantity}</strong> {item.unit_symbol}</span>
                                <span>₹{Number(r.total_price).toFixed(2)}</span>
                                <span className={`ck-status-badge ck-status-badge--${r.status === 'SUBMITTED' || r.status === 'ACCEPTED' ? 'active' : 'inactive'}`}>
                                  {r.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Header row (only for non-dashboard tabs) */}
        {['restaurants', 'users', 'products'].includes(section) && (
        <div className="ck-section-header">
          <h2 className="ck-section-title">
            {section === 'restaurants' ? 'Restaurants' : section === 'users' ? 'CK Users' : 'Products'}
          </h2>
          {!showForm && (
            <button id="btn-add" className="ck-btn-add" onClick={openAdd}>
              + Add {section === 'restaurants' ? 'Restaurant' : section === 'users' ? 'User' : 'Product'}
            </button>
          )}
        </div>
        )}

        {/* ── FORM ── */}
        {showForm && (
          <div className="ck-form-card fade-in">
            <div className="ck-form-title">
              {section === 'restaurants' && !editId ? 'Invite Restaurant' : (editId ? 'Edit ' : 'Add ') + (section === 'restaurants' ? 'Restaurant' : section === 'users' ? 'User' : 'Product')}
            </div>
            <form onSubmit={handleSubmit} noValidate>

              {/* Restaurant form */}
              {section === 'restaurants' && (
                editId ? (
                  <div className="ck-form-grid">
                    <div className="ck-field"><label>Restaurant Name *</label><input className="ck-input" required value={rForm.name} onChange={e => setRForm({ ...rForm, name: e.target.value })} placeholder="e.g. Biryani Hub" /></div>
                    <div className="ck-field"><label>Contact Number</label><input className="ck-input" value={rForm.contact_number} onChange={e => setRForm({ ...rForm, contact_number: e.target.value })} placeholder="9876543210" /></div>
                    <div className="ck-field ck-field--full"><label>Address</label><textarea className="ck-input ck-textarea" value={rForm.address} onChange={e => setRForm({ ...rForm, address: e.target.value })} placeholder="Full address" /></div>
                    <div className="ck-field"><label>GST Number</label><input className="ck-input" value={rForm.gst_number} onChange={e => setRForm({ ...rForm, gst_number: e.target.value })} placeholder="27AAPFU0939F1ZV" /></div>
                  </div>
                ) : (
                  <div className="ck-form-grid">
                    <div className="ck-field"><label>Restaurant Name *</label><input className="ck-input" required value={inviteForm.restaurant_name} onChange={e => setInviteForm({ ...inviteForm, restaurant_name: e.target.value })} placeholder="e.g. ABC Grill" /></div>
                    <div className="ck-field"><label>Contact Person *</label><input className="ck-input" required value={inviteForm.contact_person} onChange={e => setInviteForm({ ...inviteForm, contact_person: e.target.value })} placeholder="John Doe" /></div>
                    <div className="ck-field ck-field--full"><label>Email Address *</label><input type="email" className="ck-input" required value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} placeholder="manager@abcgrill.com" /></div>
                    <div className="ck-field ck-field--full"><label>Notes (Optional)</label><textarea className="ck-input ck-textarea" value={inviteForm.notes} onChange={e => setInviteForm({ ...inviteForm, notes: e.target.value })} placeholder="Any onboarding notes..." /></div>
                  </div>
                )
              )}

              {/* User form */}
              {section === 'users' && (
                <div className="ck-form-grid">
                  <div className="ck-field"><label>Full Name *</label><input className="ck-input" required value={uForm.name} onChange={e => setUForm({ ...uForm, name: e.target.value })} /></div>
                  <div className="ck-field"><label>Email *</label><input type="email" className="ck-input" required value={uForm.email} onChange={e => setUForm({ ...uForm, email: e.target.value })} disabled={!!editId} /></div>
                  <div className="ck-field"><label>Mobile *</label><input className="ck-input" required value={uForm.mobile} onChange={e => setUForm({ ...uForm, mobile: e.target.value })} /></div>
                  <div className="ck-field"><label>Role *</label>
                    <select className="ck-select" value={uForm.role_id} onChange={e => setUForm({ ...uForm, role_id: e.target.value })} required>
                      <option value="">Select role</option>
                      {ckRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  {!editId && <>
                    <div className="ck-field"><label>Password *</label><input type="password" className="ck-input" required value={uForm.password} onChange={e => setUForm({ ...uForm, password: e.target.value })} /></div>
                    <div className="ck-field"><label>Confirm Password *</label><input type="password" className="ck-input" required value={uForm.confirm_password} onChange={e => setUForm({ ...uForm, confirm_password: e.target.value })} /></div>
                  </>}
                </div>
              )}

              {/* Product form */}
              {section === 'products' && (
                <>
                  <div className="ck-form-grid">
                    <div className="ck-field"><label>Product Name *</label><input className="ck-input" required value={pForm.product_name} onChange={e => setPForm({ ...pForm, product_name: e.target.value })} /></div>
                    <div className="ck-field"><label>Category</label>
                      <select className="ck-select" value={pForm.category_id} onChange={e => setPForm({ ...pForm, category_id: e.target.value })}>
                        <option value="">None</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="ck-field ck-field--full"><label>Description</label><textarea className="ck-input ck-textarea" value={pForm.description} onChange={e => setPForm({ ...pForm, description: e.target.value })} /></div>
                    <div className="ck-field"><label>Cost Price (₹)</label><input type="number" min="0" step="0.01" className="ck-input" value={pForm.cost_price} onChange={e => setPForm({ ...pForm, cost_price: e.target.value })} /></div>
                    <div className="ck-field"><label>Selling Price (₹) *</label><input type="number" min="0" step="0.01" className="ck-input" required value={pForm.selling_price} onChange={e => setPForm({ ...pForm, selling_price: e.target.value })} /></div>
                    <div className="ck-field"><label>Tax %</label><input type="number" min="0" max="100" step="0.01" className="ck-input" value={pForm.tax_percent} onChange={e => setPForm({ ...pForm, tax_percent: e.target.value })} /></div>
                    <div className="ck-field"><label>Batch Size</label><input type="number" min="0" className="ck-input" value={pForm.batch_size} onChange={e => setPForm({ ...pForm, batch_size: e.target.value })} /></div>
                    <div className="ck-field"><label>Min. Order Qty (MOQ)</label><input type="number" min="0" className="ck-input" value={pForm.moq} onChange={e => setPForm({ ...pForm, moq: e.target.value })} /></div>
                    <div className="ck-field"><label>Unit</label>
                      <select className="ck-select" value={pForm.unit_id} onChange={e => setPForm({ ...pForm, unit_id: e.target.value })}>
                        <option value="">None</option>
                        {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                      </select>
                    </div>
                    <div className="ck-field"><label>Shelf Life (days)</label><input type="number" min="0" className="ck-input" value={pForm.shelf_life_days} onChange={e => setPForm({ ...pForm, shelf_life_days: e.target.value })} /></div>
                    <div className="ck-field"><label>Order Cutoff (hours before delivery)</label><input type="number" min="0" className="ck-input" value={pForm.order_cutoff_hours} onChange={e => setPForm({ ...pForm, order_cutoff_hours: e.target.value })} /></div>
                    <div className="ck-field"><label>Lead Time (days)</label><input type="number" min="0" className="ck-input" value={pForm.lead_time_days} onChange={e => setPForm({ ...pForm, lead_time_days: e.target.value })} /></div>
                    <div className="ck-field ck-field--check">
                      <label className="ck-check-label">
                        <input type="checkbox" checked={pForm.allow_urgent_order as boolean} onChange={e => setPForm({ ...pForm, allow_urgent_order: e.target.checked })} />
                        Allow Urgent Orders
                      </label>
                    </div>
                  </div>

                  {/* Recipe builder */}
                  <div className="ck-recipe-section">
                    <div className="ck-recipe-header">
                      <span className="ck-recipe-title">Recipe Ingredients</span>
                      <button type="button" className="ck-btn-plus" onClick={addRecipeRow}>＋ Add Ingredient</button>
                    </div>
                    <div className="ck-recipe-table">
                      <div className="ck-recipe-row ck-recipe-row--head">
                        <span>Raw Material *</span><span>Amount *</span><span>Unit</span><span></span>
                      </div>
                      {recipe.map((row, i) => (
                        <div key={i} className="ck-recipe-row">
                          <select className="ck-select" value={row.raw_material_id} onChange={e => updateRecipeRow(i, 'raw_material_id', e.target.value)}>
                            <option value="">Select...</option>
                            {rawMaterials.map(rm => {
                              const isSelectedElsewhere = recipe.some((r, idx) => idx !== i && String(r.raw_material_id) === String(rm.id));
                              return (
                                <option key={rm.id} value={rm.id} disabled={isSelectedElsewhere}>
                                  {rm.name} {isSelectedElsewhere ? '(Selected)' : ''}
                                </option>
                              );
                            })}
                          </select>
                          <input type="number" min="0" step="0.001" className="ck-input" placeholder="e.g. 1.5" value={row.quantity} onChange={e => updateRecipeRow(i, 'quantity', e.target.value)} />
                          <select className="ck-select" value={row.unit_id} onChange={e => updateRecipeRow(i, 'unit_id', e.target.value)}>
                            <option value="">Unit</option>
                            {units.map(u => <option key={u.id} value={u.id}>{u.symbol}</option>)}
                          </select>
                          <button type="button" className="ck-btn-remove" onClick={() => removeRecipeRow(i)} disabled={recipe.length === 1}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {formError && <div className="ck-form-error">{formError}</div>}
              {formSuccess && <div className="ck-form-success">{formSuccess}</div>}

              <div className="ck-form-actions">
                <button type="button" className="ck-btn-cancel" onClick={closeForm}>Cancel</button>
                <button type="submit" className="ck-btn-submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : (section === 'restaurants' && !editId) ? 'Send Invitation' : editId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── LISTS ── */}

        {/* Restaurants list */}
        {section === 'restaurants' && !showForm && (
          <div className="ck-list fade-in">
            {restaurants.length === 0
              ? <div className="ck-empty">No restaurants yet. Click "+ Add Restaurant" to get started.</div>
              : restaurants.map(r => (
                <div key={r.id} className="ck-list-item">
                  <div className="ck-list-item-main">
                    <div className="ck-list-item-title">{r.name}</div>
                    <div className="ck-list-item-meta">
                      <span>Branch: <strong>{r.branch_code}</strong></span>
                      {r.contact_number && <span>📞 {r.contact_number}</span>}
                      {r.gst_number && <span>GST: {r.gst_number}</span>}
                      {r.address && <span>📍 {r.address}</span>}
                    </div>
                  </div>
                  <div className="ck-list-item-actions">
                    <button className="ck-btn-edit" onClick={() => openEdit(r)}>Edit</button>
                    {deleteConfirm === r.id
                      ? <><span className="ck-confirm-text">Sure?</span>
                          <button className="ck-btn-delete-confirm" onClick={() => handleDelete(r.id)}>Yes, Delete</button>
                          <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                      : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(r.id)}>Delete</button>}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ── RESTAURANT REQUESTS TAB ── */}
        {section === 'requests' && (
          <div className="fade-in">
            <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="ck-section-title">🏪 Restaurant Requests</h2>
              <button className="ck-btn-add" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-light)' }} onClick={fetchAll}>↻ Refresh</button>
            </div>
            {onboardings.length === 0 ? (
              <div className="ck-empty">No onboarding requests yet. Use "Restaurants → + Add Restaurant" to send an invitation.</div>
            ) : (
              <div className="ck-list">
                {onboardings.map(ob => (
                  <div key={ob.id} className="ck-list-item">
                    <div className="ck-list-item-main">
                      <div className="ck-list-item-title">
                        {ob.restaurant_name}
                        <span className={`ob-status ob-status--${ob.status}`} style={{ marginLeft: '0.5rem' }}>{ob.status.replace('_', ' ')}</span>
                      </div>
                      <div className="ck-list-item-meta">
                        <span>👤 {ob.contact_person}</span>
                        <span>📧 {ob.email}</span>
                        {ob.city && <span>📍 {ob.city}</span>}
                        <span style={{ color: 'var(--text-light)', fontSize: '0.75rem' }}>Sent: {new Date(ob.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="ck-list-item-actions">
                      {(ob.status === 'submitted') && (
                        <button className="ck-btn-edit" onClick={async () => {
                          try {
                            const res = await axios.get(`${API}/admin/restaurants/onboarding/${ob.id}`, { headers: authHeader });
                            setSelectedOnboardingDetail(res.data.onboarding);
                            setShowReviewModal(true);
                          } catch (err: any) {
                            alert(err.response?.data?.message ?? 'Failed to load details');
                          }
                        }}>Review</button>
                      )}
                      {(ob.status === 'invited' || ob.status === 'changes_requested') && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Awaiting response</span>
                      )}
                      {ob.status === 'approved' && <span style={{ color: '#2e7d32', fontSize: '0.8rem' }}>✓ Approved</span>}
                      {ob.status === 'rejected' && <span style={{ color: '#c62828', fontSize: '0.8rem' }}>✗ Rejected</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Review Modal */}
            {showReviewModal && selectedOnboardingDetail && (
              <div className="review-overlay" onClick={() => setShowReviewModal(false)}>
                <div className="review-modal" onClick={e => e.stopPropagation()}>
                  <div className="review-header">
                    <h3 className="review-title">Review: {selectedOnboardingDetail.restaurant_name}</h3>
                    <button className="review-close" onClick={() => setShowReviewModal(false)}>×</button>
                  </div>
                  <div className="review-body">
                    <div className="review-section">
                      <div className="review-section-title">Restaurant Details</div>
                      <div className="review-grid">
                        <div className="review-item"><strong>Restaurant Name</strong>{selectedOnboardingDetail.restaurant_name}</div>
                        <div className="review-item"><strong>Trading Name</strong>{selectedOnboardingDetail.trading_name || '—'}</div>
                        <div className="review-item"><strong>Company Reg No.</strong>{selectedOnboardingDetail.company_reg_no || '—'}</div>
                        <div className="review-item"><strong>VAT Number</strong>{selectedOnboardingDetail.vat_no || '—'}</div>
                        <div className="review-item review-item-full"><strong>Address</strong>{selectedOnboardingDetail.address || '—'}</div>
                        <div className="review-item"><strong>City</strong>{selectedOnboardingDetail.city || '—'}</div>
                        <div className="review-item"><strong>Postcode</strong>{selectedOnboardingDetail.postcode || '—'}</div>
                      </div>
                    </div>
                    <div className="review-section">
                      <div className="review-section-title">Contact</div>
                      <div className="review-grid">
                        <div className="review-item"><strong>Contact Person</strong>{selectedOnboardingDetail.contact_person}</div>
                        <div className="review-item"><strong>Phone</strong>{selectedOnboardingDetail.phone || '—'}</div>
                        <div className="review-item review-item-full"><strong>Email</strong>{selectedOnboardingDetail.email}</div>
                      </div>
                    </div>
                    <div className="review-section">
                      <div className="review-section-title">Delivery &amp; Billing</div>
                      <div className="review-grid">
                        <div className="review-item"><strong>Opening Hours</strong>{selectedOnboardingDetail.opening_hours || '—'}</div>
                        <div className="review-item"><strong>Preferred Delivery Days</strong>{selectedOnboardingDetail.preferred_delivery_days || '—'}</div>
                        <div className="review-item"><strong>Preferred Delivery Time</strong>{selectedOnboardingDetail.preferred_delivery_time || '—'}</div>
                        <div className="review-item"><strong>Accounts Email</strong>{selectedOnboardingDetail.accounts_email || '—'}</div>
                        <div className="review-item"><strong>Payment Terms</strong>{selectedOnboardingDetail.payment_terms || '—'}</div>
                        <div className="review-item"><strong>PO Required</strong>{selectedOnboardingDetail.po_required ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                    {showActionModal && (
                      <div className="review-section">
                        <div className="review-section-title">{showActionModal === 'reject' ? 'Rejection Reason' : 'Changes Required'}</div>
                        <textarea
                          className="ck-input ck-textarea"
                          rows={3}
                          placeholder={showActionModal === 'reject' ? 'State why this application is being rejected...' : 'Describe what needs to be corrected...'}
                          value={actionReason}
                          onChange={e => setActionReason(e.target.value)}
                          autoFocus
                        />
                      </div>
                    )}
                  </div>
                  <div className="review-actions">
                    {showActionModal ? (
                      <>
                        <button className="ck-btn-cancel" onClick={() => { setShowActionModal(null); setActionReason(''); }}>Back</button>
                        <button
                          className={showActionModal === 'reject' ? 'review-btn-reject' : 'review-btn-changes'}
                          disabled={loading || !actionReason.trim()}
                          onClick={async () => {
                            if (!actionReason.trim()) return;
                            setLoading(true);
                            try {
                              const endpoint = showActionModal === 'reject' ? 'reject' : 'request-changes';
                              await axios.post(`${API}/admin/restaurants/onboarding/${selectedOnboardingDetail.id}/${endpoint}`, { reason: actionReason }, { headers: authHeader });
                              setShowReviewModal(false);
                              setShowActionModal(null);
                              setActionReason('');
                              setSelectedOnboardingDetail(null);
                              await fetchAll();
                              setFormSuccess(showActionModal === 'reject' ? 'Application rejected.' : 'Changes requested. Email sent.');
                              setTimeout(() => setFormSuccess(''), 3000);
                            } catch (err: any) {
                              setFormError(err.response?.data?.message ?? 'Action failed');
                            } finally { setLoading(false); }
                          }}
                        >
                          {showActionModal === 'reject' ? 'Confirm Rejection' : 'Send Changes Request'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="review-btn-reject" onClick={() => { setShowActionModal('reject'); setActionReason(''); }}>Reject</button>
                        <button className="review-btn-changes" onClick={() => { setShowActionModal('changes'); setActionReason(''); }}>Request Changes</button>
                        <button
                          className="review-btn-approve"
                          disabled={loading}
                          onClick={async () => {
                            setLoading(true);
                            try {
                              await axios.post(`${API}/admin/restaurants/onboarding/${selectedOnboardingDetail.id}/approve`, {}, { headers: authHeader });
                              setShowReviewModal(false);
                              setSelectedOnboardingDetail(null);
                              await fetchAll();
                              setFormSuccess('Restaurant approved! Welcome email sent.');
                              setTimeout(() => setFormSuccess(''), 3000);
                            } catch (err: any) {
                              setFormError(err.response?.data?.message ?? 'Approval failed');
                            } finally { setLoading(false); }
                          }}
                        >
                          {loading ? '...' : '✓ Approve'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Users list */}
        {section === 'users' && !showForm && (
          <div className="ck-list fade-in">
            {ckUsers.length === 0
              ? <div className="ck-empty">No users yet. Click "+ Add User" to get started.</div>
              : ckUsers.map(u => (
                <div key={u.id} className="ck-list-item">
                  <div className="ck-list-item-main">
                    <div className="ck-list-item-title">{u.name} <span className="ck-role-badge">{u.role_name}</span></div>
                    <div className="ck-list-item-meta">
                      <span>📧 {u.email}</span>
                      <span>📞 {u.mobile}</span>
                      <span>ID: <strong>{u.user_id}</strong></span>
                      <span className={`ck-status-badge ck-status-badge--${u.status}`}>{u.status}</span>
                    </div>
                  </div>
                  <div className="ck-list-item-actions">
                    <button className="ck-btn-edit" onClick={() => openEdit(u)}>Edit</button>
                    {deleteConfirm === u.id
                      ? <><span className="ck-confirm-text">Sure?</span>
                          <button className="ck-btn-delete-confirm" onClick={() => handleDelete(u.id)}>Yes, Delete</button>
                          <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                      : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(u.id)}>Delete</button>}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Products list */}
        {section === 'products' && !showForm && (
          <div className="ck-list fade-in">
            {products.length === 0
              ? <div className="ck-empty">No products yet. Click "+ Add Product" to get started.</div>
              : products.map(p => (
                <div key={p.id} className="ck-list-item">
                  <div className="ck-list-item-main">
                    <div className="ck-list-item-title">{p.product_name} {p.category_name && <span className="ck-cat-badge">{p.category_name}</span>}</div>
                    <div className="ck-list-item-meta">
                      <span>₹{Number(p.selling_price).toFixed(2)}</span>
                      {p.unit_name && <span>Unit: {p.unit_name}</span>}
                      {p.tax_percent > 0 && <span>Tax: {p.tax_percent}%</span>}
                      {p.allow_urgent_order && <span className="ck-urgent-badge">Urgent ✓</span>}
                      {p.recipe.length > 0 && <span>🧪 {p.recipe.length} ingredient{p.recipe.length > 1 ? 's' : ''}</span>}
                    </div>
                    {p.description && <div className="ck-list-item-desc">{p.description}</div>}
                    {p.recipe.length > 0 && (
                      <div className="ck-recipe-chips">
                        {p.recipe.map(r => (
                          <span key={r.id} className="ck-recipe-chip">{r.raw_material_name} {r.quantity}{r.unit_name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ck-list-item-actions">
                    <button className="ck-btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    {deleteConfirm === p.id
                      ? <><span className="ck-confirm-text">Sure?</span>
                          <button className="ck-btn-delete-confirm" onClick={() => handleDelete(p.id)}>Yes, Delete</button>
                          <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                      : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(p.id)}>Delete</button>}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ── RAW MATERIALS MASTER ── */}
        {section === 'raw-materials' && (
          <div className="fade-in">
            {invSuccess && <div className="inv-toast inv-toast--success">{invSuccess}</div>}
            {invError && <div className="inv-toast inv-toast--error">{invError}</div>}

            <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="ck-section-title">🌾 Raw Materials Master</h2>
              <button className="ck-btn-add" onClick={() => { setShowRmForm(true); setEditRmId(null); setRmForm(emptyRmForm()); setInvError(''); }}>+ Add Raw Material</button>
            </div>

            {showRmForm && (
              <div className="inv-modal-overlay" onClick={() => setShowRmForm(false)}>
                <div className="inv-modal" onClick={e => e.stopPropagation()}>
                  <div className="inv-modal-header">
                    <h3>{editRmId ? 'Edit Raw Material' : 'Add Raw Material'}</h3>
                    <button className="inv-modal-close" onClick={() => setShowRmForm(false)}>✕</button>
                  </div>
                  <form onSubmit={handleRmSubmit} className="inv-form">
                    <label>Name *<input className="ck-form-input" required value={rmForm.name} onChange={e => setRmForm(f => ({...f, name: e.target.value}))} /></label>
                    <label>Category
                      <select className="ck-form-select" value={rmForm.category} onChange={e => setRmForm(f => ({...f, category: e.target.value}))}>
                        <option value="">— Select Category —</option>
                        <option value="Produce">Produce</option>
                        <option value="Dairy">Dairy</option>
                        <option value="Meat & Poultry">Meat & Poultry</option>
                        <option value="Seafood">Seafood</option>
                        <option value="Dry Goods">Dry Goods</option>
                        <option value="Spices">Spices</option>
                        <option value="Oils & Condiments">Oils & Condiments</option>
                        <option value="Bakery">Bakery</option>
                        <option value="Beverages">Beverages</option>
                        <option value="Packaging">Packaging</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                    <label>Unit<select className="ck-form-select" value={rmForm.unit_id} onChange={e => setRmForm(f => ({...f, unit_id: e.target.value}))}>
                      <option value="">— Select Unit —</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                    </select></label>
                    <label>Reorder Level<input className="ck-form-input" type="number" step="0.01" value={rmForm.reorder_level} onChange={e => setRmForm(f => ({...f, reorder_level: e.target.value}))} /></label>
                    <label>Standard Purchase Price (₹)<input className="ck-form-input" type="number" step="0.01" value={rmForm.standard_price} onChange={e => setRmForm(f => ({...f, standard_price: e.target.value}))} /></label>
                    <label>Status<select className="ck-form-select" value={rmForm.status} onChange={e => setRmForm(f => ({...f, status: e.target.value}))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select></label>
                    {invError && <div className="ck-form-error">{invError}</div>}
                    <div className="inv-modal-actions">
                      <button type="button" className="ck-btn-cancel-sm" onClick={() => setShowRmForm(false)}>Cancel</button>
                      <button type="submit" className="ck-btn-add" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="inv-search-bar">
              <input className="inv-search-input" placeholder="🔍 Search raw materials…" value={rmSearch} onChange={e => setRmSearch(e.target.value)} />
            </div>

            <div className="ck-list">
              {rawMaterials.filter(rm => rm.name.toLowerCase().includes(rmSearch.toLowerCase())).length === 0
                ? <div className="ck-empty">No raw materials found. Click "+ Add Raw Material" to get started.</div>
                : rawMaterials.filter(rm => rm.name.toLowerCase().includes(rmSearch.toLowerCase())).map(rm => (
                <div key={rm.id} className="ck-list-item">
                  <div className="ck-list-item-main">
                    <div className="ck-list-item-title">
                      {rm.name}
                      {rm.category && <span className="ck-cat-badge">{rm.category}</span>}
                    </div>
                    <div className="ck-list-item-meta">
                      {rm.unit && <span>Unit: <strong>{rm.unit.symbol}</strong></span>}
                      {rm.reorder_level != null && <span>Reorder at: <strong>{rm.reorder_level}</strong></span>}
                      {rm.standard_price != null && <span>Std. Price: <strong>₹{Number(rm.standard_price).toFixed(2)}</strong></span>}
                    </div>
                  </div>
                  <div className="ck-list-item-actions">
                    <button className="ck-btn-edit" onClick={() => { setEditRmId(rm.id); setRmForm({ name: rm.name, category: rm.category || '', unit_id: String(rm.unit_id || ''), reorder_level: String(rm.reorder_level || ''), standard_price: String(rm.standard_price || ''), status: 'active' }); setShowRmForm(true); setInvError(''); }}>Edit</button>
                    {deleteConfirm === rm.id
                      ? <><span className="ck-confirm-text">Sure?</span>
                          <button className="ck-btn-delete-confirm" onClick={() => handleDeleteRm(rm.id)}>Yes, Delete</button>
                          <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                      : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(rm.id)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INVENTORY OPERATIONS ── */}
        {section === 'inventory' && !selectedRmDetail && (
          <div className="fade-in">
            {invSuccess && <div className="inv-toast inv-toast--success">{invSuccess}</div>}
            {invError && <div className="inv-toast inv-toast--error">{invError}</div>}

            <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
              <h2 className="ck-section-title">📦 Raw Materials Inventory</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="inv-btn-secondary" onClick={() => { setAdjForm(emptyAdjForm()); setInvError(''); setShowAdjModal(true); }}>⚖ Adjust Stock</button>
                <button className="ck-btn-add" onClick={() => { setBatchForm(emptyBatchForm()); setInvError(''); setShowBatchModal(true); }}>+ Update Inventory</button>
              </div>
            </div>

            {/* Update Inventory Modal */}
            {showBatchModal && (
              <div className="inv-modal-overlay" onClick={() => setShowBatchModal(false)}>
                <div className="inv-modal" onClick={e => e.stopPropagation()}>
                  <div className="inv-modal-header">
                    <h3>Update Inventory</h3>
                    <button className="inv-modal-close" onClick={() => setShowBatchModal(false)}>✕</button>
                  </div>
                  <form onSubmit={handleBatchSubmit} className="inv-form">
                    <label>Raw Material *
                      <select className="ck-form-select" required value={batchForm.raw_material_id} onChange={e => setBatchForm(f => ({...f, raw_material_id: e.target.value}))}>
                        <option value="">— Select —</option>
                        {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>{rm.name}</option>)}
                      </select>
                    </label>
                    <div className="inv-form-row">
                      <label>Quantity *<input className="ck-form-input" type="number" step="0.01" required value={batchForm.quantity} onChange={e => setBatchForm(f => ({...f, quantity: e.target.value}))} /></label>
                      <label>Purchase Price (₹) *<input className="ck-form-input" type="number" step="0.01" required value={batchForm.purchase_price} onChange={e => setBatchForm(f => ({...f, purchase_price: e.target.value}))} /></label>
                    </div>
                    <label>Batch No (optional)<input className="ck-form-input" value={batchForm.batch_no} placeholder="Auto-generated if blank" onChange={e => setBatchForm(f => ({...f, batch_no: e.target.value}))} /></label>
                    <div className="inv-form-row">
                      <label>Manufactured Date<input className="ck-form-input" type="datetime-local" value={batchForm.manufactured_date} onChange={e => setBatchForm(f => ({...f, manufactured_date: e.target.value}))} /></label>
                      <label>Expiry Date<input className="ck-form-input" type="datetime-local" value={batchForm.expiry_date} onChange={e => setBatchForm(f => ({...f, expiry_date: e.target.value}))} /></label>
                    </div>
                    <label>Supplier<input className="ck-form-input" value={batchForm.supplier} onChange={e => setBatchForm(f => ({...f, supplier: e.target.value}))} /></label>
                    <label>Remarks<input className="ck-form-input" value={batchForm.remarks} onChange={e => setBatchForm(f => ({...f, remarks: e.target.value}))} /></label>
                    {invError && <div className="ck-form-error">{invError}</div>}
                    <div className="inv-modal-actions">
                      <button type="button" className="ck-btn-cancel-sm" onClick={() => setShowBatchModal(false)}>Cancel</button>
                      <button type="submit" className="ck-btn-add" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Adjust Stock Modal */}
            {showAdjModal && (
              <div className="inv-modal-overlay" onClick={() => setShowAdjModal(false)}>
                <div className="inv-modal" onClick={e => e.stopPropagation()}>
                  <div className="inv-modal-header">
                    <h3>⚖ Adjust Stock</h3>
                    <button className="inv-modal-close" onClick={() => setShowAdjModal(false)}>✕</button>
                  </div>
                  <form onSubmit={handleAdjSubmit} className="inv-form">
                    <label>Raw Material *
                      <select className="ck-form-select" required value={adjForm.raw_material_id} onChange={e => setAdjForm(f => ({...f, raw_material_id: e.target.value}))}>
                        <option value="">— Select —</option>
                        {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>{rm.name}</option>)}
                      </select>
                    </label>
                    <label>Quantity (use negative for reduction, e.g. -5) *<input className="ck-form-input" type="number" step="0.01" required value={adjForm.quantity} onChange={e => setAdjForm(f => ({...f, quantity: e.target.value}))} /></label>
                    <label>Reason *
                      <select className="ck-form-select" value={adjForm.reason} onChange={e => setAdjForm(f => ({...f, reason: e.target.value}))}>
                        {ADJUSTMENT_REASONS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </label>
                    <label>Remarks<input className="ck-form-input" value={adjForm.remarks} onChange={e => setAdjForm(f => ({...f, remarks: e.target.value}))} /></label>
                    {invError && <div className="ck-form-error">{invError}</div>}
                    <div className="inv-modal-actions">
                      <button type="button" className="ck-btn-cancel-sm" onClick={() => setShowAdjModal(false)}>Cancel</button>
                      <button type="submit" className="ck-btn-add" disabled={loading}>{loading ? 'Saving…' : 'Save Adjustment'}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="inv-search-bar">
              <input className="inv-search-input" placeholder="🔍 Search inventory…" value={inventorySearch} onChange={e => setInventorySearch(e.target.value)} />
            </div>

            <div className="inv-card-grid">
              {inventoryDashboard.filter(item => item.name.toLowerCase().includes(inventorySearch.toLowerCase())).length === 0
                ? <div className="ck-empty" style={{ gridColumn: '1 / -1' }}>No inventory data yet. Add batches using "Update Inventory".</div>
                : inventoryDashboard.filter(item => item.name.toLowerCase().includes(inventorySearch.toLowerCase())).map(item => (
                <div key={item.id} className={`inv-card ${item.isLowStock ? 'inv-card--low' : ''}`} onClick={() => openRmDetail(item)}>
                  <div className="inv-card-name">{item.name}</div>
                  <div className="inv-card-qty">
                    {item.availableQuantity.toFixed(2)}
                    <span className="inv-card-unit">{item.unit}</span>
                  </div>
                  <div className="inv-card-meta">
                    <span>🗂 {item.batchCount} batch{item.batchCount !== 1 ? 'es' : ''}</span>
                    {item.isLowStock && <span className="inv-badge-low">⚠ Low Stock</span>}
                    {item.nextExpiry && <span className="inv-badge-expiry">⏱ Expires {new Date(item.nextExpiry).toLocaleDateString('en-IN')}</span>}
                  </div>
                  {item.category && <div className="inv-card-category">{item.category}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── INVENTORY DETAIL VIEW ── */}
        {section === 'inventory' && selectedRmDetail && (
          <div className="fade-in">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button className="inv-btn-back" onClick={() => setSelectedRmDetail(null)}>← Back</button>
              <h2 className="ck-section-title" style={{ margin: 0 }}>{selectedRmDetail.name}</h2>
              {selectedRmDetail.isLowStock && <span className="inv-badge-low">⚠ Low Stock</span>}
            </div>

            <div className="inv-detail-stats">
              <div className="inv-detail-stat">
                <div className="inv-detail-stat-value">{selectedRmDetail.availableQuantity.toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: 500 }}>{selectedRmDetail.unit}</span></div>
                <div className="inv-detail-stat-label">Available</div>
              </div>
              <div className="inv-detail-stat">
                <div className="inv-detail-stat-value">{selectedRmDetail.batchCount}</div>
                <div className="inv-detail-stat-label">Active Batches</div>
              </div>
              <div className="inv-detail-stat">
                <div className="inv-detail-stat-value">{selectedRmDetail.reorderLevel}</div>
                <div className="inv-detail-stat-label">Reorder Level</div>
              </div>
              <div className="inv-detail-stat">
                <div className="inv-detail-stat-value">{selectedRmDetail.nextExpiry ? new Date(selectedRmDetail.nextExpiry).toLocaleDateString('en-IN') : '—'}</div>
                <div className="inv-detail-stat-label">Next Expiry</div>
              </div>
            </div>

            <div className="inv-detail-tabs">
              <button className={`inv-detail-tab ${detailTab === 'batches' ? 'inv-detail-tab--active' : ''}`} onClick={() => setDetailTab('batches')}>🗂 Batches</button>
              <button className={`inv-detail-tab ${detailTab === 'history' ? 'inv-detail-tab--active' : ''}`} onClick={() => setDetailTab('history')}>📋 History</button>
            </div>

            {detailTab === 'batches' && (
              <div className="inv-batch-list">
                {rmBatches.length === 0
                  ? <div className="ck-empty">No active batches for this item.</div>
                  : rmBatches.map(batch => (
                  <div key={batch.id} className="inv-batch-card">
                    <div className="inv-batch-header">
                      <span className="inv-batch-no">Batch #{batch.batch_no || batch.id}</span>
                      <span className="inv-batch-qty">{Number(batch.quantity).toFixed(2)} {selectedRmDetail.unit}</span>
                    </div>
                    <div className="inv-batch-meta">
                      <span>Added: {formatDateShort(batch.created_at)}</span>
                      {batch.supplier && <span>Supplier: {batch.supplier}</span>}
                      <span>Price: ₹{Number(batch.purchase_price).toFixed(2)}/unit</span>
                      {batch.expiry_date && (
                        <span className={new Date(batch.expiry_date) < new Date(Date.now() + 86400000) ? 'inv-expiry-soon' : ''}>
                          Expires: {formatDateShort(batch.expiry_date)}
                        </span>
                      )}
                    </div>
                    {batch.remarks && <div className="inv-batch-remarks">{batch.remarks}</div>}
                    <div className="inv-batch-progress">
                      <div className="inv-batch-progress-bar" style={{ width: `${Math.min(100, (Number(batch.quantity) / Number(batch.original_quantity)) * 100)}%` }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-light)', textAlign: 'right', marginTop: '0.2rem' }}>
                      {Number(batch.quantity).toFixed(2)} / {Number(batch.original_quantity).toFixed(2)} remaining
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'history' && (
              <div className="inv-history-table">
                <div className="inv-history-head">
                  <span>Time</span><span>Action</span><span>Qty Change</span><span>Balance</span><span>Note</span>
                </div>
                {rmHistory.length === 0
                  ? <div className="ck-empty">No transactions recorded yet.</div>
                  : rmHistory.map(entry => (
                  <div key={entry.id} className={`inv-history-row ${entry.quantity < 0 ? 'inv-history-row--out' : 'inv-history-row--in'}`}>
                    <span>{formatDateShort(entry.created_at)}</span>
                    <span>{txLabel[entry.transaction_type] || entry.transaction_type}</span>
                    <span className={entry.quantity < 0 ? 'inv-qty-neg' : 'inv-qty-pos'}>{entry.quantity > 0 ? '+' : ''}{entry.quantity.toFixed(2)} {selectedRmDetail.unit}</span>
                    <span>{entry.balance.toFixed(2)} {selectedRmDetail.unit}</span>
                    <span>{entry.remarks || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
