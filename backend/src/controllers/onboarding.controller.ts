import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { generateUserId, generateUsername, seedTenantRoles } from '../services/auth.service';
import {
  sendOnboardingInvitation,
  sendWelcomeEmail,
  sendRejectionEmail,
  sendChangesRequestedEmail,
} from '../services/email.service';

const TOKEN_TTL_DAYS = 7;

const getTenantId = (req: Request): number => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) throw new Error('Central Kitchen tenant scope is required');
  return tenantId;
};

// ─── POST /admin/restaurants/invite ──────────────────────────────────────────
export const inviteRestaurant = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { restaurant_name, contact_person, email, notes } = req.body;

    if (!restaurant_name || !contact_person || !email) {
      return res.status(400).json({ message: 'restaurant_name, contact_person, and email are required.' });
    }

    // Check if there's already an active/pending invite for this email in this tenant
    const existing = await prisma.restaurantOnboarding.findFirst({
      where: {
        tenant_id: tenantId,
        email,
        status: { in: ['invited', 'submitted', 'changes_requested'] },
      },
    });
    if (existing) {
      return res.status(409).json({ message: 'An active invitation already exists for this email.' });
    }

    const token = crypto.randomBytes(48).toString('hex');
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + TOKEN_TTL_DAYS);

    const onboarding = await prisma.restaurantOnboarding.create({
      data: {
        tenant_id: tenantId,
        token,
        expires_at,
        restaurant_name,
        contact_person,
        email,
        notes: notes ?? null,
        status: 'invited',
      },
    });


    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const registrationUrl = `${frontendBase}/onboarding/register?token=${token}`;

    // Email is best-effort — the invite record is always saved even if SMTP fails
    let emailWarning: string | undefined;
    try {
      await sendOnboardingInvitation(email, contact_person, restaurant_name, tenant?.name ?? 'Central Kitchen', registrationUrl);
    } catch (emailErr: any) {
      console.error('⚠️  Invitation email failed:', emailErr.message);
      emailWarning = 'Invitation saved, but email delivery failed. Share this link manually: ' + registrationUrl;
    }

    return res.status(201).json({
      message: emailWarning ?? 'Invitation sent successfully',
      id: onboarding.id,
      registration_url: registrationUrl,
      email_sent: !emailWarning,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── GET /admin/restaurants/onboarding ───────────────────────────────────────
export const listOnboardings = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const onboardings = await prisma.restaurantOnboarding.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        restaurant_name: true,
        contact_person: true,
        email: true,
        status: true,
        created_at: true,
        updated_at: true,
        expires_at: true,
        city: true,
        notes: true,
      },
      orderBy: { updated_at: 'desc' },
    });
    return res.status(200).json({ onboardings });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── GET /admin/restaurants/onboarding/:id ───────────────────────────────────
export const getOnboardingById = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const onboarding = await prisma.restaurantOnboarding.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!onboarding) return res.status(404).json({ message: 'Onboarding request not found.' });
    return res.status(200).json({ onboarding });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /admin/restaurants/onboarding/:id/approve ──────────────────────────
