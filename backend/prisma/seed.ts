import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedTenantRoles } from '../src/services/auth.service';

const prisma = new PrismaClient();

/**
 * System role templates — canonical list, tenant_id = null.
 * When a new tenant signs up, these are copied as tenant-specific roles.
 */

const PERMISSIONS = [
  // 1. Login & User Management
  { module: 'login_user_mgmt', action: 'view' },
  { module: 'login_user_mgmt', action: 'create' },
  { module: 'login_user_mgmt', action: 'edit' },
  { module: 'login_user_mgmt', action: 'delete' },

  // 2. Restaurant / Outlet
  { module: 'restaurant_outlet', action: 'view' },
  { module: 'restaurant_outlet', action: 'create' },
  { module: 'restaurant_outlet', action: 'edit' },
  { module: 'restaurant_outlet', action: 'delete' },

  // 3. Product / Food Item
  { module: 'product_food_item', action: 'view' },
  { module: 'product_food_item', action: 'create' },
  { module: 'product_food_item', action: 'edit' },
  { module: 'product_food_item', action: 'delete' },

  // 4. Recipe / Ingredient Mapping
  { module: 'recipe_ingredient_mapping', action: 'view' },
  { module: 'recipe_ingredient_mapping', action: 'create' },
  { module: 'recipe_ingredient_mapping', action: 'edit' },
  { module: 'recipe_ingredient_mapping', action: 'delete' },
  { module: 'recipe_ingredient_mapping', action: 'approve' },

  // 5. Restaurant Order Management
  { module: 'restaurant_order_mgmt', action: 'view' },
  { module: 'restaurant_order_mgmt', action: 'create' },
  { module: 'restaurant_order_mgmt', action: 'edit' },
  { module: 'restaurant_order_mgmt', action: 'delete' },

  // 6. CK Order Dashboard
  { module: 'ck_order_dashboard', action: 'view' },

  // 7. Stock / Inventory
  { module: 'stock_inventory', action: 'view' },
  { module: 'stock_inventory', action: 'create' },
  { module: 'stock_inventory', action: 'edit' },
  { module: 'stock_inventory', action: 'delete' },

  // 8. Production Planning
  { module: 'production_planning', action: 'view' },
  { module: 'production_planning', action: 'create' },
  { module: 'production_planning', action: 'edit' },
  { module: 'production_planning', action: 'delete' },
  { module: 'production_planning', action: 'approve' },

  // 9. Raw Material Requirement Calc
  { module: 'raw_material_req_calc', action: 'view' },

  // 10. Vendor / Purchase Management
  { module: 'vendor_purchase_mgmt', action: 'view' },
  { module: 'vendor_purchase_mgmt', action: 'create' },
  { module: 'vendor_purchase_mgmt', action: 'edit' },
  { module: 'vendor_purchase_mgmt', action: 'delete' },
  { module: 'vendor_purchase_mgmt', action: 'approve' },

  // 11. Dispatch & Delivery
  { module: 'dispatch_delivery', action: 'view' },
  { module: 'dispatch_delivery', action: 'create' },
  { module: 'dispatch_delivery', action: 'edit' },
  { module: 'dispatch_delivery', action: 'delete' },

  // 12. Billing & Payment
  { module: 'billing_payment', action: 'view' },
  { module: 'billing_payment', action: 'create' },
  { module: 'billing_payment', action: 'edit' },
  { module: 'billing_payment', action: 'delete' },

  // 13. Reports & Analytics (scope-specific view actions)
  { module: 'reports_analytics', action: 'view_all' },
  { module: 'reports_analytics', action: 'view_ops' },
  { module: 'reports_analytics', action: 'view_stock' },
  { module: 'reports_analytics', action: 'view_purchase' },
  { module: 'reports_analytics', action: 'view_finance' },
  { module: 'reports_analytics', action: 'view_restaurant' },

  // 14. Role / Permission Management
  { module: 'role_permission_mgmt', action: 'view' },
  { module: 'role_permission_mgmt', action: 'create' },
  { module: 'role_permission_mgmt', action: 'edit' },
  { module: 'role_permission_mgmt', action: 'delete' },

  // 15. Audit Log
  { module: 'audit_log', action: 'view' },

  // 16. Notifications
  { module: 'notifications', action: 'view' },
  { module: 'notifications', action: 'broadcast' },

  // 17. Restaurant Dashboard
  { module: 'restaurant_dashboard', action: 'view_override' },
  { module: 'restaurant_dashboard', action: 'view_full' },
  { module: 'restaurant_dashboard', action: 'view_limited' },

  // 18. CK Dashboard
  { module: 'ck_dashboard', action: 'view' },
].map((p) => ({ ...p, code: `${p.module.toUpperCase()}_${p.action.toUpperCase()}` }));

