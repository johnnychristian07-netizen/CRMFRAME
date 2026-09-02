import '@fastify/jwt';
import type { AuthContext } from './lib/db.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; workspaceId: string };
    user: { sub: string; workspaceId: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}
