import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('postgres://crm:crm@localhost:5432/crm'),
  JWT_SECRET: z.string().min(16).default('development-secret-change-me'),
  CORS_ORIGIN: z.string().default('http://localhost:5173')
});

export const config = envSchema.parse(process.env);