const ALL_CODES = PERMISSIONS.map((p) => p.code);

const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_CODES,

  KITCHEN_MANAGER: [
    'LOGIN_USER_MGMT_VIEW',
    'RESTAURANT_OUTLET_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW', 'PRODUCT_FOOD_ITEM_CREATE', 'PRODUCT_FOOD_ITEM_EDIT',
    'RECIPE_INGREDIENT_MAPPING_VIEW', 'RECIPE_INGREDIENT_MAPPING_CREATE', 'RECIPE_INGREDIENT_MAPPING_EDIT', 'RECIPE_INGREDIENT_MAPPING_APPROVE',
    'RESTAURANT_ORDER_MGMT_VIEW', 'RESTAURANT_ORDER_MGMT_EDIT',
    'CK_ORDER_DASHBOARD_VIEW',
    'STOCK_INVENTORY_VIEW',
    'PRODUCTION_PLANNING_VIEW', 'PRODUCTION_PLANNING_CREATE', 'PRODUCTION_PLANNING_EDIT', 'PRODUCTION_PLANNING_APPROVE',
    'RAW_MATERIAL_REQ_CALC_VIEW',
    'VENDOR_PURCHASE_MGMT_VIEW',
    'DISPATCH_DELIVERY_VIEW', 'DISPATCH_DELIVERY_CREATE', 'DISPATCH_DELIVERY_EDIT',
    'REPORTS_ANALYTICS_VIEW_OPS',
    'NOTIFICATIONS_VIEW',
    'CK_DASHBOARD_VIEW',
  ],

  INVENTORY_MANAGER: [
    'LOGIN_USER_MGMT_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RECIPE_INGREDIENT_MAPPING_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW',
    'CK_ORDER_DASHBOARD_VIEW',
    'STOCK_INVENTORY_VIEW', 'STOCK_INVENTORY_CREATE', 'STOCK_INVENTORY_EDIT', 'STOCK_INVENTORY_DELETE',
    'PRODUCTION_PLANNING_VIEW',
    'RAW_MATERIAL_REQ_CALC_VIEW',
    'VENDOR_PURCHASE_MGMT_VIEW',
    'DISPATCH_DELIVERY_VIEW',
    'REPORTS_ANALYTICS_VIEW_STOCK',
    'NOTIFICATIONS_VIEW',
    'CK_DASHBOARD_VIEW',
  ],

  PURCHASE_MANAGER: [
    'LOGIN_USER_MGMT_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RECIPE_INGREDIENT_MAPPING_VIEW',
    'CK_ORDER_DASHBOARD_VIEW',
    'STOCK_INVENTORY_VIEW',
    'PRODUCTION_PLANNING_VIEW',
    'RAW_MATERIAL_REQ_CALC_VIEW',
    'VENDOR_PURCHASE_MGMT_VIEW', 'VENDOR_PURCHASE_MGMT_CREATE', 'VENDOR_PURCHASE_MGMT_EDIT', 'VENDOR_PURCHASE_MGMT_DELETE', 'VENDOR_PURCHASE_MGMT_APPROVE',
    'REPORTS_ANALYTICS_VIEW_PURCHASE',
    'NOTIFICATIONS_VIEW',
    'CK_DASHBOARD_VIEW',
  ],

  ACCOUNTS: [
    'LOGIN_USER_MGMT_VIEW',
    'RESTAURANT_OUTLET_VIEW', 'RESTAURANT_OUTLET_EDIT',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RECIPE_INGREDIENT_MAPPING_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW',
    'CK_ORDER_DASHBOARD_VIEW',
    'STOCK_INVENTORY_VIEW',
    'VENDOR_PURCHASE_MGMT_VIEW', 'VENDOR_PURCHASE_MGMT_EDIT',
    'BILLING_PAYMENT_VIEW', 'BILLING_PAYMENT_CREATE', 'BILLING_PAYMENT_EDIT', 'BILLING_PAYMENT_DELETE',
    'REPORTS_ANALYTICS_VIEW_FINANCE',
    'NOTIFICATIONS_VIEW',
    'CK_DASHBOARD_VIEW',
  ],

  DELIVERY_STAFF: [
    'LOGIN_USER_MGMT_VIEW',
    'RESTAURANT_OUTLET_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW',
    'DISPATCH_DELIVERY_VIEW', 'DISPATCH_DELIVERY_EDIT',
    'NOTIFICATIONS_VIEW',
  ],

  RESTAURANT_ADMIN: [
    'LOGIN_USER_MGMT_VIEW', 'LOGIN_USER_MGMT_CREATE', 'LOGIN_USER_MGMT_EDIT',
    'RESTAURANT_OUTLET_VIEW', 'RESTAURANT_OUTLET_EDIT',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW', 'RESTAURANT_ORDER_MGMT_CREATE', 'RESTAURANT_ORDER_MGMT_EDIT', 'RESTAURANT_ORDER_MGMT_DELETE',
    'DISPATCH_DELIVERY_VIEW',
    'BILLING_PAYMENT_VIEW',
    'REPORTS_ANALYTICS_VIEW_RESTAURANT',
    'NOTIFICATIONS_VIEW',
    'RESTAURANT_DASHBOARD_VIEW_FULL',
  ],

  RESTAURANT_MANAGER: [
    'LOGIN_USER_MGMT_VIEW', 'LOGIN_USER_MGMT_CREATE', 'LOGIN_USER_MGMT_EDIT',
    'RESTAURANT_OUTLET_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW', 'RESTAURANT_ORDER_MGMT_CREATE', 'RESTAURANT_ORDER_MGMT_EDIT', 'RESTAURANT_ORDER_MGMT_DELETE',
    'DISPATCH_DELIVERY_VIEW', 'DISPATCH_DELIVERY_EDIT',
    'BILLING_PAYMENT_VIEW',
    'REPORTS_ANALYTICS_VIEW_RESTAURANT',
    'NOTIFICATIONS_VIEW',
    'RESTAURANT_DASHBOARD_VIEW_FULL',
  ],

  RESTAURANT_STAFF: [
    'LOGIN_USER_MGMT_VIEW',
    'RESTAURANT_OUTLET_VIEW',
    'PRODUCT_FOOD_ITEM_VIEW',
    'RESTAURANT_ORDER_MGMT_VIEW', 'RESTAURANT_ORDER_MGMT_CREATE', 'RESTAURANT_ORDER_MGMT_EDIT',
    'DISPATCH_DELIVERY_VIEW', 'DISPATCH_DELIVERY_EDIT',
    'NOTIFICATIONS_VIEW',
    'RESTAURANT_DASHBOARD_VIEW_LIMITED',
  ],
};

