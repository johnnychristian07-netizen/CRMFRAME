import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenantTx } from '../../lib/db.js';
import { requirePermission, visibleUserIds, requireAssignableUser } from '../../lib/permissions.js';
import { addActivity, audit, normalizeEmail } from '../../lib/domain.js';

const schema = z.object({
  companyId:z.string().uuid().optional(), firstName:z.string().min(1), lastName:z.string().optional(), email:z.string().email().optional(),
  phone:z.string().optional(), mobile:z.string().optional(), jobTitle:z.string().optional(), linkedinUrl:z.string().url().optional(),
  ownerUserId:z.string().uuid().optional(), customFields:z.record(z.unknown()).default({})
});

export async function contactRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);
  app.get('/', async request => {
    requirePermission(request.auth,'contact.read');
    return withTenantTx(request.auth, async client => {
      const users=await visibleUserIds(client,request.auth); const params:unknown[]=[request.auth.workspaceId];
      let scope=''; if(users){params.push(users);scope=` AND owner_user_id=ANY($2::uuid[])`;}
      const r=await client.query(`SELECT * FROM contacts WHERE workspace_id=$1 AND deleted_at IS NULL${scope} ORDER BY updated_at DESC LIMIT 100`,params);
      return {data:r.rows};
    });
  });
  app.post('/', async (request,reply)=>{
    requirePermission(request.auth,'contact.create'); const body=schema.parse(request.body);
    return withTenantTx(request.auth, async client=>{
      const owner=body.ownerUserId??request.auth.userId; await requireAssignableUser(client,request.auth,owner);
      const fullName=[body.firstName,body.lastName].filter(Boolean).join(' ');
      const r=await client.query(`INSERT INTO contacts(workspace_id,company_id,first_name,last_name,full_name,email,normalized_email,phone,mobile,job_title,linkedin_url,owner_user_id,custom_fields,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,[request.auth.workspaceId,body.companyId??null,body.firstName,body.lastName??null,fullName,body.email??null,normalizeEmail(body.email),body.phone??null,body.mobile??null,body.jobTitle??null,body.linkedinUrl??null,owner,JSON.stringify(body.customFields),request.auth.userId]);
      const contact=r.rows[0]; await addActivity(client,request.auth,{type:'CONTACT_CREATED',title:`Contato criado: ${contact.full_name}`,companyId:contact.company_id,contactId:contact.id});
      await audit(client,request.auth,{action:'contact.created',entityType:'contact',entityId:contact.id,after:contact,requestId:request.id}); reply.code(201);return contact;
    });
  });
}
