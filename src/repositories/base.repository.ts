import { getTenantContext } from '../utils/tenant-context';
import { db, queryClient } from '../config/database';
import { sql } from 'drizzle-orm';

export class BaseRepository {
  protected db = db;

  protected getTenantId(): string {
    return getTenantContext().organizationId;
  }

  protected getUserId(): string {
    return getTenantContext().userId;
  }

  protected async setUserContext(userId: string): Promise<void> {
    await this.db.execute(sql`SET LOCAL app.user_id = ${userId}`);
  }

  protected async executeWithUserContext<T>(
    callback: (tx: typeof db) => Promise<T>
  ): Promise<T> {
    return await this.db.transaction(async (tx) => {
      return await callback(tx);
    });
  }
}