const SYSTEM_ROLES = [
  { name: 'SUPER_ADMIN', code: '01', type: 'central_kitchen', is_super_admin: true },
  { name: 'KITCHEN_MANAGER', code: '02', type: 'central_kitchen', is_super_admin: false },
  { name: 'INVENTORY_MANAGER', code: '03', type: 'central_kitchen', is_super_admin: false },
  { name: 'PURCHASE_MANAGER', code: '04', type: 'central_kitchen', is_super_admin: false },
  { name: 'ACCOUNTS', code: '05', type: 'central_kitchen', is_super_admin: false },
  { name: 'DELIVERY_STAFF', code: '06', type: 'central_kitchen', is_super_admin: false },
  { name: 'RESTAURANT_ADMIN', code: '50', type: 'restaurant', is_super_admin: false },
  { name: 'RESTAURANT_MANAGER', code: '51', type: 'restaurant', is_super_admin: false },
  { name: 'RESTAURANT_STAFF', code: '52', type: 'restaurant', is_super_admin: false },
  { name: 'BILLING_OPERATOR', code: '53', type: 'restaurant', is_super_admin: false },
  { name: 'AUDITOR', code: '54', type: 'restaurant', is_super_admin: false },
];

async function seedSystemRolesAndPermissions(prisma: PrismaClient) {
  // 1. Permissions catalog
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }
  console.log(`   ✓ Seeded ${PERMISSIONS.length} permissions`);

  // 2. System roles (tenant_id: null)
  for (const roleDef of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { tenant_id_code: { tenant_id: null, code: roleDef.code } },
      update: {
        name: roleDef.name,
        type: roleDef.type,
        is_system_role: true,
        is_super_admin: roleDef.is_super_admin,
      },
      create: {
        tenant_id: null,
        name: roleDef.name,
        code: roleDef.code,
        type: roleDef.type,
        is_system_role: true,
        is_super_admin: roleDef.is_super_admin,
      },
    });

    // 3. Assign permissions for this role
    const codes = ROLE_PERMISSIONS[roleDef.name] || [];
    const permissionRows = await prisma.permission.findMany({ where: { code: { in: codes } } });

    for (const perm of permissionRows) {
      await prisma.rolePermission.upsert({
        where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
        update: {},
        create: { role_id: role.id, permission_id: perm.id },
      });
    }
    console.log(`   ✓ Assigned ${permissionRows.length} permissions to ${roleDef.name}`);
  }
}


