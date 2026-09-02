import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../lib/db.js';
import { config } from '../config.js';
export async function devAuthRoutes(app:FastifyInstance){
  if(config.NODE_ENV==='production')return;
  app.post('/dev-token',async(request,reply)=>{const body=z.object({email:z.string().email().default('owner@demo.local'),workspaceSlug:z.string().default('crm-demo')}).parse(request.body??{});const client=await pool.connect();try{await client.query('BEGIN');const user=(await client.query(`SELECT id,email,name FROM users WHERE email=$1 AND status='ACTIVE'`,[body.email])).rows[0];if(!user){reply.code(404);return{error:'Run npm run seed first'};}await client.query(`SELECT set_config('app.user_id',$1,true)`,[user.id]);const workspace=(await client.query(`SELECT id,name,slug FROM workspaces WHERE slug=$1 AND deleted_at IS NULL`,[body.workspaceSlug])).rows[0];if(!workspace){reply.code(404);return{error:'Workspace not found'};}await client.query(`SELECT set_config('app.workspace_id',$1,true)`,[workspace.id]);const membership=(await client.query(`SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND status='ACTIVE'`,[workspace.id,user.id])).rows[0];if(!membership){reply.code(403);return{error:'No active membership'};}await client.query('COMMIT');return{token:app.jwt.sign({sub:user.id,workspaceId:workspace.id}),user,workspace,role:membership.role};}catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}finally{client.release();}});
}
