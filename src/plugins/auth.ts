import type { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import { config } from '../config.js';
import { pool } from '../lib/db.js';

export async function authPlugin(app: FastifyInstance) {
  await app.register(jwt, { secret: config.JWT_SECRET });
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async function(request: any) {
    await request.jwtVerify();
    const userId = request.user.sub;
    const workspaceId = request.user.workspaceId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
      await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceId]);
      const membership = await client.query<{ role: any }>(`
        SELECT role FROM workspace_memberships
        WHERE workspace_id=$1 AND user_id=$2 AND status='ACTIVE'
      `,[workspaceId,userId]);
      await client.query('COMMIT');
      if (!membership.rows[0]) {
        const error = new Error('No active workspace membership') as Error & { statusCode?: number };
        error.statusCode = 403; throw error;
      }
      request.auth = { userId, workspaceId, role: membership.rows[0].role };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally { client.release(); }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}
