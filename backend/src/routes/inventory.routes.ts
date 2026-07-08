import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
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
router.get('/raw-materials', listRawMaterials);
router.post('/raw-materials', createRawMaterial);
router.put('/raw-materials/:id', updateRawMaterial);
router.delete('/raw-materials/:id', deleteRawMaterial);

// Inventory Operations
router.get('/dashboard', getInventoryDashboard);
router.get('/raw-materials/:id/batches', getRawMaterialBatches);
router.post('/batches', updateInventory);
router.post('/adjustments', adjustStockEndpoint);
router.get('/raw-materials/:id/history', getRawMaterialHistory);

export default router;
