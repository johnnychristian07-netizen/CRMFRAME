import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenantTx } from '../../lib/db.js';
import { requirePermission, visibleUserIds, requireAssignableUser, requireOwnedRecord } from '../../lib/permissions.js';
import { addActivity, audit, outbox } from '../../lib/domain.js';

const createSchema=z.object({
  companyId:z.string().uuid().optional(),pipelineId:z.string().uuid(),pipelineStageId:z.string().uuid(),name:z.string().min(1),description:z.string().optional(),
  ownerUserId:z.string().uuid().optional(),amount:z.number().nonnegative().default(0),currency:z.string().length(3).default('BRL'),expectedCloseDate:z.string().date().optional(),
  source:z.string().optional(),contactIds:z.array(z.string().uuid()).default([]),customFields:z.record(z.unknown()).default({})
});
const moveSchema=z.object({stageId:z.string().uuid(),lostReasonId:z.string().uuid().optional()});

export async function opportunityRoutes(app:FastifyInstance){
  app.addHook('onRequest',app.authenticate);
  app.get('/',async request=>{requirePermission(request.auth,'opportunity.read');return withTenantTx(request.auth,async client=>{
    const users=await visibleUserIds(client,request.auth);const params:unknown[]=[request.auth.workspaceId];let scope='';
    if(users){params.push(users);scope=` AND o.owner_user_id=ANY($2::uuid[])`;}
    const r=await client.query(`SELECT o.*,ps.name AS stage_name,ps.stage_type,p.name AS pipeline_name,c.name AS company_name
      FROM opportunities o JOIN pipeline_stages ps ON ps.id=o.pipeline_stage_id JOIN pipelines p ON p.id=o.pipeline_id LEFT JOIN companies c ON c.id=o.company_id
      WHERE o.workspace_id=$1 AND o.deleted_at IS NULL${scope} ORDER BY o.updated_at DESC LIMIT 100`,params);return {data:r.rows};
  });});

  app.post('/',async(request,reply)=>{requirePermission(request.auth,'opportunity.create');const body=createSchema.parse(request.body);return withTenantTx(request.auth,async client=>{
    const owner=body.ownerUserId??request.auth.userId; await requireAssignableUser(client,request.auth,owner);
    const stage=(await client.query(`SELECT * FROM pipeline_stages WHERE workspace_id=$1 AND id=$2 AND pipeline_id=$3 AND is_active=true`,[request.auth.workspaceId,body.pipelineStageId,body.pipelineId])).rows[0];
    if(!stage){reply.code(422);return{error:'Stage does not belong to pipeline'};}
    const r=await client.query(`INSERT INTO opportunities(workspace_id,company_id,pipeline_id,pipeline_stage_id,name,description,owner_user_id,amount,currency,expected_close_date,closed_at,source,custom_fields,created_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,[request.auth.workspaceId,body.companyId??null,body.pipelineId,body.pipelineStageId,body.name,body.description??null,owner,body.amount,body.currency.toUpperCase(),body.expectedCloseDate??null,stage.stage_type==='OPEN'?null:new Date(),body.source??null,JSON.stringify(body.customFields),request.auth.userId]);
    const opp=r.rows[0];
    for(const [i,contactId] of body.contactIds.entries()) await client.query(`INSERT INTO opportunity_contacts(workspace_id,opportunity_id,contact_id,is_primary) VALUES($1,$2,$3,$4)`,[request.auth.workspaceId,opp.id,contactId,i===0]);
    await addActivity(client,request.auth,{type:'OPPORTUNITY_CREATED',title:`Oportunidade criada: ${opp.name}`,companyId:opp.company_id,opportunityId:opp.id,metadata:{stageId:opp.pipeline_stage_id,amount:opp.amount}});
    await audit(client,request.auth,{action:'opportunity.created',entityType:'opportunity',entityId:opp.id,after:opp,requestId:request.id});
    await outbox(client,request.auth,{aggregateType:'opportunity',aggregateId:opp.id,eventType:'OpportunityCreated',payload:{opportunityId:opp.id,stageId:opp.pipeline_stage_id,ownerUserId:opp.owner_user_id}});
    reply.code(201);return opp;
  });});

  app.post('/:id/move-stage',async(request,reply)=>{requirePermission(request.auth,'opportunity.update');const id=z.string().uuid().parse((request.params as any).id);const body=moveSchema.parse(request.body);return withTenantTx(request.auth,async client=>{
    await requireOwnedRecord(client,request.auth,'opportunities',id);
    const before=(await client.query(`SELECT o.*,ps.name old_stage_name,ps.stage_type old_stage_type FROM opportunities o JOIN pipeline_stages ps ON ps.id=o.pipeline_stage_id WHERE o.workspace_id=$1 AND o.id=$2 AND o.deleted_at IS NULL FOR UPDATE`,[request.auth.workspaceId,id])).rows[0];
    const stage=(await client.query(`SELECT * FROM pipeline_stages WHERE workspace_id=$1 AND id=$2 AND pipeline_id=$3 AND is_active=true`,[request.auth.workspaceId,body.stageId,before.pipeline_id])).rows[0];
    if(!stage){reply.code(422);return{error:'Stage does not belong to opportunity pipeline'};}
    if(stage.stage_type==='LOST'&&!body.lostReasonId){reply.code(422);return{error:'lostReasonId is required for a lost opportunity'};}
    const result=await client.query(`UPDATE opportunities SET pipeline_stage_id=$3,lost_reason_id=$4,closed_at=CASE WHEN $5='OPEN' THEN NULL ELSE now() END WHERE workspace_id=$1 AND id=$2 RETURNING *`,[request.auth.workspaceId,id,body.stageId,stage.stage_type==='LOST'?body.lostReasonId:null,stage.stage_type]);
    const after=result.rows[0];const activityType=stage.stage_type==='WON'?'OPPORTUNITY_WON':stage.stage_type==='LOST'?'OPPORTUNITY_LOST':'OPPORTUNITY_STAGE_CHANGED';
    await addActivity(client,request.auth,{type:activityType,title:`Oportunidade movida: ${before.old_stage_name} → ${stage.name}`,companyId:after.company_id,opportunityId:id,metadata:{fromStageId:before.pipeline_stage_id,toStageId:stage.id,stageType:stage.stage_type}});
    await audit(client,request.auth,{action:'opportunity.stage_changed',entityType:'opportunity',entityId:id,before,after,requestId:request.id});
    await outbox(client,request.auth,{aggregateType:'opportunity',aggregateId:id,eventType:'OpportunityStageChanged',payload:{opportunityId:id,fromStageId:before.pipeline_stage_id,toStageId:stage.id,stageType:stage.stage_type,ownerUserId:after.owner_user_id}});
    return after;
  });});
}
