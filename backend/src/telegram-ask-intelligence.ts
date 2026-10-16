import type { Pool } from 'pg';
import type { AuthorizationContext } from './rbac.js';

export const telegramAskHelp = `Ask Intelligence Telegram — tanpa AI
Kirim pertanyaan langsung atau /tanya PERTANYAAN.
Contoh:
• Berapa berita negatif kemarin?
• Apa isu berisiko tinggi?
• Bagaimana status isu sampah?
• Strakom MTQ sudah disetujui?
• Klarifikasi apa yang belum selesai?
• Publikasi isu MTQ
• Monitoring isu sampah
Data mengikuti akses akun yang terhubung. Bot hanya membaca data dan hasil tersimpan; tidak mengubah status atau menjalankan analisis AI.`;
const norm=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function telegramAskIntent(question:string){
 const q=norm(question);
 const domain=/\b(klarifikasi|penugasan|tanggapan|respons|respon)\b/.test(q)?'clarification':/\b(strakom|strategi komunikasi)\b/.test(q)?'strategy':/\b(publikasi|tayang|dipublikasikan)\b/.test(q)?'publication':/\b(monitoring|pantauan|pemantauan)\b/.test(q)?'monitoring':/\b(isu|issue|masalah)\b/.test(q)?'issue':/\b(berita|media|pemberitaan|artikel|kliping|evidence)\b/.test(q)?'news':null;
 const period=/\bkemarin\b/.test(q)?'yesterday':/\bhari ini\b/.test(q)?'today':/\b(minggu lalu|pekan lalu)\b/.test(q)?'last_week':/\bbulan lalu\b/.test(q)?'last_month':/\b(minggu ini|pekan ini)\b/.test(q)?'this_week':/\bbulan ini\b/.test(q)?'this_month':/\b7 hari\b/.test(q)?'seven_days':domain==='news'?'today':null;
 return {domain,period,risk:/\b(kritis|critical)\b/.test(q)?'critical':/\b(tinggi|high)\b/.test(q)?'high':null,sentiment:/\bnegatif\b/.test(q)?'negative':/\bpositif\b/.test(q)?'positive':null,pending:/\b(belum|menunggu|tertunda)\b/.test(q),approved:/\b(disetujui|approved)\b/.test(q),resolved:/\b(selesai|ditutup|resolved|closed)\b/.test(q),active:/\b(aktif|active)\b/.test(q)};
}
function periodSql(expr:string,period:string|null){
 const d=`(${expr} AT TIME ZONE 'Asia/Jakarta')::date`,now="(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')";
 switch(period){case'today':return `${d}=${now}::date`;case'yesterday':return `${d}=${now}::date-1`;case'seven_days':return `${d}>=${now}::date-6 AND ${d}<=${now}::date`;case'last_week':return `${d}>=date_trunc('week',${now})::date-7 AND ${d}<date_trunc('week',${now})::date`;case'this_week':return `${d}>=date_trunc('week',${now})::date AND ${d}<=${now}::date`;case'last_month':return `${d}>=(date_trunc('month',${now})-INTERVAL '1 month')::date AND ${d}<date_trunc('month',${now})::date`;case'this_month':return `${d}>=date_trunc('month',${now})::date AND ${d}<=${now}::date`;default:return'TRUE';}
}
const periodLabel:Record<string,string>={today:'hari ini',yesterday:'kemarin',seven_days:'7 hari terakhir',last_week:'minggu lalu',this_week:'minggu ini',last_month:'bulan lalu',this_month:'bulan ini'};
const globalAccess=(u:AuthorizationContext)=>u.legacyRole==='admin'||u.roles.some(r=>['super_admin','humas','executive'].includes(r));

