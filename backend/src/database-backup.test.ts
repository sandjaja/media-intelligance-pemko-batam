import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {BACKUP_GROUPS,registerDatabaseBackupRoutes,renderBackup} from './database-backup.js';

const admin={id:'1',active:true,legacyRole:'admin',roles:['super_admin']};
async function fixture(user:any=admin,orgCount=1){
 const queries:string[]=[];
 const query=async(sql:string,params:any[]=[]):Promise<any>=>{
  queries.push(sql);
  if(sql.includes('FROM organizations LIMIT 2'))return{rows:Array.from({length:orgCount},(_,i)=>({id:i+1}))};
  if(sql.includes('FROM information_schema.tables'))return{rows:params[0].map((table_name:string)=>({table_name}))};
  if(sql.includes('FROM information_schema.columns'))return{rows:[{column_name:'id'},{column_name:'name'}]};
  if(sql.includes('row_to_json(t)'))return{rows:[{row:{id:1,name:"=SUM(1+1) O'Brien"}}]};
  return{rows:[]};
 };
 const pool={query,connect:async()=>({query,release(){}})} as any;
 const app=Fastify();app.addHook('preHandler',async r=>{r.sessionAuth=user});await registerDatabaseBackupRoutes(app,pool);
 return{app,queries};
}
test('only Super Admin can list or download backups',async()=>{
 for(const user of [null,{...admin,legacyRole:'operator',roles:['humas']}]){
  const x=await fixture(user);try{
   const expected=user?403:401;
   assert.equal((await x.app.inject({url:'/api/admin/database-backup/options'})).statusCode,expected);
   assert.equal((await x.app.inject({method:'POST',url:'/api/admin/database-backup/download',payload:{groups:['master'],format:'json'}})).statusCode,expected);
   assert.ok(!x.queries.some(q=>q.includes('row_to_json')));
  }finally{await x.app.close()}
 }
});
test('single-organization guard, selection validation, and audit precede response',async()=>{
 const x=await fixture(admin,2);try{
  assert.equal((await x.app.inject({method:'POST',url:'/api/admin/database-backup/download',payload:{groups:['master'],format:'json'}})).statusCode,409);
  assert.ok(!x.queries.some(q=>q.includes('row_to_json')));
  assert.equal((await x.app.inject({method:'POST',url:'/api/admin/database-backup/download',payload:{groups:['users'],format:'json'}})).statusCode,400);
 }finally{await x.app.close()}
 const y=await fixture();try{
  const r=await y.app.inject({method:'POST',url:'/api/admin/database-backup/download',payload:{groups:['master'],format:'json'}});
  assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'private, no-store');
  assert.equal(JSON.parse(r.body).tables.opd.rows[0].name,"=SUM(1+1) O'Brien");
  assert.ok(y.queries.some(q=>q.includes('DATABASE_BACKUP_DOWNLOADED')));
  assert.ok(!y.queries.some(q=>/FROM public\."users"/.test(q)));
 }finally{await y.app.close()}
});
test('all format contains SQL, JSON and CSV and escapes data safely',()=>{
 const data={createdAt:'2026-10-21T00:00:00.000Z',groups:['master'],tables:{opd:{columns:['id','name'],rows:[{id:1,name:"=SUM(1+1) O'Brien"}]}},rowCounts:{opd:1},note:'test'} as any;
 const sql=renderBackup(data,'sql').body.toString();assert.match(sql,/O''Brien/);assert.match(sql,/jsonb_populate_record/);
 const csv=renderBackup(data,'csv').body;
 assert.ok(csv.includes(Buffer.from('csv/opd.csv')));assert.ok(csv.includes(Buffer.from("'=SUM(1+1) O'Brien")));
 const all=renderBackup(data,'all').body;
 assert.equal(all.readUInt32LE(0),0x04034b50);assert.ok(all.includes(Buffer.from('backup.sql')));assert.ok(all.includes(Buffer.from('backup.json')));assert.ok(all.includes(Buffer.from('csv/opd.csv')));
 assert.ok(BACKUP_GROUPS.master.tables.includes('keywords'));assert.ok(BACKUP_GROUPS.master.tables.includes('keyword_opd'));
});
