import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
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
router.post('/plans/preview', previewProductionPlan);

// Plan CRUD
router.get('/plans', listProductionPlans);
router.post('/plans', createProductionPlan);
router.get('/plans/:id', getProductionPlan);

// Plan lifecycle actions
router.post('/plans/:id/material-request', generateMaterialRequest);
router.post('/plans/:id/mark-ready', markPlanReady);

// ─── ONLY THIS ENDPOINT DEDUCTS INVENTORY ────────────────────────────────────
router.post('/plans/:id/start', startProduction);

export default router;
