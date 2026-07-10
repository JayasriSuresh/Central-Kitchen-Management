import { Router } from 'express';
import { getTenants, createTenant } from '../controllers/system.controller';
import { listRoleRequests } from '../controllers/role.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireMasterAdmin } from '../middlewares/rbac.middleware';

const router = Router();

// Master Admin endpoints
router.use(authMiddleware);
router.use(requireMasterAdmin);

router.get('/tenants', getTenants);
router.post('/tenants', createTenant);

// Cross-tenant role requests dashboard (alias for convenience)
router.get('/roles/requests', listRoleRequests);

export default router;
