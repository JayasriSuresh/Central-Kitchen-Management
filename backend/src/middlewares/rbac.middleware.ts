import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requirePermission = (module: string, action: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const isSystemAdmin = 
        user.role?.code === '01' || 
        user.role?.name === 'SUPER_ADMIN' || 
        (user.role?.is_system_role && user.role?.name === 'Super Admin');
      if (isSystemAdmin) {
        return next(); // Super Admins can do everything
      }

      const permissions = user.role?.role_permissions || [];
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