export const approveOnboarding = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);

    const ob = await prisma.restaurantOnboarding.findFirst({
      where: { id, tenant_id: tenantId, status: { in: ['submitted', 'changes_requested'] } },
    });
    if (!ob) return res.status(404).json({ message: 'Onboarding request not found or not in a reviewable state.' });
    if (!ob.password_hash) return res.status(400).json({ message: 'Restaurant has not completed registration yet.' });

    await prisma.$transaction(async (tx) => {
      // 1. Create the global Restaurant record
      const restaurant = await tx.restaurant.create({
        data: {
          name: ob.restaurant_name,
          address: ob.address ?? null,
          gst_number: ob.vat_no ?? null,
          status: 'active',
        },
      });

      // 2. Allocate next restaurant_no per-tenant
      const maxRt = await tx.restaurantTenant.aggregate({
        where: { tenant_id: tenantId },
        _max: { restaurant_no: true },
      });
      const restaurant_no = (maxRt._max.restaurant_no ?? 0) + 1;
      const branch_code = `BR-${String(restaurant_no).padStart(3, '0')}`;

      // 3. Create the RestaurantTenant link
      const rt = await tx.restaurantTenant.create({
        data: {
          tenant_id: tenantId,
          restaurant_id: restaurant.id,
          restaurant_no,
          branch_code,
          contact_number: ob.phone ?? null,
          payment_terms: ob.payment_terms ?? null,
          status: 'active',
        },
      });

      // 4. Find the RESTAURANT_ADMIN role for this tenant
      const adminRole = await tx.role.findFirst({
        where: { tenant_id: tenantId, code: '50' }, // RESTAURANT_ADMIN
      });
      if (!adminRole) throw new Error('RESTAURANT_ADMIN role not found. Ensure roles are seeded for this tenant.');

      // 5. Generate user_id using CCC RRR RR NNNN format
      const user_id = await generateUserId(tx, tenantId, restaurant.id, adminRole.id);
      const username = generateUsername(user_id);

      // 6. Create the Restaurant Admin user
      const user = await tx.user.create({
        data: {
          tenant_id: tenantId,
          restaurant_id: restaurant.id,
          user_id,
          username,
          name: ob.contact_person,
          email: ob.email,
          mobile: ob.phone ?? '0000000000',
          password_hash: ob.password_hash!,
          primary_role_id: adminRole.id,
          email_verified: true,
          status: 'active',
        },
      });

      // 7. Create RestaurantUserRole
      await tx.restaurantUserRole.create({
        data: {
          restaurant_tenant_id: rt.id,
          user_id: user.id,
          role_id: adminRole.id,
        },
      });

      // 8. Mark onboarding as approved
      await tx.restaurantOnboarding.update({
        where: { id: ob.id },
        data: { status: 'approved' },
      });

      // 9. Send welcome email
      await sendWelcomeEmail(ob.email, ob.contact_person, username, ob.restaurant_name);
    });

    return res.status(200).json({ message: 'Restaurant approved and provisioned successfully.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /admin/restaurants/onboarding/:id/reject ───────────────────────────
export const rejectOnboarding = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A rejection reason is required.' });
    }

    const ob = await prisma.restaurantOnboarding.findFirst({
      where: { id, tenant_id: tenantId, status: { not: 'approved' } },
    });
    if (!ob) return res.status(404).json({ message: 'Onboarding request not found.' });

    await prisma.restaurantOnboarding.update({
      where: { id: ob.id },
      data: { status: 'rejected', rejection_reason: reason },
    });

    await sendRejectionEmail(ob.email, ob.contact_person, ob.restaurant_name, reason);

    return res.status(200).json({ message: 'Onboarding request rejected.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── POST /admin/restaurants/onboarding/:id/request-changes ──────────────────
export const requestChangesOnboarding = async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Please specify what changes are required.' });
    }

    const ob = await prisma.restaurantOnboarding.findFirst({
      where: { id, tenant_id: tenantId, status: 'submitted' },
    });
    if (!ob) return res.status(404).json({ message: 'Onboarding request not found or not in submitted state.' });

    await prisma.restaurantOnboarding.update({
      where: { id: ob.id },
      data: { status: 'changes_requested', rejection_reason: reason },
    });

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const registrationUrl = `${frontendBase}/onboarding/register?token=${ob.token}`;
    await sendChangesRequestedEmail(ob.email, ob.contact_person, ob.restaurant_name, reason, registrationUrl);

    return res.status(200).json({ message: 'Changes requested and email sent.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── PUBLIC: GET /onboarding/invite?token=... ────────────────────────────────
export const getOnboardingDetailsByToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Token is required.' });

    const ob = await prisma.restaurantOnboarding.findUnique({
      where: { token: String(token) },
      select: {
        id: true,
        status: true,
        expires_at: true,
        restaurant_name: true,
        contact_person: true,
        email: true,
        trading_name: true,
        company_reg_no: true,
        vat_no: true,
        address: true,
        postcode: true,
        city: true,
        phone: true,
        opening_hours: true,
        delivery_instructions: true,
        preferred_delivery_days: true,
        preferred_delivery_time: true,
        accounts_email: true,
        payment_terms: true,
        po_required: true,
        rejection_reason: true,
        tenant: { select: { name: true } },
      },
    });

    if (!ob) return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    if (ob.status === 'approved') return res.status(410).json({ message: 'This invitation has already been approved.' });
    if (ob.status === 'rejected') return res.status(410).json({ message: 'This invitation was rejected.' });
    if (new Date() > ob.expires_at && ob.status === 'invited') {
      return res.status(410).json({ message: 'This invitation link has expired. Please contact your Central Kitchen.' });
    }

    return res.status(200).json({ onboarding: ob });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// ─── PUBLIC: POST /onboarding/submit ─────────────────────────────────────────
export const submitOnboardingRegistration = async (req: Request, res: Response) => {
  try {
    const {
      token, trading_name, company_reg_no, vat_no, address, postcode, city, phone,
      opening_hours, delivery_instructions, preferred_delivery_days, preferred_delivery_time,
      accounts_email, payment_terms, po_required, password, confirm_password,
    } = req.body;

    if (!token) return res.status(400).json({ message: 'Token is required.' });
    if (!password || !confirm_password) return res.status(400).json({ message: 'Password and confirm password are required.' });
    if (password !== confirm_password) return res.status(400).json({ message: 'Passwords do not match.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const ob = await prisma.restaurantOnboarding.findUnique({ where: { token: String(token) } });
    if (!ob) return res.status(404).json({ message: 'Invalid or expired invitation link.' });
    if (ob.status === 'approved') return res.status(410).json({ message: 'This registration has already been approved.' });
    if (ob.status === 'rejected') return res.status(410).json({ message: 'This invitation was rejected.' });
    if (new Date() > ob.expires_at && ob.status === 'invited') {
      return res.status(410).json({ message: 'This invitation link has expired.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const newStatus = ob.status === 'changes_requested' ? 'submitted' : 'submitted';

    // Extend expiry if re-submitting
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + TOKEN_TTL_DAYS);

    await prisma.restaurantOnboarding.update({
      where: { token: String(token) },
      data: {
        status: newStatus,
        expires_at: newExpiry,
        trading_name: trading_name ?? null,
        company_reg_no: company_reg_no ?? null,
        vat_no: vat_no ?? null,
        address: address ?? null,
        postcode: postcode ?? null,
        city: city ?? null,
        phone: phone ?? null,
        opening_hours: opening_hours ?? null,
        delivery_instructions: delivery_instructions ?? null,
        preferred_delivery_days: preferred_delivery_days ?? null,
        preferred_delivery_time: preferred_delivery_time ?? null,
        accounts_email: accounts_email ?? null,
        payment_terms: payment_terms ?? null,
        po_required: po_required === true || po_required === 'true',
        password_hash,
      },
    });

    return res.status(200).json({
      message: 'Registration submitted successfully. Your application is pending approval.',
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
