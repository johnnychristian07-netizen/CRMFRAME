import type { FastifyInstance } from 'fastify';
import { pool } from '../../lib/db.js';
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });
}
