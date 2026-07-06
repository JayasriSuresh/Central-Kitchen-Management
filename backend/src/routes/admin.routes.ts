import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  getDropdownData,
  listRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  listCkUsers,
  createCkUser,
  updateCkUser,
  deleteCkUser,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrdersSummary,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication
router.use(authMiddleware);

// Dropdown data for form selects
router.get('/dropdown-data', getDropdownData);

// Restaurants
router.get('/restaurants', listRestaurants);
router.post('/restaurants', createRestaurant);
router.put('/restaurants/:id', updateRestaurant);
router.delete('/restaurants/:id', deleteRestaurant);

// CK Users
router.get('/users/ck', listCkUsers);
router.post('/users/ck', createCkUser);
router.put('/users/ck/:id', updateCkUser);
router.delete('/users/ck/:id', deleteCkUser);

// Products & Recipes
router.get('/products', listProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Orders summary dashboard
router.get('/orders/summary', getOrdersSummary);

export default router;
