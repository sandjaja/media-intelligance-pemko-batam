import type {IncomingMessage,ServerResponse} from 'node:http';
import {Pool} from 'pg';
import {verifyApifyCallback} from './apify-callback-auth.js';
import {driveBackgroundApifyJob,getBackgroundApifyJob} from './apify-background-collection.js';
const json=(res:ServerResponse,status:number,body:unknown)=>{res.statusCode=status;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
export const config={maxDuration:300};
export default async function handler(req:IncomingMessage,res:ServerResponse){
 if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
 const query=new URL(req.url||'','https://callback.invalid').searchParams,jobId=query.get('jobId')||'',signature=query.get('signature')||'';
 if(!/^[a-f0-9-]{36}$/.test(jobId))return json(res,401,{error:'UNAUTHORIZED'});
 try{if(!verifyApifyCallback(jobId,signature))return json(res,401,{error:'UNAUTHORIZED'});}catch{return json(res,503,{error:'APIFY_CALLBACK_NOT_CONFIGURED'});}
 const databaseUrl=process.env.DATABASE_URL??process.env.POSTGRES_URL;
 if(!databaseUrl)return json(res,503,{error:'DATABASE_URL_REQUIRED'});
 const pool=new Pool({connectionString:databaseUrl,max:3});
 try{
  const job=await getBackgroundApifyJob(pool,jobId);
  if(!job?.callbackBaseUrl)return json(res,404,{error:'APIFY_BACKGROUND_JOB_NOT_FOUND'});
  const result=await driveBackgroundApifyJob(pool,jobId,75000,query.get('completedKind')||undefined);
  return json(res,200,{ok:true,jobId,status:result.status});
 }catch{return json(res,503,{error:'APIFY_CALLBACK_RETRY_REQUIRED'});}finally{await pool.end();}
}
