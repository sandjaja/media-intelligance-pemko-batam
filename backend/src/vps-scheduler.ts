import 'dotenv/config';
import {Pool} from 'pg';
import {loadVpsConfig} from './install-service.js';
import {runScheduledCollectionIfDue} from './collection-scheduler.js';
import {runLiveScheduledExecutiveBrief} from './cron-executive-brief.js';
if(process.env.DEPLOYMENT_MODE!=='vps'||process.env.VERCEL)throw Error('VPS_SCHEDULER_ONLY');
if(await loadVpsConfig()){
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000});
  let failed=false;
  try{
    for(const [name,run] of [['collection',()=>runScheduledCollectionIfDue(pool)],['executive_brief',()=>runLiveScheduledExecutiveBrief(pool,new Date())]] as const){
      try{const result=await run();console.log(JSON.stringify({event:'vps_schedule_tick',feature:name,status:(result as any).status,skipped:(result as any).skipped,reason:(result as any).reason}));}
      catch{failed=true;console.error(JSON.stringify({event:'vps_schedule_failed',feature:name}))}
    }
  }finally{await pool.end()}
  if(failed)process.exitCode=1;
}else console.log(JSON.stringify({event:'vps_schedule_skipped',reason:'NOT_INSTALLED'}));
