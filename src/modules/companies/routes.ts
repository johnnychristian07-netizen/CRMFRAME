import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenantTx } from '../../lib/db.js';
import { requirePermission, visibleUserIds, requireAssignableUser, requireOwnedRecord } from '../../lib/permissions.js';
import { addActivity, audit, normalizeDomain, normalizeText } from '../../lib/domain.js';

const createSchema = z.object({
  name: z.string().min(1), legalName: z.string().optional(), domain: z.string().optional(), website: z.string().optional(),
  industry: z.string().optional(), employeeCount: z.number().int().nonnegative().optional(), annualRevenue: z.number().nonnegative().optional(),
  phone: z.string().optional(), email: z.string().email().optional(), ownerUserId: z.string().uuid().optional(),
  lifecycleStage: z.string().optional(), customFields: z.record(z.unknown()).default({})
});
const patchSchema = createSchema.partial();

export async function companyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request) => {
    requirePermission(request.auth, 'company.read');
    const q = z.string().optional().parse((request.query as any)?.q);
    const limit = Math.min(Number((request.query as any)?.limit ?? 50), 100);
    const offset = Math.max(Number((request.query as any)?.offset ?? 0), 0);
    return withTenantTx(request.auth, async client => {
      const users = await visibleUserIds(client, request.auth);
      const params: unknown[] = [request.auth.workspaceId];
      const where = [`workspace_id=$1`, `deleted_at IS NULL`];
      if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(name) LIKE $${params.length} OR lower(coalesce(domain,'')) LIKE $${params.length})`); }
      if (users) { params.push(users); where.push(`owner_user_id = ANY($${params.length}::uuid[])`); }
      params.push(limit, offset);
      const rows = await client.query(`SELECT * FROM companies WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
      return { data: rows.rows, limit, offset };
    });
  });

  app.post('/', async (request, reply) => {
    requirePermission(request.auth, 'company.create');
    const body = createSchema.parse(request.body);
    return withTenantTx(request.auth, async client => {
      const owner = body.ownerUserId ?? request.auth.userId;
      await requireAssignableUser(client, request.auth, owner);
      const result = await client.query(`
        INSERT INTO companies(workspace_id,name,legal_name,normalized_name,domain,normalized_domain,website,industry,employee_count,annual_revenue,phone,email,owner_user_id,lifecycle_stage,custom_fields,created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16) RETURNING *
      `,[request.auth.workspaceId,body.name,body.legalName ?? null,normalizeText(body.name),body.domain ?? null,normalizeDomain(body.domain),body.website ?? null,body.industry ?? null,body.employeeCount ?? null,body.annualRevenue ?? null,body.phone ?? null,body.email ?? null,owner,body.lifecycleStage ?? null,JSON.stringify(body.customFields),request.auth.userId]);
      const company = result.rows[0];
      await addActivity(client, request.auth, { type:'COMPANY_CREATED', title:`Empresa criada: ${company.name}`, companyId:company.id });
      await audit(client, request.auth, { action:'company.created', entityType:'company', entityId:company.id, after:company, requestId:request.id });
      reply.code(201); return company;
    });
  });

  app.get('/:id', async (request, reply) => {
    requirePermission(request.auth, 'company.read');
    const id = z.string().uuid().parse((request.params as any).id);
    return withTenantTx(request.auth, async client => {
      const users = await visibleUserIds(client, request.auth);
      const params: unknown[] = [request.auth.workspaceId,id];
      let scope=''; if (users) { params.push(users); scope=` AND owner_user_id=ANY($3::uuid[])`; }
      const result = await client.query(`SELECT * FROM companies WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL${scope}`,params);
      if (!result.rows[0]) { reply.code(404); return { error:'Company not found' }; }
      return result.rows[0];
    });
  });

  app.patch('/:id', async (request, reply) => {
    requirePermission(request.auth, 'company.update');
    const id = z.string().uuid().parse((request.params as any).id); const body = patchSchema.parse(request.body);
    return withTenantTx(request.auth, async client => {
      const before = await requireOwnedRecord(client, request.auth, 'companies', id);
      const next = { ...before,
        name: body.name ?? before.name, legal_name: body.legalName ?? before.legal_name, domain: body.domain ?? before.domain,
        website: body.website ?? before.website, industry: body.industry ?? before.industry, employee_count: body.employeeCount ?? before.employee_count,
        annual_revenue: body.annualRevenue ?? before.annual_revenue, phone: body.phone ?? before.phone, email: body.email ?? before.email,
        owner_user_id: body.ownerUserId ?? before.owner_user_id, lifecycle_stage: body.lifecycleStage ?? before.lifecycle_stage,
        custom_fields: body.customFields ?? before.custom_fields
      };
      await requireAssignableUser(client, request.auth, next.owner_user_id);
      const result = await client.query(`UPDATE companies SET name=$3,legal_name=$4,normalized_name=$5,domain=$6,normalized_domain=$7,website=$8,industry=$9,employee_count=$10,annual_revenue=$11,phone=$12,email=$13,owner_user_id=$14,lifecycle_stage=$15,custom_fields=$16::jsonb WHERE workspace_id=$1 AND id=$2 RETURNING *`,
        [request.auth.workspaceId,id,next.name,next.legal_name,normalizeText(next.name),next.domain,normalizeDomain(next.domain),next.website,next.industry,next.employee_count,next.annual_revenue,next.phone,next.email,next.owner_user_id,next.lifecycle_stage,JSON.stringify(next.custom_fields)]);
      await audit(client, request.auth, { action:'company.updated',entityType:'company',entityId:id,before,after:result.rows[0],requestId:request.id });
      return result.rows[0];
    });
  });

  app.delete('/:id', async (request, reply) => {
    requirePermission(request.auth, 'company.delete');
    const id = z.string().uuid().parse((request.params as any).id);
    return withTenantTx(request.auth, async client => {
      const before = await requireOwnedRecord(client, request.auth, 'companies', id);
      await client.query(`UPDATE companies SET deleted_at=now() WHERE workspace_id=$1 AND id=$2`,[request.auth.workspaceId,id]);
      await audit(client, request.auth, { action:'company.deleted',entityType:'company',entityId:id,before,requestId:request.id });
      reply.code(204); return;
    });
  });
}
