import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { Prisma } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ─── Password ──────────────────────────────────────────────────────────────

export const hashPassword = async (password: string) => bcrypt.hash(password, 12);
export const comparePassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

// ─── Tokens & Sessions ─────────────────────────────────────────────────────

export const generateTokens = async (
  userId: number,
  tenantId: number | null,
  activeWorkspace?: {
    type: string;
    restaurantId?: number | null;
    roleId: number;
  },
  userAgent?: string,
  ipAddress?: string,
  deviceName?: string,
) => {
  // Embed permission codes in JWT so middleware never hits the DB for auth checks
  let permissionCodes: string[] = [];
  if (activeWorkspace?.roleId) {
    const rolePerms = await prisma.rolePermission.findMany({
      where: { role_id: activeWorkspace.roleId },
      include: { permission: { select: { code: true } } },
    });
    permissionCodes = rolePerms.map((rp) => rp.permission.code);

    // Also check if this role is super_admin / is_super_admin
    const role = await prisma.role.findUnique({
      where: { id: activeWorkspace.roleId },
      select: { is_super_admin: true, code: true },
    });
    if (role?.is_super_admin) permissionCodes = ['*'];
  }

  const accessToken = jwt.sign(
    { userId, tenantId, activeWorkspace, permissionCodes },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
  const refreshToken = crypto.randomBytes(64).toString('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day refresh window

  const storedToken = await prisma.refreshToken.create({
    data: { user_id: userId, token: refreshToken, expires_at: expiresAt },
  });

  await prisma.deviceSession.create({
    data: {
      user_id: userId,
      refresh_token_id: storedToken.id,
      user_agent: userAgent,
      ip_address: ipAddress,
      device_name: deviceName || 'Web Browser',
    },
  });

  return { accessToken, refreshToken, permissionCodes };
};

export const rotateRefreshToken = async (
  incomingToken: string,
  activeWorkspace?: {
    type: string;
    restaurantId?: number | null;
    roleId: number;
  },
  userAgent?: string,
  ipAddress?: string,
) => {
  const record = await prisma.refreshToken.findFirst({
    where: { token: incomingToken, revoked_at: null, expires_at: { gt: new Date() } },
    include: { user: { select: { id: true, tenant_id: true, status: true } } },
  });

  if (!record) throw new Error('Invalid or expired refresh token');
  if (record.user.status !== 'active') throw new Error('User account is inactive');

  // Revoke old token + session
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revoked_at: new Date() },
  });
  await prisma.deviceSession.updateMany({
    where: { refresh_token_id: record.id },
    data: { revoked_at: new Date() },
  });

  // Issue fresh pair
  return generateTokens(record.user.id, record.user.tenant_id, activeWorkspace, userAgent, ipAddress);
};

export const revokeRefreshToken = async (refreshToken: string) => {
  const record = await prisma.refreshToken.findFirst({
    where: { token: refreshToken, revoked_at: null },
  });
  if (!record) return;

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revoked_at: new Date() },
  });
  await prisma.deviceSession.updateMany({
    where: { refresh_token_id: record.id },
    data: { revoked_at: new Date() },
  });
};

export const revokeAllUserSessions = async (userId: number) => {
  const tokens = await prisma.refreshToken.findMany({
    where: { user_id: userId, revoked_at: null },
    select: { id: true },
  });
  const ids = tokens.map((t) => t.id);

  await prisma.refreshToken.updateMany({
    where: { id: { in: ids } },
    data: { revoked_at: new Date() },
  });
  await prisma.deviceSession.updateMany({
    where: { refresh_token_id: { in: ids } },
    data: { revoked_at: new Date() },
  });
};

// ─── Account lockout ────────────────────────────────────────────────────────

export const recordFailedLogin = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failed_login_count: true },
  });
  if (!user) return;

  const newCount = (user.failed_login_count ?? 0) + 1;
  const data: Prisma.UserUpdateInput = { failed_login_count: newCount };

  if (newCount >= MAX_FAILED_ATTEMPTS) {
    data.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  }

  await prisma.user.update({ where: { id: userId }, data });
};

export const clearFailedLogins = async (userId: number) => {
  await prisma.user.update({
    where: { id: userId },
    data: { failed_login_count: 0, locked_until: null },
  });
};

