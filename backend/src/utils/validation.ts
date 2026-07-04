import { z } from 'zod';

export const loginSchema = z.object({
  tenant_id: z.coerce.number(),
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const resolveTenantSchema = z.object({
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
});

export const signupSchema = z.object({
  tenant_name: z.string().min(1, 'Tenant name is required'),
  tenant_code: z.string().min(1, 'Tenant code is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().min(10, 'Mobile must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  tenant_id: z.coerce.number(),
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const sendOtpSchema = z.object({
  tenant_id: z.coerce.number(),
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
  // 'email_verify' = verify after signup; 'password_reset' = forgot-password OTP
  purpose: z.enum(['email_verify', 'password_reset']),
});

export const verifyOtpSchema = z.object({
  tenant_id: z.coerce.number(),
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  purpose: z.enum(['email_verify', 'password_reset']),
});

// Used to verify the OTP and set the new password in one step
export const resetPasswordOtpSchema = z.object({
  tenant_id: z.coerce.number(),
  email_or_mobile: z.string().min(1, 'Email or Mobile is required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  new_password: z.string().min(6, 'Password must be at least 6 characters'),
});
