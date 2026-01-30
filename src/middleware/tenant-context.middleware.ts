import { Request, Response, NextFunction } from 'express';
import { tenantStorage } from '../utils/tenant-context';
import { UnauthorizedError } from '../errors';

export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return next(new UnauthorizedError('Tenant context not found. Ensure auth middleware is applied first.'));
  }

  tenantStorage.run(req.tenantContext, () => {
    next();
  });
}
