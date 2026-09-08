import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printReviewAuth?: AuthorizationContext } }

type Phase2EAnalysis = {
  engine: string;
  generatedAt: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  issueCategory: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  importanceScore: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: string[];
  note: string;
};

const clamp = (n:number,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(n)));
const hits=(text:string,words:string[])=>words.filter(w=>text.includes(w));
function analyzePrintArticle(input:{title?:string;summary?:string;body_text?:string;is_headline?:boolean;keyword_count?:number}):Phase2EAnalysis{
  const text=`${input.title||''} ${input.summary||''} ${input.body_text||''}`.toLowerCase().replace(/\s+/g,' ');
  const positive=hits(text,['apresiasi','berhasil','meningkat','tumbuh','positif','penghargaan','prestasi','membaik','solusi','dukungan','optimistis','lancar']);
  const negative=hits(text,['keluhan','gagal','rusak','macet','banjir','sampah','protes','kritik','buruk','terlambat','masalah','konflik','penolakan','kerugian','korban']);
  const highRisk=hits(text,['darurat','krisis','kecelakaan','kebakaran','korupsi','demonstrasi','unjuk rasa','pencemaran','wabah','longsor','bencana','pidana']);
  const critical=hits(text,['meninggal','tewas','ledakan','kerusuhan','tersangka','ditangkap','evakuasi','status darurat']);
  const sentimentDelta=positive.length-negative.length-(highRisk.length*2)-(critical.length*2);
  const sentiment:Phase2EAnalysis['sentiment']=sentimentDelta>=2?'positive':sentimentDelta<=-2?'negative':'neutral';

  const categories:[string,string[]][]=[
    ['Infrastruktur & Transportasi',['jalan','jembatan','pelabuhan','transportasi','kemacetan','macet','drainase','lampu jalan','infrastruktur']],
    ['Pelayanan Publik',['pelayanan','layanan publik','administrasi','perizinan','pengaduan','masyarakat']],
    ['Ekonomi & Investasi',['ekonomi','investasi','usaha','umkm','inflasi','harga','pertumbuhan','industri','pariwisata']],
    ['Lingkungan',['sampah','lingkungan','pencemaran','banjir','drainase','limbah','mangrove']],
    ['Keamanan & Ketertiban',['keamanan','kriminal','pidana','polisi','kerusuhan','demonstrasi','unjuk rasa']],
    ['Kesehatan',['kesehatan','rumah sakit','puskesmas','wabah','pasien','dokter']],
    ['Pendidikan',['sekolah','pendidikan','siswa','guru','beasiswa']],
    ['Pemerintahan',['pemko','pemerintah','walikota','dinas','opd','kebijakan','anggaran']],
  ];
  let issueCategory='Umum / Lintas Isu',best=0;
  for(const [name,words] of categories){const score=hits(text,words).length;if(score>best){best=score;issueCategory=name;}}

  const keywordCount=Number(input.keyword_count||0);
  let risk=8+(negative.length*7)+(highRisk.length*15)+(critical.length*24)+(input.is_headline?8:0);
  if(sentiment==='positive')risk-=8;
  risk=clamp(risk);
  const riskLevel:Phase2EAnalysis['riskLevel']=risk>=80?'CRITICAL':risk>=60?'HIGH':risk>=35?'MEDIUM':'LOW';
  const textDepth=Math.min(20,Math.floor(text.length/500)*3);
  const importance=clamp(15+(input.is_headline?28:0)+(keywordCount*5)+textDepth+(risk*0.32));
  const evidenceSignals=[...negative,...highRisk,...critical];
  const confidence:Phase2EAnalysis['confidence']=text.length>=1800&&(evidenceSignals.length+positive.length)>=3?'HIGH':text.length>=600?'MEDIUM':'LOW';
  const signals=[
    input.is_headline?'Headline/front-page indicator':null,
    keywordCount?`${keywordCount} keyword clipping tercatat`:null,
    negative.length?`Sinyal negatif: ${negative.join(', ')}`:null,
    highRisk.length?`Sinyal risiko: ${highRisk.join(', ')}`:null,
    critical.length?`Sinyal kritis: ${critical.join(', ')}`:null,
  ].filter(Boolean) as string[];
  if(!signals.length)signals.push('Tidak ada sinyal risiko eksplisit yang kuat pada teks terverifikasi.');
  return {engine:'phase2e-rule-v1',generatedAt:new Date().toISOString(),sentiment,issueCategory,riskScore:risk,riskLevel,importanceScore:importance,confidence,signals,note:'Analisis deterministik Phase 2E berdasarkan teks clipping terverifikasi; bukan generasi fakta baru. Hasil harus ditinjau manusia bila confidence LOW.'};
}

