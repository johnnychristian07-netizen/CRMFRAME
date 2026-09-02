import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm' });
const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await readFile(path.join(here, '..', 'migrations', '001_initial.sql'), 'utf8');
try {
  await pool.query(sql);
  console.log('Migration 001_initial.sql applied.');
} finally {
  await pool.end();
}
