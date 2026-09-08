import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printAnalysisRecoveryAuth?: AuthorizationContext } }

const norm=(v:any)=>String(v||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu,' ').replace(/\s+/g,' ').trim();
const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
const hits=(text:string,words:string[])=>words.filter(w=>text.includes(w));
const count=(text:string,term:string)=>{if(!term)return 0;let n=0,p=0;while((p=text.indexOf(term,p))!==-1){n++;p+=Math.max(1,term.length);}return n;};

export async function registerPrintAnalysisRecoveryRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(request:FastifyRequest,reply:any)=>{const token=request.cookies.access_token;if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const ctx=await loadAuthorizationContext(pool,d.sub);if(!ctx?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});request.printAnalysisRecoveryAuth=ctx;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
  const canAnalyze=(ctx:AuthorizationContext)=>ctx.legacyRole==='admin'||ctx.roles.includes('super_admin')||ctx.roles.includes('humas');

  app.post('/api/print/articles/:id/mark-analyzed-v2',{preHandler:auth},async(request,reply)=>{
    const ctx=request.printAnalysisRecoveryAuth!;
    if(!canAnalyze(ctx))return reply.code(403).send({error:'ANALYSIS_REQUIRES_HUMAS_OR_SUPER_ADMIN'});
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_ID'});
    const current=(await pool.query(`SELECT id,title,summary,body_text,is_headline,status,opd_id,district_id,verified_by,verified_at FROM print_articles WHERE id=$1`,[id.data])).rows[0];
    if(!current)return reply.code(404).send({error:'NOT_FOUND'});
    if(String(current.status)!=='verified')return reply.code(409).send({error:'ARTICLE_MUST_BE_VERIFIED_FIRST',message:`Clipping harus berstatus Verified sebelum dianalisis. Status saat ini: ${current.status}.`});

    const safe=async<T=any>(sql:string,params:any[]=[]):Promise<T[]>=>{try{return (await pool.query(sql,params)).rows as T[];}catch(e){console.warn('Phase2E optional intelligence source skipped',String((e as any)?.message||e));return[];}};
    const [official,operator,opds,districts]=await Promise.all([
      safe(`SELECT k.id,k.keyword,k.opd_id,k.group_id,k.match_type,k.priority,kg.name group_name FROM keywords k LEFT JOIN keyword_groups kg ON kg.id=k.group_id WHERE k.active=true ORDER BY k.priority DESC,k.id`),
      safe(`SELECT keyword_text FROM print_article_keywords WHERE article_id=$1 AND source='operator' ORDER BY keyword_text`,[id.data]),
      safe(`SELECT id,name,code FROM opd WHERE active=true ORDER BY name`),
      safe(`SELECT id,name,code FROM districts WHERE active=true ORDER BY name`)
    ]);

    const title=norm(current.title),summary=norm(current.summary),body=norm(current.body_text),text=`${title} ${summary} ${body}`.trim();
    const positive=hits(text,['apresiasi','berhasil','meningkat','tumbuh','positif','penghargaan','prestasi','membaik','solusi','dukungan','optimistis','lancar']);
    const negative=hits(text,['keluhan','gagal','rusak','macet','banjir','sampah','protes','kritik','buruk','terlambat','masalah','konflik','penolakan','kerugian','korban']);
    const high=hits(text,['darurat','krisis','kecelakaan','kebakaran','korupsi','demonstrasi','unjuk rasa','pencemaran','wabah','longsor','bencana','pidana']);
    const critical=hits(text,['meninggal','tewas','ledakan','kerusuhan','tersangka','ditangkap','evakuasi','status darurat']);
    const delta=positive.length-negative.length-high.length*2-critical.length*2;
    const sentiment=delta>=2?'positive':delta<=-2?'negative':'neutral';
    let risk=8+negative.length*7+high.length*15+critical.length*24+(current.is_headline?8:0);if(sentiment==='positive')risk-=8;risk=clamp(risk);
    const riskLevel=risk>=80?'CRITICAL':risk>=60?'HIGH':risk>=35?'MEDIUM':'LOW';

    const officialMatches=(official as any[]).map(k=>{const term=norm(k.keyword);const tc=count(title,term),sc=count(summary,term),bc=count(body,term),total=tc+sc+bc;if(!total)return null;return{keywordId:Number(k.id),keyword:String(k.keyword),source:'official',opdId:k.opd_id==null?null:Number(k.opd_id),priority:Math.max(1,Math.min(3,Number(k.priority||2))),fields:[tc?'title':null,sc?'summary':null,bc?'body':null].filter(Boolean),occurrences:{title:tc,summary:sc,body:bc,total}};}).filter(Boolean);
    const operatorMatches=(operator as any[]).map(k=>{const term=norm(k.keyword_text);const tc=count(title,term),sc=count(summary,term),bc=count(body,term),total=tc+sc+bc;return{keyword:String(k.keyword_text),source:'operator',fields:[tc?'title':null,sc?'summary':null,bc?'body':null].filter(Boolean),occurrences:{title:tc,summary:sc,body:bc,total},presentInText:total>0};}).filter(k=>k.presentInText);
    const operatorNotFound=(operator as any[]).filter(k=>!text.includes(norm(k.keyword_text))).map(k=>String(k.keyword_text));

    const categories:[string,string[]][]=[['Infrastruktur & Transportasi',['jalan','jembatan','pelabuhan','transportasi','kemacetan','macet','drainase','lampu jalan','infrastruktur']],['Pelayanan Publik',['pelayanan','layanan publik','administrasi','perizinan','pengaduan','masyarakat']],['Ekonomi & Investasi',['ekonomi','investasi','usaha','umkm','inflasi','harga','pertumbuhan','industri','pariwisata']],['Lingkungan',['sampah','lingkungan','pencemaran','banjir','drainase','limbah','mangrove']],['Keamanan & Ketertiban',['keamanan','kriminal','pidana','polisi','kerusuhan','demonstrasi','unjuk rasa']],['Kesehatan',['kesehatan','rumah sakit','puskesmas','wabah','pasien','dokter']],['Pendidikan',['sekolah','pendidikan','siswa','guru','beasiswa']],['Pemerintahan',['pemko','pemerintah','walikota','dinas','opd','kebijakan','anggaran']]];
    let issueCategory='Umum / Lintas Isu',best=0;for(const [name,words] of categories){const s=hits(text,words).length;if(s>best){best=s;issueCategory=name;}}

    const opdScores=new Map<number,number>();for(const k of officialMatches as any[]){if(k.opdId!=null)opdScores.set(k.opdId,(opdScores.get(k.opdId)||0)+k.priority*3+Math.min(4,k.occurrences.total));}for(const o of opds as any[]){const term=norm(o.name);if(term&&text.includes(term))opdScores.set(Number(o.id),(opdScores.get(Number(o.id))||0)+8);}const detectedOpd=[...opdScores.entries()].sort((a,b)=>b[1]-a[1])[0];
    const districtCandidates=(districts as any[]).map(d=>({id:Number(d.id),name:String(d.name),score:count(title,norm(d.name))*6+count(summary,norm(d.name))*3+count(body,norm(d.name))*2})).filter(d=>d.score>0).sort((a,b)=>b.score-a.score);const detectedDistrict=districtCandidates[0]||null;
    const selectedOpd=(opds as any[]).find(o=>Number(o.id)===Number(current.opd_id));const selectedDistrict=(districts as any[]).find(d=>Number(d.id)===Number(current.district_id));const detectedOpdObj=detectedOpd?{id:detectedOpd[0],name:String((opds as any[]).find(o=>Number(o.id)===detectedOpd[0])?.name||`OPD #${detectedOpd[0]}`),score:detectedOpd[1],evidence:[]}:null;
    const opdMatch=current.opd_id==null?'UNSET':!detectedOpdObj?'UNDETECTED':Number(current.opd_id)===detectedOpdObj.id?'MATCH':'MISMATCH';const districtMatch=current.district_id==null?'UNSET':!detectedDistrict?'UNDETECTED':Number(current.district_id)===detectedDistrict.id?'MATCH':'MISMATCH';
    const entityValidation={selected:{opdId:current.opd_id==null?null:Number(current.opd_id),opdName:selectedOpd?.name||null,districtId:current.district_id==null?null:Number(current.district_id),districtName:selectedDistrict?.name||null},detected:{opd:detectedOpdObj,district:detectedDistrict},opdMatch,districtMatch,reviewRequired:opdMatch==='MISMATCH'||districtMatch==='MISMATCH',evidence:[],note:'Validasi intelligence tidak menimpa metadata yang diverifikasi manusia.'};

    const importance=clamp(15+(current.is_headline?28:0)+Math.min(24,officialMatches.length*6)+Math.min(8,operatorMatches.length*2)+Math.min(20,Math.floor(text.length/500)*3)+risk*.32);
    const confidence=text.length>=1800&&(negative.length+high.length+critical.length+positive.length+officialMatches.length+operatorMatches.length)>=3?'HIGH':text.length>=600?'MEDIUM':'LOW';
    const signals=[current.is_headline?'Headline/front-page indicator':null,officialMatches.length?`Keyword resmi terdeteksi: ${(officialMatches as any[]).map(k=>k.keyword).join(', ')}`:null,operatorMatches.length?`Keyword operator terkonfirmasi di teks: ${(operatorMatches as any[]).map(k=>k.keyword).join(', ')}`:null,operatorNotFound.length?`Keyword operator tidak ditemukan literal di teks: ${operatorNotFound.join(', ')}`:null,negative.length?`Sinyal negatif: ${negative.join(', ')}`:null,high.length?`Sinyal risiko: ${high.join(', ')}`:null,critical.length?`Sinyal kritis: ${critical.join(', ')}`:null].filter(Boolean) as string[];
    const analysis={engine:'phase2e-rule-v2.3-recovery',generatedAt:new Date().toISOString(),sentiment,issueCategory,riskScore:risk,riskLevel,importanceScore:importance,confidence,officialKeywordMatches:officialMatches,operatorKeywordMatches:operatorMatches,operatorKeywordsNotFound:operatorNotFound,entityValidation,signals:signals.length?signals:['Tidak ada sinyal risiko eksplisit yang kuat pada teks terverifikasi.'],issueLinkage:{engine:'deferred',candidateCount:0,linkedIssueId:null,candidates:[],degraded:true,note:'Issue linkage sementara dipisahkan dari proses analisis inti.'},note:'Recovery path Phase 2E: analisis inti diprioritaskan agar Verified → Analyzed tetap stabil.'};

    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout='2500ms'`);
      await client.query(`SET LOCAL statement_timeout='12000ms'`);
      const locked=(await client.query(`SELECT status FROM print_articles WHERE id=$1 FOR UPDATE NOWAIT`,[id.data])).rows[0];
      if(!locked||String(locked.status)!=='verified'){await client.query('ROLLBACK');return reply.code(409).send({error:'ARTICLE_STATUS_CHANGED',message:'Status clipping berubah sebelum analisis disimpan. Muat ulang data.'});}
      const row=(await client.query(`UPDATE print_articles SET status='analyzed',sentiment=$2,risk_score=$3,importance_score=$4,ai_metadata=jsonb_set(COALESCE(ai_metadata,'{}'::jsonb),'{phase2e}',$5::jsonb,true),updated_at=now() WHERE id=$1 RETURNING id,title,status,sentiment,risk_score,importance_score,ai_metadata,verified_by,verified_at,updated_at`,[id.data,sentiment,risk,importance,JSON.stringify(analysis)])).rows[0];
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_ANALYZED_RECOVERY',$2)`,[ctx.id,{printArticleId:id.data,engine:analysis.engine,sentiment,riskScore:risk,importanceScore:importance,issueCategory,confidence}]);
      await client.query('COMMIT');
      return {data:row,analysis};
    }catch(e:any){try{await client.query('ROLLBACK');}catch{}const code=String(e?.code||'');console.error('Phase2E recovery analysis failed',{articleId:id.data,code,message:e?.message});if(code==='55P03'||code==='57014')return reply.code(409).send({error:'ANALYSIS_DATABASE_BUSY',message:'Database sedang menahan lock lama pada clipping ini. Tutup modal, muat ulang halaman, lalu coba lagi setelah beberapa detik.',code});return reply.code(500).send({error:'PRINT_ANALYSIS_FAILED',message:String(e?.message||'Analisis gagal disimpan.'),code});}finally{client.release();}
  });
}
