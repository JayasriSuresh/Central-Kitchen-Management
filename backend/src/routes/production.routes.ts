import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/rbac.middleware';
import {
  previewProductionPlan,
  createProductionPlan,
  listProductionPlans,
  getProductionPlan,
  generateMaterialRequest,
  startProduction,
  markPlanReady,
} from '../controllers/production.controller';

const router = Router();
router.use(authMiddleware);

// Read-only planning preview (NO inventory changes)
router.post('/plans/preview', requirePermission('production_planning', 'view'), previewProductionPlan);

// Plan CRUD
router.get('/plans', requirePermission('production_planning', 'view'), listProductionPlans);
router.post('/plans', requirePermission('production_planning', 'create'), createProductionPlan);
router.get('/plans/:id', requirePermission('production_planning', 'view'), getProductionPlan);

// Plan lifecycle actions
router.post('/plans/:id/material-request', requirePermission('production_planning', 'edit'), generateMaterialRequest);
router.post('/plans/:id/mark-ready', requirePermission('production_planning', 'edit'), markPlanReady);

// ─── ONLY THIS ENDPOINT DEDUCTS INVENTORY ────────────────────────────────────
router.post('/plans/:id/start', requirePermission('production_planning', 'approve'), startProduction);

export default router;
