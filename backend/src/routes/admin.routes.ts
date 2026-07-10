import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermission } from '../middlewares/rbac.middleware';
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

// Dropdown data for form selects (authenticated users can read)
router.get('/dropdown-data', getDropdownData);

// Restaurants
router.get('/restaurants', requirePermission('restaurant_outlet', 'view'), listRestaurants);
router.post('/restaurants', requirePermission('restaurant_outlet', 'create'), createRestaurant);
router.put('/restaurants/:id', requirePermission('restaurant_outlet', 'edit'), updateRestaurant);
router.delete('/restaurants/:id', requirePermission('restaurant_outlet', 'delete'), deleteRestaurant);

// Restaurant Onboarding (invite flow)
router.post('/restaurants/invite', requirePermission('restaurant_outlet', 'create'), inviteRestaurant);
router.get('/restaurants/onboarding', requirePermission('restaurant_outlet', 'view'), listOnboardings);
router.get('/restaurants/onboarding/:id', requirePermission('restaurant_outlet', 'view'), getOnboardingById);
router.post('/restaurants/onboarding/:id/approve', requirePermission('restaurant_outlet', 'edit'), approveOnboarding);
router.post('/restaurants/onboarding/:id/reject', requirePermission('restaurant_outlet', 'edit'), rejectOnboarding);
router.post('/restaurants/onboarding/:id/request-changes', requirePermission('restaurant_outlet', 'edit'), requestChangesOnboarding);

// CK Users
router.get('/users/ck', requirePermission('login_user_mgmt', 'view'), listCkUsers);
router.post('/users/ck', requirePermission('login_user_mgmt', 'create'), createCkUser);
router.put('/users/ck/:id', requirePermission('login_user_mgmt', 'edit'), updateCkUser);
router.delete('/users/ck/:id', requirePermission('login_user_mgmt', 'delete'), deleteCkUser);

// Products & Recipes
router.get('/products', requirePermission('product_food_item', 'view'), listProducts);
router.post('/products', requirePermission('product_food_item', 'create'), createProduct);
router.put('/products/:id', requirePermission('product_food_item', 'edit'), updateProduct);
router.delete('/products/:id', requirePermission('product_food_item', 'delete'), deleteProduct);

// Orders summary dashboard
router.get('/orders/summary', requirePermission('ck_order_dashboard', 'view'), getOrdersSummary);

export default router;
