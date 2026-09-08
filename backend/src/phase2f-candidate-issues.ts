import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

const ENGINE='phase2f-candidate-issue-v1.0';
declare module 'fastify' { interface FastifyRequest { phase2fCandidateIssueAuth?: AuthorizationContext } }
const STOP=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','batam','pemerintah','dinas','kota','daerah','berita','halaman','koran','batampos','kepri','provinsi','jalan','kembali','akibat','hingga','setelah']);
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&/[a-z]/.test(x)&&!STOP.has(x)))];
const issueWords=new Set(['banjir','genangan','terendam','rendam','hujan','longsor','sampah','macet','kemacetan','rusak','kecelakaan','kebakaran','krisis','darurat','protes','demonstrasi','pencemaran','wabah','keluhan','gangguan']);

async function detect(pool:Pool,organizationId:number){
 const rows=(await pool.query(`SELECT pa.id,pa.title,pa.summary,pa.body_text,pa.sentiment,pa.risk_score,pa.importance_score,pa.opd_id,pa.district_id,pa.ai_metadata->'phase2e'->>'issueCategory' issue_category,(SELECT count(*)::int FROM evidence_sources es WHERE es.print_article_id=pa.id) evidence_count FROM print_articles pa JOIN opd o ON o.id=pa.opd_id WHERE o.organization_id=$1 AND lower(pa.status)='analyzed' AND NOT EXISTS(SELECT 1 FROM issue_print_articles ipa WHERE ipa.print_article_id=pa.id AND ipa.linkage_status='linked') ORDER BY pa.created_at DESC LIMIT 100`,[organizationId])).rows;
 const pairs:any[]=[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];const ta=tokens(`${a.title} ${a.summary} ${a.body_text}`),tb=new Set(tokens(`${b.title} ${b.summary} ${b.body_text}`));const shared=ta.filter(x=>tb.has(x));const anchors=shared.filter(x=>issueWords.has(x));const sameOpd=Number(a.opd_id)===Number(b.opd_id),sameDistrict=a.district_id!=null&&Number(a.district_id)===Number(b.district_id);if(!anchors.length)continue;
  let score=35+Math.min(30,anchors.length*15)+Math.min(15,shared.length*3)+(sameOpd?10:0)+(sameDistrict?5:0);score=Math.min(100,score);if(score<55)continue;
  pairs.push({engine:ENGINE,score,candidateIssue:true,printArticleIds:[Number(a.id),Number(b.id)],titles:[a.title,b.title],anchors,sharedTerms:shared.slice(0,12),sameOpd,sameDistrict,opdId:sameOpd?Number(a.opd_id):null,districtId:sameDistrict?Number(a.district_id):null,evidenceSourceCount:Number(a.evidence_count||0)+Number(b.evidence_count||0),suggestedLabel:anchors.includes('banjir')||anchors.includes('terendam')||anchors.includes('rendam')?`Banjir/Genangan terkait ${anchors.includes('hujan')?'Hujan':'Infrastruktur'}`:`Isu ${anchors.slice(0,3).join(' / ')}`,note:'Kandidat issue berbasis kemiripan evidence. Sistem tidak membuat Issue aktif/watch otomatis; Humas/Super Admin harus memvalidasi.'});
 }
 return pairs.sort((a,b)=>b.score-a.score).slice(0,30);
}
export async function registerPhase2fCandidateIssueRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.phase2fCandidateIssueAuth=ctx}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'})}};
 app.get('/api/intelligence/candidate-issues',{preHandler:auth},async(request,reply)=>{const ctx=request.phase2fCandidateIssueAuth!;let organizationId=Number(ctx.organizationId||0);if(!organizationId&&ctx.opdId){const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);organizationId=Number(r.rows[0]?.organization_id||0)}if(!organizationId){const r=await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 2');if(r.rowCount===1)organizationId=Number(r.rows[0].id)}if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const candidates=await detect(pool,organizationId);return{data:{engine:ENGINE,total:candidates.length,candidates}}});
}
