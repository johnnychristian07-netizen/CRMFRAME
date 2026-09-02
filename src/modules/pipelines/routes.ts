import type { FastifyInstance } from 'fastify';
import { withTenantTx } from '../../lib/db.js';
import { requirePermission } from '../../lib/permissions.js';
export async function pipelineRoutes(app:FastifyInstance){
  app.addHook('onRequest',app.authenticate);
  app.get('/',async request=>{requirePermission(request.auth,'pipeline.read');return withTenantTx(request.auth,async client=>{
    const p=await client.query(`SELECT * FROM pipelines WHERE workspace_id=$1 AND deleted_at IS NULL ORDER BY is_default DESC,name`,[request.auth.workspaceId]);
    const s=await client.query(`SELECT * FROM pipeline_stages WHERE workspace_id=$1 AND is_active=true ORDER BY pipeline_id,position`,[request.auth.workspaceId]);
    return {data:p.rows.map(x=>({...x,stages:s.rows.filter(y=>y.pipeline_id===x.id)}))};
  });});
}
