import { readFile, readdir, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import type { Pool } from 'pg';

export interface InstallClient { query(sql:string, values?:any[]):Promise<{rows:any[];rowCount?:number|null}> }
export const installInput = z.object({
  databaseUrl:z.string().min(10).max(4000).refine(value=>{try{const u=new URL(value);return ['postgres:','postgresql:'].includes(u.protocol)&&!!u.hostname&&!u.hash&&!u.hostname.includes('-pooler.')}catch{return false}},'Gunakan URL PostgreSQL langsung, bukan pooler.'),
  email:z.string().trim().email().max(200).transform(v=>v.toLowerCase()),
  password:z.string().min(12).max(200),
  confirmPassword:z.string(),
  acceptEmptyDatabase:z.literal(true),
}).strict().refine(v=>v.password===v.confirmPassword,{path:['confirmPassword'],message:'Konfirmasi password tidak sama.'});
export type InstallInput=z.infer<typeof installInput>;
const backendDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const installConfigPath=()=>resolve(process.env.INSTALL_CONFIG_PATH||'/var/lib/media-intelligence/runtime.json');
export async function assertEmptyDatabase(client:InstallClient){
  const {rows}=await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','f')");
  if(Number(rows[0]?.count)!==0)throw Error('DATABASE_NOT_EMPTY');
}
export async function initializeEmptyDatabase(client:InstallClient,input:InstallInput,instanceId:string){
  // Caller holds one transaction and advisory lock on this exact connection.
  await assertEmptyDatabase(client);
  await client.query(await readFile(resolve(backendDir,'install/schema.sql'),'utf8'));
  const references=JSON.parse(await readFile(resolve(backendDir,'install/reference.json'),'utf8')) as Record<string,Record<string,unknown>[]>;
  for(const [table,rows] of Object.entries(references)){
    if(!/^[a-z_]+$/.test(table))throw Error('INVALID_REFERENCE_TABLE');
    for(const row of rows||[]){
      const columns=Object.keys(row);if(!columns.every(c=>/^[a-z_]+$/.test(c)))throw Error('INVALID_REFERENCE_COLUMN');
      await client.query(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) OVERRIDING SYSTEM VALUE VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(c=>row[c]!==null&&typeof row[c]==='object'?JSON.stringify(row[c]):row[c]));
    }
  }
  // Import source-controlled prompt defaults only. No tenant prompts, users,
  // credentials, balances, media, or historical analyses are copied.
  for(const name of ['148_ai_humas_strakom_default.sql','149_ai_humas_content_studio_base.sql','151_ai_humas_publication_monitoring_defaults.sql','152_ai_humas_gap_narrative_default.sql','153_ai_humas_five_tasks_seed.sql']){
    const sql=await readFile(resolve(backendDir,'migrations',name),'utf8');
    await client.query(sql.replaceAll('Pemerintah Kota Batam','pemerintah daerah').replaceAll('Kota Batam','daerah'));
  }
  const organization=(await client.query("INSERT INTO organizations(name,code,active) VALUES('Pemerintah Daerah','PEMDA',true) RETURNING id")).rows[0];
  const master=JSON.parse(await readFile(resolve(backendDir,'install/master-data.json'),'utf8')) as Record<string,Record<string,unknown>[]>;
  for(const table of ['classification_sectors','taxonomy_categories','keyword_groups','opd','keywords','keyword_taxonomy','keyword_opd']){
    for(const source of master[table]||[]){
      const row:Record<string,unknown>={...source,...(['classification_sectors','taxonomy_categories','keyword_groups','opd','keywords'].includes(table)?{organization_id:organization.id}:{})};
      const columns=Object.keys(row);if(!columns.every(c=>/^[a-z_]+$/.test(c)))throw Error('INVALID_MASTER_COLUMN');
      await client.query(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) OVERRIDING SYSTEM VALUE VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(c=>row[c]));
    }
  }
  await client.query("INSERT INTO government_branding(government_name,short_name,is_active) VALUES('Pemerintah Daerah','Pemda',true)");
  await client.query("INSERT INTO collection_scheduler_config(id,enabled,online_enabled,owned_enabled,social_enabled) VALUES(1,false,false,false,false)");
  await client.query("INSERT INTO executive_brief_schedule_settings(id,enabled,hour_wib,minute_wib) VALUES(1,false,9,30)");
  await client.query("INSERT INTO notification_channels(code,name,status) VALUES('EMAIL','Email','INACTIVE'),('TELEGRAM','Telegram','INACTIVE'),('WHATSAPP','WhatsApp','INACTIVE')");
  await client.query('UPDATE ai_providers SET enabled=false');
  const passwordHash=await argon2.hash(input.password,{type:argon2.argon2id});
  const {rows}=await client.query("INSERT INTO users(email,password_hash,role,active) VALUES($1,$2,'admin',true) RETURNING id",[input.email,passwordHash]);
  await client.query("INSERT INTO user_roles(user_id,role_id) SELECT $1,id FROM roles WHERE code='super_admin'",[rows[0].id]);
  await client.query("CREATE TABLE app_installation (id boolean PRIMARY KEY DEFAULT true CHECK(id), instance_id text NOT NULL, installed_at timestamptz NOT NULL DEFAULT now())");
  await client.query('INSERT INTO app_installation(instance_id) VALUES($1)',[instanceId]);
  await client.query("INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'VPS_INSTALLED',$2::jsonb)",[rows[0].id,JSON.stringify({identitySource:'DATA_WILAYAH',schedulerEnabled:false})]);
  // Snapshot has the complete schema through this explicit manifest. Future
  // upgrades apply only later migrations; never replay historical constraints.
  const baseline=JSON.parse(await readFile(resolve(backendDir,'install/migrations.json'),'utf8')) as string[];
  for(const version of baseline)await client.query('INSERT INTO schema_migrations(version) VALUES($1)',[version]);
  // Keep serial/identity generators ahead of seeded reference IDs.
  await client.query(`DO $reset$ DECLARE r record; seq text; v bigint; BEGIN FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_default LIKE 'nextval(%' OR is_identity='YES') LOOP seq:=pg_get_serial_sequence(format('%I.%I','public',r.table_name),r.column_name); IF seq IS NOT NULL THEN EXECUTE format('SELECT max(%I) FROM public.%I',r.column_name,r.table_name) INTO v; PERFORM setval(seq,COALESCE(v,1),v IS NOT NULL); END IF; END LOOP; END $reset$;`);
}
export async function loadVpsConfig(){
  const path=installConfigPath();
  let config:any;
  try{config=JSON.parse(await readFile(path,'utf8'))}catch(e:any){if(e.code!=='ENOENT')throw Error('VPS_CONFIG_INVALID')}
  if(!config){
    // Recover a crash between DB COMMIT and atomic config rename. The nonce is
    // generated locally and written before the transaction, never supplied by UI.
    try{
      const pending=JSON.parse(await readFile(path+'.pending','utf8'));
      const {Pool}=await import('pg');const pool=new Pool({connectionString:pending.databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
      try{const row=(await pool.query('SELECT instance_id FROM app_installation WHERE id=true')).rows[0];if(row?.instance_id===pending.instanceId){await rename(path+'.pending',path);config=pending;}}finally{await pool.end()}
    }catch{}
  }
  if(config){
    if(config.version!==1||!config.databaseUrl||!config.instanceId)throw Error('VPS_CONFIG_INVALID');
    process.env.DATABASE_URL=config.databaseUrl;
    process.env.INSTALL_ENABLED='false';
    return true;
  }
  return false;
}
export async function completeInstall(pool:Pool,input:InstallInput,path=installConfigPath()){
  const client=await pool.connect(),instanceId=randomUUID();let committed=false,pendingWritten=false;
  try{
    await client.query('BEGIN');
    const lock=await client.query('SELECT pg_try_advisory_xact_lock(674102026) AS locked');
    if(!lock.rows[0]?.locked)throw Error('INSTALL_BUSY');
    await assertEmptyDatabase(client);
    await mkdir(dirname(path),{recursive:true,mode:0o700});
    await writeFile(path+'.pending',JSON.stringify({version:1,databaseUrl:input.databaseUrl,instanceId})+'\n',{mode:0o600,flag:'wx'});
    pendingWritten=true;
    await initializeEmptyDatabase(client,input,instanceId);
    await client.query('COMMIT');committed=true;
    await rename(path+'.pending',path);
  }catch(error){
    if(!committed){await client.query('ROLLBACK').catch(()=>undefined);if(pendingWritten)await unlink(path+'.pending').catch(()=>undefined)}
    throw error;
  }finally{client.release()}
}
