import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  organizationId: string;
  userId: string;
  role: 'admin' | 'processor' | 'provider' | 'patient';
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext {
  const context = tenantStorage.getStore();
  if (!context) {
    throw new Error('Tenant context not found. Make sure tenant middleware is properly configured.');
  }
  return context;
}

export function getOptionalTenantContext(): TenantContext | null {
  return tenantStorage.getStore() || null;
}

export function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return tenantStorage.run(context, fn);
}
