import type { IncomingMessage,ServerResponse } from 'node:http';
import { Pool } from 'pg';
import { runScheduledCollectionIfDue } from './collection-scheduler.js';
const json=(res:ServerResponse,status:number,body:any)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body))};
export default async function handler(req:IncomingMessage,res:ServerResponse){
 if(req.method!=='GET')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.authorization!==`Bearer ${secret}`)return json(res,401,{error:'UNAUTHORIZED'});
 const databaseUrl=process.env.DATABASE_URL??process.env.POSTGRES_URL??'';if(!databaseUrl)return json(res,500,{error:'DATABASE_URL_REQUIRED'});
 const pool=new Pool({connectionString:databaseUrl,max:3});
 try{return json(res,200,await runScheduledCollectionIfDue(pool))}catch(error){return json(res,500,{error:'COLLECTION_CRON_FAILED',message:error instanceof Error?error.message:String(error)})}finally{await pool.end()}
}
