import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenantTx } from '../../lib/db.js';
import { requirePermission } from '../../lib/permissions.js';
import { addActivity, audit } from '../../lib/domain.js';
const noteSchema=z.object({title:z.string().min(1),body:z.string().optional(),companyId:z.string().uuid().optional(),contactId:z.string().uuid().optional(),opportunityId:z.string().uuid().optional()});
export async function activityRoutes(app:FastifyInstance){app.addHook('onRequest',app.authenticate);
  app.get('/',async request=>{requirePermission(request.auth,'activity.read');const q=request.query as any;return withTenantTx(request.auth,async client=>{const params:unknown[]=[request.auth.workspaceId];const where=['workspace_id=$1'];for(const [key,col] of [['companyId','company_id'],['contactId','contact_id'],['opportunityId','opportunity_id'],['taskId','task_id']] as const){if(q?.[key]){params.push(z.string().uuid().parse(q[key]));where.push(`${col}=$${params.length}`);}}const r=await client.query(`SELECT * FROM activities WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC LIMIT 200`,params);return{data:r.rows};});});
  app.post('/notes',async(request,reply)=>{const b=noteSchema.parse(request.body);requirePermission(request.auth,'company.update');return withTenantTx(request.auth,async client=>{await addActivity(client,request.auth,{type:'NOTE',title:b.title,body:b.body,companyId:b.companyId,contactId:b.contactId,opportunityId:b.opportunityId});await audit(client,request.auth,{action:'activity.note_created',entityType:'activity',after:b,requestId:request.id});reply.code(201);return{ok:true};});});
}
