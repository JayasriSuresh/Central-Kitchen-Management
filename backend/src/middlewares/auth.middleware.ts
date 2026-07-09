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

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, deleted_at: null },
      include: {
        // New schema: roles live on the User via primaryRole (the FK primary_role_id)
        primaryRole: {
          include: {
            role_permissions: {
              include: { permission: true },
            },
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

    req.user = user;
    req.tenantId = user.tenant_id ?? undefined;
    next();
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(401).json({ message: 'Unauthorized: Token expired or invalid' });
  }
};