// ─── Tenant seeding ────────────────────────────────────────────────────────

export const seedTenantRoles = async (tx: Prisma.TransactionClient, tenantId: number) => {
  // Copy all global system roles (tenant_id: null) into the new tenant
  const globalRoles = await tx.role.findMany({
    where: { tenant_id: null },
    include: { role_permissions: true },
  });

  if (globalRoles.length === 0) {
    throw new Error('No global role templates found. Run the seed script first.');
  }

  for (const sysRole of globalRoles) {
    // Skip MASTER_ADMIN — it belongs to the platform only
    if (sysRole.code === '00') continue;

    const newRole = await tx.role.create({
      data: {
        tenant_id: tenantId,
        name: sysRole.name,
        code: sysRole.code,
        type: sysRole.type,
        role_scope: 'GLOBAL',      // copies of global roles remain scoped GLOBAL
        owner_type: sysRole.owner_type,
        description: sysRole.description,
        is_super_admin: sysRole.is_super_admin,
        status: 'active',
      },
    });

    if (sysRole.role_permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: sysRole.role_permissions.map((rp) => ({
          role_id: newRole.id,
          permission_id: rp.permission_id,
        })),
      });
    }
  }
};

// ─── User ID generation ────────────────────────────────────────────────────
//
// Format: CCC RRR RR NNNN
//   CCC  = tenant.ck_no          (e.g. 100 for first CK)
//   RRR  = restaurant_tenant.restaurant_no per-tenant (e.g. 001), or 000 for CK-level
//   RR   = role.code             (e.g. 01 = SUPER_ADMIN)
//   NNNN = atomic per-bucket counter from UserCodeCounter table
//
// The counter is atomically incremented via upsert so concurrent signups
// never collide — no race condition.

export const generateUserId = async (
  tx: Prisma.TransactionClient,
  tenantId: number,
  restaurantId: number | null,
  roleId: number,
): Promise<string> => {
  // 1. CCC — from stored ck_no (never derived from PK)
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { ck_no: true },
  });
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  const CCC = String(tenant.ck_no).padStart(3, '0');

  // 2. RRR — from RestaurantTenant.restaurant_no (per-tenant sequence),
  //           or 000 for CK-level users
  let RRR = '000';
  if (restaurantId) {
    const rt = await tx.restaurantTenant.findUnique({
      where: { tenant_id_restaurant_id: { tenant_id: tenantId, restaurant_id: restaurantId } },
      select: { restaurant_no: true },
    });
    if (!rt) throw new Error(`RestaurantTenant for tenant=${tenantId} restaurant=${restaurantId} not found`);
    RRR = String(rt.restaurant_no).padStart(3, '0');
  }

  // 3. RR — role code
  const role = await tx.role.findUnique({
    where: { id: roleId },
    select: { code: true },
  });
  if (!role) throw new Error(`Role ${roleId} not found`);
  const RR = role.code.padStart(2, '0');

  // 4. NNNN — atomic counter using UserCodeCounter table
  //    We use a sentinel value of 0 for restaurant_id when it's null (CK-level users),
  //    because Prisma's typed upsert `where` clause does not accept null for compound
  //    unique keys. MySQL's unique index also matches NULLs differently than non-NULL values.
  const counterRestaurantId = restaurantId ?? 0;
  const updatedCounter = await tx.userCodeCounter.upsert({
    where: {
      tenant_id_restaurant_id_role_code: {
        tenant_id: tenantId,
        restaurant_id: counterRestaurantId,
        role_code: RR,
      },
    },
    create: { tenant_id: tenantId, restaurant_id: counterRestaurantId, role_code: RR, last_sequence: 1 },
    update: { last_sequence: { increment: 1 } },
    select: { last_sequence: true },
  });
  const NNNN = String(updatedCounter.last_sequence).padStart(4, '0');

  return `${CCC}${RRR}${RR}${NNNN}`;
};

// ─── Username generation ────────────────────────────────────────────────────
//
// Username = the generated user_id itself (unique, human-readable, deterministic)
// Stored separately so users can log in with it directly.

export const generateUsername = (userId: string): string => userId;
