import pg, { type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config.js';

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 20 });

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: 'OWNER'|'ADMIN'|'MANAGER'|'MEMBER'|'VIEWER';
};

export async function withTenantTx<T>(ctx: AuthContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [ctx.userId]);
    await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [ctx.workspaceId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function oneOrNull<T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await client.query<T>(sql, params);
  return result.rows[0] ?? null;
}
