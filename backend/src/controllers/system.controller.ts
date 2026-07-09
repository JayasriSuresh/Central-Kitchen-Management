import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import bcrypt from 'bcrypt';
import { seedTenantRoles } from '../services/auth.service';

export const getTenants = async (req: Request, res: Response) => {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { users: true, products: true, restaurant_tenants: true }
        }
      }
    });

    res.json({ data: tenants });
  } catch (error) {
    console.error('getTenants error:', error);
    res.status(500).json({ message: 'Failed to fetch tenants' });
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    const { name, code, ck_no, address, adminName, adminEmail, adminMobile, adminPassword } = req.body;

    if (!name || !code || !ck_no || !adminEmail || !adminPassword) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check if ck_no or code is taken
    const existing = await prisma.tenant.findFirst({
      where: {
        OR: [{ ck_no: parseInt(ck_no) }, { code }]
      }
    });

    if (existing) {
      return res.status(400).json({ message: 'Tenant with this ck_no or code already exists' });
    }

    // 1. Create Tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        code,
        ck_no: parseInt(ck_no),
        address,
        status: 'active'
      }
    });

    // 2. Seed roles for tenant
    await prisma.$transaction(async (tx) => {
      await seedTenantRoles(tx, tenant.id);
    });

    // 3. Create Admin user
    const superAdminRole = await prisma.role.findFirst({
      where: { tenant_id: tenant.id, code: '01' }
    });

    if (!superAdminRole) {
      throw new Error('SUPER_ADMIN role failed to generate for tenant');
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    
    // Generate User ID
    const CCC = String(tenant.ck_no).padStart(3, '0');
    const RRR = '000';
    const RR = superAdminRole.code.padStart(2, '0');
    const NNNN = '0001';
    const user_id = `${CCC}${RRR}${RR}${NNNN}`;

    const adminUser = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        user_id,
        username: user_id,
        name: adminName || 'Admin',
        email: adminEmail,
        mobile: adminMobile || '0000000000',
        password_hash: passwordHash,
        primary_role_id: superAdminRole.id,
        email_verified: true,
        status: 'active'
      }
    });

    await prisma.userRole.create({
      data: {
        user_id: adminUser.id,
        role_id: superAdminRole.id
      }
    });

    // Initialize code counter
    await prisma.userCodeCounter.create({
      data: {
        tenant_id: tenant.id,
        restaurant_id: null,
        role_code: RR,
        last_sequence: 1
      }
    });

    res.status(201).json({ message: 'Central Kitchen created successfully', data: tenant });

  } catch (error) {
    console.error('createTenant error:', error);
    res.status(500).json({ message: 'Failed to create Central Kitchen' });
  }
};
