import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

const ENGINE='phase2f-candidate-issue-v1.1-anchor-family';
declare module 'fastify' { interface FastifyRequest { phase2fCandidateIssueAuth?: AuthorizationContext } }
const STOP=new Set(['yang','dengan','untuk','dari','pada','dalam','pemko','batam','pemerintah','dinas','kota','daerah','berita','halaman','koran','batampos','kepri','provinsi','jalan','kembali','akibat','hingga','setelah']);
const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&/[a-z]/.test(x)&&!STOP.has(x)))];
const FAMILY:Record<string,Set<string>>={
 FLOOD:new Set(['banjir','genangan','tergenang','terendam','rendam','meluap','luapan']),
 TRAFFIC:new Set(['macet','kemacetan']),
 DISASTER:new Set(['longsor','kebakaran','kecelakaan','darurat','krisis']),
 ENVIRONMENT:new Set(['sampah','pencemaran','limbah']),
 PUBLIC_COMPLAINT:new Set(['keluhan','protes','demonstrasi','gangguan']),
};
const families=(ts:string[])=>Object.entries(FAMILY).filter(([,words])=>ts.some(t=>words.has(t))).map(([name])=>name);
const familyTerms=(ts:string[],family:string)=>ts.filter(t=>FAMILY[family]?.has(t));

async function resolveOrganizationId(pool:Pool,ctx:AuthorizationContext){
 if(ctx.opdId){
  const r=await pool.query('SELECT organization_id FROM opd WHERE id=$1',[ctx.opdId]);
  const id=Number(r.rows[0]?.organization_id||0);
  if(id)return id;
 }
 const r=await pool.query('SELECT id FROM organizations ORDER BY id LIMIT 2');
 return r.rowCount===1?Number(r.rows[0].id):0;
}

async function detect(pool:Pool,organizationId:number){
 const rows=(await pool.query(`SELECT pa.id,pa.title,pa.summary,pa.body_text,pa.sentiment,pa.risk_score,pa.importance_score,pa.opd_id,pa.district_id,pa.ai_metadata->'phase2e'->>'issueCategory' issue_category,(SELECT count(*)::int FROM evidence_sources es WHERE es.print_article_id=pa.id) evidence_count FROM print_articles pa JOIN opd o ON o.id=pa.opd_id WHERE o.organization_id=$1 AND lower(pa.status)='analyzed' AND NOT EXISTS(SELECT 1 FROM issue_print_articles ipa WHERE ipa.print_article_id=pa.id AND ipa.linkage_status='linked') ORDER BY pa.created_at DESC LIMIT 100`,[organizationId])).rows;
 const pairs:any[]=[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];
  const ta=tokens(`${a.title} ${a.summary} ${a.body_text}`),tb=tokens(`${b.title} ${b.summary} ${b.body_text}`),tbSet=new Set(tb);
  const shared=ta.filter(x=>tbSet.has(x));
  const fa=families(ta),fb=new Set(families(tb)),sharedFamilies=fa.filter(x=>fb.has(x));
  if(!sharedFamilies.length)continue;
  const sameOpd=Number(a.opd_id)===Number(b.opd_id),sameDistrict=a.district_id!=null&&Number(a.district_id)===Number(b.district_id);
  const rainA=ta.includes('hujan'),rainB=tb.includes('hujan'),sameCategory=Boolean(a.issue_category)&&a.issue_category===b.issue_category;
  let score=40+Math.min(25,sharedFamilies.length*20)+Math.min(12,shared.length*2)+(sameOpd?10:0)+(sameDistrict?5:0)+(sameCategory?5:0)+(sharedFamilies.includes('FLOOD')&&rainA&&rainB?5:0);
  score=Math.min(100,score);if(score<60)continue;
  const primary=sharedFamilies[0];
  const anchors=[...new Set([...familyTerms(ta,primary),...familyTerms(tb,primary)])];
  pairs.push({engine:ENGINE,score,candidateIssue:true,printArticleIds:[Number(a.id),Number(b.id)],titles:[a.title,b.title],anchorFamily:primary,anchors,sharedTerms:shared.slice(0,12),sameOpd,sameDistrict,sameCategory,opdId:sameOpd?Number(a.opd_id):null,districtId:sameDistrict?Number(a.district_id):null,evidenceSourceCount:Number(a.evidence_count||0)+Number(b.evidence_count||0),suggestedLabel:primary==='FLOOD'?'Banjir/Genangan':primary==='TRAFFIC'?'Kemacetan':primary==='DISASTER'?'Kejadian Darurat/Bencana':primary==='ENVIRONMENT'?'Lingkungan':primary==='PUBLIC_COMPLAINT'?'Keluhan/Gangguan Publik':`Isu ${primary}`,reasons:[`Keluarga anchor sama: ${primary}`,sameOpd?'OPD sama':null,sameDistrict?'Kecamatan sama':null,sameCategory?'Kategori isu sama':null,sharedFamilies.includes('FLOOD')&&rainA&&rainB?'Konteks hujan muncul pada kedua evidence':null].filter(Boolean),note:'Kandidat issue berbasis keluarga anchor dan corroborating evidence. Sistem tidak membuat Issue aktif/watch otomatis; Humas/Super Admin harus memvalidasi.'});
 }
 return pairs.sort((a,b)=>b.score-a.score).slice(0,30);
}
export async function registerPhase2fCandidateIssueRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
 const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.phase2fCandidateIssueAuth=ctx}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'})}};
 app.get('/api/intelligence/candidate-issues',{preHandler:auth},async(request,reply)=>{const ctx=request.phase2fCandidateIssueAuth!;const organizationId=await resolveOrganizationId(pool,ctx);if(!organizationId)return reply.code(409).send({error:'ORGANIZATION_UNRESOLVED'});const candidates=await detect(pool,organizationId);return{data:{engine:ENGINE,total:candidates.length,candidates}}});
}
