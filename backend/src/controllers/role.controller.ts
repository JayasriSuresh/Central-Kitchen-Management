import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middlewares/auth.middleware';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getCallerId = (req: AuthRequest): number => (req.user as any).id;
const getTenantId = (req: AuthRequest): number => {
  const t = (req as any).tenantId;
  if (!t) throw new Error('Tenant scope required');
  return t;
};

const writeAuditLog = async (
  tenantId: number | null,
  userId: number,
  action: string,
  entity: string,
  entityId: number,
  meta?: object,
) => {
  await prisma.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: userId,
      action,
      entity_type: entity,
      entity_id: entityId,
      new_value: meta ? (meta as any) : undefined,
    },
  });
};

// ─── PERMISSION CENTRE ────────────────────────────────────────────────────────

// GET /roles/permissions
export const listPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });

    // Count roles that use each permission
    const usageCounts = await prisma.rolePermission.groupBy({
      by: ['permission_id'],
      _count: { permission_id: true },
    });
    const usageMap = new Map(usageCounts.map((u) => [u.permission_id, u._count.permission_id]));

    // Group by module
    const grouped: Record<string, any[]> = {};
    for (const p of permissions) {
      if (!grouped[p.module]) grouped[p.module] = [];
      grouped[p.module].push({ ...p, used_by_count: usageMap.get(p.id) ?? 0 });
    }

    return res.json({ data: permissions.map((p) => ({ ...p, used_by_count: usageMap.get(p.id) ?? 0 })), grouped });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/permissions
export const createPermission = async (req: AuthRequest, res: Response) => {
  try {
    const { module, action, description } = req.body;
    if (!module || !action) return res.status(400).json({ message: 'module and action are required' });

    const code = `${module.toUpperCase()}_${action.toUpperCase()}`;

    const existing = await prisma.permission.findUnique({ where: { code } });
    if (existing) return res.status(409).json({ message: `Permission ${code} already exists` });

    const perm = await prisma.permission.create({ data: { module, action, code, description } });

    await writeAuditLog(null, getCallerId(req), 'CREATE', 'Permission', perm.id, { code });

    return res.status(201).json({ data: perm });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /roles/permissions/:id
export const deletePermission = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);

    const usage = await prisma.rolePermission.count({ where: { permission_id: id } });
    if (usage > 0) {
      return res.status(409).json({ message: `Cannot delete: permission is used by ${usage} role(s)` });
    }

    await prisma.permission.delete({ where: { id } });
    await writeAuditLog(null, getCallerId(req), 'DELETE', 'Permission', id);

    return res.json({ message: 'Permission deleted' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── GLOBAL ROLES (Master Admin) ─────────────────────────────────────────────

// GET /roles/global
export const listGlobalRoles = async (req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      where: { tenant_id: null, deleted_at: null },
      include: {
        role_permissions: { include: { permission: true } },
        _count: { select: { versions: true } },
      },
      orderBy: { code: 'asc' },
    });
    return res.json({ data: roles });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/global
export const createGlobalRole = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, type, permission_codes } = req.body;
    if (!name || !type) return res.status(400).json({ message: 'name and type are required' });

    const codes: string[] = Array.isArray(permission_codes) ? permission_codes : [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

    // Determine next code (auto-increment based on type)
    const last = await prisma.role.findFirst({
      where: { tenant_id: null, code: { not: '00' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const nextCode = String((parseInt(last?.code ?? '0') || 0) + 1).padStart(2, '0');

    const role = await prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          tenant_id: null,
          name,
          code: nextCode,
          role_scope: 'GLOBAL',
          type,
          owner_type: 'MASTER',
          description,
          current_version: 1,
          status: 'active',
        },
      });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ role_id: r.id, permission_id: p.id })),
        });
      }

      // Snapshot version 1
      await tx.roleVersion.create({
        data: {
          role_id: r.id,
          version_no: 1,
          snapshot: codes,
          change_notes: 'Initial version',
          changed_by_id: getCallerId(req),
        },
      });

      return r;
    });

    await writeAuditLog(null, getCallerId(req), 'CREATE_GLOBAL_ROLE', 'Role', role.id, { name, type, codes });

    return res.status(201).json({ data: role });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// PUT /roles/global/:id
