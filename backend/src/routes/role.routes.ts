import { Router } from 'express';
import {
  // Permissions
  listPermissions,
  createPermission,
  deletePermission,
  // Global Roles
  listGlobalRoles,
  createGlobalRole,
  updateGlobalRole,
  deleteGlobalRole,
  // Role Requests
  submitRoleRequest,
  listRoleRequests,
  getRoleRequestById,
  approveRoleRequest,
  rejectRoleRequest,
  // Tenant Roles
  listTenantRoles,
  listTemplates,
  cloneRoleToRequest,
  // Single Role
  getRoleById,
  updateRolePermissions,
  // Versions
  listRoleVersions,
  getRoleVersion,
  rollbackRole,
} from '../controllers/role.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireMasterAdmin, requireSuperAdmin, requirePermission } from '../middlewares/rbac.middleware';

const router = Router();

// All routes require auth
router.use(authMiddleware);

// ── Permission Centre ──────────────────────────────────────────────────────────
router.get('/permissions', listPermissions);
router.post('/permissions', requireMasterAdmin, createPermission);
router.delete('/permissions/:id', requireMasterAdmin, deletePermission);

// ── Global Roles (Master Admin) ────────────────────────────────────────────────
router.get('/global', requireMasterAdmin, listGlobalRoles);
router.post('/global', requireMasterAdmin, createGlobalRole);
router.put('/global/:id', requireMasterAdmin, updateGlobalRole);
router.delete('/global/:id', requireMasterAdmin, deleteGlobalRole);

// ── Role Requests ──────────────────────────────────────────────────────────────
router.post('/requests', requireSuperAdmin, submitRoleRequest);
router.get('/requests', requirePermission('login_user_mgmt', 'view'), listRoleRequests);
router.get('/requests/:id', requirePermission('login_user_mgmt', 'view'), getRoleRequestById);
router.post('/requests/:id/approve', requireMasterAdmin, approveRoleRequest);
router.post('/requests/:id/reject', requireMasterAdmin, rejectRoleRequest);

// ── Tenant / Template Roles ────────────────────────────────────────────────────
router.get('/tenant', requirePermission('login_user_mgmt', 'view'), listTenantRoles);
router.get('/templates', requirePermission('login_user_mgmt', 'view'), listTemplates);
router.post('/templates/:id/clone', requireSuperAdmin, cloneRoleToRequest);

// ── Single Role + Permissions ──────────────────────────────────────────────────
// NOTE: keep specific paths before :id
router.get('/:id', requirePermission('login_user_mgmt', 'view'), getRoleById);
router.put('/:id/permissions', requireSuperAdmin, updateRolePermissions);

// ── Role Versions ──────────────────────────────────────────────────────────────
router.get('/:id/versions', requirePermission('login_user_mgmt', 'view'), listRoleVersions);
router.get('/:id/versions/:versionNo', requirePermission('login_user_mgmt', 'view'), getRoleVersion);
router.post('/:id/versions/:versionNo/rollback', requireMasterAdmin, rollbackRole);

export default router;
