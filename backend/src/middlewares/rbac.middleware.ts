import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * requirePermission — checks the JWT-cached permission codes on req.user.
 * Codes are embedded at login time so no DB round-trip is needed.
 *
 * Super-admins have permissionCodes = ['*'] and always pass.
 */
export const requirePermission = (module: string, action: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const codes: string[] = (user as any).permissionCodes ?? [];

      // Wildcard = super-admin (Master Admin or CK SUPER_ADMIN)
      if (codes.includes('*')) {
        return next();
      }

      const requiredCode = `${module.toUpperCase()}_${action.toUpperCase()}`;
      if (!codes.includes(requiredCode)) {
        return res.status(403).json({ message: `Forbidden: Requires ${module}:${action} permission` });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Internal Server Error during permission check' });
    }
  };
};

/**
 * requireMasterAdmin — only allows users whose role code is '00' (MASTER_ADMIN).
 */
export const requireMasterAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (user.primaryRole?.code !== '00') {
      return res.status(403).json({ message: 'Forbidden: Requires System Administrator privileges' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

/**
 * requireSuperAdmin — allows Master Admin OR the tenant's own SUPER_ADMIN (is_super_admin=true).
 * Used for routes that CK admins should also be able to reach within their own tenant.
 */
export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const codes: string[] = (user as any).permissionCodes ?? [];
    if (codes.includes('*')) {
      return next(); // wildcard = super admin of any flavour
    }

    return res.status(403).json({ message: 'Forbidden: Requires Super Admin privileges' });
  } catch (error) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
