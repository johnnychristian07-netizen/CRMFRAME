import type { PoolClient } from 'pg';
import type { AuthContext } from './db.js';

export async function addActivity(client: PoolClient, ctx: AuthContext, input: {
  type: string; title: string; body?: string | null; companyId?: string | null; contactId?: string | null;
  opportunityId?: string | null; taskId?: string | null; metadata?: unknown;
}) {
  await client.query(`
    INSERT INTO activities(workspace_id,type,actor_user_id,company_id,contact_id,opportunity_id,task_id,title,body,metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
  `, [ctx.workspaceId,input.type,ctx.userId,input.companyId ?? null,input.contactId ?? null,input.opportunityId ?? null,input.taskId ?? null,input.title,input.body ?? null,JSON.stringify(input.metadata ?? {})]);
}

export async function audit(client: PoolClient, ctx: AuthContext, input: {
  action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown; requestId?: string;
}) {
  await client.query(`
    INSERT INTO audit_logs(workspace_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
  `, [ctx.workspaceId,ctx.userId,input.action,input.entityType,input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before), input.after === undefined ? null : JSON.stringify(input.after), input.requestId ?? null]);
}

export async function outbox(client: PoolClient, ctx: AuthContext, input: {
  aggregateType: string; aggregateId: string; eventType: string; payload: unknown;
}) {
  await client.query(`
    INSERT INTO outbox_events(workspace_id,aggregate_type,aggregate_id,event_type,payload)
    VALUES ($1,$2,$3,$4,$5::jsonb)
  `,[ctx.workspaceId,input.aggregateType,input.aggregateId,input.eventType,JSON.stringify(input.payload)]);
}

export function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export function normalizeEmail(value?: string | null): string | null { return value?.trim().toLowerCase() || null; }
export function normalizeDomain(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0] || null;
}
