import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import {
  generateTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  hashPassword,
  comparePassword,
  seedTenantRoles,
  generateUserId,
  generateUsername,
  recordFailedLogin,
  clearFailedLogins,
} from '../services/auth.service';
import { sendOtpEmail } from '../services/email.service';
import {
  resolveTenantSchema,
  loginSchema,
  signupSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resetPasswordOtpSchema,
  loginOtpSendSchema,
  loginOtpVerifySchema,
} from '../utils/validation';

// ─── GET /auth/tenants ────────────────────────────────────────────────────────

export const getTenants = async (_req: Request, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true, code: true },
      orderBy: { ck_no: 'asc' },
    });
    return res.status(200).json({ tenants });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /auth/resolve-tenant ────────────────────────────────────────────────

export const resolveTenant = async (req: Request, res: Response) => {
  try {
    const { email_or_mobile } = resolveTenantSchema.parse(req.body);

    const users = await prisma.user.findMany({
      where: {
        OR: [{ email: email_or_mobile }, { mobile: email_or_mobile }, { username: email_or_mobile }],
        deleted_at: null,
      },
      include: { tenant: true },
    });

    if (users.length === 0) return res.status(404).json({ message: 'User not found' });

    const tenants = users.map((u) => {
      if (!u.tenant) return { id: null, name: 'System Administration', code: 'SYS' };
      return { id: u.tenant.id, name: u.tenant.name, code: u.tenant.code };
    });
    return res.status(200).json({ tenants });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/login ─────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { tenant_id: tenant_id === null ? null : tenant_id },
          { tenant_id: null }
        ],
        AND: [
          { OR: [{ email: email_or_mobile }, { mobile: email_or_mobile }, { username: email_or_mobile }] }
        ],
        deleted_at: null,
      },
      include: {
        primaryRole: { select: { id: true, name: true, code: true, type: true, is_super_admin: true } },
        user_roles: {
          include: {
            role: true
          }
        },
        restaurant_user_roles: {
          include: {
            role: true
          }
        }
      },
    });

    if (!user) {
      // Avoid foreign key violation if tenant_id does not exist
      const tenantExists = tenant_id ? await prisma.tenant.findUnique({ where: { id: tenant_id } }) : false;
      await prisma.loginAttempt.create({
        data: {
          tenant_id: tenantExists ? tenant_id : null,
          email_or_mobile,
          success: false,
          ip_address: req.ip
        },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check account lockout
    if (user.locked_until && user.locked_until > new Date()) {
      const minutesLeft = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'User account is inactive' });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      await Promise.all([
        prisma.loginAttempt.create({
          data: { tenant_id, email_or_mobile, user_id: user.id, success: false, ip_address: req.ip },
        }),
        recordFailedLogin(user.id),
      ]);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success — clear lockout, update last_login
    await Promise.all([
      clearFailedLogins(user.id),
      prisma.loginAttempt.create({
        data: { tenant_id, email_or_mobile, user_id: user.id, success: true, ip_address: req.ip },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      }),
    ]);

    const portals: string[] = [];
    if (user.primaryRole?.code === '00' || user.primaryRole?.type === 'MASTER_ADMIN' || user.primaryRole?.type === 'system') {
      portals.push('system');
    } else {
      const hasCk = user.primaryRole?.type === 'CENTRAL_KITCHEN' || user.user_roles.some((ur: any) => ur.role.type === 'CENTRAL_KITCHEN');
      const hasRest = user.primaryRole?.type === 'RESTAURANT' || user.restaurant_user_roles.some((rur: any) => rur.role.type === 'RESTAURANT');
      if (hasCk) portals.push('central_kitchen');
      if (hasRest) portals.push('restaurant');
    }

    // Get all available workspaces for the user
    const workspaces = await getWorkspaces(user.id, user.primaryRole, tenant_id);

    // If multi-workspace, return a short-lived workspace selection token
    if (workspaces.length > 1) {
      const workspaceToken = jwt.sign(
        { userId: user.id, tenantId: user.tenant_id, type: 'workspace_select' },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '5m' }
      );
      return res.status(200).json({
        requireWorkspaceSelect: true,
        workspaceToken,
        workspaces,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      });
    }

    // Otherwise, log in directly using the single workspace
    const singleWs = workspaces[0] || { type: user.primaryRole?.type ?? 'central_kitchen', roleId: user.primary_role_id, restaurantId: user.restaurant_id };
    const activeWorkspace = {
      type: singleWs.type,
      restaurantId: singleWs.restaurantId || null,
      roleId: singleWs.roleId,
    };

    const tokens = await generateTokens(
      user.id,
      tenant_id,
      activeWorkspace,
      req.headers['user-agent'],
      req.ip,
      'Web Browser',
    );

    return res.status(200).json({
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        name: user.name,
        email: user.email,
        primary_role_id: activeWorkspace.roleId,
        role_type: singleWs.type,
        tenant_id: user.tenant_id,
        restaurant_id: activeWorkspace.restaurantId,
        portals,
      },
      workspaces,
      ...tokens,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ── Helpers & Workspace Selection Endpoints ──────────────────────────

const getWorkspaces = async (userId: number, primaryRole: any, tenantId: number | null) => {
  const workspaces: any[] = [];

  // 1. Central Kitchen workspace (if they have a central_kitchen role)
  const ckRoles = await prisma.userRole.findMany({
    where: { user_id: userId, role: { type: 'CENTRAL_KITCHEN' } },
    include: { role: true }
  });

  if (ckRoles.length > 0) {
    for (const ur of ckRoles) {
      workspaces.push({
        type: 'central_kitchen',
        roleId: ur.role.id,
        roleName: ur.role.name,
        roleCode: ur.role.code,
      });
    }
  } else if (primaryRole?.type === 'CENTRAL_KITCHEN') {
    workspaces.push({
      type: 'central_kitchen',
      roleId: primaryRole.id,
      roleName: primaryRole.name,
      roleCode: primaryRole.code,
    });
  }

  // 2. Restaurant workspaces (if they have restaurant_user_roles)
  const restRoles = await prisma.restaurantUserRole.findMany({
    where: { user_id: userId },
    include: {
      role: true,
      restaurantTenant: {
        include: { restaurant: true }
      }
    }
  });

  for (const rur of restRoles) {
    workspaces.push({
      type: 'restaurant',
      restaurantId: rur.restaurantTenant.restaurant.id,
      restaurantName: rur.restaurantTenant.restaurant.name,
      roleId: rur.role.id,
      roleName: rur.role.name,
      roleCode: rur.role.code,
    });
  }

  return workspaces;
};

export const selectWorkspace = async (req: Request, res: Response) => {
  try {
    const { workspaceToken, type, restaurantId } = req.body;
    if (!workspaceToken || !type) {
      return res.status(400).json({ message: 'Missing workspaceToken or type' });
    }

    const decoded = jwt.verify(workspaceToken, process.env.JWT_SECRET || 'secret') as any;
    if (!decoded || decoded.type !== 'workspace_select') {
      return res.status(400).json({ message: 'Invalid or expired workspace selection token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, deleted_at: null },
      include: {
        primaryRole: true,
        user_roles: { include: { role: true } },
        restaurant_user_roles: { include: { role: true, restaurantTenant: true } }
      }
    });

    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    let roleId: number | null = null;

    if (type === 'CENTRAL_KITCHEN') {
      const ur = user.user_roles.find((r: any) => r.role.type === 'CENTRAL_KITCHEN');
      if (ur) {
        roleId = ur.role.id;
      } else if (user.primaryRole?.type === 'CENTRAL_KITCHEN') {
        roleId = user.primary_role_id;
      }
    } else if (type === 'RESTAURANT') {
      if (!restaurantId) {
        return res.status(400).json({ message: 'restaurantId is required' });
      }
      const rur = user.restaurant_user_roles.find(
        r => r.restaurantTenant.restaurant_id === Number(restaurantId)
      );
      if (rur) {
        roleId = rur.role.id;
      }
    }

    if (!roleId) {
      return res.status(403).json({ message: 'Forbidden: You do not have access to this workspace' });
    }

    const activeWorkspace = {
      type,
      restaurantId: type === 'restaurant' ? Number(restaurantId) : null,
      roleId,
    };

    const tokens = await generateTokens(
      user.id,
      user.tenant_id,
      activeWorkspace,
      req.headers['user-agent'],
      req.ip,
      'Web Browser'
    );

    const portals: string[] = [];
    const hasCk = user.primaryRole?.type === 'CENTRAL_KITCHEN' || user.user_roles.some((ur: any) => ur.role.type === 'CENTRAL_KITCHEN');
    const hasRest = user.primaryRole?.type === 'RESTAURANT' || user.restaurant_user_roles.some((rur: any) => rur.role.type === 'RESTAURANT');
    if (hasCk) portals.push('central_kitchen');
    if (hasRest) portals.push('restaurant');

    const roleDetails = await prisma.role.findUnique({ where: { id: roleId } });

    const workspaces = await getWorkspaces(user.id, user.primaryRole, user.tenant_id);

    return res.status(200).json({
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        name: user.name,
        email: user.email,
        primary_role_id: roleId,
        role_type: roleDetails?.type ?? type,
        tenant_id: user.tenant_id,
        restaurant_id: activeWorkspace.restaurantId,
        portals,
      },
      workspaces,
      ...tokens,
    });

  } catch (error: any) {
    console.error('selectWorkspace error:', error);
    return res.status(400).json({ message: 'Invalid or expired token.' });
  }
};

import { AuthRequest } from '../middlewares/auth.middleware';

export const switchWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { type, restaurantId } = req.body;

    if (!type || (type !== 'central_kitchen' && type !== 'restaurant')) {
      return res.status(400).json({ message: 'Invalid workspace type' });
    }

    let roleId: number | null = null;

    if (type === 'central_kitchen') {
      const ur = await prisma.userRole.findFirst({
        where: {
          user_id: user.id,
          role: { type: 'CENTRAL_KITCHEN' }
        },
        include: { role: true }
      });
      if (ur) {
        roleId = ur.role.id;
      } else if (user.primaryRole?.type === 'CENTRAL_KITCHEN') {
        roleId = user.primary_role_id;
      }
    } else if (type === 'restaurant') {
      if (!restaurantId) {
        return res.status(400).json({ message: 'restaurantId is required' });
      }
      
      const rur = await prisma.restaurantUserRole.findFirst({
        where: {
          user_id: user.id,
          restaurantTenant: { restaurant_id: Number(restaurantId) }
        },
        include: { role: true }
      });
      if (rur) {
        roleId = rur.role.id;
      }
    }

    if (!roleId) {
      return res.status(403).json({ message: 'Access denied: You do not have access to this workspace' });
    }

    const activeWorkspace = {
      type,
      restaurantId: type === 'restaurant' ? Number(restaurantId) : null,
      roleId
    };

    const tokens = await generateTokens(
      user.id,
      user.tenant_id,
      activeWorkspace,
      req.headers['user-agent'],
      req.ip,
      'Web Browser'
    );

    const portals: string[] = [];
    const hasCk = user.primaryRole?.type === 'CENTRAL_KITCHEN' || user.user_roles.some((ur: any) => ur.role.type === 'CENTRAL_KITCHEN');
    const hasRest = user.primaryRole?.type === 'RESTAURANT' || user.restaurant_user_roles.some((rur: any) => rur.role.type === 'RESTAURANT');
    if (hasCk) portals.push('central_kitchen');
    if (hasRest) portals.push('restaurant');

    const roleDetails = await prisma.role.findUnique({
      where: { id: roleId }
    });

    const workspaces = await getWorkspaces(user.id, user.primaryRole, user.tenant_id);

    return res.status(200).json({
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        name: user.name,
        email: user.email,
        primary_role_id: roleId,
        role_type: roleDetails?.type ?? type,
        tenant_id: user.tenant_id,
        restaurant_id: type === 'restaurant' ? Number(restaurantId) : null,
        portals,
      },
      workspaces,
      ...tokens
    });

  } catch (error: any) {
    console.error('switchWorkspace error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

// ─── POST /auth/signup ────────────────────────────────────────────────────────
// Creates a brand-new Central Kitchen (tenant) with its first SUPER_ADMIN user.

export const signup = async (req: Request, res: Response) => {
  try {
    const { tenant_name, tenant_code, name, email, mobile, password } = signupSchema.parse(req.body);

    const existingTenant = await prisma.tenant.findUnique({ where: { code: tenant_code } });
    if (existingTenant) return res.status(400).json({ message: 'Tenant code already exists' });

    const hashedPassword = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      // Assign the next ck_no (starts at 100, independent of PK)
      const maxCk = await tx.tenant.aggregate({ _max: { ck_no: true } });
      const ck_no = (maxCk._max.ck_no ?? 99) + 1;

      const tenant = await tx.tenant.create({
        data: { name: tenant_name, code: tenant_code, ck_no },
      });

      await seedTenantRoles(tx, tenant.id);

      const superAdminRole = await tx.role.findFirst({
        where: { tenant_id: tenant.id, code: '01' },
      });
      if (!superAdminRole) throw new Error('SUPER_ADMIN role not found after seeding');

      const user_id = await generateUserId(tx, tenant.id, null, superAdminRole.id);
      const username = generateUsername(user_id);

      const user = await tx.user.create({
        data: {
          tenant_id: tenant.id,
          user_id,
          username,
          name,
          email,
          mobile,
          password_hash: hashedPassword,
          // New schema field: primary_role_id (replaces role_id)
          primary_role_id: superAdminRole.id,
        },
      });

      // Also create the UserRole junction record (new schema requirement)
      await tx.userRole.create({
        data: { user_id: user.id, role_id: superAdminRole.id },
      });

      return { tenant, user };
    });

    return res.status(201).json({
      message: 'Central Kitchen and admin user created',
      result: {
        tenant: result.tenant,
        user: {
          id: result.user.id,
          user_id: result.user.user_id,
          username: result.user.username,
          name: result.user.name,
          email: result.user.email,
        },
      },
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/refresh-token ─────────────────────────────────────────────────

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refresh_token, activeWorkspace } = req.body;
    if (!refresh_token) return res.status(400).json({ message: 'refresh_token is required' });

    const tokens = await rotateRefreshToken(
      refresh_token,
      activeWorkspace,
      req.headers['user-agent'],
      req.ip,
    );

    return res.status(200).json(tokens);
  } catch (error: any) {
    return res.status(401).json({ message: error.message });
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────────────────

export const logout = async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      await revokeRefreshToken(refresh_token);
    }
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /auth/logout-all ────────────────────────────────────────────────────
// Revokes ALL sessions for the authenticated user (requires auth middleware)

export const logoutAll = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    await revokeAllUserSessions(userId);
    return res.status(200).json({ message: 'All sessions revoked' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── GET /auth/sessions ───────────────────────────────────────────────────────

export const getSessions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const sessions = await prisma.deviceSession.findMany({
      where: { user_id: userId, revoked_at: null },
      select: {
        id: true,
        device_name: true,
        ip_address: true,
        user_agent: true,
        last_seen_at: true,
        created_at: true,
      },
      orderBy: { last_seen_at: 'desc' },
    });

    return res.status(200).json({ sessions });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── DELETE /auth/sessions/:id ────────────────────────────────────────────────

export const revokeSession = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const sessionId = Number(req.params.id);

    const session = await prisma.deviceSession.findFirst({
      where: { id: sessionId, user_id: userId, revoked_at: null },
    });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await prisma.deviceSession.update({
      where: { id: sessionId },
      data: { revoked_at: new Date() },
    });
    await prisma.refreshToken.update({
      where: { id: session.refresh_token_id },
      data: { revoked_at: new Date() },
    });

    return res.status(200).json({ message: 'Session revoked' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── OTP helpers ──────────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60 * 1000;
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const findUserByIdentifier = (tenant_id: number | null, email_or_mobile: string) =>
  prisma.user.findFirst({
    where: {
      OR: [
        { tenant_id: tenant_id === null ? null : tenant_id },
        { tenant_id: null }
      ],
      AND: [
        { OR: [{ email: email_or_mobile }, { mobile: email_or_mobile }, { username: email_or_mobile }] }
      ],
      deleted_at: null,
    },
    include: {
      primaryRole: { select: { id: true, name: true, code: true, type: true } },
      user_roles: {
        include: {
          role: true
        }
      },
      restaurant_user_roles: {
        include: {
          role: true
        }
      }
    }
  });

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile, purpose } = sendOtpSchema.parse(req.body);
    const user = await findUserByIdentifier(tenant_id, email_or_mobile);

    if (user) {
      const otp = generateOtp();
      await prisma.otpCode.updateMany({
        where: { user_id: user.id, purpose, verified_at: null },
        data: { verified_at: new Date() },
      });
      await prisma.otpCode.create({
        data: { user_id: user.id, code: otp, purpose, expires_at: new Date(Date.now() + OTP_TTL_MS) },
      });
      await sendOtpEmail(user.email, otp, purpose as any);
    }

    // Always same response to prevent user enumeration
    return res.status(200).json({ message: 'If that account exists, an OTP has been sent.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile, otp, purpose } = verifyOtpSchema.parse(req.body);
    const user = await findUserByIdentifier(tenant_id, email_or_mobile);
    if (!user) return res.status(400).json({ message: 'Invalid OTP or account not found.' });

    const record = await prisma.otpCode.findFirst({
      where: { user_id: user.id, code: otp, purpose, verified_at: null, expires_at: { gt: new Date() } },
      orderBy: { id: 'desc' },
    });
    if (!record) return res.status(400).json({ message: 'Invalid or expired OTP.' });

    await prisma.otpCode.update({ where: { id: record.id }, data: { verified_at: new Date() } });

    if (purpose === 'email_verify') {
      await prisma.user.update({ where: { id: user.id }, data: { email_verified: true } });
    }

    return res.status(200).json({ message: 'OTP verified successfully.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/forgot-password ───────────────────────────────────────────────

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile } = req.body;
    if (!tenant_id || !email_or_mobile) {
      return res.status(400).json({ message: 'tenant_id and email_or_mobile are required.' });
    }

    const user = await findUserByIdentifier(tenant_id === null ? null : Number(tenant_id), String(email_or_mobile));
    if (user) {
      const otp = generateOtp();
      await prisma.otpCode.updateMany({
        where: { user_id: user.id, purpose: 'password_reset', verified_at: null },
        data: { verified_at: new Date() },
      });
      await prisma.otpCode.create({
        data: { user_id: user.id, code: otp, purpose: 'password_reset', expires_at: new Date(Date.now() + OTP_TTL_MS) },
      });
      await sendOtpEmail(user.email, otp, 'password_reset');
    }

    return res.status(200).json({ message: 'If that account exists, a reset OTP has been sent.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/reset-password ────────────────────────────────────────────────

export const resetPasswordWithOtp = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile, otp, new_password } = resetPasswordOtpSchema.parse(req.body);
    const user = await findUserByIdentifier(tenant_id, email_or_mobile);
    if (!user) return res.status(400).json({ message: 'Invalid OTP or account not found.' });

    const record = await prisma.otpCode.findFirst({
      where: { user_id: user.id, code: otp, purpose: 'password_reset', verified_at: null, expires_at: { gt: new Date() } },
      orderBy: { id: 'desc' },
    });
    if (!record) return res.status(400).json({ message: 'Invalid or expired OTP.' });

    const hashed = await hashPassword(new_password);

    await prisma.$transaction([
      prisma.otpCode.update({ where: { id: record.id }, data: { verified_at: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { password_hash: hashed } }),
    ]);

    return res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/login-otp/send ────────────────────────────────────────────────
// Step 1 of OTP-based login: validate the user exists, generate a 'login' OTP,
// and send it to their email. Does NOT return any user info (prevents enumeration).

export const loginOtpSend = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile } = loginOtpSendSchema.parse(req.body);
    const user = await findUserByIdentifier(tenant_id, email_or_mobile);

    if (user) {
      // Check if account is locked / inactive before sending
      if (user.locked_until && user.locked_until > new Date()) {
        const minutesLeft = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
        return res.status(403).json({
          message: `Account locked. Try again in ${minutesLeft} minute(s).`,
        });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ message: 'User account is inactive.' });
      }

      // Invalidate any previous unused login OTPs for this user
      await prisma.otpCode.updateMany({
        where: { user_id: user.id, purpose: 'login', verified_at: null },
        data: { verified_at: new Date() },
      });

      const otp = generateOtp();
      await prisma.otpCode.create({
        data: {
          user_id: user.id,
          code: otp,
          purpose: 'login',
          expires_at: new Date(Date.now() + OTP_TTL_MS),
        },
      });

      await sendOtpEmail(user.email, otp, 'login');
    }

    // Always same response regardless of whether user was found
    return res.status(200).json({ message: 'If that account exists, a login code has been sent.' });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

// ─── POST /auth/login-otp/verify ─────────────────────────────────────────────
// Step 2 of OTP-based login: verify the 'login' OTP and, on success,
// return a full session (access + refresh tokens) — same shape as /auth/login.

export const loginOtpVerify = async (req: Request, res: Response) => {
  try {
    const { tenant_id, email_or_mobile, otp } = loginOtpVerifySchema.parse(req.body);
    const user = await findUserByIdentifier(tenant_id, email_or_mobile);

    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired login code.' });
    }

    // Re-check account status
    if (user.locked_until && user.locked_until > new Date()) {
      const minutesLeft = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        message: `Account locked. Try again in ${minutesLeft} minute(s).`,
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'User account is inactive.' });
    }

    const record = await prisma.otpCode.findFirst({
      where: {
        user_id: user.id,
        code: otp,
        purpose: 'login',
        verified_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { id: 'desc' },
    });

    if (!record) {
      // Record the failed attempt toward lockout
      await Promise.all([
        prisma.loginAttempt.create({
          data: {
            tenant_id,
            email_or_mobile,
            user_id: user.id,
            success: false,
            failure_reason: 'invalid_otp',
            ip_address: req.ip,
          },
        }),
        recordFailedLogin(user.id),
      ]);
      return res.status(401).json({ message: 'Invalid or expired login code.' });
    }

    // Mark the OTP as used
    await prisma.otpCode.update({ where: { id: record.id }, data: { verified_at: new Date() } });

    // Success — clear lockout counters, update last_login
    await Promise.all([
      clearFailedLogins(user.id),
      prisma.loginAttempt.create({
        data: {
          tenant_id,
          email_or_mobile,
          user_id: user.id,
          success: true,
          ip_address: req.ip,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      }),
    ]);

    const portals: string[] = [];
    if (user.primaryRole?.code === '00' || user.primaryRole?.type === 'MASTER_ADMIN' || user.primaryRole?.type === 'system') {
      portals.push('system');
    } else {
      const hasCk = user.primaryRole?.type === 'CENTRAL_KITCHEN' || user.user_roles.some((ur: any) => ur.role.type === 'CENTRAL_KITCHEN');
      const hasRest = user.primaryRole?.type === 'RESTAURANT' || user.restaurant_user_roles.some((rur: any) => rur.role.type === 'RESTAURANT');
      if (hasCk) portals.push('central_kitchen');
      if (hasRest) portals.push('restaurant');
    }

    const workspaces = await getWorkspaces(user.id, user.primaryRole, tenant_id);

    if (workspaces.length > 1) {
      const workspaceToken = jwt.sign(
        { userId: user.id, tenantId: user.tenant_id, type: 'workspace_select' },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '5m' }
      );
      return res.status(200).json({
        requireWorkspaceSelect: true,
        workspaceToken,
        workspaces,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      });
    }

    const singleWs = workspaces[0] || { type: user.primaryRole?.type ?? 'central_kitchen', roleId: user.primary_role_id, restaurantId: user.restaurant_id };
    const activeWorkspace = {
      type: singleWs.type,
      restaurantId: singleWs.restaurantId || null,
      roleId: singleWs.roleId,
    };

    const tokens = await generateTokens(
      user.id,
      tenant_id,
      activeWorkspace,
      req.headers['user-agent'],
      req.ip,
      'Web Browser',
    );

    return res.status(200).json({
      user: {
        id: user.id,
        user_id: user.user_id,
        username: user.username,
        name: user.name,
        email: user.email,
        primary_role_id: activeWorkspace.roleId,
        role_type: singleWs.type,
        tenant_id: user.tenant_id,
        restaurant_id: activeWorkspace.restaurantId,
        portals,
      },
      ...tokens,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};
