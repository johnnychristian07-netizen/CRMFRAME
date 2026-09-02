import { pool } from './lib/db.js';

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
console.log('Outbox worker started');
while(true){
  const workspaces=await pool.query<{id:string}>('SELECT id FROM workspaces WHERE deleted_at IS NULL AND status=\'ACTIVE\'');
  for(const {id:workspaceId} of workspaces.rows){
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.workspace_id',$1,true)`,[workspaceId]);
      const events=await client.query(`SELECT * FROM outbox_events WHERE workspace_id=$1 AND published_at IS NULL ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 50`,[workspaceId]);
      for(const event of events.rows){
        try{
          // Delivery seam: plug in automation execution, webhooks, queues or analytics here.
          const rules=await client.query(`SELECT id,name,actions FROM automation_rules WHERE workspace_id=$1 AND status='ACTIVE' AND trigger_event=$2 AND deleted_at IS NULL`,[workspaceId,event.event_type]);
          for(const rule of rules.rows){
            await client.query(`INSERT INTO automation_runs(workspace_id,automation_rule_id,event_id,status,input,output,finished_at) VALUES($1,$2,$3,'DISPATCHED',$4::jsonb,$5::jsonb,now())`,[workspaceId,rule.id,event.id,JSON.stringify(event.payload),JSON.stringify({actions:rule.actions})]);
          }
          await client.query(`UPDATE outbox_events SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1`,[event.id]);
        }catch(error){
          await client.query(`UPDATE outbox_events SET attempts=attempts+1,last_error=$2 WHERE id=$1`,[event.id,error instanceof Error?error.message:String(error)]);
        }
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);console.error(error);}finally{client.release();}
  }
  await sleep(2000);
}
