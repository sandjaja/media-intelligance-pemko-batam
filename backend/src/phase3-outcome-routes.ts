import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';
import { extractDynamicIssueClaims } from './issue-dynamic-claim-extractor.js';
import { matchDynamicOfficialResponseCoverage } from './issue-response-coverage.js';
import { canTransitionPhase3, type Phase3ActorRole, type Phase3WorkflowStatus } from './phase3-workflow-policy.js';
import { get, put, del } from '@vercel/blob';
import { Readable } from 'node:stream';

declare module 'fastify' { interface FastifyRequest { phase3OutcomeAuth?: AuthorizationContext } }

const idParam=z.object({id:z.string().regex(/^\d+$/)});
const publishInput=z.object({
  channel:z.enum(['website','instagram','facebook','tiktok','youtube','x','threads','press_release','media_statement','other']),
  url:z.string().url().max(2000).nullable().optional(),
  note:z.string().trim().max(4000).nullable().optional(),
}).superRefine((v,ctx)=>{
  if(v.channel==='website'&&!v.url)ctx.addIssue({code:z.ZodIssueCode.custom,path:['url'],message:'URL website wajib diisi'});
});
const closeInput=z.object({note:z.string().trim().min(3).max(4000)});
const publicationAnalysisInput=z.object({});
const publicationEvidenceQuery=z.object({channel:z.enum(['instagram','facebook','tiktok','youtube','x','threads','press_release','media_statement','other']).optional(),caption:z.string().max(4000).optional(),primary:z.enum(['true','false']).optional(),evidenceId:z.coerce.number().int().positive().optional(),fileOrder:z.coerce.number().int().min(1).max(3).optional()});
const safePublicationName=(name:string)=>String(name||'publication').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-140)||'publication';

function cleanPublicationHtml(html:string){
  const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
  return{title:title.slice(0,500),text:text.slice(0,24000)};
}
async function fetchWebsitePublication(rawUrl:string){
  const u=new URL(rawUrl);
  if(!['http:','https:'].includes(u.protocol))throw new Error('PUBLICATION_URL_PROTOCOL_NOT_ALLOWED');
  const host=u.hostname.toLowerCase();
  if(host==='localhost'||host==='0.0.0.0'||host==='127.0.0.1'||host==='::1'||host.endsWith('.local')||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host))throw new Error('PUBLICATION_URL_HOST_NOT_ALLOWED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    const r=await fetch(u.toString(),{signal:controller.signal,redirect:'follow',headers:{'user-agent':'MediaIntelligencePemkoBatam/1.0'}});
    if(!r.ok)throw new Error(`PUBLICATION_FETCH_HTTP_${r.status}`);
    const type=r.headers.get('content-type')||'';if(!type.includes('text/html'))throw new Error('PUBLICATION_NOT_HTML');
    const len=Number(r.headers.get('content-length')||0);if(len>2_000_000)throw new Error('PUBLICATION_TOO_LARGE');
    return cleanPublicationHtml((await r.text()).slice(0,2_000_000));
  }finally{clearTimeout(timer)}
}
async function analyzePublicationPackage(input:any,mediaParts:any[]=[]){
  const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('GEMINI_API_KEY_MISSING');
  const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
  const prompt=`Anda adalah analis komunikasi pemerintah daerah. Tugas Anda menilai apakah MATERI PUBLIKASI resmi benar-benar mengeksekusi INTI STRATEGI KOMUNIKASI (Strakom) yang sudah disetujui Humas.

PRINSIP WAJIB:
- Strakom Approved adalah SATU-SATUNYA baseline strategi. Jangan menggunakan Analisis Gap atau Klarifikasi/Respons OPD sebagai baseline tambahan; keduanya sudah dirangkum saat Strakom disusun.
- Pahami Strakom secara HOLISTIK lebih dahulu. Temukan maksud strategisnya: tujuan komunikasi, perubahan pemahaman yang ingin dicapai, audiens prioritas, pesan/framing yang paling penting, pendekatan/gaya yang diinginkan, kanal/format yang relevan, serta risiko komunikasi utama.
- JANGAN membandingkan setiap field Strakom satu per satu secara mekanis. Tidak semua unsur strategi harus tertulis literal dalam satu materi publikasi. Nilai substansi, fungsi, prioritas, dan konteksnya.
- Bedakan unsur ESENSIAL dari unsur PENDUKUNG. Kekurangan unsur pendukung tidak boleh otomatis membuat publikasi dianggap gagal.
- Bukti publikasi (website/PDF/gambar) adalah realisasi aktual. Jangan mengarang isi yang tidak terlihat/terbaca.
- Tahap ini menilai KUALITAS EKSEKUSI STRATEGI dalam publikasi, BUKAN dampak publik, perubahan opini, engagement, pickup media, atau keberhasilan monitoring.
- Kritik harus konkret dan proporsional. Rekomendasi harus menjelaskan apa yang perlu dipertahankan atau diperbaiki pada publikasi berikutnya.
- achieved hanya berisi PENCAPAIAN TUJUAN STRATEGIS: hasil komunikasi pada level konten yang memang ditargetkan Strakom dan telah diwujudkan publikasi.
- strengths hanya berisi KEKUATAN EKSEKUSI PUBLIKASI: kualitas framing, struktur, headline, kutipan, data, keterbacaan, konkretisasi manfaat, atau teknik penyampaian. JANGAN mengulang daftar achieved.
- gaps hanya berisi kekurangan eksekusi yang material terhadap inti Strakom, bukan daftar semua field yang tidak disebut.
- CLAIM_PERSISTENCE hanya boleh digunakan untuk claim/problem/gap lama yang memang ingin dikoreksi/diredam dan masih perlu dipantau setelah publikasi. Pesan resmi atau narasi yang INGIN diperkuat bukan CLAIM_PERSISTENCE; gunakan MESSAGE_PICKUP.
- MESSAGE_PICKUP digunakan untuk memantau apakah pesan/framing/fakta strategis yang sengaja dibawa publikasi kemudian muncul dalam evidence media.
- monitoringFocus HARUS dapat diverifikasi dari data/evidence yang benar-benar tersedia pada 4 sumber sistem: ONLINE, PRINT, SOCIAL, OWNED.
- Jangan membuat indikator berupa jumlah/tingkat share, retweet, repost, like, komentar, reach, impression, page view, kunjungan portal, atau metrik engagement lain kecuali metrik tersebut secara eksplisit tersedia pada input evidence.
- Jika metrik engagement tidak tersedia, ubah indikator menjadi sinyal yang dapat dibuktikan dari konten/evidence, misalnya kemunculan ulang pesan, pickup media, publikasi lanjutan, konsistensi framing, atau amplifikasi pesan resmi pada evidence baru.
- expectedSignal harus berupa kondisi yang dapat diuji oleh mesin monitoring terhadap evidence yang tersimpan, bukan target abstrak seperti "tingginya penyebaran".
- Jika tidak ada baseline claim/problem lama yang jelas dari Strakom, jangan membuat CLAIM_PERSISTENCE.
- coordinationRequirements dari Strakom adalah kebutuhan substansi/koordinasi untuk membuat komunikasi lengkap. Saat bukti publikasi belum memuat informasi yang dibutuhkan, nyatakan sebagai "belum tercantum/belum dapat diverifikasi dari bukti publikasi", BUKAN bahwa OPD/kecamatan belum bertindak.
- expectedCommunicationOutcomes adalah TARGET pemahaman/tindakan audiens. Analisa Publikasi hanya boleh menilai apakah konten menyediakan informasi/pesan yang mendukung target itu; jangan menyatakan outcome masyarakat sudah terjadi.
- Jika ada kebutuhan koordinasi/substansi yang belum terwakili di publikasi, masukkan coordinationFollowUp. Gunakan pihak yang sudah disebut Strakom; jangan membuat routing OPD/kecamatan baru.
- coordinationFollowUp.status hanya NONE, NEEDS_CONFIRMATION, NEEDS_COORDINATION, atau FOLLOWUP_PUBLICATION. Rekomendasi harus berupa tindak lanjut komunikasi/informasi, bukan perintah kebijakan operasional.

HASILKAN:
1. strategyEssence: sintesis singkat tentang inti Strakom, bukan salinan field.
2. executionAssessment: apakah publikasi secara substansi menjalankan inti tersebut; status ALIGNED|PARTIAL|MISALIGNED|INSUFFICIENT_EVIDENCE, disertai alasan.
3. achieved: unsur strategis penting yang sudah terealisasi dalam materi publikasi.
4. gaps: unsur penting yang seharusnya hadir/lebih kuat berdasarkan maksud Strakom tetapi belum cukup terealisasi. Jangan memasukkan detail minor.
5. communicationStyle: gaya komunikasi aktual publikasi dan kecocokannya dengan kebutuhan strategi.
6. strengths: kekuatan TEKNIK/EKSEKUSI publikasi yang membuat strategi tersampaikan; jangan mengulang achieved.
7. audienceAndMessage: apakah framing/pesan dapat dipahami oleh audiens yang dituju secara substantif.
8. improvements: perbaikan prioritas dan operasional untuk publikasi berikutnya; hindari saran generik.
9. coordinationFollowUp: tindak lanjut informasi/koordinasi hanya jika ada kebutuhan material dari Strakom yang belum terwakili pada bukti publikasi.
10. monitoringFocus: turunkan hanya hal yang memang perlu diamati SETELAH publikasi untuk mengetahui pickup/persistensi claim/sinyal baru/sentimen-risiko/amplifikasi. Gunakan evidence yang tersedia di sistem (ONLINE, PRINT, SOCIAL, OWNED), jangan mengandalkan komentar/share/engagement jika tidak tersedia.

Output JSON:
{"strategyEssence":{"summary":"...","essentialIntent":["..."],"priorityAudience":["..."],"coreMessage":["..."],"intendedApproach":"..."},"executionAssessment":{"status":"ALIGNED|PARTIAL|MISALIGNED|INSUFFICIENT_EVIDENCE","assessment":"..."},"achieved":["..."],"gaps":["..."],"communicationStyle":{"observed":"...","fitAssessment":"..."},"strengths":["..."],"audienceAndMessage":{"assessment":"...","potentialMisunderstanding":["..."]},"improvements":[{"priority":"HIGH|MEDIUM|LOW","recommendation":"...","reason":"..."}],"coordinationFollowUp":{"status":"NONE|NEEDS_CONFIRMATION|NEEDS_COORDINATION|FOLLOWUP_PUBLICATION","missingInformation":["..."],"parties":["..."],"recommendation":"...","reason":"..."},"monitoringFocus":[{"type":"MESSAGE_PICKUP|CLAIM_PERSISTENCE|NEW_CLAIM|SENTIMENT_RISK|OFFICIAL_AMPLIFICATION","target":"...","rationale":"...","expectedSignal":"...","sourceTypes":["ONLINE","PRINT","SOCIAL","OWNED"]}]}

DATA:
${JSON.stringify(input).slice(0,50000)}`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt},...mediaParts]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!r.ok)throw new Error(`Gemini HTTP ${r.status}`);
  const payload=await r.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');if(!raw)throw new Error('GEMINI_EMPTY_RESPONSE');
  return JSON.parse(raw);
}

