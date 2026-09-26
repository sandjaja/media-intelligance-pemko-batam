import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { hasPermission, loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printWarningAuth?: AuthorizationContext } }

const ENGINE='phase2f-warning-signal-v1.0';
type WarningLevel='NONE'|'WATCH'|'ELEVATED'|'HIGH'|'CRITICAL';
type EvidenceConfidence='LOW'|'MEDIUM'|'HIGH';

type Phase2E={
  confidence?:string;
  riskLevel?:string;
  riskScore?:number;
  importanceScore?:number;
  sentiment?:string;
  issueCategory?:string;
  officialKeywordMatches?:Array<{keyword:string}>;
  entityValidation?:{
    selected?:{opdId?:number|null;districtId?:number|null};
    detected?:{opd?:{id:number}|null;district?:{id:number}|null};
  };
};

export type PrintWarningSignal={engine:string;generatedAt:string;printArticleId:number;warningScore:number;warningLevel:WarningLevel;candidateAlert:boolean;evidenceConfidence:EvidenceConfidence;riskScore:number;importanceScore:number;sentiment:string;issueId:number|null;linkedArticleCount:number;evidenceSourceCount:number;reasons:string[];note:string};

const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const level=(s:number):WarningLevel=>s>=85?'CRITICAL':s>=70?'HIGH':s>=50?'ELEVATED':s>=30?'WATCH':'NONE';

async function compute(client:PoolClient,article:any):Promise<PrintWarningSignal>{
  const p=(article.ai_metadata?.phase2e||{}) as Phase2E;
  const risk=Number(article.risk_score??p.riskScore??0)||0;
  const importance=Number(article.importance_score??p.importanceScore??0)||0;
  const sentiment=String(article.sentiment??p.sentiment??'neutral').toLowerCase();
  const evidence=await client.query(`SELECT id,source_type FROM evidence_sources WHERE print_article_id=$1 ORDER BY id`,[article.id]);
  const linked=await client.query(`SELECT issue_id FROM issue_print_articles WHERE print_article_id=$1 AND linkage_status='linked' ORDER BY decided_at DESC NULLS LAST LIMIT 1`,[article.id]);
  const issueId=linked.rows[0]?Number(linked.rows[0].issue_id):null;
  let linkedArticleCount=0;
  if(issueId){const c=await client.query(`SELECT count(*)::int AS n FROM issue_print_articles WHERE issue_id=$1 AND linkage_status='linked'`,[issueId]);linkedArticleCount=Number(c.rows[0]?.n||0);}
  let score=risk*0.5+importance*0.2;
  const reasons:string[]=[`Risk ${risk}/100 memberi kontribusi ${Math.round(risk*0.5)} poin`,`Importance ${importance}/100 memberi kontribusi ${Math.round(importance*0.2)} poin`];
  if(sentiment==='negative'){score+=15;reasons.push('Sentiment negatif: +15');}
  if(issueId){score+=5;reasons.push(`Terhubung ke issue #${issueId}: +5`);}
  if(linkedArticleCount>=3){score+=10;reasons.push(`Issue memiliki ${linkedArticleCount} clipping terverifikasi: +10`);}else if(linkedArticleCount===2){score+=5;reasons.push('Issue memiliki 2 clipping terverifikasi: +5');}
  const officialCount=Array.isArray(p.officialKeywordMatches)?p.officialKeywordMatches.length:0;
  if(officialCount>=2){score+=3;reasons.push(`Beberapa keyword resmi terdeteksi (${officialCount}): +3`);}
  const warningScore=clamp(score),warningLevel=level(warningScore),evidenceSourceCount=evidence.rowCount||0,phaseConfidence=String(p.confidence||'LOW').toUpperCase();
  const evidenceConfidence:EvidenceConfidence=evidenceSourceCount>0&&phaseConfidence==='HIGH'?'HIGH':evidenceSourceCount>0&&phaseConfidence==='MEDIUM'?'MEDIUM':'LOW';
  return{engine:ENGINE,generatedAt:new Date().toISOString(),printArticleId:Number(article.id),warningScore,warningLevel,candidateAlert:warningScore>=50,evidenceConfidence,riskScore:risk,importanceScore:importance,sentiment,issueId,linkedArticleCount,evidenceSourceCount,reasons,note:warningScore>=50?'Sinyal memenuhi ambang kandidat alert. Sistem TIDAK membuat alert aktif otomatis; keputusan tetap melalui validasi manusia.':'Belum memenuhi ambang kandidat alert. Tetap dapat dipantau sebagai evidence/sinyal.'};
}

export async function registerPrintWarningSignalRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const decoded=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof decoded.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,decoded.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.printWarningAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
  const canReadArticle=(ctx:AuthorizationContext,article:any)=>hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all')||!ctx.opdId||Number(article.opd_id)===Number(ctx.opdId);
  app.get('/api/print/articles/:id/warning-signal',{preHandler:auth},async(request,reply)=>{const parsed=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!parsed.success)return reply.code(400).send({error:'INVALID_ID'});const client=await pool.connect();try{const ar=await client.query(`SELECT * FROM print_articles WHERE id=$1`,[parsed.data]);const article=ar.rows[0];if(!article)return reply.code(404).send({error:'NOT_FOUND'});if(!canReadArticle(request.printWarningAuth!,article))return reply.code(403).send({error:'FORBIDDEN'});if(String(article.status).toLowerCase()!=='analyzed')return reply.code(409).send({error:'ARTICLE_NOT_ANALYZED'});return{data:await compute(client,article)};}finally{client.release();}});
  app.get('/api/intelligence/warning-signals',{preHandler:auth},async(request,reply)=>{const q=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});const ctx=request.printWarningAuth!;const params:any[]=[];let where=`WHERE lower(pa.status)='analyzed'`;if(!(hasPermission(ctx,'platform.admin')||hasPermission(ctx,'intelligence.read.all'))&&ctx.opdId){params.push(ctx.opdId);where+=` AND pa.opd_id=$${params.length}`;}params.push(q.data.limit);const rows=(await pool.query(`SELECT pa.* FROM print_articles pa ${where} ORDER BY pa.updated_at DESC NULLS LAST,pa.id DESC LIMIT $${params.length}`,params)).rows;const client=await pool.connect();try{const signals:PrintWarningSignal[]=[];for(const row of rows)signals.push(await compute(client,row));signals.sort((a,b)=>b.warningScore-a.warningScore);return{data:{engine:ENGINE,total:signals.length,candidateAlertCount:signals.filter(x=>x.candidateAlert).length,signals}};}finally{client.release();}});
}
