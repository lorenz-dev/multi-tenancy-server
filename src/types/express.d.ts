import { TenantContext } from '../utils/tenant-context';

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}

export {};
