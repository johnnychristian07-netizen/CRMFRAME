import type { PoolClient } from 'pg';
import type { AuthContext } from './db.js';

export type Permission =
  | 'company.create'|'company.read'|'company.update'|'company.delete'
  | 'contact.create'|'contact.read'|'contact.update'|'contact.delete'
  | 'opportunity.create'|'opportunity.read'|'opportunity.update'|'opportunity.delete'
  | 'task.create'|'task.read'|'task.update'|'task.delete'
  | 'pipeline.read'|'pipeline.manage'|'activity.read'|'workspace.manage'|'members.manage';

type Role = AuthContext['role'];
const all: Permission[] = [
  'company.create','company.read','company.update','company.delete',
  'contact.create','contact.read','contact.update','contact.delete',
  'opportunity.create','opportunity.read','opportunity.update','opportunity.delete',
  'task.create','task.read','task.update','task.delete',
  'pipeline.read','pipeline.manage','activity.read','workspace.manage','members.manage'
];

const permissions: Record<Role, Set<Permission>> = {
  OWNER: new Set(all),
  ADMIN: new Set(all),
  MANAGER: new Set(all.filter(p => !['workspace.manage','members.manage'].includes(p))),
  MEMBER: new Set([
    'company.create','company.read','company.update',
    'contact.create','contact.read','contact.update',
    'opportunity.create','opportunity.read','opportunity.update',
    'task.create','task.read','task.update','pipeline.read','activity.read'
  ]),
  VIEWER: new Set(['company.read','contact.read','opportunity.read','task.read','pipeline.read','activity.read'])
};

export function requirePermission(ctx: AuthContext, permission: Permission): void {
  if (!permissions[ctx.role].has(permission)) {
    const error = new Error(`Missing permission: ${permission}`) as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }
}

export type DataScope = 'ALL'|'TEAM'|'OWN';
export function dataScope(role: Role): DataScope {
  if (role === 'OWNER' || role === 'ADMIN' || role === 'VIEWER') return 'ALL';
  if (role === 'MANAGER') return 'TEAM';
  return 'OWN';
}

export async function visibleUserIds(client: PoolClient, ctx: AuthContext): Promise<string[] | null> {
  const scope = dataScope(ctx.role);
  if (scope === 'ALL') return null;
  if (scope === 'OWN') return [ctx.userId];

  const result = await client.query<{ user_id: string }>(`
    WITH my_membership AS (
      SELECT id FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND status='ACTIVE'
    ), my_teams AS (
      SELECT team_id FROM team_members WHERE workspace_id=$1 AND membership_id IN (SELECT id FROM my_membership)
    )
    SELECT DISTINCT wm.user_id
    FROM team_members tm
    JOIN workspace_memberships wm ON wm.id=tm.membership_id
    WHERE tm.workspace_id=$1 AND tm.team_id IN (SELECT team_id FROM my_teams) AND wm.status='ACTIVE'
    UNION SELECT $2::uuid
  `, [ctx.workspaceId, ctx.userId]);
  return result.rows.map(r => r.user_id);
}

export async function requireAssignableUser(client: PoolClient, ctx: AuthContext, userId: string): Promise<void> {
  const active = await client.query(`SELECT 1 FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 AND status='ACTIVE'`, [ctx.workspaceId, userId]);
  if (!active.rows[0]) {
    const error = new Error('Assigned/owner user is not an active member of this workspace') as Error & { statusCode?: number };
    error.statusCode = 422; throw error;
  }
  const visible = await visibleUserIds(client, ctx);
  if (visible && !visible.includes(userId)) {
    const error = new Error('You cannot assign records outside your data scope') as Error & { statusCode?: number };
    error.statusCode = 403; throw error;
  }
}

export async function requireOwnedRecord(client: PoolClient, ctx: AuthContext, table: 'companies'|'contacts'|'opportunities'|'tasks', id: string): Promise<any> {
  const ownerColumn = table === 'tasks' ? 'assigned_to_user_id' : 'owner_user_id';
  const result = await client.query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL`, [ctx.workspaceId, id]);
  const record = result.rows[0];
  if (!record) {
    const error = new Error('Record not found') as Error & { statusCode?: number };
    error.statusCode = 404; throw error;
  }
  const visible = await visibleUserIds(client, ctx);
  if (visible && !visible.includes(record[ownerColumn])) {
    const error = new Error('Record is outside your data scope') as Error & { statusCode?: number };
    error.statusCode = 403; throw error;
  }
  return record;
}