async function analyzeMonitoringAgainstPublication(input:any){
  const key=process.env.GEMINI_API_KEY;if(!key)throw new Error('GEMINI_API_KEY_MISSING');
  const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
  const prompt=`Anda adalah evaluator monitoring pascapublikasi pemerintah daerah. Bandingkan Fokus Monitoring yang ditetapkan saat Analisa Publikasi dengan evidence 4 media yang benar-benar tersedia SETELAH publikasi. Jangan mengarang isi evidence dan jangan menyimpulkan efektivitas keseluruhan bila evidence belum cukup.

ATURAN PENILAIAN:
- Status per fokus menunjukkan apakah SINYAL ditemukan pada evidence, bukan otomatis berarti respons komunikasi efektif secara keseluruhan.
- Jika hanya satu/sangat sedikit evidence atau hanya satu kanal terwakili, evidenceSufficiency harus LIMITED/INSUFFICIENT dan overallAssessment wajib menyebut bahwa efektivitas keseluruhan belum dapat disimpulkan.
- Untuk MESSAGE_PICKUP: PROVEN hanya bila pesan/inti respons jelas muncul pada evidence.
- Untuk OFFICIAL_AMPLIFICATION: nilai sebagai pickup/amplifikasi PESAN RESMI oleh media/kanal. Kutipan pernyataan resmi di media eksternal boleh menjadi sinyal pickup, tetapi jangan menyebutnya amplifikasi kanal resmi milik Pemko.
- Untuk SENTIMENT_RISK: jangan menyatakan perbaikan/penurunan sentimen atau risiko hanya karena satu evidence bernada positif. Bandingkan dengan baseline bila tersedia; bila evidence tidak cukup untuk tren, gunakan PARTIAL atau INSUFFICIENT_DATA dan jelaskan sinyal yang ditemukan.
- CLAIM_PERSISTENCE dan NEW_CLAIM harus menunjuk claim konkret dalam evidence.
- Nilai HANYA konten evidence yang diberikan. Jangan meminta atau menyimpulkan komentar, share/repost, engagement, atau reaksi audiens yang tidak ada.
- Perlakukan sourceType sebagai identitas sumber yang otoritatif: online=Media Online, print=Media Cetak, social=Media Sosial, owned=Owned Channel. Jangan mengubah atau menebak bentuk sumber (misalnya menyebut print sebagai screenshot/kanal pemerintah) kecuali metadata/konten evidence secara eksplisit menyatakannya.
- evidenceRefs wajib mempertahankan sourceType:id yang diberikan.

Untuk SETIAP monitoringFocus beri:
status: PROVEN|PARTIAL|NOT_PROVEN|INSUFFICIENT_DATA
assessment: alasan singkat berbasis evidence
evidenceRefs: referensi source:id
signal: sinyal konkret yang terlihat

overallAssessment harus menjadi KESIMPULAN SEMENTARA yang ringkas dan operasional: apa yang ditemukan, apa yang belum dapat disimpulkan, kanal apa yang belum terwakili, dan apakah evidence masih perlu ditambah.
Output JSON {"focusResults":[{"type":"...","target":"...","status":"PROVEN|PARTIAL|NOT_PROVEN|INSUFFICIENT_DATA","assessment":"...","evidenceRefs":["print:38"],"signal":"..."}],"overallAssessment":"...","evidenceSufficiency":"SUFFICIENT|LIMITED|INSUFFICIENT","remainingGap":["..."],"newSignals":["..."]}.

DATA:
${JSON.stringify(input).slice(0,50000)}`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!r.ok)throw new Error(`Gemini HTTP ${r.status}`);
  const payload=await r.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');if(!raw)throw new Error('GEMINI_EMPTY_RESPONSE');
  return JSON.parse(raw);
}

