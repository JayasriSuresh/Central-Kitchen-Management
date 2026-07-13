export interface NavigationItem {
  key: string;
  title: string;
  icon: string;
  permission: string; // e.g. 'CK_ORDER_DASHBOARD_VIEW'
  group: 'Operations' | 'Inventory' | 'Purchasing' | 'Administration' | 'None';
}

export const centralKitchenNavigation: NavigationItem[] = [
  {
    key: 'dashboard',
    title: 'Orders Dashboard',
    icon: '📊',
    permission: 'CK_ORDER_DASHBOARD_VIEW',
    group: 'None'
  },
  {
    key: 'production',
    title: 'Planning',
    icon: '🏭',
    permission: 'PRODUCTION_PLANNING_VIEW',
    group: 'Operations'
  },
  {
    key: 'raw-materials',
    title: 'Raw Materials',
    icon: '📦',
    permission: 'STOCK_INVENTORY_VIEW',
    group: 'Inventory'
  },
  {
    key: 'inventory',
    title: 'Stock Levels',
    icon: '📈',
    permission: 'STOCK_INVENTORY_VIEW',
    group: 'Inventory'
  },
  {
    key: 'purchase-requests', // Maps to Material Requests subtab in purchase section
    title: 'Material Requests',
    icon: '📋',
    permission: 'VENDOR_PURCHASE_MGMT_VIEW',
    group: 'Purchasing'
  },
  {
    key: 'purchase-orders', // Maps to Purchase Orders subtab in purchase section
    title: 'Purchase Orders',
    icon: '🛒',
    permission: 'VENDOR_PURCHASE_MGMT_VIEW',
    group: 'Purchasing'
  },
  {
    key: 'vendors', // Maps to Vendors subtab in purchase section
    title: 'Vendors',
    icon: '🏢',
    permission: 'VENDOR_PURCHASE_MGMT_VIEW',
    group: 'Purchasing'
  },
  {
    key: 'restaurants',
    title: 'Restaurants',
    icon: '🏪',
    permission: 'RESTAURANT_OUTLET_VIEW',
    group: 'Administration'
  },
  {
    key: 'requests',
    title: 'Requests',
    icon: '📥',
    permission: 'RESTAURANT_OUTLET_VIEW',
    group: 'Administration'
  },
  {
    key: 'users',
    title: 'Users',
    icon: '👤',
    permission: 'LOGIN_USER_MGMT_VIEW',
    group: 'Administration'
  },
  {
    key: 'products',
    title: 'Products',
    icon: '🍽',
    permission: 'PRODUCT_FOOD_ITEM_VIEW',
    group: 'Administration'
  },
  {
    key: 'roles',
    title: 'Roles',
    icon: '🔐',
    permission: 'LOGIN_USER_MGMT_VIEW',
    group: 'Administration'
  }
];
