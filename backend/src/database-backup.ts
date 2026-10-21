import type {FastifyInstance} from 'fastify';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';

// A deliberate allowlist: never expose users, sessions, credentials, tokens, or audit logs.
export const BACKUP_GROUPS={
 master:{label:'Master & wilayah',tables:['organizations','opd','uptd','districts','villages','keywords','keyword_opd','keyword_district','classification_sectors','taxonomy_categories','government_branding','media_sources']},
 media:{label:'Pemantauan media',tables:['articles','article_entities','article_alerts','print_articles','print_article_pages','print_article_keywords','social_mentions','social_post_metrics']},
 issues:{label:'Isu & klarifikasi',tables:['issues','issue_articles','issue_print_articles','issue_opd','issue_districts','issue_workflows','issue_workflow_supporting_opd','issue_workflow_contributors','issue_response_submissions','issue_contributor_submissions','issue_workflow_events','issue_communication_gap_snapshots']},
 communication:{label:'Strategi & publikasi',tables:['communication_strategies','communication_strategy_districts','issue_publication_evidence','issue_publication_analysis_snapshots','issue_monitoring_analysis_snapshots','issue_monitors','issue_monitor_terms','issue_monitor_sources']},
} as const;
type Group=keyof typeof BACKUP_GROUPS;
const keys=Object.keys(BACKUP_GROUPS) as Group[];
const schema=z.object({groups:z.array(z.enum(keys as [Group,...Group[]])).min(1).max(keys.length),format:z.enum(['sql','json','csv','all'])}).strict();
const LIMIT_ROWS=5000;
// Leave headroom under the Vercel Function response cap; the VPS can serve larger files.
const LIMIT_BYTES=process.env.VERCEL==='1'?4*1024*1024:20*1024*1024;
const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const csvCell=(v:unknown)=>{
 if(v===null||v===undefined)return '';
 let s=typeof v==='object'?JSON.stringify(v):String(v);
 // CSV is often opened in a spreadsheet; preserve content in JSON/SQL and neutralize formulas here.
 if(/^[\s\u0000-\u001f]*[=+@\-]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
};
export class BackupLimitError extends Error{}
export class BackupSchemaError extends Error{}
const assertSize=(v:Buffer)=>{if(v.length>LIMIT_BYTES)throw new BackupLimitError('BACKUP_TOO_LARGE')};
type Snapshot={createdAt:string;groups:Group[];tables:Record<string,{columns:string[];rows:Record<string,unknown>[]}>;rowCounts:Record<string,number>;note:string};
async function snapshot(client:PoolClient,groups:Group[]):Promise<Snapshot>{
 const wanted=[...new Set(groups.flatMap(g=>BACKUP_GROUPS[g].tables))];
 const catalog=await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name=ANY($1::text[])`,[wanted]);
 const present=new Set(catalog.rows.map(r=>String(r.table_name)));
 const missing=wanted.filter(table=>!present.has(table));
 if(missing.length)throw new BackupSchemaError('BACKUP_SCHEMA_INCOMPLETE:'+missing.join(','));
 const tables:Snapshot['tables']={},rowCounts:Snapshot['rowCounts']={};
 let total=0;
 for(const table of wanted){
  const cols=await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_generated='NEVER' ORDER BY ordinal_position`,[table]);
  const columns=cols.rows.map(r=>String(r.column_name));
  if(!columns.length)continue;
  // Identifiers can only originate in the fixed allowlist or PostgreSQL's catalog.
  const result=await client.query(`SELECT row_to_json(t) AS row FROM public.${quote(table)} t LIMIT ${LIMIT_ROWS+1}`);
  if(result.rows.length>LIMIT_ROWS)throw new BackupLimitError('BACKUP_TOO_MANY_ROWS:'+table);
  total+=result.rows.length;
  if(total>LIMIT_ROWS)throw new BackupLimitError('BACKUP_TOO_MANY_ROWS:total');
  tables[table]={columns,rows:result.rows.map(r=>r.row)};rowCounts[table]=result.rows.length;
  assertSize(Buffer.from(JSON.stringify(tables)));
 }
 return{createdAt:new Date().toISOString(),groups,tables,rowCounts,note:'Ekspor data terpilih, bukan dump skema PostgreSQL atau backup berkas lampiran. SQL memerlukan skema dan dependensi yang sesuai untuk dipulihkan.'};
}
export function renderBackup(data:Snapshot,format:'sql'|'json'|'csv'|'all'):{body:Buffer;contentType:string;extension:string}{
 const json=()=>Buffer.from(JSON.stringify(data,null,2)+'\n');
 const sql=()=>Buffer.from(['-- Media Intelligence: ekspor data terpilih; jalankan pada skema yang sesuai setelah pemeriksaan FK dan sequence.',
  `-- Dibuat: ${data.createdAt}; tabel: ${Object.keys(data.tables).join(', ')}`,
  'BEGIN;',...Object.entries(data.tables).flatMap(([table,{columns,rows}])=>rows.map(row=>
   `INSERT INTO public.${quote(table)} (${columns.map(quote).join(', ')}) SELECT ${columns.map(quote).join(', ')} FROM jsonb_populate_record(NULL::public.${quote(table)}, ${literal(JSON.stringify(row))}::jsonb);`)),
  'COMMIT;',''].join('\n'));
 const csvFiles=()=>Object.entries(data.tables).map(([table,{columns,rows}])=>({name:`csv/${table}.csv`,data:Buffer.from('\ufeff'+columns.map(csvCell).join(',')+'\r\n'+rows.map(row=>columns.map(c=>csvCell(row[c])).join(',')+'\r\n').join(''))}));
 if(format==='sql')return{body:sql(),contentType:'application/sql; charset=utf-8',extension:'sql'};
 if(format==='json')return{body:json(),contentType:'application/json; charset=utf-8',extension:'json'};
 const files=format==='all'?[{name:'backup.sql',data:sql()},{name:'backup.json',data:json()},...csvFiles()]:[
  {name:'manifest.json',data:Buffer.from(JSON.stringify({createdAt:data.createdAt,rowCounts:data.rowCounts,note:data.note},null,2))},...csvFiles()];
 const body=zip(files);assertSize(body);
 return{body,contentType:'application/zip',extension:'zip'};
}
function crc32(buffer:Buffer){let crc=-1;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^-1)>>>0}
// ZIP store method needs no dependency and is readable by standard unzip utilities.
export function zip(files:{name:string;data:Buffer}[]){const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;
 for(const {name,data} of files){const n=Buffer.from(name),crc=crc32(data);assertSize(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  chunks.push(local,n,data);const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(0x800,8);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(n.length,28);dir.writeUInt32LE(offset,42);central.push(dir,n);offset+=local.length+n.length+data.length;
 }
 const centralSize=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,...central,end]);
}
export async function registerDatabaseBackupRoutes(app:FastifyInstance,pool:Pool){
 app.get('/api/admin/database-backup/options',{preHandler:superAdmin},async(_r,reply)=>{reply.header('Cache-Control','private, no-store');return{groups:keys.map(id=>({id,label:BACKUP_GROUPS[id].label,tables:BACKUP_GROUPS[id].tables})),limits:{maxRows:LIMIT_ROWS,maxBytes:LIMIT_BYTES}}});
 app.post('/api/admin/database-backup/download',{preHandler:superAdmin},async(r,reply)=>{
  reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff');
  const origin=r.headers.origin;
  if(origin){try{const host=new URL(origin).host;if(host!==r.headers.host&&origin!==process.env.CORS_ORIGIN)return reply.code(403).send({error:'INVALID_ORIGIN'});}catch{return reply.code(403).send({error:'INVALID_ORIGIN'});}}
  const parsed=schema.safeParse(r.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_BACKUP_SELECTION'});
  const groups=[...new Set(parsed.data.groups)];const client=await pool.connect();
  try{
   await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await client.query("SET LOCAL statement_timeout = '15000ms'");
   const orgs=await client.query('SELECT id FROM organizations LIMIT 2');
   if(orgs.rows.length!==1){await client.query('ROLLBACK');return reply.code(409).send({error:'SINGLE_ORGANIZATION_REQUIRED'});}
   const data=await snapshot(client,groups);await client.query('COMMIT');
   const result=renderBackup(data,parsed.data.format);assertSize(result.body);
   const filename=`media-intelligence-backup-${data.createdAt.slice(0,10)}.${result.extension}`;
   try{await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'DATABASE_BACKUP_DOWNLOADED',$2::jsonb)`,[r.sessionAuth!.id,JSON.stringify({groups,format:parsed.data.format,tables:data.rowCounts,bytes:result.body.length})]);}catch(e){r.log.warn({err:e},'Backup audit log failed');return reply.code(503).send({error:'BACKUP_AUDIT_UNAVAILABLE'});}
   return reply.header('Content-Type',result.contentType).header('Content-Disposition',`attachment; filename="${filename}"`).send(result.body);
  }catch(e){await client.query('ROLLBACK').catch(()=>undefined);if(e instanceof BackupLimitError)return reply.code(413).send({error:e.message});if(e instanceof BackupSchemaError)return reply.code(409).send({error:'BACKUP_SCHEMA_INCOMPLETE',missingTables:e.message.split(':')[1]?.split(',')});r.log.error({err:e},'Database backup failed');return reply.code(503).send({error:'BACKUP_FAILED'});}finally{client.release();}
 });
}
async function superAdmin(r:any,reply:any){const c=r.sessionAuth;if(!c?.active)return reply.code(401).send({error:'UNAUTHENTICATED'});if(c.legacyRole!=='admin'&&!c.roles.includes('super_admin'))return reply.code(403).send({error:'FORBIDDEN'});}
