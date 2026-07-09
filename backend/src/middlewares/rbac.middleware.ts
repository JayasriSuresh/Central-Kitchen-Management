import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requirePermission = (module: string, action: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const isSystemAdmin = user.primaryRole?.is_super_admin === true;
      if (isSystemAdmin) {
        return next(); // Super Admins can do everything
      }

      const permissions = user.primaryRole?.role_permissions || [];
      const hasPermission = permissions.some(
        (rp: any) => rp.permission.module === module && rp.permission.action === action
      );

      if (!hasPermission) {
        return res.status(403).json({ message: `Forbidden: Requires ${module}:${action} permission` });
      }

      next();
    } catch (error) {
      return res.status(500).json({ message: 'Internal Server Error during permission check' });
    }
  };
};

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