export async function registerPhase3OutcomeRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  try{app.addContentTypeParser(['image/jpeg','image/png','application/pdf'],{parseAs:'buffer',bodyLimit:8_000_000},(_req,body,done)=>done(null,body));}catch{}
  const auth=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const ctx=await loadAuthorizationContext(pool,d.sub);
      if(!ctx?.active)return reply.code(401).send({error:'USER_INACTIVE_OR_MISSING'});
      request.phase3OutcomeAuth=ctx;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const actorRole=(ctx:AuthorizationContext):Phase3ActorRole=>{
    for(const role of ['super_admin','humas','opd','district','executive','viewer'] as Phase3ActorRole[])if(ctx.roles.includes(role))return role;
    return 'viewer';
  };
  const isGlobalReader=(ctx:AuthorizationContext)=>ctx.roles.some(r=>['super_admin','humas','executive','viewer'].includes(r));
  const canSeeOutcome=async(ctx:AuthorizationContext,w:any)=>{
    if(isGlobalReader(ctx))return true;
    if(ctx.roles.includes('district')&&ctx.districtId){
      const visible=await pool.query(`SELECT 1 FROM issues i WHERE i.id=$1 AND ((i.geographic_scope='CITYWIDE' OR (i.geographic_scope='DISTRICTS' AND EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$2))) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=$3 AND c.contributor_type='DISTRICT' AND c.district_id=$2)) LIMIT 1`,[w.issue_id,ctx.districtId,w.id]);
      return Boolean(visible.rows[0]);
    }
    if(ctx.roles.includes('opd')&&ctx.opdId){
      if(String(w.lead_opd_id)===String(ctx.opdId))return true;
      const supporting=await pool.query(`SELECT 1 FROM issue_workflow_contributors WHERE workflow_id=$1 AND contributor_type='OPD' AND opd_id=$2 LIMIT 1`,[w.id,ctx.opdId]);
      return Boolean(supporting.rows[0]);
    }
    return false;
  };
  const isManager=(ctx:AuthorizationContext)=>ctx.roles.includes('super_admin')||ctx.roles.includes('humas');
  const workflow=async(issueId:string)=>{
    const {rows}=await pool.query(`SELECT w.*,i.title,i.description,i.status analytical_status,i.risk_level,i.momentum,o.name lead_opd_name FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN opd o ON o.id=w.lead_opd_id WHERE w.issue_id=$1 ORDER BY w.cycle_number DESC,w.id DESC LIMIT 1`,[issueId]);
    return rows[0]||null;
  };
  const event=async(workflowId:string|number,issueId:string|number,ctx:AuthorizationContext,type:string,fromStatus:string,toStatus:string,note?:string|null,metadata:any={})=>pool.query(`INSERT INTO issue_workflow_events(workflow_id,issue_id,actor_user_id,actor_role,event_type,from_status,to_status,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[workflowId,issueId,ctx.id,actorRole(ctx),type,fromStatus,toStatus,note||null,JSON.stringify(metadata||{})]);

  app.post('/api/phase3/issues/:id/publication-evidence/save',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(w.publication_evidence_saved_at)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_ALREADY_SAVED'});
    const count=Number((await pool.query('SELECT count(*) n FROM issue_publication_evidence WHERE workflow_id=$1',[w.id])).rows[0]?.n||0);if(!count)return reply.code(400).send({error:'PUBLICATION_EVIDENCE_REQUIRED'});
    await pool.query('UPDATE issue_workflows SET publication_evidence_saved_at=now(),publication_evidence_saved_by=$2,updated_at=now() WHERE id=$1 AND publication_evidence_saved_at IS NULL',[w.id,ctx.id]);return{data:{saved:true,count}};
  });
  app.get('/api/phase3/issues/:id/publication-evidence',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(!(await canSeeOutcome(request.phase3OutcomeAuth!,w)))return reply.code(403).send({error:'FORBIDDEN'});
    const saved=Boolean(w.publication_evidence_saved_at);return{saved,saved_at:w.publication_evidence_saved_at||null,data:(await pool.query(`SELECT e.id,e.evidence_type,e.channel,e.url,e.file_name,e.mime_type,e.caption,e.is_primary,e.created_at,
 COALESCE((SELECT json_agg(json_build_object('id',f.id,'file_name',f.file_name,'mime_type',f.mime_type,'file_order',f.file_order) ORDER BY f.file_order,f.id) FROM issue_publication_evidence_files f WHERE f.evidence_id=e.id),'[]'::json) files
 FROM issue_publication_evidence e WHERE e.workflow_id=$1 ORDER BY e.is_primary DESC,e.created_at,e.id`,[w.id])).rows};
  });
  app.post('/api/phase3/issues/:id/publication-evidence/website',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=z.object({url:z.string().url().max(2000),caption:z.string().max(4000).nullable().optional(),primary:z.boolean().optional()}).safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_PUBLICATION_EVIDENCE'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(w?.publication_evidence_saved_at)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_LOCKED'});const count=Number((await pool.query('SELECT count(*) n FROM issue_publication_evidence WHERE workflow_id=$1',[w.id])).rows[0]?.n||0);if(count>=5)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_LIMIT'});
    if(b.data.primary)await pool.query('UPDATE issue_publication_evidence SET is_primary=false WHERE workflow_id=$1',[w.id]);const row=(await pool.query(`INSERT INTO issue_publication_evidence(workflow_id,issue_id,evidence_type,channel,url,caption,is_primary,created_by) VALUES($1,$2,'WEBSITE','website',$3,$4,$5,$6) RETURNING id,evidence_type,channel,url,file_name,mime_type,caption,is_primary,created_at`,[w.id,p.data.id,b.data.url,b.data.caption||null,!!b.data.primary,ctx.id])).rows[0];return reply.code(201).send({data:row});
  });
  app.post('/api/phase3/issues/:id/publication-evidence/file',{preHandler:auth,bodyLimit:8_000_000},async(request,reply)=>{
    const p=idParam.safeParse(request.params),q=publicationEvidenceQuery.safeParse(request.query);if(!p.success||!q.success)return reply.code(400).send({error:'INVALID_PUBLICATION_EVIDENCE'});const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(w?.publication_evidence_saved_at)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_LOCKED'});
    const mime=String(request.headers['content-type']||'').split(';')[0].trim();if(!['application/pdf','image/jpeg','image/png'].includes(mime))return reply.code(415).send({error:'UNSUPPORTED_PUBLICATION_EVIDENCE'});const body=request.body as Buffer;if(!Buffer.isBuffer(body)||!body.length)return reply.code(400).send({error:'EMPTY_PUBLICATION_EVIDENCE'});if(body.length>8_000_000)return reply.code(413).send({error:'PUBLICATION_EVIDENCE_TOO_LARGE'});
    const type=mime==='application/pdf'?'PDF':'IMAGE',name=safePublicationName(String(request.headers['x-file-name']||`publication-${Date.now()}`));let evidenceId=q.data.evidenceId||null;
    if(evidenceId){const e=(await pool.query('SELECT id,evidence_type FROM issue_publication_evidence WHERE id=$1 AND workflow_id=$2',[evidenceId,w.id])).rows[0];if(!e||e.evidence_type!==type)return reply.code(400).send({error:'PUBLICATION_EVIDENCE_GROUP_MISMATCH'});const n=Number((await pool.query('SELECT count(*) n FROM issue_publication_evidence_files WHERE evidence_id=$1',[evidenceId])).rows[0]?.n||0);if(n>=3)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_FILE_LIMIT'});}
    else{const count=Number((await pool.query('SELECT count(*) n FROM issue_publication_evidence WHERE workflow_id=$1',[w.id])).rows[0]?.n||0);if(count>=5)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_LIMIT'});}
    let blob:any;try{blob=await put(`phase3-publication/${p.data.id}/${Date.now()}-${name}`,body,{access:'private',contentType:mime,addRandomSuffix:true});}catch(e){request.log.error(e);return reply.code(503).send({error:'PUBLICATION_STORAGE_UNAVAILABLE'});}
    const c=await pool.connect();try{await c.query('BEGIN');if(!evidenceId){const primary=q.data.primary==='true';if(primary)await c.query('UPDATE issue_publication_evidence SET is_primary=false WHERE workflow_id=$1',[w.id]);const e=(await c.query(`INSERT INTO issue_publication_evidence(workflow_id,issue_id,evidence_type,channel,caption,is_primary,created_by) VALUES($7,$1,$2,$3,$4,$5,$6) RETURNING id`,[p.data.id,type,q.data.channel||null,q.data.caption||null,primary,ctx.id,w.id])).rows[0];evidenceId=e.id;}const order=q.data.fileOrder||Number((await c.query('SELECT count(*) n FROM issue_publication_evidence_files WHERE evidence_id=$1',[evidenceId])).rows[0]?.n||0)+1;await c.query(`INSERT INTO issue_publication_evidence_files(evidence_id,storage_key,file_name,mime_type,file_order) VALUES($1,$2,$3,$4,$5)`,[evidenceId,blob.pathname,name,mime,order]);await c.query('COMMIT');return reply.code(201).send({data:{id:evidenceId,evidence_type:type,channel:q.data.channel||null,caption:q.data.caption||null,file_name:name,mime_type:mime,file_order:order}});}catch(e){await c.query('ROLLBACK');try{await del(blob.pathname)}catch{}throw e}finally{c.release()}
  });

  app.get('/api/phase3/publication-evidence/:evidenceId/file',{preHandler:auth},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).evidenceId);if(!id.success)return reply.code(400).send({error:'INVALID_EVIDENCE_ID'});const row=(await pool.query('SELECT * FROM issue_publication_evidence WHERE id=$1',[id.data])).rows[0];if(!row?.storage_key)return reply.code(404).send({error:'PUBLICATION_EVIDENCE_NOT_FOUND'});const w=await workflow(String(row.issue_id));if(!w||!(await canSeeOutcome(request.phase3OutcomeAuth!,w)))return reply.code(403).send({error:'FORBIDDEN'});
    try{const result=await get(row.storage_key,{access:'private'});if(!result)return reply.code(404).send({error:'PUBLICATION_EVIDENCE_NOT_FOUND'});reply.header('Content-Type',result.blob.contentType||row.mime_type||'application/octet-stream');reply.header('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(row.file_name||'publication')}`);return reply.send(Readable.fromWeb(result.stream as any));}catch(e){request.log.error(e);return reply.code(503).send({error:'PUBLICATION_STORAGE_UNAVAILABLE'});}
  });
  app.delete('/api/phase3/issues/:id/publication-evidence/:evidenceId',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),eid=z.coerce.number().int().positive().safeParse((request.params as any).evidenceId);if(!p.success||!eid.success)return reply.code(400).send({error:'INVALID_EVIDENCE_ID'});if(!isManager(request.phase3OutcomeAuth!))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(w?.publication_evidence_saved_at)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_LOCKED'});const files=(await pool.query('SELECT storage_key FROM issue_publication_evidence_files WHERE evidence_id=$1',[eid.data])).rows.map(x=>x.storage_key).filter(Boolean);const row=(await pool.query('DELETE FROM issue_publication_evidence WHERE id=$1 AND workflow_id=$2 RETURNING storage_key',[eid.data,w.id])).rows[0];if(!row)return reply.code(404).send({error:'PUBLICATION_EVIDENCE_NOT_FOUND'});const keys=[...files,row.storage_key].filter(Boolean);if(keys.length)try{await del(keys)}catch(e){request.log.warn(e,'failed to delete publication blobs')};return{ok:true};
  });

  app.post('/api/phase3/issues/:id/gap/proceed-assignment',{preHandler:auth},async(request,reply)=>{const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(w.workflow_status!=='NEW')return reply.code(409).send({error:'GAP_DECISION_NOT_AVAILABLE',status:w.workflow_status});const gap=Boolean((await pool.query('SELECT 1 FROM issue_communication_gap_snapshots WHERE workflow_id=$1 LIMIT 1',[w.id])).rows[0]);if(!gap)return reply.code(409).send({error:'COMMUNICATION_GAP_REQUIRED'});const exists=Boolean((await pool.query("SELECT 1 FROM issue_workflow_events WHERE workflow_id=$1 AND event_type='GAP_ASSIGNMENT_APPROVED' LIMIT 1",[w.id])).rows[0]);if(!exists)await event(w.id,p.data.id,ctx,'GAP_ASSIGNMENT_APPROVED','NEW','NEW',null,{decision:'PROCEED_ASSIGNMENT'});return{data:{workflowId:w.id,issueId:w.issue_id,cycleNumber:w.cycle_number,workflowStatus:'NEW',nextStage:'ASSIGNMENT'}};});

