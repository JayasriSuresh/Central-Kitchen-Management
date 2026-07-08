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
import {
  inviteRestaurant,
  listOnboardings,
  getOnboardingById,
  approveOnboarding,
  rejectOnboarding,
  requestChangesOnboarding,
} from '../controllers/onboarding.controller';

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

// Restaurant Onboarding (invite flow)
router.post('/restaurants/invite', inviteRestaurant);
router.get('/restaurants/onboarding', listOnboardings);
router.get('/restaurants/onboarding/:id', getOnboardingById);
router.post('/restaurants/onboarding/:id/approve', approveOnboarding);
router.post('/restaurants/onboarding/:id/reject', rejectOnboarding);
router.post('/restaurants/onboarding/:id/request-changes', requestChangesOnboarding);

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
