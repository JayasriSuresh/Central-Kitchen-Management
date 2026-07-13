import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { centralKitchenNavigation } from '../config/navigation';
import { Can } from '../components/Can';

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
type Section = 'dashboard' | 'restaurants' | 'requests' | 'users' | 'products' | 'raw-materials' | 'inventory' | 'production' | 'purchase' | 'roles';

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

// ─── Production Planning Types ────────────────────────────────────────────────
interface FEFOAllocation { batch_id: number; batch_no: string | null; expiry_date: string | null; allocated_qty: number; }
interface RawMaterialRequirementPreview {
  raw_material_id: number; raw_material_name: string; unit_symbol: string;
  required_qty: number; available_qty: number; shortage: number;
  status: 'enough' | 'short'; purchase_needed_qty: number;
  fefo_allocations: FEFOAllocation[];
}
interface ProductionPlanPreview {
  restaurant_demand: { restaurant_name: string; quantity: number }[];
  total_demand: number; buffer_qty: number; finished_stock: number; required_qty: number;
  has_recipe: boolean; recipe_id?: number;
  raw_material_requirements: RawMaterialRequirementPreview[];
  summary: { total: number; available: number; short: number };
}
interface ProductionPlan {
  id: number; plan_date: string; status: string; created_at: string;
  createdBy: { name: string } | null; approvedBy: { name: string } | null;
  items: { id: number; product_id: number; total_orders_qty: number; buffer_qty: number; current_stock_qty: number; production_qty: number; status: string; product: { product_name: string; unit?: { symbol: string } } }[];
  requirements: { id: number; raw_material_id: number; required_qty: number; available_qty: number; purchase_needed_qty: number; rawMaterial: { name: string; unit?: { symbol: string } }; purchase_requests: { id: number; status: string }[] }[];
}
interface PurchaseRequestItem {
  id: number; request_number: string; status: string; requested_by: string | null; created_at: string;
  requirement: { id: number; required_qty: number; purchase_needed_qty: number; rawMaterial: { name: string; unit?: { symbol: string } }; plan: { items: { product: { product_name: string } }[] } };
  purchaseOrders: { id: number; po_number: string; status: string }[];
}
interface PurchaseOrder {
  id: number; po_number: string; status: string; total_amount: number; created_at: string;
  vendor: { name: string }; createdBy: { name: string } | null;
  items: { id: number; raw_material_id: number; ordered_qty: number; received_qty: number; unit_price: number; rawMaterial: { name: string; unit?: { symbol: string } } }[];
  goods_received_notes: { id: number; received_date: string }[];
}
interface VendorItem { id: number; name: string; contact_number?: string; }

