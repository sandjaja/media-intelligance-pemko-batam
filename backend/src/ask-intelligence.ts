import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

type User = { id: string; role: 'admin'|'operator'|'viewer'; opdId: string | null };

type Row = { title:string; summary:string|null; source_name:string|null; published_at:string|null; sentiment:string|null; risk_level:string; risk_score:number; impact_score:number; importance_score:number; velocity_score:number; opd_name:string|null };

function fallback(question:string, rows:Row[], alertCount:number) {
  const q=question.toLowerCase();
  if(!rows.length) return { mode:'deterministic-fallback', answer:'Belum ada data media yang cukup untuk menjawab pertanyaan ini. Jalankan monitoring dan pastikan feed aktif.', evidence:[], actions:['Jalankan monitoring sekarang.','Periksa Source Health bila data tetap kosong.'], priority:'WATCH' };
  const negative=rows.filter(r=>String(r.sentiment).toLowerCase()==='negative');
  const critical=rows.filter(r=>['critical','high'].includes(String(r.risk_level).toLowerCase()));
  const top=rows[0];
  let answer=`Sinyal tertinggi saat ini adalah “${top.title}” dari ${top.source_name||'media'} dengan risk ${Number(top.risk_score)||0}/100 dan impact ${Number(top.impact_score)||0}/100.`;
  if(q.includes('negatif')||q.includes('negative')) answer=`Terdapat ${negative.length} sinyal negatif dalam kumpulan data yang dianalisis. Sinyal dengan prioritas tertinggi adalah “${top.title}”.`;
  else if(q.includes('opd')) answer=`Sinyal teratas berasal dari konteks OPD ${top.opd_name||'belum terpetakan'}. Gunakan filter OPD untuk mempersempit analisis.`;
  else if(q.includes('2 jam')||q.includes('harus dilakukan')||q.includes('lakukan')) answer=`Dalam 2 jam ke depan, fokus pada validasi fakta untuk “${top.title}”, koordinasi OPD terkait, dan penyiapan satu key message yang konsisten.`;
  else if(q.includes('holding')) answer=`Holding statement yang aman: “Pemko sedang melakukan verifikasi fakta dan koordinasi dengan OPD terkait. Informasi resmi akan disampaikan melalui kanal pemerintah setelah data terverifikasi.”`;
  return { mode:'deterministic-fallback', answer, evidence:rows.slice(0,5).map(r=>({title:r.title,source:r.source_name,risk:r.risk_score,impact:r.impact_score,sentiment:r.sentiment})), actions:critical.length?['Validasi fakta lintas OPD.','Tetapkan juru bicara.','Siapkan holding statement dan Q&A.','Pantau eskalasi media.']:['Monitor perkembangan.','Siapkan konteks dan data pendukung.'], priority:critical.some(r=>String(r.risk_level).toLowerCase()==='critical')?'IMMEDIATE':critical.length?'HIGH':negative.length?'MEDIUM':'WATCH', active_alerts:alertCount };
}

async function ai(question:string, rows:Row[]) {
  const key=process.env.OPENAI_API_KEY;
  if(!key) return null;
  const model=process.env.OPENAI_MODEL||'gpt-5-mini';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:'Anda adalah Ask Intelligence untuk pemerintah daerah. Jawab hanya berdasarkan data yang diberikan. Jangan mengarang fakta. Pisahkan evidence dari rekomendasi. Output JSON: answer string, evidence array, actions array, priority one of WATCH/MEDIUM/HIGH/IMMEDIATE.'}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({question,signals:rows.slice(0,15)})}]}],text:{format:{type:'json_object'}},max_output_tokens:1000})});
  if(!response.ok) throw new Error(`AI provider HTTP ${response.status}`);
  const payload=await response.json() as any;
  const text=payload.output_text||payload.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
  if(!text) throw new Error('AI provider returned no text');
  return {mode:'ai',...JSON.parse(text)};
}

export async function registerAskIntelligence(app:FastifyInstance, pool:Pool, jwtSecret:string) {
  app.post('/api/ask',{preHandler:async(request:FastifyRequest,reply)=>{
    const token=request.cookies.access_token;
    if(!token) return reply.code(401).send({error:'UNAUTHENTICATED'});
    try { const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload; if(typeof d.sub!=='string'||!['admin','operator','viewer'].includes(String(d.role))) throw new Error('invalid'); request.user={id:d.sub,email:String(d.email),role:d.role as any,opdId:d.opdId?String(d.opdId):null}; } catch { return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'}); }
  }},async(request,reply)=>{
    const parsed=z.object({question:z.string().trim().min(3).max(1000),opdId:z.string().regex(/^\d+$/).optional()}).safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:'INVALID_REQUEST'});
    const user=request.user as User|undefined;
    const requested=parsed.data.opdId;
    const opdId=user?.role==='admin'?requested:(user?.opdId??null);
    const params:unknown[]=[]; const where:string[]=[];
    if(opdId){params.push(opdId);where.push(`a.opd_id=$${params.length}`);}
    params.push(30);
    const {rows}=await pool.query(`SELECT a.title,a.summary,a.published_at,a.sentiment,a.risk_level,a.risk_score,a.impact_score,a.importance_score,a.velocity_score,ms.name source_name,o.name opd_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.risk_score DESC,a.impact_score DESC,a.published_at DESC NULLS LAST LIMIT $${params.length}`,params);
    const alertsParams:unknown[]=[]; const alertWhere:string[]=[`aa.status IN ('open','acknowledged')`];
    if(opdId){alertsParams.push(opdId);alertWhere.push(`a.opd_id=$${alertsParams.length}`);}
    const alerts=await pool.query(`SELECT COUNT(*)::int count FROM article_alerts aa JOIN articles a ON a.id=aa.article_id WHERE ${alertWhere.join(' AND ')}`,alertsParams);
    const data=rows.map(r=>({...r,risk_score:Number(r.risk_score||0),impact_score:Number(r.impact_score||0),importance_score:Number(r.importance_score||0),velocity_score:Number(r.velocity_score||0})) as Row);
    try { return await ai(parsed.data.question,data) ?? fallback(parsed.data.question,data,Number(alerts.rows[0]?.count||0)); } catch { return {...fallback(parsed.data.question,data,Number(alerts.rows[0]?.count||0)),provider_error:true}; }
  });
}
