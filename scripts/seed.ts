import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/crm' });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const user = await client.query(`
    INSERT INTO users(email,name) VALUES ('owner@demo.local','Owner Demo')
    ON CONFLICT(email) DO UPDATE SET name=excluded.name
    RETURNING id,email,name
  `);
  const workspace = await client.query(`
    INSERT INTO workspaces(name,slug) VALUES ('CRM Demo','crm-demo')
    ON CONFLICT(slug) DO UPDATE SET name=excluded.name
    RETURNING id,name,slug
  `);
  const userId = user.rows[0].id;
  const workspaceId = workspace.rows[0].id;
  await client.query(`SELECT set_config('app.user_id', $1, true)`, [userId]);
  await client.query(`SELECT set_config('app.workspace_id', $1, true)`, [workspaceId]);
  await client.query(`
    INSERT INTO workspace_memberships(workspace_id,user_id,role)
    VALUES ($1,$2,'OWNER') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='OWNER',status='ACTIVE'
  `,[workspaceId,userId]);
  const pipeline = await client.query(`
    INSERT INTO pipelines(workspace_id,name,description,is_default)
    VALUES ($1,'Vendas','Pipeline comercial principal',true)
    ON CONFLICT(workspace_id,name) DO UPDATE SET is_default=true
    RETURNING id
  `,[workspaceId]);
  const pipelineId = pipeline.rows[0].id;
  const stages = [
    ['Lead',0,'OPEN',10],['Qualificação',1,'OPEN',25],['Diagnóstico',2,'OPEN',40],
    ['Proposta',3,'OPEN',60],['Negociação',4,'OPEN',80],['Fechado ganho',5,'WON',100],['Fechado perdido',6,'LOST',0]
  ];
  for (const [name,position,type,probability] of stages) {
    await client.query(`
      INSERT INTO pipeline_stages(workspace_id,pipeline_id,name,position,stage_type,probability)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(pipeline_id,position) DO NOTHING
    `,[workspaceId,pipelineId,name,position,type,probability]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ user: user.rows[0], workspace: workspace.rows[0], pipelineId }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