export const updateGlobalRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, description, permission_codes, change_notes } = req.body;

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing || existing.tenant_id !== null) return res.status(404).json({ message: 'Global role not found' });

    const codes: string[] = Array.isArray(permission_codes) ? permission_codes : [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

    await prisma.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data: { name, description, current_version: { increment: 1 } } });

      // Replace permissions
      await tx.rolePermission.deleteMany({ where: { role_id: id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ role_id: id, permission_id: p.id })),
        });
      }

      const newVersion = (existing.current_version ?? 1) + 1;
      await tx.roleVersion.create({
        data: {
          role_id: id,
          version_no: newVersion,
          snapshot: codes,
          change_notes: change_notes || `Updated to version ${newVersion}`,
          changed_by_id: getCallerId(req),
        },
      });
    });

    await writeAuditLog(null, getCallerId(req), 'UPDATE_GLOBAL_ROLE', 'Role', id, { codes });

    return res.json({ message: 'Global role updated' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// DELETE /roles/global/:id
export const deleteGlobalRole = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await prisma.role.update({ where: { id }, data: { deleted_at: new Date(), status: 'inactive' } });
    await writeAuditLog(null, getCallerId(req), 'DELETE_GLOBAL_ROLE', 'Role', id);
    return res.json({ message: 'Global role archived' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── ROLE REQUESTS ─────────────────────────────────────────────────────────────

// POST /roles/requests
export const submitRoleRequest = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { role_name, description, role_type, template_role_id, permission_codes } = req.body;

    if (!role_name || !role_type) return res.status(400).json({ message: 'role_name and role_type are required' });

    const codes: string[] = Array.isArray(permission_codes) ? permission_codes : [];
    if (codes.length > 0) {
      const found = await prisma.permission.findMany({ where: { code: { in: codes } } });
      const missing = codes.filter((c) => !found.some((p) => p.code === c));
      if (missing.length > 0) return res.status(400).json({ message: `Unknown permission codes: ${missing.join(', ')}` });
    }

    const request = await prisma.roleRequest.create({
      data: {
        tenant_id: tenantId,
        requested_by_id: getCallerId(req),
        role_name,
        description,
        role_type,
        template_role_id: template_role_id ? parseInt(template_role_id) : null,
        requested_permissions: codes,
        status: 'PENDING',
      },
    });

    await writeAuditLog(tenantId, getCallerId(req), 'SUBMIT_ROLE_REQUEST', 'RoleRequest', request.id, { role_name, role_type });

    return res.status(201).json({ data: request });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /roles/requests
export const listRoleRequests = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user as any;
    const isMaster = user.primaryRole?.code === '00';

    const where: any = {};
    if (!isMaster) {
      where.tenant_id = getTenantId(req);
    }

    const requests = await prisma.roleRequest.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
        approvedRole: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.json({ data: requests });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /roles/requests/:id
export const getRoleRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const request = await prisma.roleRequest.findUnique({
      where: { id },
      include: {
        tenant: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true } },
        approvedRole: true,
      },
    });
    if (!request) return res.status(404).json({ message: 'Request not found' });

    // Expand permission codes to full objects
    const codes = (request.requested_permissions as string[]) || [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

    return res.json({ data: { ...request, permissions } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/requests/:id/approve
export const approveRoleRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { permission_codes, change_notes } = req.body; // Master Admin may modify codes before approving

    const request = await prisma.roleRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(409).json({ message: 'Request is no longer pending' });

    const finalCodes: string[] =
      Array.isArray(permission_codes) && permission_codes.length > 0
        ? permission_codes
        : (request.requested_permissions as string[]);

    const permissions = await prisma.permission.findMany({ where: { code: { in: finalCodes } } });

    const role = await prisma.$transaction(async (tx) => {
      // 1. Create the role
      const r = await tx.role.create({
        data: {
          tenant_id: request.tenant_id,
          name: request.role_name,
          code: `TN_${Date.now()}`, // auto-generated tenant role code
          role_scope: 'TENANT',
          type: request.role_type,
          owner_type: 'TENANT',
          description: request.description,
          current_version: 1,
          status: 'active',
        },
      });

      // 2. Assign permissions
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ role_id: r.id, permission_id: p.id })),
        });
      }

      // 3. Snapshot version 1
      await tx.roleVersion.create({
        data: {
          role_id: r.id,
          version_no: 1,
          snapshot: finalCodes,
          change_notes: change_notes || `Approved from request #${id}`,
          changed_by_id: getCallerId(req),
        },
      });

      // 4. Mark request approved
      await tx.roleRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approved_role_id: r.id,
          approved_by_id: getCallerId(req),
          approved_at: new Date(),
        },
      });

      return r;
    });

    await writeAuditLog(
      request.tenant_id,
      getCallerId(req),
      'APPROVE_ROLE_REQUEST',
      'RoleRequest',
      id,
      { approved_role_id: role.id },
    );

    return res.json({ message: 'Role request approved and role created', data: role });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/requests/:id/reject