export async function registerPrintReviewRoutes(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  const auth = async (request: FastifyRequest, reply: any) => {
    const token = request.cookies.access_token;
    if (!token) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    try {
      const decoded = jwt.verify(token, jwtSecret) as jwt.JwtPayload;
      if (typeof decoded.sub !== 'string') throw new Error('invalid');
      const ctx = await loadAuthorizationContext(pool, decoded.sub);
      if (!ctx?.active) return reply.code(403).send({ error: 'ACCOUNT_INACTIVE' });
      request.printReviewAuth = ctx;
    } catch {
      return reply.code(401).send({ error: 'INVALID_ACCESS_TOKEN' });
    }
  };

  const canReview = (ctx: AuthorizationContext) =>
    ctx.roles.includes('super_admin') || ctx.roles.includes('humas');

  app.get('/api/print/review-capability', { preHandler: auth }, async (request) => ({
    data: {
      canReviewAndVerify: canReview(request.printReviewAuth!),
      canAdvanceAnalysis: canReview(request.printReviewAuth!),
    },
  }));

  app.post('/api/print/articles/:id/review-verify', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printReviewAuth!;
    if (!canReview(ctx)) return reply.code(403).send({ error: 'REVIEW_VERIFY_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_ID' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT id,title,status FROM print_articles WHERE id=$1 FOR UPDATE`,[id.data])).rows[0];
      if (!current) {await client.query('ROLLBACK');return reply.code(404).send({ error: 'NOT_FOUND' });}
      if (!['needs_review', 'verified'].includes(String(current.status))) {await client.query('ROLLBACK');return reply.code(409).send({error:'INVALID_REVIEW_STATE',message:`Clipping berstatus ${current.status} tidak dapat diverifikasi dari alur review.`});}
      const verified = (await client.query(`UPDATE print_articles SET status='verified', verified_by=$2, verified_at=now(), updated_at=now() WHERE id=$1 RETURNING id,title,status,verified_by,verified_at,updated_at`,[id.data, ctx.id])).rows[0];
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_REVIEW_VERIFIED',$2)`,[ctx.id, { printArticleId: id.data, previousStatus: current.status }]);
      await client.query('COMMIT');return { data: verified };
    } catch (error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });

  app.post('/api/print/articles/:id/mark-analyzed', { preHandler: auth }, async (request, reply) => {
    const ctx = request.printReviewAuth!;
    if (!canReview(ctx)) return reply.code(403).send({ error: 'ANALYSIS_REQUIRES_HUMAS_OR_SUPER_ADMIN' });
    const id = z.coerce.number().int().positive().safeParse((request.params as any).id);
    if (!id.success) return reply.code(400).send({ error: 'INVALID_ID' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query(`SELECT pa.id,pa.title,pa.summary,pa.body_text,pa.is_headline,pa.status,pa.verified_by,pa.verified_at,(SELECT COUNT(*)::int FROM print_article_keywords pak WHERE pak.article_id=pa.id) keyword_count FROM print_articles pa WHERE pa.id=$1 FOR UPDATE`,[id.data])).rows[0];
      if (!current) {await client.query('ROLLBACK');return reply.code(404).send({ error: 'NOT_FOUND' });}
      if (String(current.status) !== 'verified') {await client.query('ROLLBACK');return reply.code(409).send({error:'ARTICLE_MUST_BE_VERIFIED_FIRST',message:`Clipping harus berstatus Verified sebelum masuk ke Analyzed. Status saat ini: ${current.status}.`});}
      const analysis=analyzePrintArticle(current);
      const analyzed = (await client.query(`UPDATE print_articles SET status='analyzed',sentiment=$2,risk_score=$3,importance_score=$4,ai_metadata=jsonb_set(COALESCE(ai_metadata,'{}'::jsonb),'{phase2e}',$5::jsonb,true),updated_at=now() WHERE id=$1 RETURNING id,title,status,sentiment,risk_score,importance_score,ai_metadata,verified_by,verified_at,updated_at`,[id.data,analysis.sentiment,analysis.riskScore,analysis.importanceScore,JSON.stringify(analysis)])).rows[0];
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_ANALYZED',$2)`,[ctx.id,{printArticleId:id.data,previousStatus:current.status,engine:analysis.engine,sentiment:analysis.sentiment,riskScore:analysis.riskScore,importanceScore:analysis.importanceScore,issueCategory:analysis.issueCategory,confidence:analysis.confidence}]);
      await client.query('COMMIT');return { data: analyzed, analysis };
    } catch (error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  });
}