// ─── Admin credentials (change after first login!) ───────────────────────────
const ADMIN_EMAIL    = 'jaisrisureshkumar@gmail.com';
const ADMIN_MOBILE   = '9000000001';
const ADMIN_NAME     = 'Super Admin';
const ADMIN_PASSWORD = 'Jayasri@123';
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Seed system role templates and permissions
  console.log('\n1️⃣  Seeding system role templates and permissions...');
  await seedSystemRolesAndPermissions(prisma);

  // 2. Create (or find) the default "Central Kitchen" tenant
  console.log('\n2️⃣  Seeding default tenant...');
  let tenant = await prisma.tenant.findUnique({ where: { code: 'CK' } });
  if (!tenant) {
    // Specify ck_no: 100 explicitly
    tenant = await prisma.tenant.create({ data: { name: 'Central Kitchen', code: 'CK', ck_no: 100, status: 'active' } });
    console.log(`   ✓ Created tenant: "${tenant.name}" (code: ${tenant.code}, ck_no: ${tenant.ck_no})`);

    // Copy system roles for this tenant using auth.service logic
    await prisma.$transaction(async (tx) => {
      await seedTenantRoles(tx, tenant!.id);
    });
    console.log(`   ✓ Copied roles and permissions for tenant`);
  } else {
    console.log(`   ℹ️  Tenant "Central Kitchen" already exists (id: ${tenant.id}, ck_no: ${tenant.ck_no})`);
  }

  // 3. Create the default admin user
  console.log('\n3️⃣  Seeding admin user...');
  const existingUser = await prisma.user.findFirst({
    where: { tenant_id: tenant.id, email: ADMIN_EMAIL },
  });

  if (!existingUser) {
    const superAdminRole = await prisma.role.findFirst({
      where: { tenant_id: tenant.id, code: '01' },
    });
    if (!superAdminRole) throw new Error('SUPER_ADMIN role not found for tenant');

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // user_id format: CCC RRR RR NNNN
    // CCC = 100 (tenant ck_no), RRR = 000 (CK level), RR = 01 (role SUPER_ADMIN), NNNN = 0001
    const CCC = String(tenant.ck_no).padStart(3, '0');
    const RRR = '000';
    const RR = superAdminRole.code.padStart(2, '0');
    const NNNN = '0001';
    const user_id = `${CCC}${RRR}${RR}${NNNN}`;
    const username = user_id; // Set username equal to user_id

    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        user_id,
        username,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        mobile: ADMIN_MOBILE,
        password_hash: passwordHash,
        primary_role_id: superAdminRole.id,
        email_verified: true,
        status: 'active',
      },
    });

    await prisma.userRole.create({
      data: {
        user_id: user.id,
        role_id: superAdminRole.id,
      },
    });

    // Initialize the code counter for this tenant + role combination
    const existingCounter = await prisma.userCodeCounter.findFirst({
      where: {
        tenant_id: tenant.id,
        restaurant_id: null,
        role_code: RR,
      }
    });

    if (!existingCounter) {
      await prisma.userCodeCounter.create({
        data: {
          tenant_id: tenant.id,
          restaurant_id: null,
          role_code: RR,
          last_sequence: 1,
        }
      });
    } else {
      await prisma.userCodeCounter.update({
        where: { id: existingCounter.id },
        data: { last_sequence: 1 },
      });
    }

    console.log(`   ✓ Created admin user`);
    console.log(`      Email   : ${ADMIN_EMAIL}`);
    console.log(`      Password: ${ADMIN_PASSWORD}`);
    console.log(`      User ID : ${user_id}`);
    console.log(`      Username: ${username}`);
  } else {
    console.log(`   ℹ️  Admin user already exists (email: ${ADMIN_EMAIL})`);
  }

  // 4. Create another default user for testing (Jayasri - KITCHEN_MANAGER)
  console.log('\n4️⃣  Seeding Jayasri (Kitchen Manager) user...');
  const jayEmail = 'jayasriinkwc@gmail.com';
  const existingJay = await prisma.user.findFirst({
    where: { tenant_id: tenant.id, email: jayEmail },
  });

  if (!existingJay) {
    const managerRole = await prisma.role.findFirst({
      where: { tenant_id: tenant.id, code: '02' },
    });
    if (!managerRole) throw new Error('KITCHEN_MANAGER role not found for tenant');

    const passwordHash = await bcrypt.hash('Jayasri@123', 12);
    const CCC = String(tenant.ck_no).padStart(3, '0');
    const RRR = '000';
    const RR = managerRole.code.padStart(2, '0');
    const NNNN = '0001';
    const user_id = `${CCC}${RRR}${RR}${NNNN}`;

    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        user_id,
        username: user_id,
        name: 'Jayasri',
        email: jayEmail,
        mobile: '9000000002',
        password_hash: passwordHash,
        primary_role_id: managerRole.id,
        email_verified: true,
        status: 'active',
      },
    });

    await prisma.userRole.create({
      data: {
        user_id: user.id,
        role_id: managerRole.id,
      },
    });

    // Initialize the code counter for this tenant + role combination
    const existingCounter = await prisma.userCodeCounter.findFirst({
      where: { tenant_id: tenant.id, restaurant_id: null, role_code: RR }
    });
    if (!existingCounter) {
      await prisma.userCodeCounter.create({
        data: { tenant_id: tenant.id, restaurant_id: null, role_code: RR, last_sequence: 1 }
      });
    } else {
      await prisma.userCodeCounter.update({
        where: { id: existingCounter.id },
        data: { last_sequence: 1 }
      });
    }

    console.log(`   ✓ Created Jayasri user`);
    console.log(`      Email   : ${jayEmail}`);
    console.log(`      Password: Jayasri@123`);
    console.log(`      User ID : ${user_id}`);
  } else {
    console.log(`   ℹ️  Jayasri user already exists (email: ${jayEmail})`);
  }

  // 5. Create default Restaurant & Restaurant Admin User
  console.log('\n5️⃣  Seeding default Restaurant and Restaurant Administrator...');
  let restaurant = await prisma.restaurant.findFirst({ where: { name: 'South Indian Delights' } });
  let rt = null;
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: { name: 'South Indian Delights', address: '123 Temple Road, Chennai', gst_number: '33AAAAA1111A1Z1', status: 'active' },
    });
    rt = await prisma.restaurantTenant.create({
      data: {
        tenant_id: tenant.id,
        restaurant_id: restaurant.id,
        restaurant_no: 1,
        branch_code: 'BR-001',
        contact_number: '9876543210',
        status: 'active',
      },
    });
    console.log(`   ✓ Created restaurant and restaurant-tenant relationship`);
  } else {
    rt = await prisma.restaurantTenant.findFirst({
      where: { tenant_id: tenant.id, restaurant_id: restaurant.id },
    });
    console.log(`   ℹ️  Restaurant already exists`);
  }

  const restEmail = 'restadmin@centralkitchen.com';
  const existingRestUser = await prisma.user.findFirst({
    where: { tenant_id: tenant.id, email: restEmail },
  });

  if (!existingRestUser) {
    const restRole = await prisma.role.findFirst({
      where: { tenant_id: tenant.id, code: '50' }, // RESTAURANT_ADMIN
    });
    if (!restRole) throw new Error('RESTAURANT_ADMIN role not found for tenant');

    const passwordHash = await bcrypt.hash('Jayasri@123', 12);
    // user_id format: CCC RRR RR NNNN (CCC=100, RRR=001 (restaurant_no 1), RR=50 (role code), NNNN=0001)
    const user_id = '100001500001';

    const user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        restaurant_id: restaurant.id,
        user_id,
        username: user_id,
        name: 'South Indian Delights Admin',
        email: restEmail,
        mobile: '9876543210',
        password_hash: passwordHash,
        primary_role_id: restRole.id,
        email_verified: true,
        status: 'active',
      },
    });

    await prisma.userRole.create({
      data: {
        user_id: user.id,
        role_id: restRole.id,
      },
    });

    console.log(`   ✓ Created Restaurant Administrator user`);
    console.log(`      Email   : ${restEmail}`);
    console.log(`      Password: Jayasri@123`);
    console.log(`      User ID : ${user_id}`);
  } else {
    console.log(`   ℹ️  Restaurant user already exists (email: ${restEmail})`);
  }

  console.log('\n✅  Seed complete.\n');
}

async function getSystemRoleId(code: string): Promise<number> {
  const role = await prisma.role.findFirst({
    where: { tenant_id: null, code },
    select: { id: true },
  });
  return role?.id ?? -1;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