export const rejectRoleRequest = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { remarks } = req.body;
    if (!remarks) return res.status(400).json({ message: 'Rejection remarks are required' });

    const request = await prisma.roleRequest.findUnique({ where: { id } });
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(409).json({ message: 'Request is no longer pending' });

    await prisma.roleRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        remarks,
        approved_by_id: getCallerId(req),
        approved_at: new Date(),
      },
    });

    await writeAuditLog(request.tenant_id, getCallerId(req), 'REJECT_ROLE_REQUEST', 'RoleRequest', id, { remarks });

    return res.json({ message: 'Role request rejected' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── TENANT ROLES ─────────────────────────────────────────────────────────────

// GET /roles/tenant
export const listTenantRoles = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { type } = req.query;

    const where: any = {
      deleted_at: null,
      OR: [
        { role_scope: 'GLOBAL' },
        { role_scope: 'TENANT', tenant_id: tenantId },
      ],
    };
    if (type) where.type = type;

    const roles = await prisma.role.findMany({
      where,
      include: {
        role_permissions: { include: { permission: true } },
        _count: { select: { versions: true } },
      },
      orderBy: [{ role_scope: 'asc' }, { code: 'asc' }],
    });

    return res.json({ data: roles });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /roles/templates
export const listTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      where: { role_scope: 'GLOBAL', deleted_at: null },
      include: { role_permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
    return res.json({ data: roles });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/templates/:id/clone
export const cloneRoleToRequest = async (req: AuthRequest, res: Response) => {
  try {
    const templateId = parseInt(req.params.id as string);
    const template = await prisma.role.findUnique({
      where: { id: templateId },
      include: { role_permissions: { include: { permission: true } } },
    });
    if (!template) return res.status(404).json({ message: 'Template role not found' });

    const permissionCodes = template.role_permissions.map((rp) => rp.permission.code);

    return res.json({
      data: {
        template_role_id: template.id,
        role_name: `${template.name}_COPY`,
        description: template.description,
        role_type: template.type,
        permission_codes: permissionCodes,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── SINGLE ROLE ──────────────────────────────────────────────────────────────

// GET /roles/:id
export const getRoleById = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        role_permissions: { include: { permission: true } },
        versions: { orderBy: { version_no: 'desc' } },
      },
    });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    return res.json({ data: role });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// PUT /roles/:id/permissions
export const updateRolePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { permission_codes, change_notes } = req.body;

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) return res.status(404).json({ message: 'Role not found' });
    if (role.role_scope === 'GLOBAL') {
      return res.status(403).json({ message: 'Use the global role update endpoint for GLOBAL roles' });
    }

    const codes: string[] = Array.isArray(permission_codes) ? permission_codes : [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

    const newVersion = (role.current_version ?? 1) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role_id: id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ role_id: id, permission_id: p.id })),
        });
      }
      await tx.role.update({ where: { id }, data: { current_version: newVersion } });
      await tx.roleVersion.create({
        data: {
          role_id: id,
          version_no: newVersion,
          snapshot: codes,
          change_notes: change_notes || `Updated to version ${newVersion}`,
          changed_by_id: getCallerId(req),
        },
      });
    });

    await writeAuditLog(role.tenant_id, getCallerId(req), 'UPDATE_ROLE_PERMISSIONS', 'Role', id, { codes });

    return res.json({ message: 'Role permissions updated', version: newVersion });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── ROLE VERSIONS ────────────────────────────────────────────────────────────

// GET /roles/:id/versions
export const listRoleVersions = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const versions = await prisma.roleVersion.findMany({
      where: { role_id: id },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { version_no: 'desc' },
    });
    return res.json({ data: versions });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// GET /roles/:id/versions/:versionNo
export const getRoleVersion = async (req: AuthRequest, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string);
    const versionNo = parseInt(req.params.versionNo as string);

    const version = await prisma.roleVersion.findUnique({
      where: { role_id_version_no: { role_id: roleId, version_no: versionNo } },
      include: { changedBy: { select: { id: true, name: true } } },
    });
    if (!version) return res.status(404).json({ message: 'Version not found' });

    // Expand snapshot codes to full permission objects
    const codes = (version.snapshot as string[]) || [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });

    return res.json({ data: { ...version, permissions } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// POST /roles/:id/versions/:versionNo/rollback
export const rollbackRole = async (req: AuthRequest, res: Response) => {
  try {
    const roleId = parseInt(req.params.id as string);
    const versionNo = parseInt(req.params.versionNo as string);

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const targetVersion = await prisma.roleVersion.findUnique({
      where: { role_id_version_no: { role_id: roleId, version_no: versionNo } },
    });
    if (!targetVersion) return res.status(404).json({ message: 'Version not found' });

    const codes = (targetVersion.snapshot as string[]) || [];
    const permissions = await prisma.permission.findMany({ where: { code: { in: codes } } });
    const newVersion = (role.current_version ?? 1) + 1;

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { role_id: roleId } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({ role_id: roleId, permission_id: p.id })),
        });
      }
      await tx.role.update({ where: { id: roleId }, data: { current_version: newVersion } });
      await tx.roleVersion.create({
        data: {
          role_id: roleId,
          version_no: newVersion,
          snapshot: codes,
          change_notes: `Rolled back to version ${versionNo}`,
          changed_by_id: getCallerId(req),
        },
      });
    });

    await writeAuditLog(
      role.tenant_id,
      getCallerId(req),
      'ROLLBACK_ROLE',
      'Role',
      roleId,
      { from_version: role.current_version, to_version: versionNo, new_version: newVersion },
    );

    return res.json({ message: `Rolled back to v${versionNo} — now v${newVersion}`, version: newVersion });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