export default function CentralKitchenHome() {
  const { user, accessToken, logout, workspaces, activePortal, setAuth } = useAuth();
  const { hasPermission, canView, canCreate, canUpdate, canDelete, canApprove } = usePermissions();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ production: true, inventory: true, purchasing: false, administration: false });
  const [showUserMenu, setShowUserMenu] = useState(false);

  const sectionModuleMap: Record<string, string> = {
    restaurants: 'restaurant_outlet',
    users: 'login_user_mgmt',
    products: 'product_food_item',
    'raw-materials': 'stock_inventory',
    inventory: 'stock_inventory',
    purchase: 'vendor_purchase_mgmt',
    roles: 'login_user_mgmt'
  };
  const currentModule = sectionModuleMap[section] || '';

  const allowedSections = {
    dashboard: hasPermission('CK_ORDER_DASHBOARD_VIEW'),
    production: hasPermission('PRODUCTION_PLANNING_VIEW'),
    'raw-materials': hasPermission('STOCK_INVENTORY_VIEW'),
    inventory: hasPermission('STOCK_INVENTORY_VIEW'),
    purchase: hasPermission('VENDOR_PURCHASE_MGMT_VIEW'),
    restaurants: hasPermission('RESTAURANT_OUTLET_VIEW'),
    requests: hasPermission('RESTAURANT_OUTLET_VIEW'),
    users: hasPermission('LOGIN_USER_MGMT_VIEW'),
    products: hasPermission('PRODUCT_FOOD_ITEM_VIEW'),
    roles: hasPermission('LOGIN_USER_MGMT_VIEW')
  };

  useEffect(() => {
    const orderOfTabs: Section[] = ['dashboard', 'production', 'inventory', 'raw-materials', 'purchase', 'restaurants', 'requests', 'users', 'products', 'roles'];
    if (!allowedSections[section]) {
      const firstAllowed = orderOfTabs.find(tab => allowedSections[tab]);
      if (firstAllowed) {
        setSection(firstAllowed);
      }
    }
  }, [section, allowedSections]);

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
        permissionCodes: res.data.permissionCodes,
      });
      setShowUserMenu(false);

      if (ws.type === 'system') navigate('/system');
      else if (ws.type === 'restaurant') navigate('/restaurant');
      else navigate('/central-kitchen');
    } catch (err) {
      console.error('Failed to switch workspace', err);
    }
  };

  const navigateTo = (s: Section) => {
    setSection(s);
    setShowForm(false);
    setDeleteConfirm(null);
    setExpandedProductId(null);
    setSelectedRmDetail(null);
    setShowRmForm(false);
    setShowBatchModal(false);
    setShowAdjModal(false);
    setSelectedPlan(null);
    setPlanActionMsg('');
    setShowUserMenu(false);
  };

  const toggleGroup = (g: string) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

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

  // Production planning state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planningProductId, setPlanningProductId] = useState<number | null>(null);
  const [planningProductName, setPlanningProductName] = useState('');
  const [planBufferQty, setPlanBufferQty] = useState('0');
  const [planPreview, setPlanPreview] = useState<ProductionPlanPreview | null>(null);
  const [planPreviewLoading, setPlanPreviewLoading] = useState(false);
  const [planPreviewError, setPlanPreviewError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [planSaveSuccess, setPlanSaveSuccess] = useState('');
  const [expandedRMId, setExpandedRMId] = useState<number | null>(null);

  // Production plans list tab
  const [productionPlans, setProductionPlans] = useState<ProductionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ProductionPlan | null>(null);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [planActionMsg, setPlanActionMsg] = useState('');

  // Purchase tab state
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequestItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [purchaseSubTab, setPurchaseSubTab] = useState<'requests' | 'orders' | 'vendors'>('requests');
  const [approveModal, setApproveModal] = useState<PurchaseRequestItem | null>(null);
  const [approveForm, setApproveForm] = useState({ vendor_id: '', unit_price: '', modified_qty: '', expected_delivery_date: '' });
  const [grnModal, setGrnModal] = useState<PurchaseOrder | null>(null);
  const [grnForm, setGrnForm] = useState<{ raw_material_id: number; name: string; ordered_qty: number; received_qty: string; batch_no: string; expiry_date: string; purchase_price: string }[]>([]);
  const [purchaseMsg, setPurchaseMsg] = useState('');
  const [purchaseErr, setPurchaseErr] = useState('');
  const [vendorForm, setVendorForm] = useState({ name: '', contact_number: '', gst_number: '', payment_terms: '', address: '' });
  const [showVendorForm, setShowVendorForm] = useState(false);

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

  // Must be computed AFTER editId is declared above
  const isReadOnly = editId ? !canUpdate(currentModule) : !canCreate(currentModule);

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

  // ── Roles section state ────────────────────────────────────────────────────
  const [rolesSubTab, setRolesSubTab] = useState<'my-roles' | 'requests' | 'new-request'>('my-roles');
  const [tenantRoles, setTenantRoles] = useState<any[]>([]);
  const [roleRequests, setRoleRequests] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [expandedRoleId, setExpandedRoleId] = useState<number | null>(null);
  const [expandedReqId, setExpandedReqId] = useState<number | null>(null);
  const [roleReqForm, setRoleReqForm] = useState({ role_name: '', description: '', role_type: 'CENTRAL_KITCHEN', template_role_id: '', permission_codes: [] as string[] });
  const [roleReqError, setRoleReqError] = useState('');
  const [roleReqSuccess, setRoleReqSuccess] = useState('');
  const [roleReqSubmitting, setRoleReqSubmitting] = useState(false);

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

  const fetchProductionPlans = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/production/plans`, { headers: authHeader });
      setProductionPlans(res.data.plans);
    } catch (err: any) { console.error('Failed to load production plans', err); }
  }, [accessToken]);

  const fetchPurchaseData = useCallback(async () => {
    try {
      const [rRes, oRes, vRes] = await Promise.all([
        axios.get(`${API}/purchase/requests`, { headers: authHeader }),
        axios.get(`${API}/purchase/orders`, { headers: authHeader }),
        axios.get(`${API}/purchase/vendors`, { headers: authHeader }),
      ]);
      setPurchaseRequests(rRes.data.requests);
      setPurchaseOrders(oRes.data.orders);
      setVendors(vRes.data.vendors);
    } catch (err: any) { console.error('Failed to load purchase data', err); }
  }, [accessToken]);

  const openPlanModal = async (productId: number, productName: string) => {
    setPlanningProductId(productId);
    setPlanningProductName(productName);
    setPlanBufferQty('0');
    setPlanPreview(null);
    setPlanPreviewError('');
    setPlanSaveSuccess('');
    setExpandedRMId(null);
    setShowPlanModal(true);
  };

  const runPreview = async () => {
    if (!planningProductId) return;
    setPlanPreviewLoading(true);
    setPlanPreviewError('');
    setPlanPreview(null);
    try {
      const res = await axios.post(`${API}/production/plans/preview`,
        { product_id: planningProductId, buffer_qty: Number(planBufferQty) || 0 },
        { headers: authHeader }
      );
      setPlanPreview(res.data);
    } catch (err: any) {
      setPlanPreviewError(err.response?.data?.message ?? 'Preview failed');
    } finally { setPlanPreviewLoading(false); }
  };

  const saveDraftPlan = async () => {
    if (!planningProductId || !planPreview) return;
    setSavingPlan(true);
    try {
      await axios.post(`${API}/production/plans`,
        { product_id: planningProductId, buffer_qty: Number(planBufferQty) || 0 },
        { headers: authHeader }
      );
      setPlanSaveSuccess('✓ Draft plan created! Go to the Production Plans tab to manage it.');
      await fetchProductionPlans();
    } catch (err: any) {
      setPlanPreviewError(err.response?.data?.message ?? 'Failed to save plan');
    } finally { setSavingPlan(false); }
  };

  const handlePlanAction = async (planId: number, action: string) => {
    setPlanActionLoading(true);
    setPlanActionMsg('');
    try {
      await axios.post(`${API}/production/plans/${planId}/${action}`, {}, { headers: authHeader });
      await fetchProductionPlans();
      if (selectedPlan?.id === planId) {
        const res = await axios.get(`${API}/production/plans/${planId}`, { headers: authHeader });
        setSelectedPlan(res.data.plan);
      }
      setPlanActionMsg(action === 'start' ? '✓ Production started! Inventory has been deducted.' : action === 'material-request' ? '✓ Material requests generated.' : '✓ Plan updated.');
      setTimeout(() => setPlanActionMsg(''), 4000);
    } catch (err: any) {
      setPlanActionMsg('Error: ' + (err.response?.data?.message ?? 'Action failed'));
    } finally { setPlanActionLoading(false); }
  };

  const openGrnModal = (po: PurchaseOrder) => {
    setGrnModal(po);
    setGrnForm(po.items.map(item => ({
      raw_material_id: item.raw_material_id,
      name: item.rawMaterial.name,
      ordered_qty: Number(item.ordered_qty),
      received_qty: String(Number(item.ordered_qty) - Number(item.received_qty)),
      batch_no: '',
      expiry_date: '',
      purchase_price: String(Number(item.unit_price)),
    })));
  };

  const submitGRN = async () => {
    if (!grnModal) return;
    setPlanActionLoading(true);
    setPurchaseErr('');
    try {
      await axios.post(`${API}/purchase/orders/${grnModal.id}/grn`,
        { items: grnForm.map(f => ({ ...f, received_qty: Number(f.received_qty), purchase_price: Number(f.purchase_price) })) },
        { headers: authHeader }
      );
      setGrnModal(null);
      setPurchaseMsg('✓ Goods received! Inventory updated.');
      await Promise.all([fetchPurchaseData(), fetchInventoryDashboard()]);
      setTimeout(() => setPurchaseMsg(''), 4000);
    } catch (err: any) {
      setPurchaseErr(err.response?.data?.message ?? 'GRN failed');
    } finally { setPlanActionLoading(false); }
  };

  const fetchAll = useCallback(async () => {
    try {
      const promises: Promise<any>[] = [];
      const keys: string[] = [];

      promises.push(axios.get(`${API}/admin/dropdown-data`, { headers: authHeader }));
      keys.push('dropdown');

      if (hasPermission('RESTAURANT_OUTLET_VIEW')) {
        promises.push(axios.get(`${API}/admin/restaurants`, { headers: authHeader }));
        keys.push('restaurants');
        promises.push(axios.get(`${API}/admin/restaurants/onboarding`, { headers: authHeader }));
        keys.push('onboarding');
      }
      if (hasPermission('LOGIN_USER_MGMT_VIEW')) {
        promises.push(axios.get(`${API}/admin/users/ck`, { headers: authHeader }));
        keys.push('users');
      }
      if (hasPermission('PRODUCT_FOOD_ITEM_VIEW')) {
        promises.push(axios.get(`${API}/admin/products`, { headers: authHeader }));
        keys.push('products');
      }
      if (hasPermission('CK_ORDER_DASHBOARD_VIEW')) {
        promises.push(axios.get(`${API}/admin/orders/summary`, { headers: authHeader }));
        keys.push('ordersSummary');
      }

      const results = await Promise.all(promises);
      results.forEach((res, index) => {
        const key = keys[index];
        if (key === 'dropdown') {
          setRoles(res.data.roles);
          setCategories(res.data.categories);
          setUnits(res.data.units);
          setRawMaterials(res.data.rawMaterials);
        } else if (key === 'restaurants') {
          setRestaurants(res.data.restaurants);
        } else if (key === 'onboarding') {
          setOnboardings(res.data.onboardings);
        } else if (key === 'users') {
          setCkUsers(res.data.users);
        } else if (key === 'products') {
          setProducts(res.data.products);
        } else if (key === 'ordersSummary') {
          setOrdersSummary(res.data.summary);
        }
      });
    } catch (err: any) {
      if (err.response?.status === 401) { logout(); navigate('/login'); }
      console.error('Failed to load data', err);
    }
  }, [accessToken, hasPermission]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (section === 'inventory') fetchInventoryDashboard(); }, [section, fetchInventoryDashboard]);
  useEffect(() => { if (section === 'raw-materials') fetchRawMaterials(); }, [section, fetchRawMaterials]);
  useEffect(() => { if (section === 'production') fetchProductionPlans(); }, [section, fetchProductionPlans]);
  useEffect(() => { if (section === 'purchase') fetchPurchaseData(); }, [section, fetchPurchaseData]);

  const loadRolesData = async () => {
    setRolesLoading(true);
    try {
      const [rolesRes, reqsRes, permsRes, tmplRes] = await Promise.all([
        fetch(`${API}/roles/tenant`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/requests`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/permissions`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${API}/roles/templates`, { headers: { Authorization: `Bearer ${accessToken}` } }),
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

  const ckRoles = roles.filter(r => r.type?.toUpperCase() === 'CENTRAL_KITCHEN');

  const pendingCount = onboardings.filter(o => o.status === 'submitted' || o.status === 'submitted_again').length;

  // Group the navigation items for dynamic sidebar rendering
  const groupedItems = centralKitchenNavigation.reduce((acc, item) => {
    if (!hasPermission(item.permission)) return acc;
    if (item.group === 'None') {
      acc.none.push(item);
    } else {
      acc.groups[item.group] = acc.groups[item.group] || [];
      acc.groups[item.group].push(item);
    }
    return acc;
  }, { none: [] as typeof centralKitchenNavigation, groups: {} as Record<string, typeof centralKitchenNavigation> });

  const groupsConfig = [
    { name: 'Operations', icon: '🏭', expandKey: 'production' },
    { name: 'Inventory', icon: '📦', expandKey: 'inventory' },
    { name: 'Purchasing', icon: '🛒', expandKey: 'purchasing' },
    { name: 'Administration', icon: '⚙️', expandKey: 'administration' }
  ] as const;

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
              <div className="ck-user-dropdown" style={{ right: 0, left: 'auto' }}>
                <div className="ck-user-dropdown-info">
                  <div className="ck-user-dropdown-name">{user?.name}</div>
                  <div className="ck-user-dropdown-role">Kitchen Manager</div>
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

      {/* ── LAYOUT: sidebar + content ── */}
      <div className={`ck-layout ${sidebarOpen ? '' : 'ck-layout--collapsed'}`}>

        {/* ── SIDEBAR ── */}
        <aside className="ck-sidebar">
          <nav className="ck-nav">
            {/* Render ungrouped navigation items */}
            {groupedItems.none.map(item => (
              <button
                key={item.key}
                className={`ck-nav-item ${section === item.key ? 'ck-nav-item--active' : ''}`}
                onClick={() => navigateTo(item.key as any)}
              >
                <span className="ck-nav-icon">{item.icon}</span>
                <span className="ck-nav-label">{item.title}</span>
              </button>
            ))}

            {/* Render grouped navigation items */}
            {groupsConfig.map(group => {
              const items = groupedItems.groups[group.name] || [];
              if (items.length === 0) return null; // Hide empty group category

              const isExpanded = expandedGroups[group.expandKey];

              return (
                <div key={group.name} className="ck-nav-group">
                  <button className="ck-nav-group-header" onClick={() => toggleGroup(group.expandKey)}>
                    <span className="ck-nav-icon">{group.icon}</span>
                    <span className="ck-nav-label">{group.name}</span>
                    <span className="ck-nav-caret">{isExpanded ? '▾' : '▸'}</span>
                  </button>
                  {isExpanded && (
                    <div className="ck-nav-children">
                      {items.map(item => {
                        const isActive =
                          section === item.key ||
                          (item.key === 'purchase-requests' && section === 'purchase' && purchaseSubTab === 'requests') ||
                          (item.key === 'purchase-orders' && section === 'purchase' && purchaseSubTab === 'orders') ||
                          (item.key === 'vendors' && section === 'purchase' && purchaseSubTab === 'vendors');

                        const handleClick = () => {
                          if (item.key === 'purchase-requests') {
                            navigateTo('purchase');
                            setPurchaseSubTab('requests');
                          } else if (item.key === 'purchase-orders') {
                            navigateTo('purchase');
                            setPurchaseSubTab('orders');
                          } else if (item.key === 'vendors') {
                            navigateTo('purchase');
                            setPurchaseSubTab('vendors');
                          } else {
                            navigateTo(item.key as any);
                            if (item.key === 'roles') {
                              loadRolesData();
                            }
                          }
                        };

                        return (
                          <button
                            key={item.key}
                            className={`ck-nav-child ${isActive ? 'ck-nav-child--active' : ''}`}
                            onClick={handleClick}
                          >
                            {item.title}
                            {item.key === 'requests' && pendingCount > 0 && (
                              <span className="ck-nav-badge">{pendingCount}</span>
                            )}
                          </button>
                        );
                      })}
                      {/* Keep the "soon" placeholders if the user has permission for that group */}
                      {group.name === 'Operations' && (
                        <>
                          <button className="ck-nav-child ck-nav-child--soon">Queue <span className="ck-soon-tag">Soon</span></button>
                          <button className="ck-nav-child ck-nav-child--soon">Batch History <span className="ck-soon-tag">Soon</span></button>
                        </>
                      )}
                      {group.name === 'Inventory' && (
                        <button className="ck-nav-child ck-nav-child--soon">Finished Goods <span className="ck-soon-tag">Soon</span></button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── MAIN CONTENT ── */}
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
                      <div className="ck-stat-value">£{ordersSummary.reduce((s, p) => s + p.total_value, 0).toFixed(0)}</div>
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
                                <span style={{ color: 'var(--text-light)' }}>£{item.total_value.toFixed(2)}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                              <button
                                className="ck-btn-edit"
                                onClick={() => setExpandedProductId(isExpanded ? null : item.product_id)}
                              >
                                {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                              </button>
                              {canCreate('production_planning') && (
                                <button
                                  className="ck-btn-plan"
                                  onClick={() => openPlanModal(item.product_id, item.product_name)}
                                >
                                  🏭 Plan Production
                                </button>
                              )}
                            </div>
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
                                  <span>£{Number(r.total_price).toFixed(2)}</span>
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
                <>
                  {section === 'restaurants' && canCreate('restaurant_outlet') && (
                    <button id="btn-add" className="ck-btn-add" onClick={openAdd}>
                      + Add Restaurant
                    </button>
                  )}
                  {section === 'users' && canCreate('login_user_mgmt') && (
                    <button id="btn-add" className="ck-btn-add" onClick={openAdd}>
                      + Add User
                    </button>
                  )}
                  {section === 'products' && canCreate('product_food_item') && (
                    <button id="btn-add" className="ck-btn-add" onClick={openAdd}>
                      + Add Product
                    </button>
                  )}
                </>
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
                <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
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
                        <div className="ck-field"><label>Cost Price (£)</label><input type="number" min="0" step="0.01" className="ck-input" value={pForm.cost_price} onChange={e => setPForm({ ...pForm, cost_price: e.target.value })} /></div>
                        <div className="ck-field"><label>Selling Price (£) *</label><input type="number" min="0" step="0.01" className="ck-input" required value={pForm.selling_price} onChange={e => setPForm({ ...pForm, selling_price: e.target.value })} /></div>
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
                          {!isReadOnly && <button type="button" className="ck-btn-plus" onClick={addRecipeRow}>＋ Add Ingredient</button>}
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
                              {!isReadOnly && <button type="button" className="ck-btn-remove" onClick={() => removeRecipeRow(i)} disabled={recipe.length === 1}>✕</button>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </fieldset>

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
                    {(canUpdate('restaurant_outlet') || canDelete('restaurant_outlet')) && (
                      <div className="ck-list-item-actions">
                        {canUpdate('restaurant_outlet') && (
                          <button className="ck-btn-edit" onClick={() => openEdit(r)}>Edit</button>
                        )}
                        {canDelete('restaurant_outlet') && (
                          deleteConfirm === r.id
                            ? <><span className="ck-confirm-text">Sure?</span>
                              <button className="ck-btn-delete-confirm" onClick={() => handleDelete(r.id)}>Yes, Delete</button>
                              <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                            : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(r.id)}>Delete</button>
                        )}
                      </div>
                    )}
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
                          canApprove('restaurant_outlet') ? (
                            <button className="ck-btn-edit" onClick={async () => {
                              try {
                                const res = await axios.get(`${API}/admin/restaurants/onboarding/${ob.id}`, { headers: authHeader });
                                setSelectedOnboardingDetail(res.data.onboarding);
                                setShowReviewModal(true);
                              } catch (err: any) {
                                alert(err.response?.data?.message ?? 'Failed to load details');
                              }
                            }}>Review</button>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Submitted (Awaiting review)</span>
                          )
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
                    {(canUpdate('login_user_mgmt') || canDelete('login_user_mgmt')) && (
                      <div className="ck-list-item-actions">
                        {canUpdate('login_user_mgmt') && (
                          <button className="ck-btn-edit" onClick={() => openEdit(u)}>Edit</button>
                        )}
                        {canDelete('login_user_mgmt') && (
                          deleteConfirm === u.id
                            ? <><span className="ck-confirm-text">Sure?</span>
                              <button className="ck-btn-delete-confirm" onClick={() => handleDelete(u.id)}>Yes, Delete</button>
                              <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                            : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(u.id)}>Delete</button>
                        )}
                      </div>
                    )}
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
                        <span>£{Number(p.selling_price).toFixed(2)}</span>
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
                    {(canUpdate('product_food_item') || canDelete('product_food_item')) && (
                      <div className="ck-list-item-actions">
                        {canUpdate('product_food_item') && (
                          <button className="ck-btn-edit" onClick={() => openEdit(p)}>Edit</button>
                        )}
                        {canDelete('product_food_item') && (
                          deleteConfirm === p.id
                            ? <><span className="ck-confirm-text">Sure?</span>
                              <button className="ck-btn-delete-confirm" onClick={() => handleDelete(p.id)}>Yes, Delete</button>
                              <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                            : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(p.id)}>Delete</button>
                        )}
                      </div>
                    )}
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
                {canCreate('stock_inventory') && (
                  <button className="ck-btn-add" onClick={() => { setShowRmForm(true); setEditRmId(null); setRmForm(emptyRmForm()); setInvError(''); }}>+ Add Raw Material</button>
                )}
              </div>

              {showRmForm && (() => {
                const isReadOnlyRm = editRmId ? !canUpdate('stock_inventory') : !canCreate('stock_inventory');
                return (
                  <div className="inv-modal-overlay" onClick={() => setShowRmForm(false)}>
                    <div className="inv-modal" onClick={e => e.stopPropagation()}>
                      <div className="inv-modal-header">
                        <h3>{editRmId ? 'Edit Raw Material' : 'Add Raw Material'}</h3>
                        <button className="inv-modal-close" onClick={() => setShowRmForm(false)}>✕</button>
                      </div>
                      <form onSubmit={handleRmSubmit} className="inv-form">
                        <fieldset disabled={isReadOnlyRm} style={{ border: 'none', padding: 0, margin: 0, display: 'contents' }}>
                          <label>Name *<input className="ck-form-input" required value={rmForm.name} onChange={e => setRmForm(f => ({ ...f, name: e.target.value }))} /></label>
                          <label>Category
                            <select className="ck-form-select" value={rmForm.category} onChange={e => setRmForm(f => ({ ...f, category: e.target.value }))}>
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
                          <label>Unit<select className="ck-form-select" value={rmForm.unit_id} onChange={e => setRmForm(f => ({ ...f, unit_id: e.target.value }))}>
                            <option value="">— Select Unit —</option>
                            {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
                          </select></label>
                          <label>Reorder Level<input className="ck-form-input" type="number" step="0.01" value={rmForm.reorder_level} onChange={e => setRmForm(f => ({ ...f, reorder_level: e.target.value }))} /></label>
                          <label>Standard Purchase Price (£)<input className="ck-form-input" type="number" step="0.01" value={rmForm.standard_price} onChange={e => setRmForm(f => ({ ...f, standard_price: e.target.value }))} /></label>
                          <label>Status<select className="ck-form-select" value={rmForm.status} onChange={e => setRmForm(f => ({ ...f, status: e.target.value }))}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select></label>
                        </fieldset>
                        {invError && <div className="ck-form-error">{invError}</div>}
                        <div className="inv-modal-actions">
                          <button type="button" className="ck-btn-cancel-sm" onClick={() => setShowRmForm(false)}>Cancel</button>
                          {!isReadOnlyRm && (
                            <button type="submit" className="ck-btn-add" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                );
              })()}

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
                          {rm.standard_price != null && <span>Std. Price: <strong>£{Number(rm.standard_price).toFixed(2)}</strong></span>}
                        </div>
                      </div>
                      {(canUpdate('stock_inventory') || canDelete('stock_inventory')) && (
                        <div className="ck-list-item-actions">
                          {canUpdate('stock_inventory') && (
                            <button className="ck-btn-edit" onClick={() => { setEditRmId(rm.id); setRmForm({ name: rm.name, category: rm.category || '', unit_id: String(rm.unit_id || ''), reorder_level: String(rm.reorder_level || ''), standard_price: String(rm.standard_price || ''), status: 'active' }); setShowRmForm(true); setInvError(''); }}>Edit</button>
                          )}
                          {canDelete('stock_inventory') && (
                            deleteConfirm === rm.id
                              ? <><span className="ck-confirm-text">Sure?</span>
                                <button className="ck-btn-delete-confirm" onClick={() => handleDeleteRm(rm.id)}>Yes, Delete</button>
                                <button className="ck-btn-cancel-sm" onClick={() => setDeleteConfirm(null)}>Cancel</button></>
                              : <button className="ck-btn-delete" onClick={() => setDeleteConfirm(rm.id)}>Delete</button>
                          )}
                        </div>
                      )}
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
                  {canUpdate('stock_inventory') && (
                    <button className="inv-btn-secondary" onClick={() => { setAdjForm(emptyAdjForm()); setInvError(''); setShowAdjModal(true); }}>⚖ Adjust Stock</button>
                  )}
                  {canCreate('stock_inventory') && (
                    <button className="ck-btn-add" onClick={() => { setBatchForm(emptyBatchForm()); setInvError(''); setShowBatchModal(true); }}>+ Update Inventory</button>
                  )}
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
                        <select className="ck-form-select" required value={batchForm.raw_material_id} onChange={e => setBatchForm(f => ({ ...f, raw_material_id: e.target.value }))}>
                          <option value="">— Select —</option>
                          {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>{rm.name}</option>)}
                        </select>
                      </label>
                      <div className="inv-form-row">
                        <label>Quantity *<input className="ck-form-input" type="number" step="0.01" required value={batchForm.quantity} onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))} /></label>
                        <label>Purchase Price (£) *<input className="ck-form-input" type="number" step="0.01" required value={batchForm.purchase_price} onChange={e => setBatchForm(f => ({ ...f, purchase_price: e.target.value }))} /></label>
                      </div>
                      <label>Batch No (optional)<input className="ck-form-input" value={batchForm.batch_no} placeholder="Auto-generated if blank" onChange={e => setBatchForm(f => ({ ...f, batch_no: e.target.value }))} /></label>
                      <div className="inv-form-row">
                        <label>Manufactured Date<input className="ck-form-input" type="datetime-local" value={batchForm.manufactured_date} onChange={e => setBatchForm(f => ({ ...f, manufactured_date: e.target.value }))} /></label>
                        <label>Expiry Date<input className="ck-form-input" type="datetime-local" value={batchForm.expiry_date} onChange={e => setBatchForm(f => ({ ...f, expiry_date: e.target.value }))} /></label>
                      </div>
                      <label>Supplier<input className="ck-form-input" value={batchForm.supplier} onChange={e => setBatchForm(f => ({ ...f, supplier: e.target.value }))} /></label>
                      <label>Remarks<input className="ck-form-input" value={batchForm.remarks} onChange={e => setBatchForm(f => ({ ...f, remarks: e.target.value }))} /></label>
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
                        <select className="ck-form-select" required value={adjForm.raw_material_id} onChange={e => setAdjForm(f => ({ ...f, raw_material_id: e.target.value }))}>
                          <option value="">— Select —</option>
                          {rawMaterials.map(rm => <option key={rm.id} value={rm.id}>{rm.name}</option>)}
                        </select>
                      </label>
                      <label>Quantity (use negative for reduction, e.g. -5) *<input className="ck-form-input" type="number" step="0.01" required value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))} /></label>
                      <label>Reason *
                        <select className="ck-form-select" value={adjForm.reason} onChange={e => setAdjForm(f => ({ ...f, reason: e.target.value }))}>
                          {ADJUSTMENT_REASONS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </label>
                      <label>Remarks<input className="ck-form-input" value={adjForm.remarks} onChange={e => setAdjForm(f => ({ ...f, remarks: e.target.value }))} /></label>
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
                          <span>Price: £{Number(batch.purchase_price).toFixed(2)}/unit</span>
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
          {/* ── PRODUCTION PLANS TAB ── */}
          {section === 'production' && (
            <div className="fade-in">
              {planActionMsg && <div className={`inv-toast ${planActionMsg.startsWith('Error') ? 'inv-toast--error' : 'inv-toast--success'}`}>{planActionMsg}</div>}
              <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
                <h2 className="ck-section-title">🏭 Production Plans</h2>
                <button className="ck-btn-add" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-light)' }} onClick={fetchProductionPlans}>↻ Refresh</button>
              </div>

              {selectedPlan ? (
                <div className="fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    <button className="inv-btn-back" onClick={() => setSelectedPlan(null)}>← Back to Plans</button>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Plan #{selectedPlan.id} — {selectedPlan.items[0]?.product.product_name}</h3>
                    <span className={`plan-status-badge plan-status-${selectedPlan.status}`}>{selectedPlan.status.replace(/_/g, ' ').toUpperCase()}</span>
                  </div>

                  {/* Plan Summary Stats */}
                  {selectedPlan.items.map(item => (
                    <div key={item.id} className="plan-detail-stats">
                      <div className="plan-detail-stat"><div className="plan-detail-val">{Number(item.total_orders_qty)}</div><div className="plan-detail-lbl">Total Demand</div></div>
                      <div className="plan-detail-stat"><div className="plan-detail-val">{Number(item.buffer_qty)}</div><div className="plan-detail-lbl">Buffer</div></div>
                      <div className="plan-detail-stat"><div className="plan-detail-val">{Number(item.current_stock_qty)}</div><div className="plan-detail-lbl">Finished Stock</div></div>
                      <div className="plan-detail-stat plan-detail-stat--highlight"><div className="plan-detail-val">{Number(item.production_qty)}</div><div className="plan-detail-lbl">Required Production</div></div>
                    </div>
                  ))}

                  {/* Raw Material Requirements */}
                  <div className="plan-section-title" style={{ marginTop: '1.5rem' }}>🧪 Raw Material Requirements</div>
                  <div className="plan-rm-table">
                    <div className="plan-rm-head"><span>Material</span><span>Required</span><span>Available</span><span>To Purchase</span><span>Status</span></div>
                    {selectedPlan.requirements.map(req => (
                      <div key={req.id} className={`plan-rm-row ${Number(req.purchase_needed_qty) > 0 ? 'plan-rm-row--short' : 'plan-rm-row--ok'}`}>
                        <span><strong>{req.rawMaterial.name}</strong></span>
                        <span>{Number(req.required_qty).toFixed(2)} {req.rawMaterial.unit?.symbol || ''}</span>
                        <span>{Number(req.available_qty).toFixed(2)} {req.rawMaterial.unit?.symbol || ''}</span>
                        <span>{Number(req.purchase_needed_qty) > 0 ? <span className="plan-short-badge">Buy {Number(req.purchase_needed_qty).toFixed(2)}</span> : '—'}</span>
                        <span>{Number(req.purchase_needed_qty) > 0 ? <span className="plan-short-badge">Short</span> : <span className="plan-ok-badge">Enough</span>}</span>
                      </div>
                    ))}
                  </div>

                  {canUpdate('production_planning') && (
                    <div className="plan-action-bar">
                      {selectedPlan.status === 'draft' && (
                        <button className="ck-btn-plan" disabled={planActionLoading}
                          onClick={() => handlePlanAction(selectedPlan.id, 'material-request')}>
                          {planActionLoading ? '...' : '📋 Generate Material Request'}
                        </button>
                      )}
                      {selectedPlan.status === 'material_check_completed' && (
                        <button className="ck-btn-plan" disabled={planActionLoading}
                          onClick={() => handlePlanAction(selectedPlan.id, 'mark-ready')}>
                          {planActionLoading ? '...' : '✅ Check & Mark Ready'}
                        </button>
                      )}
                      {selectedPlan.status === 'ready_for_production' && (
                        <button className="plan-start-btn" disabled={planActionLoading}
                          onClick={() => handlePlanAction(selectedPlan.id, 'start')}>
                          {planActionLoading ? '⟳ Starting...' : '▶ Start Production'}
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '0.5rem' }}>
                    Created: {new Date(selectedPlan.created_at).toLocaleString('en-IN')} by {selectedPlan.createdBy?.name || '—'}
                  </div>
                </div>
              ) : (
                <div className="ck-list">
                  {productionPlans.length === 0
                    ? <div className="ck-empty">No production plans yet. Go to the Orders tab and click "Plan Production" on a product.</div>
                    : productionPlans.map(plan => (
                      <div key={plan.id} className="ck-list-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedPlan(plan)}>
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">
                            Plan #{plan.id} — {plan.items[0]?.product.product_name || 'Unknown Product'}
                            <span className={`plan-status-badge plan-status-${plan.status}`} style={{ marginLeft: '0.75rem' }}>
                              {plan.status.replace(/_/g, ' ').toUpperCase()}
                            </span>
                          </div>
                          <div className="ck-list-item-meta">
                            <span>📅 {new Date(plan.plan_date).toLocaleDateString('en-IN')}</span>
                            {plan.items[0] && <span>🍳 Produce: <strong>{Number(plan.items[0].production_qty)}</strong> {plan.items[0].product.unit?.symbol || 'units'}</span>}
                            <span>👤 {plan.createdBy?.name || '—'}</span>
                            <span>{plan.requirements.filter(r => Number(r.purchase_needed_qty) > 0).length} shortage(s)</span>
                          </div>
                        </div>
                        <div className="ck-list-item-actions">
                          <button className="ck-btn-edit">View →</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          )}

          {/* ── PURCHASE TAB ── */}
          {section === 'purchase' && (
            <div className="fade-in">
              {purchaseMsg && <div className="inv-toast inv-toast--success">{purchaseMsg}</div>}
              {purchaseErr && <div className="inv-toast inv-toast--error">{purchaseErr}</div>}

              <div className="ck-section-header" style={{ marginBottom: '1.25rem' }}>
                <h2 className="ck-section-title">🛒 Purchase Management</h2>
                <button className="ck-btn-add" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-light)' }} onClick={fetchPurchaseData}>↻ Refresh</button>
              </div>

              {/* Sub-tabs */}
              <div className="inv-detail-tabs" style={{ marginBottom: '1.5rem' }}>
                {(['requests', 'orders', 'vendors'] as const).map(t => (
                  <button key={t} className={`inv-detail-tab ${purchaseSubTab === t ? 'inv-detail-tab--active' : ''}`} onClick={() => setPurchaseSubTab(t)}>
                    {t === 'requests' ? '📋 Material Requests' : t === 'orders' ? '📦 Purchase Orders' : '🏢 Vendors'}
                  </button>
                ))}
              </div>

              {/* Material Requests */}
              {purchaseSubTab === 'requests' && (
                <div className="ck-list">
                  {purchaseRequests.length === 0
                    ? <div className="ck-empty">No material requests yet. Requests are created from Production Plans when shortages exist.</div>
                    : purchaseRequests.map(req => (
                      <div key={req.id} className="ck-list-item">
                        <div className="ck-list-item-main">
                          <div className="ck-list-item-title">
                            {req.requirement.rawMaterial.name}
                            <span className={`plan-status-badge plan-status-${req.status}`} style={{ marginLeft: '0.75rem' }}>{req.status.toUpperCase()}</span>
                          </div>
                          <div className="ck-list-item-meta">
                            <span>📋 {req.request_number}</span>
                            <span>Needed: <strong>{Number(req.requirement.purchase_needed_qty).toFixed(2)} {req.requirement.rawMaterial.unit?.symbol || ''}</strong></span>
                            <span>For: {req.requirement.plan.items[0]?.product.product_name || '—'}</span>
                            <span>{new Date(req.created_at).toLocaleDateString('en-IN')}</span>
                          </div>
                          {req.purchaseOrders.length > 0 && (
                            <div className="ck-list-item-meta" style={{ marginTop: '0.25rem' }}>
                              {req.purchaseOrders.map(po => (
                                <span key={po.id} style={{ background: '#e3f2fd', color: '#1565c0', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem' }}>PO: {po.po_number} ({po.status})</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {canApprove('vendor_purchase_mgmt') && req.status === 'pending' && (
                          <div className="ck-list-item-actions">
                            <button className="ck-btn-plan" onClick={() => { setApproveModal(req); setApproveForm({ vendor_id: '', unit_price: '', modified_qty: String(Number(req.requirement.purchase_needed_qty).toFixed(2)), expected_delivery_date: '' }); }}>✓ Approve & Create PO</button>
                            <button className="ck-btn-delete" onClick={async () => { await axios.post(`${API}/purchase/requests/${req.id}/reject`, {}, { headers: authHeader }); fetchPurchaseData(); }}>✗ Reject</button>
                          </div>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Purchase Orders */}
              {purchaseSubTab === 'orders' && (
                <div className="ck-list">
                  {purchaseOrders.length === 0
                    ? <div className="ck-empty">No purchase orders yet.</div>
                    : purchaseOrders.map(po => (
                      <div key={po.id} className="ck-list-item" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="ck-list-item-main">
                            <div className="ck-list-item-title">
                              {po.po_number}
                              <span className={`plan-status-badge plan-status-${po.status}`} style={{ marginLeft: '0.75rem' }}>{po.status.toUpperCase()}</span>
                            </div>
                            <div className="ck-list-item-meta">
                              <span>🏢 {po.vendor.name}</span>
                              <span>£{Number(po.total_amount).toFixed(2)}</span>
                              <span>{new Date(po.created_at).toLocaleDateString('en-IN')}</span>
                              <span>By: {po.createdBy?.name || '—'}</span>
                            </div>
                            <div style={{ marginTop: '0.5rem' }}>
                              {po.items.map(item => (
                                <span key={item.id} style={{ fontSize: '0.75rem', marginRight: '0.75rem' }}>
                                  {item.rawMaterial.name}: {Number(item.ordered_qty).toFixed(2)} {item.rawMaterial.unit?.symbol || ''}
                                  (Received: {Number(item.received_qty).toFixed(2)})
                                </span>
                              ))}
                            </div>
                          </div>
                          {canUpdate('vendor_purchase_mgmt') && po.status !== 'received' && (
                            <button className="ck-btn-plan" onClick={() => openGrnModal(po)}>📦 Receive Stock (GRN)</button>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Vendors */}
              {purchaseSubTab === 'vendors' && (
                <div className="fade-in">
                  {canCreate('vendor_purchase_mgmt') && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                      <button className="ck-btn-add" onClick={() => { setVendorForm({ name: '', contact_number: '', gst_number: '', payment_terms: '', address: '' }); setShowVendorForm(true); }}>+ Add Vendor</button>
                    </div>
                  )}
                  <div className="ck-list">
                    {vendors.length === 0
                      ? <div className="ck-empty">No vendors yet. Add vendors to assign when approving purchase requests.</div>
                      : vendors.map(v => (
                        <div key={v.id} className="ck-list-item">
                          <div className="ck-list-item-main">
                            <div className="ck-list-item-title">{v.name}</div>
                            <div className="ck-list-item-meta">{v.contact_number && <span>📞 {v.contact_number}</span>}</div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}


            </div>
          )}

          {/* ── ROLES SECTION ── */}
          {section === 'roles' && (
            <div className="fade-in" style={{ padding: '2rem' }}>
              <div className="ck-section-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <h2 className="ck-section-title">🔐 Role Management</h2>
                  <p className="ck-section-subtitle">View assigned roles and request custom roles for your kitchen</p>
                </div>
                {rolesSubTab !== 'new-request' && canCreate('login_user_mgmt') && (
                  <button className="ck-btn-add" onClick={() => { setRolesSubTab('new-request'); loadRolesData(); }}>
                    + Request New Role
                  </button>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="ck-tabs" style={{ marginBottom: '1.5rem' }}>
                {(['my-roles', 'requests'] as const).map(tab => (
                  <button key={tab}
                    className={`ck-tab ${rolesSubTab === tab ? 'ck-tab--active' : ''}`}
                    onClick={() => { setRolesSubTab(tab); if (tab === 'my-roles' || tab === 'requests') loadRolesData(); }}>
                    {tab === 'my-roles' ? 'My Roles' : 'Role Requests'}
                  </button>
                ))}
              </div>

              {rolesLoading && <div className="ck-empty">Loading roles…</div>}

              {/* ── MY ROLES TAB ── */}
              {!rolesLoading && rolesSubTab === 'my-roles' && (
                <div>
                  {/* GLOBAL roles */}
                  <h3 style={{ fontSize: '1rem', color: 'var(--text-light)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🌐 Global Roles</h3>
                  <div className="ck-list" style={{ marginBottom: '2rem' }}>
                    {tenantRoles.filter(r => r.role_scope === 'GLOBAL').length === 0
                      ? <div className="ck-empty">No global roles assigned.</div>
                      : tenantRoles.filter(r => r.role_scope === 'GLOBAL').map(role => (
                        <div key={role.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="ck-list-item-main">
                              <div className="ck-list-item-title">
                                {role.name}
                                <span className="ck-status-badge ck-status-badge--active" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>{role.type}</span>
                              </div>
                              <div className="ck-list-item-meta">
                                <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>{role.role_permissions?.length ?? 0} permissions</span>
                                {role.description && <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>— {role.description}</span>}
                              </div>
                            </div>
                            <button className="ck-btn-edit" onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}>
                              {expandedRoleId === role.id ? 'Hide ▲' : 'View Permissions ▼'}
                            </button>
                          </div>
                          {expandedRoleId === role.id && (
                            <div style={{ marginTop: '1rem', width: '100%' }}>
                              {Object.entries(
                                (role.role_permissions || []).reduce((acc: any, rp: any) => {
                                  const mod = rp.permission.module;
                                  if (!acc[mod]) acc[mod] = [];
                                  acc[mod].push(rp.permission);
                                  return acc;
                                }, {})
                              ).map(([mod, perms]: any) => (
                                <div key={mod} style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{mod.replace(/_/g, ' ')}</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {perms.map((p: any) => (
                                      <span key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>{p.action}</span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>

                  {/* TENANT roles */}
                  <h3 style={{ fontSize: '1rem', color: 'var(--text-light)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏢 Custom Tenant Roles</h3>
                  <div className="ck-list">
                    {tenantRoles.filter(r => r.role_scope === 'TENANT').length === 0
                      ? <div className="ck-empty">No custom roles yet. <button className="ck-link-btn" onClick={() => setRolesSubTab('new-request')}>Request one →</button></div>
                      : tenantRoles.filter(r => r.role_scope === 'TENANT').map(role => (
                        <div key={role.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="ck-list-item-main">
                              <div className="ck-list-item-title">
                                {role.name}
                                <span style={{ marginLeft: '0.5rem', background: 'var(--primary)', color: '#fff', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.7rem' }}>v{role.current_version}</span>
                              </div>
                              <div className="ck-list-item-meta">
                                <span style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>{role.role_permissions?.length ?? 0} permissions · {role.type}</span>
                              </div>
                            </div>
                            <button className="ck-btn-edit" onClick={() => setExpandedRoleId(expandedRoleId === role.id ? null : role.id)}>
                              {expandedRoleId === role.id ? 'Hide ▲' : 'View ▼'}
                            </button>
                          </div>
                          {expandedRoleId === role.id && (
                            <div style={{ marginTop: '1rem', width: '100%' }}>
                              {Object.entries(
                                (role.role_permissions || []).reduce((acc: any, rp: any) => {
                                  const mod = rp.permission.module;
                                  if (!acc[mod]) acc[mod] = [];
                                  acc[mod].push(rp.permission);
                                  return acc;
                                }, {})
                              ).map(([mod, perms]: any) => (
                                <div key={mod} style={{ marginBottom: '0.75rem' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{mod.replace(/_/g, ' ')}</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {perms.map((p: any) => (
                                      <span key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.15rem 0.5rem', fontSize: '0.75rem', color: 'var(--text-light)' }}>{p.action}</span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── ROLE REQUESTS TAB ── */}
              {!rolesLoading && rolesSubTab === 'requests' && (
                <div>
                  {roleRequests.length === 0
                    ? <div className="ck-empty">No role requests yet.</div>
                    : <div className="ck-list">
                      {roleRequests.map(req => (
                        <div key={req.id} className="ck-list-item" style={{ flexDirection: 'column' }}>
                          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="ck-list-item-main">
                              <div className="ck-list-item-title">
                                {req.role_name}
                                <span style={{
                                  marginLeft: '0.5rem', borderRadius: '999px', padding: '0.15rem 0.55rem', fontSize: '0.72rem', fontWeight: 600,
                                  background: req.status === 'PENDING' ? '#fff8e1' : req.status === 'APPROVED' ? '#e8f5e9' : '#fce4ec',
                                  color: req.status === 'PENDING' ? '#f57c00' : req.status === 'APPROVED' ? '#388e3c' : '#c62828'
                                }}>
                                  {req.status === 'PENDING' ? '🟡 Pending' : req.status === 'APPROVED' ? '🟢 Approved' : '🔴 Rejected'}
                                </span>
                              </div>
                              <div className="ck-list-item-meta">
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>Type: {req.role_type} · Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <button className="ck-btn-edit" onClick={() => setExpandedReqId(expandedReqId === req.id ? null : req.id)}>
                              {expandedReqId === req.id ? 'Less ▲' : 'Details ▼'}
                            </button>
                          </div>
                          {expandedReqId === req.id && (
                            <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--surface)', borderRadius: '8px', width: '100%' }}>
                              {req.description && <p style={{ color: 'var(--text-light)', marginBottom: '0.5rem' }}>{req.description}</p>}
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginBottom: '0.25rem' }}>
                                Requested permissions: <strong>{(req.requested_permissions as string[]).join(', ') || '—'}</strong>
                              </div>
                              {req.status === 'REJECTED' && req.remarks && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fce4ec', borderRadius: '6px', color: '#c62828', fontSize: '0.85rem' }}>
                                  <strong>Rejection reason:</strong> {req.remarks}
                                </div>
                              )}
                              {req.status === 'APPROVED' && req.approvedRole && (
                                <div style={{ marginTop: '0.5rem', color: '#388e3c', fontSize: '0.85rem' }}>
                                  ✓ Role created: <strong>{req.approvedRole.name}</strong>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  }
                </div>
              )}

              {/* ── NEW ROLE REQUEST FORM ── */}
              {rolesSubTab === 'new-request' && (
                <div style={{ maxWidth: '720px' }}>
                  <h3 style={{ marginBottom: '1.25rem' }}>📝 Request a New Role</h3>
                  {roleReqSuccess && <div style={{ padding: '0.75rem 1rem', background: '#e8f5e9', color: '#388e3c', borderRadius: '8px', marginBottom: '1rem' }}>{roleReqSuccess}</div>}
                  {roleReqError && <div style={{ padding: '0.75rem 1rem', background: '#fce4ec', color: '#c62828', borderRadius: '8px', marginBottom: '1rem' }}>{roleReqError}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="ck-field">
                      <label>Role Name <span className="req">*</span></label>
                      <input className="ck-input" value={roleReqForm.role_name} onChange={e => setRoleReqForm(f => ({ ...f, role_name: e.target.value }))} placeholder="e.g. Senior Kitchen Manager" />
                    </div>
                    <div className="ck-field">
                      <label>Description</label>
                      <textarea className="ck-input" rows={2} value={roleReqForm.description} onChange={e => setRoleReqForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this role responsible for?" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="ck-field">
                        <label>Role Type <span className="req">*</span></label>
                        <select className="ck-input" value={roleReqForm.role_type} onChange={e => setRoleReqForm(f => ({ ...f, role_type: e.target.value }))}>
                          <option value="CENTRAL_KITCHEN">Central Kitchen</option>
                          <option value="RESTAURANT">Restaurant</option>
                        </select>
                      </div>
                      <div className="ck-field">
                        <label>Use Template (optional)</label>
                        <select className="ck-input" value={roleReqForm.template_role_id}
                          onChange={async e => {
                            const tid = e.target.value;
                            setRoleReqForm(f => ({ ...f, template_role_id: tid }));
                            if (tid) {
                              try {
                                const res = await fetch(`${API}/roles/templates/${tid}/clone`, { headers: { Authorization: `Bearer ${accessToken}` } });
                                const data = await res.json();
                                setRoleReqForm(f => ({ ...f, permission_codes: data.data.permission_codes || [] }));
                              } catch { }
                            }
                          }}>
                          <option value="">— No template —</option>
                          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Permission Matrix */}
                    <div className="ck-field">
                      <label style={{ marginBottom: '0.75rem', display: 'block' }}>Permissions</label>
                      {Object.entries(
                        allPermissions.reduce((acc: any, p: any) => {
                          if (!acc[p.module]) acc[p.module] = [];
                          acc[p.module].push(p);
                          return acc;
                        }, {})
                      ).map(([mod, perms]: any) => (
                        <div key={mod} style={{ marginBottom: '1rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--primary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{mod.replace(/_/g, ' ')}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {perms.map((p: any) => {
                              const checked = roleReqForm.permission_codes.includes(p.code);
                              return (
                                <label key={p.id} style={{
                                  display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer',
                                  background: checked ? 'rgba(99,102,241,0.12)' : 'var(--surface)',
                                  border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                                  borderRadius: '6px', padding: '0.3rem 0.65rem', fontSize: '0.78rem', transition: 'all 0.15s'
                                }}>
                                  <input type="checkbox" checked={checked}
                                    onChange={e => setRoleReqForm(f => ({
                                      ...f,
                                      permission_codes: e.target.checked
                                        ? [...f.permission_codes, p.code]
                                        : f.permission_codes.filter(c => c !== p.code)
                                    }))}
                                    style={{ accentColor: 'var(--primary)' }} />
                                  {p.action}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                      <button className="ck-btn-cancel" onClick={() => setRolesSubTab('my-roles')}>Cancel</button>
                      <button className="ck-btn-submit" disabled={roleReqSubmitting}
                        onClick={async () => {
                          setRoleReqError('');
                          setRoleReqSuccess('');
                          if (!roleReqForm.role_name) { setRoleReqError('Role name is required'); return; }
                          setRoleReqSubmitting(true);
                          try {
                            await fetch(`${API}/roles/requests`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                              body: JSON.stringify(roleReqForm),
                            });
                            setRoleReqSuccess('✓ Role request submitted successfully!');
                            setRoleReqForm({ role_name: '', description: '', role_type: 'CENTRAL_KITCHEN', template_role_id: '', permission_codes: [] });
                            await loadRolesData();
                            setTimeout(() => setRolesSubTab('requests'), 1500);
                          } catch (err: any) {
                            setRoleReqError(err.message || 'Submission failed');
                          } finally {
                            setRoleReqSubmitting(false);
                          }
                        }}>
                        {roleReqSubmitting ? 'Submitting…' : '✓ Submit Request'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── PLAN PRODUCTION MODAL OVERLAY ── */}
        {showPlanModal && (
          <div className="plan-overlay" onClick={() => setShowPlanModal(false)}>
            <div className="plan-modal" onClick={e => e.stopPropagation()}>
              <div className="plan-modal-header">
                <h3>🏭 Plan Production — {planningProductName}</h3>
                <button className="inv-modal-close" onClick={() => setShowPlanModal(false)}>✕</button>
              </div>
              <div className="plan-modal-body">
                {/* Buffer & Preview trigger */}
                <div className="plan-buffer-row">
                  <label className="plan-label">Production Buffer Quantity</label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input className="plan-input" type="number" min="0" step="1" value={planBufferQty}
                      onChange={e => setPlanBufferQty(e.target.value)}
                      placeholder="e.g. 15" style={{ width: '100px' }} />
                    <button className="ck-btn-add" onClick={runPreview} disabled={planPreviewLoading}>
                      {planPreviewLoading ? '⟳ Calculating…' : '📊 Calculate Plan'}
                    </button>
                  </div>
                </div>

                {planPreviewError && <div className="plan-error">{planPreviewError}</div>}
                {planSaveSuccess && <div className="plan-success">{planSaveSuccess}</div>}

                {planPreview && (
                  <>
                    {/* ── Restaurant Demand ── */}
                    <div className="plan-section-title">🏪 Restaurant Demand Breakdown</div>
                    <div className="plan-restaurant-grid">
                      {planPreview.restaurant_demand.map((r, i) => (
                        <div key={i} className="plan-restaurant-card">
                          <div className="plan-restaurant-name">{r.restaurant_name}</div>
                          <div className="plan-restaurant-qty">{r.quantity} <span className="plan-unit">{planPreview.raw_material_requirements[0]?.unit_symbol || 'dishes'}</span></div>
                        </div>
                      ))}
                    </div>

                    {/* ── Production Calculation ── */}
                    <div className="plan-section-title">📐 Production Calculation</div>
                    <div className="plan-calc-row">
                      <div className="plan-calc-box plan-calc-blue">
                        <div className="plan-calc-label">Total Demand</div>
                        <div className="plan-calc-value">{planPreview.total_demand}</div>
                      </div>
                      <div className="plan-calc-op">+</div>
                      <div className="plan-calc-box plan-calc-amber">
                        <div className="plan-calc-label">Buffer</div>
                        <div className="plan-calc-value">{planPreview.buffer_qty}</div>
                      </div>
                      <div className="plan-calc-op">−</div>
                      <div className="plan-calc-box plan-calc-teal">
                        <div className="plan-calc-label">Finished Stock</div>
                        <div className="plan-calc-value">{planPreview.finished_stock}</div>
                      </div>
                      <div className="plan-calc-op">=</div>
                      <div className="plan-calc-box plan-calc-green">
                        <div className="plan-calc-label">Required Production</div>
                        <div className="plan-calc-value plan-calc-main">{planPreview.required_qty}</div>
                      </div>
                    </div>

                    {/* ── Material Summary Badge ── */}
                    {planPreview.has_recipe && (
                      <div className="plan-summary-row">
                        <span className="plan-summary-badge plan-summary-ok">✓ {planPreview.summary.available} Materials Available</span>
                        {planPreview.summary.short > 0 && <span className="plan-summary-badge plan-summary-short">⚠ {planPreview.summary.short} Materials Short</span>}
                      </div>
                    )}

                    {/* ── Raw Material Requirements ── */}
                    {planPreview.has_recipe ? (
                      <>
                        <div className="plan-section-title">🧪 Raw Material Requirements (FEFO Allocation)</div>
                        <div className="plan-rm-table">
                          <div className="plan-rm-head">
                            <span>Material</span><span>Required</span><span>Available</span><span>Status</span><span>FEFO Batches</span>
                          </div>
                          {planPreview.raw_material_requirements.map((rm) => (
                            <div key={rm.raw_material_id}>
                              <div className={`plan-rm-row ${rm.status === 'short' ? 'plan-rm-row--short' : 'plan-rm-row--ok'}`}
                                onClick={() => setExpandedRMId(expandedRMId === rm.raw_material_id ? null : rm.raw_material_id)}
                                style={{ cursor: 'pointer' }}>
                                <span><strong>{rm.raw_material_name}</strong></span>
                                <span>{rm.required_qty.toFixed(2)} {rm.unit_symbol}</span>
                                <span>{rm.available_qty.toFixed(2)} {rm.unit_symbol}</span>
                                <span>
                                  {rm.status === 'short'
                                    ? <span className="plan-short-badge">⚠ Short by {rm.shortage.toFixed(2)} {rm.unit_symbol}</span>
                                    : <span className="plan-ok-badge">✓ Enough</span>}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                  {rm.fefo_allocations.length} batch(es) {expandedRMId === rm.raw_material_id ? '▲' : '▼'}
                                </span>
                              </div>
                              {expandedRMId === rm.raw_material_id && rm.fefo_allocations.length > 0 && (
                                <div className="plan-fefo-list fade-in">
                                  {rm.fefo_allocations.map((a, ai) => (
                                    <div key={ai} className="plan-fefo-row">
                                      <span>Batch #{a.batch_no || a.batch_id}</span>
                                      <span>Expires: {a.expiry_date ? new Date(a.expiry_date).toLocaleDateString('en-IN') : 'No expiry'}</span>
                                      <span className="plan-fefo-alloc">Allocate: {a.allocated_qty.toFixed(2)} {rm.unit_symbol}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="plan-no-recipe">⚠️ No active recipe/BOM configured for this product. Set up a recipe under the Products tab first.</div>
                    )}
                  </>
                )}
              </div>
              <div className="plan-modal-footer">
                <button className="ck-btn-cancel-sm" onClick={() => setShowPlanModal(false)}>Close</button>
                {planPreview && planPreview.has_recipe && !planSaveSuccess && canCreate('production_planning') && (
                  <button className="ck-btn-add" onClick={saveDraftPlan} disabled={savingPlan}>
                    {savingPlan ? 'Saving…' : '💾 Save Draft Plan'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Approve Request Modal */}
        {approveModal && (
          <div className="plan-overlay" onClick={() => setApproveModal(null)}>
            <div className="plan-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="plan-modal-header">
                <h3>✓ Approve Purchase Request</h3>
                <button className="inv-modal-close" onClick={() => setApproveModal(null)}>✕</button>
              </div>
              <div className="plan-modal-body">
                <p style={{ margin: '0 0 1rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>
                  Material: <strong>{approveModal.requirement.rawMaterial.name}</strong> — Needed: <strong>{Number(approveModal.requirement.purchase_needed_qty).toFixed(2)} {approveModal.requirement.rawMaterial.unit?.symbol || ''}</strong>
                </p>
                <div className="plan-buffer-row">
                  <label className="plan-label">Vendor *</label>
                  <select className="ck-select" style={{ marginTop: '0.25rem' }} value={approveForm.vendor_id} onChange={e => setApproveForm(f => ({ ...f, vendor_id: e.target.value }))}>
                    <option value="">— Select Vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="plan-buffer-row">
                  <label className="plan-label">Quantity to Purchase</label>
                  <input className="plan-input" type="number" step="0.01" value={approveForm.modified_qty} onChange={e => setApproveForm(f => ({ ...f, modified_qty: e.target.value }))} />
                </div>
                <div className="plan-buffer-row">
                  <label className="plan-label">Unit Price (£) *</label>
                  <input className="plan-input" type="number" step="0.01" value={approveForm.unit_price} onChange={e => setApproveForm(f => ({ ...f, unit_price: e.target.value }))} />
                </div>
                <div className="plan-buffer-row">
                  <label className="plan-label">Expected Delivery Date</label>
                  <input className="plan-input" type="date" value={approveForm.expected_delivery_date} onChange={e => setApproveForm(f => ({ ...f, expected_delivery_date: e.target.value }))} />
                </div>
                {purchaseErr && <div className="plan-error">{purchaseErr}</div>}
              </div>
              <div className="plan-modal-footer">
                <button className="ck-btn-cancel-sm" onClick={() => setApproveModal(null)}>Cancel</button>
                <button className="ck-btn-add" disabled={planActionLoading || !approveForm.vendor_id || !approveForm.unit_price}
                  onClick={async () => {
                    setPlanActionLoading(true);
                    setPurchaseErr('');
                    try {
                      await axios.post(`${API}/purchase/requests/${approveModal.id}/approve`, approveForm, { headers: authHeader });
                      setApproveModal(null);
                      setPurchaseMsg('✓ Purchase Order created!');
                      await fetchPurchaseData();
                      setTimeout(() => setPurchaseMsg(''), 4000);
                    } catch (err: any) {
                      setPurchaseErr(err.response?.data?.message ?? 'Approval failed');
                    } finally { setPlanActionLoading(false); }
                  }}>
                  {planActionLoading ? '...' : '✓ Approve & Create PO'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GRN Modal */}
        {grnModal && (
          <div className="plan-overlay" onClick={() => setGrnModal(null)}>
            <div className="plan-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <div className="plan-modal-header">
                <h3>📦 Receive Goods — {grnModal.po_number}</h3>
                <button className="inv-modal-close" onClick={() => setGrnModal(null)}>✕</button>
              </div>
              <div className="plan-modal-body">
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-light)' }}>Vendor: {grnModal.vendor.name} — Fill in the received batch details below.</p>
                {grnForm.map((item, idx) => (
                  <div key={idx} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{item.name}</div>
                    <div className="ck-form-grid">
                      <div className="ck-field">
                        <label>Qty to Receive *</label>
                        <input className="ck-input" type="number" step="0.01" value={item.received_qty}
                          onChange={e => { const f = [...grnForm]; f[idx].received_qty = e.target.value; setGrnForm(f); }} />
                      </div>
                      <div className="ck-field">
                        <label>Batch No</label>
                        <input className="ck-input" value={item.batch_no} placeholder="Auto if blank"
                          onChange={e => { const f = [...grnForm]; f[idx].batch_no = e.target.value; setGrnForm(f); }} />
                      </div>
                      <div className="ck-field">
                        <label>Expiry Date</label>
                        <input className="ck-input" type="date" value={item.expiry_date}
                          onChange={e => { const f = [...grnForm]; f[idx].expiry_date = e.target.value; setGrnForm(f); }} />
                      </div>
                      <div className="ck-field">
                        <label>Purchase Price/unit (£)</label>
                        <input className="ck-input" type="number" step="0.01" value={item.purchase_price}
                          onChange={e => { const f = [...grnForm]; f[idx].purchase_price = e.target.value; setGrnForm(f); }} />
                      </div>
                    </div>
                  </div>
                ))}
                {purchaseErr && <div className="plan-error">{purchaseErr}</div>}
              </div>
              <div className="plan-modal-footer">
                <button className="ck-btn-cancel-sm" onClick={() => setGrnModal(null)}>Cancel</button>
                <button className="ck-btn-add" disabled={planActionLoading} onClick={submitGRN}>
                  {planActionLoading ? '...' : '✓ Confirm Receipt & Update Inventory'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Vendor Modal */}
        {showVendorForm && (
          <div className="plan-overlay" onClick={() => setShowVendorForm(false)}>
            <div className="plan-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
              <div className="plan-modal-header">
                <h3>🏢 Add Vendor</h3>
                <button className="inv-modal-close" onClick={() => setShowVendorForm(false)}>✕</button>
              </div>
              <div className="plan-modal-body">
                <div className="ck-form-grid">
                  <div className="ck-field ck-field--full"><label>Vendor Name *</label><input className="ck-input" required value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="ck-field"><label>Contact Number</label><input className="ck-input" value={vendorForm.contact_number} onChange={e => setVendorForm(f => ({ ...f, contact_number: e.target.value }))} /></div>
                  <div className="ck-field"><label>GST Number</label><input className="ck-input" value={vendorForm.gst_number} onChange={e => setVendorForm(f => ({ ...f, gst_number: e.target.value }))} /></div>
                  <div className="ck-field"><label>Payment Terms</label><input className="ck-input" value={vendorForm.payment_terms} onChange={e => setVendorForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
                  <div className="ck-field ck-field--full"><label>Address</label><input className="ck-input" value={vendorForm.address} onChange={e => setVendorForm(f => ({ ...f, address: e.target.value }))} /></div>
                </div>
              </div>
              <div className="plan-modal-footer">
                <button className="ck-btn-cancel-sm" onClick={() => setShowVendorForm(false)}>Cancel</button>
                <button className="ck-btn-add" onClick={async () => {
                  try {
                    await axios.post(`${API}/purchase/vendors`, vendorForm, { headers: authHeader });
                    setShowVendorForm(false);
                    await fetchPurchaseData();
                    setPurchaseMsg('✓ Vendor added!');
                    setTimeout(() => setPurchaseMsg(''), 3000);
                  } catch (err: any) { setPurchaseErr(err.response?.data?.message ?? 'Failed'); }
                }}>Save Vendor</button>
              </div>
            </div>
          </div>
        )}
      </div>{/* end ck-layout */}
    </div>
  );
}
