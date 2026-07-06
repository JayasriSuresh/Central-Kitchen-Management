import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role { id: number; name: string; code: string; type: string; }
interface Category { id: number; name: string; }
interface Unit { id: number; name: string; symbol: string; }
interface RawMaterial { id: number; name: string; category: string | null; unit_id: number | null; }
interface RecipeRow { raw_material_id: string; quantity: string; unit_id: string; }

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

// ─── Section Tab ──────────────────────────────────────────────────────────────
type Section = 'restaurants' | 'users' | 'products';

export default function CentralKitchenHome() {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('restaurants');

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

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const handleLogout = () => { logout(); navigate('/login'); };

  const fetchAll = useCallback(async () => {
    try {
      const [dd, rRes, uRes, pRes] = await Promise.all([
        axios.get(`${API}/admin/dropdown-data`, { headers: authHeader }),
        axios.get(`${API}/admin/restaurants`, { headers: authHeader }),
        axios.get(`${API}/admin/users/ck`, { headers: authHeader }),
        axios.get(`${API}/admin/products`, { headers: authHeader }),
      ]);
      setRoles(dd.data.roles);
      setCategories(dd.data.categories);
      setUnits(dd.data.units);
      setRawMaterials(dd.data.rawMaterials);
      setRestaurants(rRes.data.restaurants);
      setCkUsers(uRes.data.users);
      setProducts(pRes.data.products);
    } catch (err: any) {
      console.error('Failed to load data', err);
    }
  }, [accessToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Form open helpers ──
  const openAdd = () => {
    setEditId(null); setFormError(''); setFormSuccess(''); setShowForm(true);
    setRForm(emptyRestaurant()); setUForm(emptyUser()); setPForm(emptyProduct());
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
        if (editId) await axios.put(`${API}/admin/restaurants/${editId}`, rForm, { headers: authHeader });
        else await axios.post(`${API}/admin/restaurants`, rForm, { headers: authHeader });
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
        {(['restaurants', 'users', 'products'] as Section[]).map(s => (
          <button
            key={s}
            id={`tab-${s}`}
            className={`ck-tab ${section === s ? 'ck-tab--active' : ''}`}
            onClick={() => { setSection(s); setShowForm(false); setDeleteConfirm(null); }}
          >
            {s === 'restaurants' ? '🏪 Restaurants' : s === 'users' ? '👤 Users' : '📦 Products'}
          </button>
        ))}
      </div>

      <main className="ck-body">
        {/* Header row */}
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

        {/* ── FORM ── */}
        {showForm && (
          <div className="ck-form-card fade-in">
            <div className="ck-form-title">{editId ? 'Edit' : 'Add'} {section === 'restaurants' ? 'Restaurant' : section === 'users' ? 'User' : 'Product'}</div>
            <form onSubmit={handleSubmit} noValidate>

              {/* Restaurant form */}
              {section === 'restaurants' && (
                <div className="ck-form-grid">
                  <div className="ck-field"><label>Restaurant Name *</label><input className="ck-input" required value={rForm.name} onChange={e => setRForm({ ...rForm, name: e.target.value })} placeholder="e.g. Biryani Hub" /></div>
                  <div className="ck-field"><label>Contact Number</label><input className="ck-input" value={rForm.contact_number} onChange={e => setRForm({ ...rForm, contact_number: e.target.value })} placeholder="9876543210" /></div>
                  <div className="ck-field ck-field--full"><label>Address</label><textarea className="ck-input ck-textarea" value={rForm.address} onChange={e => setRForm({ ...rForm, address: e.target.value })} placeholder="Full address" /></div>
                  <div className="ck-field"><label>GST Number</label><input className="ck-input" value={rForm.gst_number} onChange={e => setRForm({ ...rForm, gst_number: e.target.value })} placeholder="27AAPFU0939F1ZV" /></div>
                </div>
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
                  {loading ? <span className="spinner" /> : editId ? 'Save Changes' : 'Create'}
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
      </main>
    </div>
  );
}
