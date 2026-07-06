import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * System role templates — canonical list, tenant_id = null.
 * When a new tenant signs up, these are copied as tenant-specific roles.
 */
const systemRoles = [
  // Central Kitchen Roles
  { name: 'SUPER_ADMIN',       code: '01', type: 'central_kitchen', is_system_role: true  },
  { name: 'KITCHEN_MANAGER',   code: '02', type: 'central_kitchen', is_system_role: false },
  { name: 'INVENTORY_MANAGER', code: '03', type: 'central_kitchen', is_system_role: false },
  { name: 'PURCHASE_MANAGER',  code: '04', type: 'central_kitchen', is_system_role: false },
  { name: 'ACCOUNTS',          code: '05', type: 'central_kitchen', is_system_role: false },
  { name: 'DELIVERY_STAFF',    code: '06', type: 'central_kitchen', is_system_role: false },
  { name: 'CHEF',              code: '07', type: 'central_kitchen', is_system_role: false },
  { name: 'STORE_KEEPER',      code: '08', type: 'central_kitchen', is_system_role: false },
  { name: 'PURCHASE_APPROVER', code: '09', type: 'central_kitchen', is_system_role: false },
  { name: 'FINANCE_APPROVER',  code: '10', type: 'central_kitchen', is_system_role: false },
  { name: 'DISPATCH_MANAGER',  code: '11', type: 'central_kitchen', is_system_role: false },
  // Restaurant Roles
  { name: 'RESTAURANT_ADMIN',   code: '50', type: 'restaurant', is_system_role: false },
  { name: 'RESTAURANT_MANAGER', code: '51', type: 'restaurant', is_system_role: false },
  { name: 'RESTAURANT_STAFF',   code: '52', type: 'restaurant', is_system_role: false },
  { name: 'BILLING_OPERATOR',   code: '53', type: 'restaurant', is_system_role: false },
  { name: 'AUDITOR',            code: '54', type: 'restaurant', is_system_role: false },
];

// ─── Admin credentials (change after first login!) ───────────────────────────
const ADMIN_EMAIL    = 'jaisrisureshkumar@gmail.com';
const ADMIN_MOBILE   = '9000000001';
const ADMIN_NAME     = 'Super Admin';
const ADMIN_PASSWORD = 'Jayasri@123';
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Seed system role templates
  console.log('\n1️⃣  Seeding system role templates...');
  for (const role of systemRoles) {
    await prisma.role.upsert({
      where: { id: await getSystemRoleId(role.code) },
      update: { name: role.name, type: role.type, is_system_role: role.is_system_role },
      create: { tenant_id: null, name: role.name, code: role.code, type: role.type, is_system_role: role.is_system_role },
    });
    console.log(`   ✓ ${role.name} (code: ${role.code})`);
  }

  // 2. Create (or find) the default "Central Kitchen" tenant
  console.log('\n2️⃣  Seeding default tenant...');
  let tenant = await prisma.tenant.findUnique({ where: { code: 'CK' } });
  if (!tenant) {
    // Specify ck_no: 100 explicitly
    tenant = await prisma.tenant.create({ data: { name: 'Central Kitchen', code: 'CK', ck_no: 100, status: 'active' } });
    console.log(`   ✓ Created tenant: "${tenant.name}" (code: ${tenant.code}, ck_no: ${tenant.ck_no})`);

    // Copy system roles for this tenant
    const templates = await prisma.role.findMany({ where: { tenant_id: null } });
    await prisma.role.createMany({
      data: templates.map(r => ({
        tenant_id: tenant!.id,
        name: r.name,
        code: r.code,
        type: r.type,
        is_system_role: r.is_system_role,
      })),
    });
    console.log(`   ✓ Copied ${templates.length} roles for tenant`);
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
