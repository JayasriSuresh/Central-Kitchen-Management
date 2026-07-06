import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  listProductsForOrdering,
  placeOrder,
  listOrderHistory,
} from '../controllers/restaurant.controller';

const router = Router();

// Enforce auth middleware on all restaurant endpoints
router.use(authMiddleware);

router.get('/products', listProductsForOrdering);
router.post('/orders', placeOrder);
router.get('/orders', listOrderHistory);

export default router;
