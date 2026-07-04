import { Router } from 'express';
import {
  getTenants,
  resolveTenant,
  login,
  signup,
  refreshToken,
  logout,
  logoutAll,
  getSessions,
  revokeSession,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPasswordWithOtp,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Public
router.get('/tenants', getTenants);
router.post('/resolve-tenant', resolveTenant);
router.post('/login', login);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// OTP
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordWithOtp);

// Protected (require valid access token)
router.post('/logout-all', authMiddleware, logoutAll);
router.get('/sessions', authMiddleware, getSessions);
router.delete('/sessions/:id', authMiddleware, revokeSession);

export default router;