/** Strict database-only channel: no provider adapter, API key, AI fallback or write queries. */
export async function answerTelegramAsk(pool:Pool,user:AuthorizationContext,question:string):Promise<string>{
 if(!user.active)return 'Akun aplikasi sedang nonaktif. Hubungi administrator.';
 const global=globalAccess(user),opdRole=!global&&user.roles.includes('opd'),districtRole=!global&&!opdRole&&user.roles.includes('district');
 if(!global&&!opdRole&&!districtRole)return 'Ask Intelligence tidak tersedia untuk role akun ini.';
 if((opdRole&&!user.opdId)||(districtRole&&!user.districtId))return 'Unit atau wilayah akun belum diatur. Hubungi administrator.';
 if(question.length<3||question.length>1000)return 'Gunakan pertanyaan sepanjang 3–1000 karakter. Kirim /bantuan untuk contoh.';
 if(/\b(hapus|ubah|setujui|tolak|kirim klarifikasi|tutup isu|buka kembali|aktifkan|nonaktifkan|jalankan|analisis ulang|analisa ulang)\b/.test(norm(question)))return 'Bot hanya membaca data. Perubahan status dan analisis dilakukan melalui aplikasi. Kirim /bantuan untuk contoh pertanyaan.';
 const intent=telegramAskIntent(question);if(!intent.domain)return telegramAskHelp;
 const organization= user.opdId?(await pool.query('SELECT organization_id FROM opd WHERE id=$1',[user.opdId])).rows[0]?.organization_id:
 user.districtId?(await pool.query('SELECT organization_id FROM districts WHERE id=$1',[user.districtId])).rows[0]?.organization_id:null;
 const organizations=organization?[{id:organization}]:(await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2')).rows;
 if(organizations.length!==1)return 'Organisasi akun belum dapat ditentukan. Hubungi administrator.';
 const org=organizations[0].id;
 const opds=(await pool.query('SELECT id,code,name FROM opd WHERE organization_id=$1 AND active=true',[org])).rows;
 const districts=(await pool.query('SELECT id,code,name FROM districts WHERE organization_id=$1 AND active=true',[org])).rows;
 const q=' '+norm(question)+' ';
 const matches=(r:any)=>[norm(r.code||''),norm(r.name||'')].some(v=>v.length>=3&&q.includes(' '+v+' '));
 const requestedOpd=opds.filter(matches).sort((a,b)=>b.name.length-a.name.length)[0],requestedDistrict=districts.filter(matches).sort((a,b)=>b.name.length-a.name.length)[0];
 if((opdRole&&requestedOpd&&String(requestedOpd.id)!==user.opdId)||(districtRole&&requestedDistrict&&String(requestedDistrict.id)!==user.districtId))return 'Pertanyaan di luar unit atau wilayah akun Anda. Gunakan akun dengan akses yang sesuai.';
 const opdId=opdRole?user.opdId:requestedOpd?.id,districtId=districtRole?user.districtId:requestedDistrict?.id;
 const params:any[]=[org],bind=(v:any)=>{params.push(v);return'$'+params.length;};
 const op=opdId?bind(opdId):null,dist=districtId?bind(districtId):null;
 let subject=norm(question);
 for(const row of [requestedOpd,requestedDistrict])if(row)for(const word of [row.name,row.code])subject=subject.replace(norm(word),' ');
 subject=subject.replace(/\b(apa|berapa|bagaimana|status|jumlah|total|daftar|sebutkan|saja|yang|dan|di|untuk|dari|dengan|ke|ada|sudah|belum|menunggu|tertunda|disetujui|approved|selesai|ditutup|resolved|closed|aktif|active|watch|berisiko|risiko|risk|tinggi|high|kritis|critical|negatif|positif|hari|ini|kemarin|7|terakhir|minggu|pekan|bulan|lalu|isu|issue|masalah|berita|media|pemberitaan|artikel|kliping|evidence|klarifikasi|penugasan|tanggapan|respons|respon|strakom|strategi|komunikasi|publikasi|tayang|dipublikasikan|monitoring|pantauan|pemantauan|online|cetak|sosial|opd|kecamatan)\b/g,' ').trim().replace(/\s+/g,' ');
 const term=subject?bind('%'+subject.replace(/[\\%_]/g,'\\$&').split(' ').join('%')+'%'):null;
 const scopeName=[opds.find(r=>String(r.id)===String(opdId))?.name,districts.find(r=>String(r.id)===String(districtId))?.name].filter(Boolean).join(' · ')||'organisasi Anda';
 const footer=`\n\nScope: ${scopeName}. Data aplikasi, tanpa AI. Waktu: WIB.`;
 if(intent.domain==='news'){
  const conditions=(alias:string,time:string)=>[`${alias}.opd_id IN(SELECT id FROM opd WHERE organization_id=$1)`,op?`${alias}.opd_id=${op}`:'TRUE',dist?`${alias}.district_id=${dist}`:'TRUE',periodSql(time,intent.period),term?`${alias}.title ILIKE ${term}`:'TRUE'].join(' AND ');
  const online=`SELECT a.title,a.published_at,a.sentiment,a.risk_level::text,a.risk_score::float,'online'::text channel FROM articles a WHERE a.news_classification='UTAMA' AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0 AND (SELECT al.action FROM audit_logs al WHERE al.action IN('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED' AND ${conditions('a','a.published_at')}`;
  const print=`SELECT pa.title,pe.edition_date::timestamptz,pa.sentiment,COALESCE(NULLIF(pa.ai_metadata->'intelligence'->>'riskLevel',''),CASE WHEN pa.risk_score>=80 THEN 'critical' WHEN pa.risk_score>=60 THEN 'high' WHEN pa.risk_score>=35 THEN 'medium' ELSE 'low' END)::text,pa.risk_score::float,'print'::text FROM print_articles pa JOIN print_editions pe ON pe.id=pa.edition_id WHERE lower(pa.status)='analyzed' AND pa.ai_metadata->'v16Routing'->>'routingStatus'='ROUTED' AND COALESCE(pa.ai_metadata->'v16Routing'->>'keywordId','')<>'' AND pa.ai_metadata->'v16Routing'->>'keywordVerification'='ACCEPTED' AND pa.ai_metadata->'intelligence'->>'riskStatus'='FINAL' AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0 AND ${conditions('pa','pe.edition_date::timestamptz')}`;
  const social=`SELECT COALESCE(sm.title,left(sm.content,240)),COALESCE(sm.published_at,sm.captured_at),sm.sentiment,sm.risk_level::text,sm.risk_score::float,'social'::text FROM social_mentions sm WHERE sm.source_kind='external' AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND (sm.metadata->'socialVerification'->>'status'='LOCKED' OR sm.metadata->'manualClassification'->>'locked'='true') AND sm.metadata->'intelligence'->>'riskStatus'='FINAL' AND sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0 AND ${conditions('sm','COALESCE(sm.published_at,sm.captured_at)')}`;
  const where=['TRUE'];if(intent.sentiment)where.push('lower(sentiment)='+bind(intent.sentiment));if(intent.risk)where.push(intent.risk==='critical'?"lower(risk_level)='critical'":"lower(risk_level) IN('high','critical')");
  if(/\bonline\b/.test(q))where.push("channel='online'");else if(/\bcetak\b/.test(q))where.push("channel='print'");else if(/\bsosial\b/.test(q))where.push("channel='social'");
  const rows=(await pool.query(`WITH trusted AS(${online} UNION ALL ${print} UNION ALL ${social}) SELECT *,COUNT(*) OVER()::int total FROM trusted WHERE ${where.join(' AND ')} ORDER BY risk_score DESC,published_at DESC NULLS LAST LIMIT 5`,params)).rows;
  const total=Number(rows[0]?.total||0);return `Berita eksternal tervalidasi ${periodLabel[intent.period||'today']}: ${total}${intent.sentiment?' · sentimen '+intent.sentiment:''}${intent.risk?' · risiko '+intent.risk:''}.`+(rows.length?'\n'+rows.map((r,i)=>`${i+1}. ${r.title} (${r.channel}; risiko ${r.risk_score}/100)`).join('\n'):'')+footer;
 }
 const where=['i.organization_id=$1'];
 if(op)where.push(opdRole&&intent.domain!=='issue'?`(w.lead_opd_id=${op} OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=${op}))`:`(EXISTS(SELECT 1 FROM issue_opd io WHERE io.issue_id=i.id AND io.opd_id=${op}) OR w.lead_opd_id=${op} OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=${op}))`);
 if(dist)where.push(`(EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=${dist}) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='DISTRICT' AND c.district_id=${dist}))`);
 if(term)where.push('i.title ILIKE '+term);
 if(intent.risk)where.push(intent.risk==='critical'?"lower(i.risk_level)='critical'":"lower(i.risk_level) IN('high','critical')");
 if(intent.domain==='issue'){
  if(intent.resolved)where.push("lower(i.status) IN('resolved','archived')");else if(intent.active)where.push("lower(i.status)='active'");else if(/\bwatch\b/.test(q))where.push("lower(i.status)='watch'");else if(!term)where.push("lower(i.status) IN('watch','active')");
 }else if(intent.domain==='clarification'){
  where.push("w.assigned_at IS NOT NULL");if(intent.pending)where.push("w.workflow_status IN('ASSIGNED','REVISION_REQUIRED')");else if(intent.approved)where.push("rs.status='APPROVED'");
 }else if(intent.domain==='strategy'){
  where.push('cs.id IS NOT NULL');if(intent.pending)where.push("cs.status<>'APPROVED'");if(!global||user.roles.includes('executive')||(intent.approved&&!intent.pending))where.push("cs.status='APPROVED'");
 }else if(intent.domain==='publication'){where.push(intent.pending?"w.published_at IS NULL AND w.workflow_status='STRATEGY'":'w.published_at IS NOT NULL');}
 else if(intent.domain==='monitoring'){if(intent.pending)where.push("w.workflow_status='MONITORING'");where.push("(w.workflow_status='MONITORING' OR ma.id IS NOT NULL)");if(intent.resolved)where.push("w.workflow_status='CLOSED'");}
 const dateColumn=intent.domain==='publication'?'w.published_at':intent.domain==='monitoring'?'COALESCE(ma.analyzed_at,w.updated_at)':intent.domain==='strategy'?'cs.updated_at':intent.domain==='clarification'?'w.assigned_at':'i.updated_at';
 where.push(periodSql(dateColumn,intent.period));
 const rows=(await pool.query(`SELECT i.id,i.title,i.status,i.risk_level,w.cycle_number,w.workflow_status,rs.status response_status,cs.status strategy_status,w.published_at,ma.analyzed_at monitoring_analyzed_at,COUNT(*) OVER()::int total
 FROM issues i LEFT JOIN LATERAL(SELECT * FROM issue_workflows x WHERE x.issue_id=i.id ORDER BY x.cycle_number DESC,x.id DESC LIMIT 1)w ON TRUE
 LEFT JOIN LATERAL(SELECT id,status,updated_at FROM communication_strategies x WHERE x.workflow_id=w.id ORDER BY x.version DESC LIMIT 1)cs ON TRUE
 LEFT JOIN LATERAL(SELECT status FROM issue_response_submissions x WHERE x.workflow_id=w.id ORDER BY x.version DESC LIMIT 1)rs ON TRUE
 LEFT JOIN LATERAL(SELECT id,analyzed_at FROM issue_monitoring_analysis_snapshots x WHERE x.workflow_id=w.id ORDER BY x.period_number DESC,x.id DESC LIMIT 1)ma ON TRUE
 WHERE ${where.join(' AND ')} ORDER BY i.updated_at DESC,i.id DESC LIMIT 5`,params)).rows;
 const label=({issue:'isu',clarification:'klarifikasi',strategy:'Strakom',publication:'publikasi',monitoring:'monitoring'})[intent.domain];
 return `Ditemukan ${Number(rows[0]?.total||0)} ${label}${intent.period?' '+periodLabel[intent.period]:''}${intent.pending?' yang belum selesai':''}.`+(rows.length?'\n'+rows.map((r,i)=>`${i+1}. ${r.title} — `+(intent.domain==='issue'?`status ${r.status}; alur ${r.workflow_status||'belum dimulai'}; risiko ${r.risk_level||'belum dinilai'}`:intent.domain==='strategy'?`Strakom ${r.strategy_status}`:intent.domain==='clarification'?`klarifikasi ${r.response_status||'belum dikirim'}; alur ${r.workflow_status}`:intent.domain==='publication'?r.published_at?`dipublikasikan ${new Date(r.published_at).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}`:'belum dipublikasikan':`alur ${r.workflow_status}; analisis tersimpan ${r.monitoring_analyzed_at?'tersedia':'belum tersedia'}`)+`; siklus #${r.cycle_number||1}`).join('\n'):' Belum ada data yang cocok pada akses akun ini.')+footer;
}
