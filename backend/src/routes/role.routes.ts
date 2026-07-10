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
import { requireMasterAdmin } from '../middlewares/rbac.middleware';

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
router.post('/requests', submitRoleRequest);
router.get('/requests', listRoleRequests);
router.get('/requests/:id', getRoleRequestById);
router.post('/requests/:id/approve', requireMasterAdmin, approveRoleRequest);
router.post('/requests/:id/reject', requireMasterAdmin, rejectRoleRequest);

// ── Tenant / Template Roles ────────────────────────────────────────────────────
router.get('/tenant', listTenantRoles);
router.get('/templates', listTemplates);
router.post('/templates/:id/clone', cloneRoleToRequest);

// ── Single Role + Permissions ──────────────────────────────────────────────────
// NOTE: keep specific paths before :id
router.get('/:id', getRoleById);
router.put('/:id/permissions', updateRolePermissions);

// ── Role Versions ──────────────────────────────────────────────────────────────
router.get('/:id/versions', listRoleVersions);
router.get('/:id/versions/:versionNo', getRoleVersion);
router.post('/:id/versions/:versionNo/rollback', requireMasterAdmin, rollbackRole);

export default router;