app.post('/api/phase3/issues/:id/gap/no-assignment',{preHandler:auth},async(request,reply)=>{const p=idParam.safeParse(request.params),b=z.object({reason:z.string().trim().min(5).max(4000)}).safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'NO_ASSIGNMENT_REASON_REQUIRED'});const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(w.workflow_status!=='NEW')return reply.code(409).send({error:'GAP_DECISION_NOT_AVAILABLE',status:w.workflow_status});const gap=Boolean((await pool.query('SELECT 1 FROM issue_communication_gap_snapshots WHERE workflow_id=$1 LIMIT 1',[w.id])).rows[0]);if(!gap)return reply.code(409).send({error:'COMMUNICATION_GAP_REQUIRED'});await pool.query(`UPDATE issue_workflows SET workflow_status='STRATEGY',closed_at=NULL,updated_by=$1,updated_at=NOW() WHERE id=$2`,[ctx.id,w.id]);await event(w.id,p.data.id,ctx,'GAP_NO_ASSIGNMENT','NEW','STRATEGY',b.data.reason,{decision:'NO_ASSIGNMENT',nextStage:'STRATEGY'});return{data:{workflowId:w.id,issueId:w.issue_id,cycleNumber:w.cycle_number,workflowStatus:'STRATEGY',nextStage:'STRATEGY',reason:b.data.reason}};});

