import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/rbac.middleware';
import {
  listRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  getInventoryDashboard,
  getRawMaterialBatches,
  updateInventory,
  adjustStockEndpoint,
  getRawMaterialHistory
} from '../controllers/inventory.controller';

const router = Router();

// Secure all inventory endpoints
router.use(authMiddleware);

// Master CRUD
router.get('/raw-materials', requirePermission('stock_inventory', 'view'), listRawMaterials);
router.post('/raw-materials', requirePermission('stock_inventory', 'create'), createRawMaterial);
router.put('/raw-materials/:id', requirePermission('stock_inventory', 'edit'), updateRawMaterial);
router.delete('/raw-materials/:id', requirePermission('stock_inventory', 'delete'), deleteRawMaterial);

// Inventory Operations
router.get('/dashboard', requirePermission('stock_inventory', 'view'), getInventoryDashboard);
router.get('/raw-materials/:id/batches', requirePermission('stock_inventory', 'view'), getRawMaterialBatches);
router.post('/batches', requirePermission('stock_inventory', 'create'), updateInventory);
router.post('/adjustments', requirePermission('stock_inventory', 'edit'), adjustStockEndpoint);
router.get('/raw-materials/:id/history', requirePermission('stock_inventory', 'view'), getRawMaterialHistory);

export default router;
