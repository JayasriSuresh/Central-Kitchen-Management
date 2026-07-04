import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const tenantMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // If user is authenticated via authMiddleware, req.tenantId is already set
  // This middleware ensures that tenantId is present
  if (!req.tenantId) {
    // Alternatively, try to extract from headers if not authenticated
    const headerTenant = req.headers['x-tenant-id'] as string;
    if (headerTenant) {
      const parsed = parseInt(headerTenant, 10);
      if (isNaN(parsed)) {
        return res.status(400).json({ message: 'Bad Request: Tenant ID must be a number' });
      }
      req.tenantId = parsed;
    } else {
      return res.status(400).json({ message: 'Bad Request: Tenant ID is required' });
    }
  }
  next();
};
