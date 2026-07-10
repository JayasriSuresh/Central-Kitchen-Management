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
  loginOtpSend,
  loginOtpVerify,
  selectWorkspace,
  switchWorkspace,
} from '../controllers/auth.controller';
import {
  getOnboardingDetailsByToken,
  submitOnboardingRegistration,
} from '../controllers/onboarding.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// Public
router.get('/tenants', getTenants);
router.post('/resolve-tenant', resolveTenant);
router.post('/login', login);
router.post('/signup', signup);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);

// OTP utilities (email verify, password reset, mobile verify)
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordWithOtp);

// OTP Login (passwordless login flow)
router.post('/login-otp/send', loginOtpSend);
router.post('/login-otp/verify', loginOtpVerify);
router.post('/select-workspace', selectWorkspace);

// Public onboarding routes (no auth required — accessed via email link)
router.get('/onboarding/invite', getOnboardingDetailsByToken);
router.post('/onboarding/submit', submitOnboardingRegistration);

// Protected (require valid access token)
router.post('/logout-all', authMiddleware, logoutAll);
router.get('/sessions', authMiddleware, getSessions);
router.delete('/sessions/:id', authMiddleware, revokeSession);
router.post('/switch-workspace', authMiddleware, switchWorkspace);

export default router;