app.get('/api/phase3/issues/:id/workflows/:workflowId/report',{preHandler:auth},async(request,reply)=>{const p=z.object({id:z.string().regex(/^\d+$/),workflowId:z.string().regex(/^\d+$/)}).safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_WORKFLOW_ID'});const wf=(await pool.query(`SELECT w.*,i.title,i.description,i.risk_level,i.momentum,i.geographic_scope,t.name taxonomy_name,o.name lead_opd_name,im.risk_score issue_risk_score FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN taxonomy_categories t ON t.id=i.taxonomy_category_id LEFT JOIN opd o ON o.id=w.lead_opd_id LEFT JOIN LATERAL (SELECT m.risk_score FROM issue_metrics m WHERE m.issue_id=i.id AND m.measured_at<=COALESCE(w.closed_at,w.updated_at,NOW()) ORDER BY m.measured_at DESC,m.id DESC LIMIT 1) im ON true WHERE w.id=$1 AND w.issue_id=$2`,[p.data.workflowId,p.data.id])).rows[0];if(!wf)return reply.code(404).send({error:'WORKFLOW_NOT_FOUND'});if(!(await canSeeOutcome(request.phase3OutcomeAuth!,wf)))return reply.code(403).send({error:'FORBIDDEN'});if(wf.workflow_status!=='CLOSED')return reply.code(409).send({error:'WORKFLOW_NOT_CLOSED'});const [gap,response,publication,monitoring,events,keywords,opds,districts]=await Promise.all([
pool.query('SELECT result,analyzed_at FROM issue_communication_gap_snapshots WHERE workflow_id=$1',[wf.id]),
pool.query(`SELECT s.*,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.workflow_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.updated_at DESC LIMIT 1`,[wf.id]),
pool.query('SELECT result,source,gap_analyzed_at,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[wf.id]),
pool.query('SELECT period_number,result,evidence_summary,period_started_at,period_ended_at,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 ORDER BY period_number DESC LIMIT 1',[wf.id]),
pool.query(`SELECT event_type,created_at,note,metadata FROM issue_workflow_events WHERE workflow_id=$1 AND event_type IN ('GAP_NO_ASSIGNMENT','ISSUE_ASSIGNED','RESPONSE_APPROVED','RESPONSE_PUBLISHED','MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at`,[wf.id]),
pool.query(`SELECT ik.keyword_role,k.keyword FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=$1 ORDER BY CASE ik.keyword_role WHEN 'PRIMARY' THEN 0 ELSE 1 END,ik.id`,[wf.issue_id]),
pool.query(`SELECT io.responsibility,o.name FROM issue_opd io JOIN opd o ON o.id=io.opd_id WHERE io.issue_id=$1 ORDER BY CASE io.responsibility WHEN 'leading' THEN 0 ELSE 1 END,o.name`,[wf.issue_id]),
pool.query(`SELECT d.name FROM issue_districts x JOIN districts d ON d.id=x.district_id WHERE x.issue_id=$1 ORDER BY d.name`,[wf.issue_id])
]);const snap=gap.rows[0]?.result||{},sd=snap.data||snap,ctxData=sd.issueContext||{},sk=ctxData.keywords||ctxData,sopd=ctxData.opds||{};const fallbackKeywords:any[]=[];const pk=sk.primaryKeyword||sk.primary;if(pk?.keyword||pk?.name)fallbackKeywords.push({keyword_role:'PRIMARY',keyword:pk.keyword||pk.name});for(const k of (sk.supportingKeywords||sk.supporting||[]))fallbackKeywords.push({keyword_role:'SUPPORTING',keyword:k.keyword||k.name||String(k)});const fallbackOpds:any[]=[];if(sopd.primary?.name)fallbackOpds.push({responsibility:'leading',name:sopd.primary.name});for(const o of (sopd.supporting||[]))if(o?.name)fallbackOpds.push({responsibility:'supporting',name:o.name});return{data:{workflow:wf,gap:gap.rows[0]||null,response:response.rows[0]||null,publication:publication.rows[0]||null,monitoring:monitoring.rows[0]||null,events:events.rows,keywords:keywords.rows.length?keywords.rows:fallbackKeywords,opds:opds.rows.length?opds.rows:fallbackOpds,districts:districts.rows}};});

  app.get('/api/phase3/outcomes',{preHandler:auth},async(request)=>{
    const ctx=request.phase3OutcomeAuth!;
    const global=isGlobalReader(ctx);
    const params:any[]=[];let scope='';
    if(!global&&ctx.roles.includes('district')){
      if(!ctx.districtId)return{data:[]};
      params.push(ctx.districtId);scope=`AND ((i.geographic_scope='CITYWIDE' OR (i.geographic_scope='DISTRICTS' AND EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=$1))) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='DISTRICT' AND c.district_id=$1))`;
    }else if(!global&&ctx.roles.includes('opd')){
      if(!ctx.opdId)return{data:[]};
      params.push(ctx.opdId);scope=`AND (w.lead_opd_id=$1 OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=$1))`;
    }else if(!global)return{data:[]};
    const {rows}=await pool.query(`SELECT w.id workflow_id,w.issue_id,w.cycle_number,w.workflow_status,w.lead_opd_id,w.approved_at,w.published_at,w.closed_at,w.updated_at,i.title,i.description,i.risk_level,i.momentum,i.geographic_scope,t.name taxonomy_name,COALESCE(o.name,(SELECT io_opd.name FROM issue_opd io JOIN opd io_opd ON io_opd.id=io.opd_id WHERE io.issue_id=i.id AND io.responsibility='leading' ORDER BY io.id LIMIT 1)) lead_opd_name,(SELECT cs.approved_at FROM communication_strategies cs WHERE cs.workflow_id=w.id AND cs.status='APPROVED' AND cs.is_current=TRUE ORDER BY cs.version DESC LIMIT 1) strategy_approved_at,
      im.risk_score issue_risk_score,im.positive_count issue_positive_count,im.neutral_count issue_neutral_count,im.negative_count issue_negative_count,im.metadata issue_metric_metadata,
      (SELECT json_build_object('id',k.id,'keyword',k.keyword) FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=i.id AND ik.keyword_role='PRIMARY' ORDER BY ik.id LIMIT 1) primary_keyword,
      COALESCE((SELECT json_agg(json_build_object('id',k.id,'keyword',k.keyword) ORDER BY ik.id) FROM issue_keywords ik JOIN keywords k ON k.id=ik.keyword_id WHERE ik.issue_id=i.id AND ik.keyword_role='SUPPORTING'),'[]'::json) supporting_keywords,
      COALESCE((SELECT json_agg(json_build_object('id',so.id,'name',so.name) ORDER BY so.name) FROM issue_workflow_contributors c JOIN opd so ON so.id=c.opd_id WHERE c.workflow_id=w.id AND c.contributor_type='OPD'),'[]'::json) supporting_opds,
      COALESCE((SELECT json_agg(json_build_object('id',d.id,'name',d.name) ORDER BY d.name) FROM issue_districts idt JOIN districts d ON d.id=idt.district_id WHERE idt.issue_id=i.id),'[]'::json) districts,
      (SELECT e.metadata FROM issue_workflow_events e WHERE e.workflow_id=w.id AND e.event_type='RESPONSE_PUBLISHED' ORDER BY e.created_at DESC LIMIT 1) publication,
      (SELECT e.note FROM issue_workflow_events e WHERE e.workflow_id=w.id AND e.event_type='ISSUE_CLOSED' ORDER BY e.created_at DESC LIMIT 1) close_note
      FROM issue_workflows w JOIN issues i ON i.id=w.issue_id LEFT JOIN taxonomy_categories t ON t.id=i.taxonomy_category_id LEFT JOIN opd o ON o.id=w.lead_opd_id LEFT JOIN LATERAL (SELECT m.risk_score,m.positive_count,m.neutral_count,m.negative_count,m.metadata FROM issue_metrics m WHERE m.issue_id=i.id ORDER BY m.measured_at DESC,m.id DESC LIMIT 1) im ON true
      WHERE w.workflow_status IN ('APPROVED','STRATEGY','PUBLISHED','MONITORING','CLOSED') ${scope}
      ORDER BY CASE w.workflow_status WHEN 'APPROVED' THEN 0 WHEN 'STRATEGY' THEN 1 WHEN 'PUBLISHED' THEN 2 WHEN 'MONITORING' THEN 2 ELSE 3 END,w.updated_at DESC`,params);
    return{data:rows};
  });

  app.post('/api/phase3/issues/:id/publish',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=publishInput.safeParse(request.body);
    if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_PUBLICATION'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'PUBLISHED',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'PUBLISHED'});
    const approvedStrategy=(await pool.query("SELECT id,version FROM communication_strategies WHERE workflow_id=$1 AND status='APPROVED' AND is_current=TRUE ORDER BY version DESC LIMIT 1",[w.id])).rows[0]||null;if(!approvedStrategy)return reply.code(409).send({error:'APPROVED_COMMUNICATION_STRATEGY_REQUIRED'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='PUBLISHED',published_at=NOW(),updated_by=$1,updated_at=NOW() WHERE id=$2`,[ctx.id,w.id]);
    await event(w.id,p.data.id,ctx,'RESPONSE_PUBLISHED',w.workflow_status,'PUBLISHED',b.data.note??null,{channel:b.data.channel,url:b.data.url??null,strategyId:Number(approvedStrategy.id),strategyVersion:Number(approvedStrategy.version)});
    return{data:await workflow(p.data.id)};
  });

  app.post('/api/phase3/issues/:id/publication-analysis',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=publicationAnalysisInput.safeParse(request.body||{});if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_PUBLICATION_ANALYSIS'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(!['PUBLISHED','MONITORING','CLOSED'].includes(String(w.workflow_status)))return reply.code(409).send({error:'PUBLICATION_NOT_AVAILABLE'});if(!w.publication_evidence_saved_at)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_NOT_SAVED'});
    const evidence=(await pool.query(`SELECT e.* FROM issue_publication_evidence e WHERE e.workflow_id=$1 ORDER BY e.is_primary DESC,e.created_at,e.id`,[w.id])).rows;if(!evidence.length)return reply.code(409).send({error:'PUBLICATION_EVIDENCE_REQUIRED'});
    const approvedStrategy=(await pool.query(`SELECT id,version,executive_summary,communication_objectives,target_audiences,key_messages,talking_points,channel_strategy,timing_strategy,spokesperson_strategy,content_formats,communication_risks,coordination_requirements,expected_communication_outcomes,success_kpis,approved_at FROM communication_strategies WHERE workflow_id=$1 AND status='APPROVED' AND is_current=TRUE ORDER BY version DESC LIMIT 1`,[w.id])).rows[0]||null;
    if(!approvedStrategy)return reply.code(409).send({error:'APPROVED_COMMUNICATION_STRATEGY_REQUIRED'});
    try{
      const materials:any[]=[],mediaParts:any[]=[];
      for(const e of evidence){
        if(e.evidence_type==='WEBSITE'&&e.url){const article=await fetchWebsitePublication(String(e.url));materials.push({id:e.id,type:'WEBSITE',channel:e.channel,url:e.url,caption:e.caption,title:article.title,text:article.text});continue}
        const files=(await pool.query('SELECT id,storage_key,file_name,mime_type,file_order FROM issue_publication_evidence_files WHERE evidence_id=$1 ORDER BY file_order,id',[e.id])).rows;const fileMeta:any[]=[];
        for(const file of files){const result=await get(file.storage_key,{access:'private'});if(!result)throw new Error('PUBLICATION_EVIDENCE_FILE_NOT_FOUND');const chunks:any[]=[];for await(const chunk of Readable.fromWeb(result.stream as any))chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));const buf=Buffer.concat(chunks);if(buf.length>8_000_000)throw new Error('PUBLICATION_EVIDENCE_TOO_LARGE');mediaParts.push({inlineData:{mimeType:file.mime_type,data:buf.toString('base64')}});fileMeta.push({id:file.id,file_name:file.file_name,mime_type:file.mime_type,file_order:file.file_order});}
        materials.push({id:e.id,type:e.evidence_type,channel:e.channel,caption:e.caption,files:fileMeta});
      }
      const existing=(await pool.query('SELECT result,source,gap_analyzed_at,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[w.id])).rows[0]||null;
      // Smoke-test mode: allow Humas to re-run publication analysis while the cycle is still PUBLISHED.
      // Existing snapshots are replaced only after a successful analysis; MONITORING/CLOSED remain immutable.
      const smokeRetest=Boolean(existing&&String(w.workflow_status)==='PUBLISHED');
      if(existing&&!smokeRetest)return{data:{source:existing.source,gapAnalyzedAt:existing.gap_analyzed_at,analysis:existing.result,analyzedAt:existing.analyzed_at,saved:true}};
      const analysis=await analyzePublicationPackage({issueTitle:String(w.title||''),approvedStrategy,publicationEvidence:materials},mediaParts);
      const source={type:'strategy-vs-publication',strategyId:Number(approvedStrategy.id),strategyVersion:Number(approvedStrategy.version),evidenceCount:evidence.length,saved_at:w.publication_evidence_saved_at};
      const saved=(await pool.query(`INSERT INTO issue_publication_analysis_snapshots(workflow_id,issue_id,result,source,gap_analyzed_at,analyzed_by) VALUES($6,$1,$2::jsonb,$3::jsonb,$4,$5) ON CONFLICT(workflow_id) DO UPDATE SET result=EXCLUDED.result,source=EXCLUDED.source,gap_analyzed_at=EXCLUDED.gap_analyzed_at,analyzed_by=EXCLUDED.analyzed_by,analyzed_at=NOW() WHERE issue_publication_analysis_snapshots.workflow_id=EXCLUDED.workflow_id AND $7::boolean RETURNING analyzed_at`,[p.data.id,JSON.stringify(analysis),JSON.stringify(source),approvedStrategy?.approved_at||null,ctx.id,w.id,smokeRetest])).rows[0];
      if(!saved){const concurrent=(await pool.query('SELECT result,source,gap_analyzed_at,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[w.id])).rows[0];return{data:{source:concurrent.source,gapAnalyzedAt:concurrent.gap_analyzed_at,analysis:concurrent.result,analyzedAt:concurrent.analyzed_at,saved:true}}}
      return{data:{source,gapAnalyzedAt:approvedStrategy?.approved_at||null,analysis,analyzedAt:saved.analyzed_at,saved:true}};
    }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,240);request.log.warn({issueId:p.data.id,reason},'publication analysis failed');return reply.code(422).send({error:'PUBLICATION_ANALYSIS_FAILED',reason});}
  });

  app.post('/api/phase3/issues/:id/monitor',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'MONITORING',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'MONITORING'});const publicationAnalysis=(await pool.query('SELECT 1 FROM issue_publication_analysis_snapshots WHERE workflow_id=$1 LIMIT 1',[w.id])).rows[0];if(!publicationAnalysis)return reply.code(409).send({error:'PUBLICATION_ANALYSIS_REQUIRED'});const previous=Number((await pool.query(`SELECT count(*) n FROM issue_workflow_events WHERE workflow_id=$1 AND event_type='MONITORING_STARTED'`,[w.id])).rows[0]?.n||0);if(previous>0)return reply.code(409).send({error:'MONITORING_ALREADY_STARTED'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='MONITORING',closed_at=NULL,updated_by=$1,updated_at=NOW() WHERE id=$2`,[ctx.id,w.id]);
    await event(w.id,p.data.id,ctx,'MONITORING_STARTED',w.workflow_status,'MONITORING');
    return{data:await workflow(p.data.id)};
  });

  app.get('/api/phase3/issues/:id/monitoring-periods',{preHandler:auth},async(request,reply)=>{const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});const ctx=request.phase3OutcomeAuth!;if(!(await canSeeOutcome(ctx,w)))return reply.code(403).send({error:'FORBIDDEN'});const {rows}=await pool.query(`SELECT event_type,created_at,note,metadata FROM issue_workflow_events WHERE workflow_id=$1 AND event_type IN ('RESPONSE_PUBLISHED','MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC,id ASC`,[w.id]);const periods:any[]=[];let publishedAt:any=null;for(const e of rows){if(e.event_type==='RESPONSE_PUBLISHED')publishedAt=e.created_at;else if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:publishedAt||e.created_at,monitoring_started_at:e.created_at,ended_at:null,status:'MONITORING',close_note:null});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open){open.ended_at=e.created_at;open.status='CLOSED';open.close_note=e.note||null}}}return{data:periods.reverse()};});

  app.get('/api/phase3/issues/:id/monitoring-periods/:period/gap',{preHandler:auth},async(request,reply)=>{
    const parsed=z.object({id:z.string().regex(/^\d+$/),period:z.string().regex(/^\d+$/)}).safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_MONITORING_PERIOD'});
    const ctx=request.phase3OutcomeAuth!,issueId=parsed.data.id,periodNo=Number(parsed.data.period);
    const w=await workflow(issueId);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    if(!(await canSeeOutcome(ctx,w)))return reply.code(403).send({error:'FORBIDDEN'});
    const events=(await pool.query(`SELECT event_type,created_at,note FROM issue_workflow_events WHERE workflow_id=$1 AND event_type IN ('RESPONSE_PUBLISHED','MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC,id ASC`,[w.id])).rows;
    const periods:any[]=[];let publishedAt:any=null;for(const e of events){if(e.event_type==='RESPONSE_PUBLISHED')publishedAt=e.created_at;else if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:publishedAt||e.created_at,monitoring_started_at:e.created_at,ended_at:null,status:'MONITORING',close_note:null});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open){open.ended_at=e.created_at;open.status='CLOSED';open.close_note=e.note||null}}}
    const period=periods.find(x=>x.number===periodNo);if(!period)return reply.code(404).send({error:'MONITORING_PERIOD_NOT_FOUND'});
    const end=period.ended_at||new Date();
    const online=(await pool.query(`SELECT a.id,a.title,a.published_at,a.summary,a.content FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=$1 AND a.published_at >= $2 AND a.published_at <= $3 ORDER BY a.published_at ASC`,[issueId,period.started_at,end])).rows;
    const print=(await pool.query(`SELECT pa.id,pa.title,pe.edition_date published_at,pa.created_at ingested_at,ipa.created_at linked_at,ipa.decided_at FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id JOIN print_editions pe ON pe.id=pa.edition_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked' AND pe.edition_date >= $2::date AND pe.edition_date <= $3::date ORDER BY pe.edition_date ASC,pa.id ASC`,[issueId,period.started_at,end])).rows;
    const social=(await pool.query(`SELECT sm.id,sm.title,sm.published_at,sm.source_kind,sm.content FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id WHERE smi.issue_id=$1 AND sm.published_at >= $2 AND sm.published_at <= $3 ORDER BY sm.published_at ASC`,[issueId,period.started_at,end])).rows;
    const externalSocial=social.filter((x:any)=>x.source_kind==='external'),owned=social.filter((x:any)=>x.source_kind==='owned');
    const external=[...online.map((x:any)=>({...x,source:'online'})),...print.map((x:any)=>({...x,source:'print'})),...externalSocial.map((x:any)=>({...x,source:'social'}))];
    const gapSnapshot=(await pool.query(`SELECT result,analyzed_at FROM issue_communication_gap_snapshots WHERE workflow_id=$1 LIMIT 1`,[w.id])).rows[0]||null;
    const finalResponse=(await pool.query(`SELECT s.id,s.version,s.response_text,s.facts_data,s.key_message,s.supporting_links,s.reviewed_at,s.submitted_at,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.workflow_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.updated_at DESC LIMIT 1`,[w.id])).rows[0]||null;
    return{data:{period,evidence:{total:external.length+owned.length,external:external.length,online:online.length,print:print.length,social:externalSocial.length,owned:owned.length},baseline:{gap:gapSnapshot?.result||null,gapAnalyzedAt:gapSnapshot?.analyzed_at||null,finalResponse},items:{online,print,social:externalSocial,owned}}};
  });

  app.post('/api/phase3/issues/:id/monitoring-periods/:period/analyze',{preHandler:auth},async(request,reply)=>{
    const parsed=z.object({id:z.string().regex(/^\d+$/),period:z.string().regex(/^\d+$/)}).safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_MONITORING_PERIOD'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const issueId=parsed.data.id,periodNo=Number(parsed.data.period),w=await workflow(issueId);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const events=(await pool.query(`SELECT event_type,created_at,note FROM issue_workflow_events WHERE workflow_id=$1 AND event_type IN ('RESPONSE_PUBLISHED','MONITORING_STARTED','ISSUE_CLOSED') ORDER BY created_at ASC,id ASC`,[w.id])).rows;
    const periods:any[]=[];let publishedAt:any=null;for(const e of events){if(e.event_type==='RESPONSE_PUBLISHED')publishedAt=e.created_at;else if(e.event_type==='MONITORING_STARTED')periods.push({number:periods.length+1,started_at:publishedAt||e.created_at,monitoring_started_at:e.created_at,ended_at:null,status:'MONITORING'});else{const open=[...periods].reverse().find(x=>!x.ended_at);if(open)open.ended_at=e.created_at;}}
    const period=periods.find(x=>x.number===periodNo);if(!period)return reply.code(404).send({error:'MONITORING_PERIOD_NOT_FOUND'});if(!period.ended_at)return reply.code(409).send({error:'MONITORING_MUST_BE_CLOSED_BEFORE_ANALYSIS'});const existingMonitoring=(await pool.query('SELECT result,evidence_summary,period_started_at,period_ended_at,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 AND period_number=$2',[w.id,periodNo])).rows[0]||null;if(existingMonitoring)return{data:{...existingMonitoring.result,saved:true,analyzedAt:existingMonitoring.analyzed_at}};const end=period.ended_at;
    const online=(await pool.query(`SELECT a.id,a.title,a.published_at FROM issue_articles ia JOIN articles a ON a.id=ia.article_id WHERE ia.issue_id=$1 AND a.published_at >= $2 AND a.published_at <= $3 ORDER BY a.published_at ASC`,[issueId,period.started_at,end])).rows;
    const print=(await pool.query(`SELECT pa.id,pa.title,pe.edition_date published_at,pa.body_text content FROM issue_print_articles ipa JOIN print_articles pa ON pa.id=ipa.print_article_id JOIN print_editions pe ON pe.id=pa.edition_id WHERE ipa.issue_id=$1 AND ipa.linkage_status='linked' AND pe.edition_date >= $2::date AND pe.edition_date <= $3::date ORDER BY pe.edition_date ASC,pa.id ASC`,[issueId,period.started_at,end])).rows;
    const social=(await pool.query(`SELECT sm.id,sm.title,sm.published_at,sm.source_kind FROM social_mention_issues smi JOIN social_mentions sm ON sm.id=smi.mention_id WHERE smi.issue_id=$1 AND sm.published_at >= $2 AND sm.published_at <= $3 ORDER BY sm.published_at ASC`,[issueId,period.started_at,end])).rows;
    const externalSocial=social.filter((x:any)=>x.source_kind==='external'),owned=social.filter((x:any)=>x.source_kind==='owned'),external=[...online.map((x:any)=>({...x,source:'online'})),...print.map((x:any)=>({...x,source:'print'})),...externalSocial.map((x:any)=>({...x,source:'social'}))];
    const angleResult=await extractDynamicIssueClaims(external),coverageResult=await matchDynamicOfficialResponseCoverage(angleResult.angles,owned);
    let publicationAnalysis:any=null,focusAssessment:any=null;
    try{
      const publicationEvidence=(await pool.query(`SELECT e.* FROM issue_publication_evidence e WHERE e.workflow_id=$1 ORDER BY e.is_primary DESC,e.created_at,e.id`,[w.id])).rows;
      if(publicationEvidence.length){
        const materials:any[]=[],mediaParts:any[]=[];
        for(const e of publicationEvidence){
          if(e.evidence_type==='WEBSITE'&&e.url){
            const article=await fetchWebsitePublication(String(e.url));
            materials.push({id:e.id,type:'WEBSITE',channel:e.channel,url:e.url,caption:e.caption,title:article.title,text:article.text});
            continue;
          }
          const files=(await pool.query('SELECT id,storage_key,file_name,mime_type,file_order FROM issue_publication_evidence_files WHERE evidence_id=$1 ORDER BY file_order,id',[e.id])).rows;
          const fileMeta:any[]=[];
          for(const file of files){
            const result=await get(file.storage_key,{access:'private'});if(!result)throw new Error('PUBLICATION_EVIDENCE_FILE_NOT_FOUND');
            const chunks:any[]=[];for await(const chunk of Readable.fromWeb(result.stream as any))chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
            const buf=Buffer.concat(chunks);if(buf.length>8_000_000)throw new Error('PUBLICATION_EVIDENCE_TOO_LARGE');
            mediaParts.push({inlineData:{mimeType:file.mime_type,data:buf.toString('base64')}});
            fileMeta.push({id:file.id,file_name:file.file_name,mime_type:file.mime_type,file_order:file.file_order});
          }
          materials.push({id:e.id,type:e.evidence_type,channel:e.channel,caption:e.caption,files:fileMeta});
        }
        const gapForPublication=(await pool.query(`SELECT result FROM issue_communication_gap_snapshots WHERE workflow_id=$1 LIMIT 1`,[w.id])).rows[0]||null;
        const responseForPublication=(await pool.query(`SELECT s.response_text,s.facts_data,s.key_message,s.supporting_links,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.workflow_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.updated_at DESC LIMIT 1`,[w.id])).rows[0]||null;
        publicationAnalysis=await analyzePublicationPackage({issueTitle:String(w.title||''),gap:gapForPublication?.result||null,finalResponse:responseForPublication,publicationEvidence:materials},mediaParts);
        const evidenceForAi=[
          ...online.map((x:any)=>({ref:`online:${x.id}`,source:'ONLINE',title:x.title||'',text:String(x.summary||x.content||'').slice(0,3500)})),
          ...print.map((x:any)=>({ref:`print:${x.id}`,source:'PRINT',title:x.title||'',text:String(x.content||'').slice(0,3500)})),
          ...externalSocial.map((x:any)=>({ref:`social:${x.id}`,source:'SOCIAL',title:x.title||'',text:String(x.content||'').slice(0,3500)})),
          ...owned.map((x:any)=>({ref:`owned:${x.id}`,source:'OWNED',title:x.title||'',text:String(x.content||'').slice(0,3500)}))
        ];
        if(Array.isArray(publicationAnalysis?.monitoringFocus)&&publicationAnalysis.monitoringFocus.length){
          focusAssessment=await analyzeMonitoringAgainstPublication({monitoringFocus:publicationAnalysis.monitoringFocus,evidence:evidenceForAi,evidenceCounts:{online:online.length,print:print.length,social:externalSocial.length,owned:owned.length,total:evidenceForAi.length}});
        }
      }
    }catch(error:any){request.log.warn({issueId,reason:String(error?.message||error).slice(0,180)},'publication-package monitoring analysis unavailable');}
    const gapSnapshot=(await pool.query(`SELECT result,analyzed_at FROM issue_communication_gap_snapshots WHERE workflow_id=$1 LIMIT 1`,[w.id])).rows[0]||null;
    const finalResponse=(await pool.query(`SELECT s.id,s.version,s.response_text,s.facts_data,s.key_message,s.supporting_links,s.reviewed_at,s.submitted_at,o.name opd_name FROM issue_response_submissions s LEFT JOIN opd o ON o.id=s.opd_id WHERE s.workflow_id=$1 AND s.status='APPROVED' ORDER BY s.version DESC,s.updated_at DESC LIMIT 1`,[w.id])).rows[0]||null;
    const payload={period,evidence:{total:external.length+owned.length,online:online.length,print:print.length,social:externalSocial.length,owned:owned.length},baseline:{gap:gapSnapshot?.result||null,gapAnalyzedAt:gapSnapshot?.analyzed_at||null,finalResponse},analysis:{externalAngles:angleResult,semanticAssessment:coverageResult,publicationAnalysis,focusAssessment},items:{online,print,social:externalSocial,owned}};
    const savedMonitoring=(await pool.query(`INSERT INTO issue_monitoring_analysis_snapshots(workflow_id,issue_id,period_number,result,evidence_summary,period_started_at,period_ended_at,analyzed_by) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8) ON CONFLICT(workflow_id,period_number) DO NOTHING RETURNING analyzed_at`,[w.id,issueId,periodNo,JSON.stringify(payload),JSON.stringify(payload.evidence),period.started_at,period.ended_at,ctx.id])).rows[0];
    if(!savedMonitoring){const concurrent=(await pool.query('SELECT result,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 AND period_number=$2',[w.id,periodNo])).rows[0];return{data:{...concurrent.result,saved:true,analyzedAt:concurrent.analyzed_at}}}
    return{data:{...payload,saved:true,analyzedAt:savedMonitoring.analyzed_at}};
  });

  app.get('/api/phase3/issues/:id/analysis-snapshots',{preHandler:auth},async(request,reply)=>{const p=idParam.safeParse(request.params);if(!p.success)return reply.code(400).send({error:'INVALID_ISSUE_ID'});const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});if(!(await canSeeOutcome(request.phase3OutcomeAuth!,w)))return reply.code(403).send({error:'FORBIDDEN'});const publication=(await pool.query('SELECT result,source,gap_analyzed_at,analyzed_at FROM issue_publication_analysis_snapshots WHERE workflow_id=$1',[w.id])).rows[0]||null;const monitoring=(await pool.query('SELECT period_number,result,evidence_summary,period_started_at,period_ended_at,analyzed_at FROM issue_monitoring_analysis_snapshots WHERE workflow_id=$1 ORDER BY period_number',[w.id])).rows;return{data:{publication,monitoring}};});

  app.post('/api/phase3/issues/:id/close',{preHandler:auth},async(request,reply)=>{
    const p=idParam.safeParse(request.params),b=closeInput.safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({error:'INVALID_CLOSE'});
    const ctx=request.phase3OutcomeAuth!;if(!isManager(ctx))return reply.code(403).send({error:'FORBIDDEN'});
    const w=await workflow(p.data.id);if(!w)return reply.code(404).send({error:'ISSUE_WORKFLOW_NOT_FOUND'});
    const role=actorRole(ctx);if(!canTransitionPhase3(w.workflow_status as Phase3WorkflowStatus,'CLOSED',role))return reply.code(409).send({error:'INVALID_WORKFLOW_TRANSITION',from:w.workflow_status,to:'CLOSED'});
    await pool.query(`UPDATE issue_workflows SET workflow_status='CLOSED',closed_at=NOW(),updated_by=$1,updated_at=NOW() WHERE id=$2`,[ctx.id,w.id]);
    await event(w.id,p.data.id,ctx,'ISSUE_CLOSED',w.workflow_status,'CLOSED',b.data.note);
    return{data:await workflow(p.data.id)};
  });
}
