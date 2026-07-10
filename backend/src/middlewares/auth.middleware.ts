import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

export interface AuthRequest extends Request {
  user?: any;
  tenantId?: number;
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token payload' });
    }

    // Lightweight user check — no need to load full permissions from DB since they're in the JWT
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, deleted_at: null },
      select: {
        id: true,
        user_id: true,
        username: true,
        name: true,
        email: true,
        mobile: true,
        status: true,
        tenant_id: true,
        restaurant_id: true,
        primary_role_id: true,
        primaryRole: {
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            is_super_admin: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized: User not found' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Forbidden: User is inactive' });
    }

    // Override active workspace context dynamically from JWT
    if (decoded.activeWorkspace) {
      user.primary_role_id = decoded.activeWorkspace.roleId;
      (user as any).restaurant_id = decoded.activeWorkspace.restaurantId ?? null;
      (user as any).role_type = decoded.activeWorkspace.type;
    }

    // Attach permissions from JWT (no DB round-trip needed)
    (user as any).permissionCodes = decoded.permissionCodes ?? [];

    req.user = user;
    req.tenantId = user.tenant_id ?? undefined;
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(401).json({ message: 'Unauthorized: Token expired or invalid' });
  }
};
