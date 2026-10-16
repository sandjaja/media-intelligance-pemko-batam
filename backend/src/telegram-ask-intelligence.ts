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
• Ringkasan Gap isu sampah
• Ringkasan Strakom MTQ
• Status Content Studio organisasi masyarakat
• Hasil analisis publikasi isu sampah
• Kesimpulan monitoring isu sampah
• Riwayat siklus MTQ
• Evaluasi siklus MTQ
• Pelajaran dari pustaka pembelajaran MTQ
• Berita media internal kemarin
• Daftar kandidat isu
Tambahkan “siklus 1” untuk membaca siklus lama.
Data mengikuti akses akun yang terhubung. Bot hanya membaca data dan hasil tersimpan; tidak mengubah status atau menjalankan analisis AI.`;
const norm=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function telegramAskIntent(question:string){
 const q=norm(question);
 const domain=/\b(pustaka|pembelajaran|pelajaran|knowledge)\b/.test(q)?'library':/\b(evaluasi|evaluation)\b/.test(q)?'evaluation':/\b(riwayat|timeline)\b/.test(q)?'history':/\b(gap|kesenjangan)\b/.test(q)?'gap':/\b(content studio|konten studio|studio|prompt produksi)\b/.test(q)?'content':/\b(kandidat|candidate)\b/.test(q)?'candidate':/\b(media internal|owned channel|kanal resmi)\b/.test(q)?'owned':/\b(klarifikasi|penugasan|tanggapan|respons|respon)\b/.test(q)?'clarification':/\b(strakom|strategi komunikasi)\b/.test(q)?'strategy':/\b(publikasi|tayang|dipublikasikan)\b/.test(q)?'publication':/\b(monitoring|pantauan|pemantauan)\b/.test(q)?'monitoring':/\b(isu|issue|masalah)\b/.test(q)?'issue':/\b(berita|media|pemberitaan|artikel|kliping|evidence)\b/.test(q)?'news':null;
 const period=/\bkemarin\b/.test(q)?'yesterday':/\bhari ini\b/.test(q)?'today':/\b(minggu lalu|pekan lalu)\b/.test(q)?'last_week':/\bbulan lalu\b/.test(q)?'last_month':/\b(minggu ini|pekan ini)\b/.test(q)?'this_week':/\bbulan ini\b/.test(q)?'this_month':/\b7 hari\b/.test(q)?'seven_days':(domain==='news'||domain==='owned')?'today':null;
 return {domain,period,cycle:Number(q.match(/\bsiklus\s+(\d+)\b/)?.[1])||null,details:/\b(hasil|ringkasan|analisis|analisa|kesimpulan|pelajaran|rekomendasi|pesan utama|jelaskan|isi)\b/.test(q),risk:/\b(kritis|critical)\b/.test(q)?'critical':/\b(tinggi|high)\b/.test(q)?'high':null,sentiment:/\bnegatif\b/.test(q)?'negative':/\bpositif\b/.test(q)?'positive':null,pending:/\b(belum|menunggu|tertunda)\b/.test(q),approved:/\b(disetujui|approved)\b/.test(q),resolved:/\b(selesai|ditutup|resolved|closed)\b/.test(q),active:/\b(aktif|active)\b/.test(q)};
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
 const manager=user.legacyRole==='admin'||user.roles.some(r=>['super_admin','humas'].includes(r));
 const global=globalAccess(user),opdRole=!global&&user.roles.includes('opd'),districtRole=!global&&!opdRole&&user.roles.includes('district');
 if(!global&&!opdRole&&!districtRole)return 'Ask Intelligence tidak tersedia untuk role akun ini.';
 if((opdRole&&!user.opdId)||(districtRole&&!user.districtId))return 'Unit atau wilayah akun belum diatur. Hubungi administrator.';
 if(question.length<3||question.length>1000)return 'Gunakan pertanyaan sepanjang 3–1000 karakter. Kirim /bantuan untuk contoh.';
 if(/\b(hapus|ubah|setujui|tolak|kirim klarifikasi|tutup isu|buka kembali|aktifkan|nonaktifkan|jalankan|analisis ulang|analisa ulang)\b/.test(norm(question)))return 'Bot hanya membaca data. Perubahan status dan analisis dilakukan melalui aplikasi. Kirim /bantuan untuk contoh pertanyaan.';
 const intent=telegramAskIntent(question);if(!intent.domain)return telegramAskHelp;
 if(['content','candidate'].includes(intent.domain)&&!manager)return 'Data Content Studio dan kandidat isu hanya tersedia untuk Humas/Super Admin sesuai akses aplikasi.';
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
 if(intent.domain==='candidate'&&(opdId||districtId))return 'Pencarian kandidat tersimpan tersedia untuk lingkup organisasi. Kirim “daftar kandidat isu” tanpa filter unit.';
 const params:any[]=[org],bind=(v:any)=>{params.push(v);return'$'+params.length;};
 const op=opdId?bind(opdId):null,dist=districtId?bind(districtId):null;
 let subject=norm(question).replace(/\bsiklus\s+\d+\b/g,' ');
 for(const row of [requestedOpd,requestedDistrict])if(row)for(const word of [row.name,row.code])subject=subject.replace(norm(word),' ');
 subject=subject.replace(/\b(semua|seluruh|tampilkan|lihat|tolong|mohon|tentang|hasil|ringkasan|analisis|analisa|kesimpulan|pelajaran|rekomendasi|pesan|utama|jelaskan|isi|pustaka|pembelajaran|knowledge|evaluasi|evaluation|riwayat|timeline|siklus|gap|kesenjangan|content|konten|studio|prompt|produksi|kandidat|candidate|internal|owned|channel|kanal|resmi|apa|berapa|bagaimana|status|jumlah|total|daftar|sebutkan|saja|yang|dan|di|untuk|dari|dengan|ke|ada|sudah|belum|menunggu|tertunda|disetujui|approved|selesai|ditutup|resolved|closed|aktif|active|watch|berisiko|risiko|risk|tinggi|high|kritis|critical|negatif|positif|hari|ini|kemarin|7|terakhir|minggu|pekan|bulan|lalu|isu|issue|masalah|berita|media|pemberitaan|artikel|kliping|evidence|klarifikasi|penugasan|tanggapan|respons|respon|strakom|strategi|komunikasi|publikasi|tayang|dipublikasikan|monitoring|pantauan|pemantauan|online|cetak|sosial|opd|kecamatan)\b/g,' ').trim().replace(/\s+/g,' ');
 const term=subject?bind('%'+subject.replace(/[\\%_]/g,'\\$&').split(' ').join('%')+'%'):null;
 const scopeName=[opds.find(r=>String(r.id)===String(opdId))?.name,districts.find(r=>String(r.id)===String(districtId))?.name].filter(Boolean).join(' · ')||'organisasi Anda';
 const footer=`\n\nScope: ${scopeName}. Data aplikasi, tanpa AI. Waktu: WIB.`;
 if(intent.domain==='candidate'){
  const where=['organization_id=$1',"status='PENDING'"];if(term)where.push('suggested_title ILIKE '+term);if(intent.pending)where.push("status='PENDING'");where.push(periodSql('updated_at',intent.period));
  const rows=(await pool.query(`SELECT suggested_title,status,COUNT(*) OVER()::int total FROM unified_candidate_issues WHERE ${where.join(' AND ')} ORDER BY updated_at DESC,id DESC LIMIT 5`,params)).rows;
  return `Kandidat isu tersimpan: ${Number(rows[0]?.total||0)}.`+(rows.length?'\n'+rows.map((r,i)=>`${i+1}. ${r.suggested_title} — ${r.status}`).join('\n'):'')+footer;
 }
 if(intent.domain==='news'||intent.domain==='owned'){
  const conditions=(alias:string,time:string)=>[`${alias}.opd_id IN(SELECT id FROM opd WHERE organization_id=$1)`,op?`${alias}.opd_id=${op}`:'TRUE',dist?`${alias}.district_id=${dist}`:'TRUE',periodSql(time,intent.period),term?`${alias}.title ILIKE ${term}`:'TRUE'].join(' AND ');
  const online=`SELECT a.title,a.published_at,a.sentiment,a.risk_level::text,a.risk_score::float,'online'::text channel FROM articles a WHERE a.news_classification='UTAMA' AND a.sentiment IS NOT NULL AND COALESCE(a.risk_score,0)>0 AND (SELECT al.action FROM audit_logs al WHERE al.action IN('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=a.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED' AND ${conditions('a','a.published_at')}`;
  const print=`SELECT pa.title,pe.edition_date::timestamptz,pa.sentiment,COALESCE(NULLIF(pa.ai_metadata->'intelligence'->>'riskLevel',''),CASE WHEN pa.risk_score>=80 THEN 'critical' WHEN pa.risk_score>=60 THEN 'high' WHEN pa.risk_score>=35 THEN 'medium' ELSE 'low' END)::text,pa.risk_score::float,'print'::text FROM print_articles pa JOIN print_editions pe ON pe.id=pa.edition_id WHERE lower(pa.status)='analyzed' AND pa.ai_metadata->'v16Routing'->>'routingStatus'='ROUTED' AND COALESCE(pa.ai_metadata->'v16Routing'->>'keywordId','')<>'' AND pa.ai_metadata->'v16Routing'->>'keywordVerification'='ACCEPTED' AND pa.ai_metadata->'intelligence'->>'riskStatus'='FINAL' AND pa.sentiment IS NOT NULL AND COALESCE(pa.risk_score,0)>0 AND ${conditions('pa','pe.edition_date::timestamptz')}`;
  const social=`SELECT COALESCE(sm.title,left(sm.content,240)),COALESCE(sm.published_at,sm.captured_at),sm.sentiment,sm.risk_level::text,sm.risk_score::float,'social'::text FROM social_mentions sm WHERE sm.source_kind='external' AND sm.metadata->'v16Routing'->>'newsClassification'='UTAMA' AND sm.metadata->'v16Routing'->>'routingStatus'='ROUTED' AND (sm.metadata->'socialVerification'->>'status'='LOCKED' OR sm.metadata->'manualClassification'->>'locked'='true') AND sm.metadata->'intelligence'->>'riskStatus'='FINAL' AND sm.sentiment IS NOT NULL AND COALESCE(sm.risk_score,0)>0 AND ${conditions('sm','COALESCE(sm.published_at,sm.captured_at)')}`;
  const owned=`SELECT COALESCE(sm.title,left(sm.content,240)) AS title,COALESCE(sm.published_at,sm.captured_at) AS published_at,sm.sentiment,sm.risk_level::text,sm.risk_score::float,'owned'::text FROM social_mentions sm JOIN owned_social_accounts osa ON osa.id=sm.owned_account_id WHERE sm.source_kind='owned' AND COALESCE(sm.curation_status,'approved')='approved' AND osa.active=TRUE AND (sm.opd_id IN(SELECT id FROM opd WHERE organization_id=$1) OR osa.opd_id IN(SELECT id FROM opd WHERE organization_id=$1) OR osa.district_id IN(SELECT id FROM districts WHERE organization_id=$1) OR (osa.opd_id IS NULL AND osa.district_id IS NULL AND (SELECT COUNT(*) FROM organizations WHERE active=TRUE)=1 AND EXISTS(SELECT 1 FROM organizations WHERE id=$1 AND active=TRUE))) AND ${op?'COALESCE(sm.opd_id,osa.opd_id)='+op:'TRUE'} AND ${dist?'COALESCE(sm.district_id,osa.district_id)='+dist:'TRUE'} AND ${periodSql('COALESCE(sm.published_at,sm.captured_at)',intent.period)} AND ${term?'COALESCE(sm.title,sm.content) ILIKE '+term:'TRUE'}`;
  const where=['TRUE'];if(intent.sentiment)where.push('lower(sentiment)='+bind(intent.sentiment));if(intent.risk)where.push(intent.risk==='critical'?"lower(risk_level)='critical'":"lower(risk_level) IN('high','critical')");
  if(/\bonline\b/.test(q))where.push("channel='online'");else if(/\bcetak\b/.test(q))where.push("channel='print'");else if(/\bsosial\b/.test(q))where.push("channel='social'");
  const rows=(await pool.query(`WITH trusted AS(${intent.domain==='owned'?owned:online+' UNION ALL '+print+' UNION ALL '+social}) SELECT *,COUNT(*) OVER()::int total FROM trusted WHERE ${where.join(' AND ')} ORDER BY risk_score DESC,published_at DESC NULLS LAST LIMIT 5`,params)).rows;
  const total=Number(rows[0]?.total||0);return `${intent.domain==='owned'?'Publikasi Media Internal':'Berita eksternal tervalidasi'} ${periodLabel[intent.period||'today']}: ${total}${intent.sentiment?' · sentimen '+intent.sentiment:''}${intent.risk?' · risiko '+intent.risk:''}.`+(rows.length?'\n'+rows.map((r,i)=>`${i+1}. ${r.title} (${r.channel}; risiko ${r.risk_score}/100)`).join('\n'):'')+footer;
 }
 const where=['i.organization_id=$1'];
 if(op)where.push(opdRole&&intent.domain!=='issue'?`(w.lead_opd_id=${op} OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=${op}))`:`(EXISTS(SELECT 1 FROM issue_opd io WHERE io.issue_id=i.id AND io.opd_id=${op}) OR w.lead_opd_id=${op} OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='OPD' AND c.opd_id=${op}))`);
 if(dist)where.push(`(EXISTS(SELECT 1 FROM issue_districts d WHERE d.issue_id=i.id AND d.district_id=${dist}) OR EXISTS(SELECT 1 FROM issue_workflow_contributors c WHERE c.workflow_id=w.id AND c.contributor_type='DISTRICT' AND c.district_id=${dist}))`);
 if(term)where.push(intent.domain==='library'?`(i.title ILIKE ${term} OR ke.metadata->'evaluation'->>'summary' ILIKE ${term} OR (ke.metadata->'evaluation'->'lessons')::text ILIKE ${term} OR (ke.metadata->'evaluation'->'tags')::text ILIKE ${term})`:'i.title ILIKE '+term);
 if(intent.cycle)where.push('w.cycle_number='+bind(intent.cycle));
 if(intent.risk)where.push(intent.risk==='critical'?"lower(i.risk_level)='critical'":"lower(i.risk_level) IN('high','critical')");
 if(intent.domain==='issue'){
  if(intent.resolved)where.push("lower(i.status) IN('resolved','archived')");else if(intent.active)where.push("lower(i.status)='active'");else if(/\bwatch\b/.test(q))where.push("lower(i.status)='watch'");else if(!term)where.push("lower(i.status) IN('watch','active')");
 }else if(['library','evaluation','history'].includes(intent.domain)){
  where.push("w.workflow_status='CLOSED'");if(intent.domain!=='history')where.push('ke.id IS NOT NULL');
 }else if(intent.domain==='gap'){where.push('gs.id IS NOT NULL');
 }else if(intent.domain==='content'){where.push('cp.id IS NOT NULL');
 }else if(intent.domain==='clarification'){
  where.push("w.assigned_at IS NOT NULL");if(intent.pending)where.push("w.workflow_status IN('ASSIGNED','REVISION_REQUIRED')");else if(intent.approved)where.push("rs.status='APPROVED'");
 }else if(intent.domain==='strategy'){
  where.push('cs.id IS NOT NULL');if(districtRole)where.push(`EXISTS(SELECT 1 FROM communication_strategy_districts sd WHERE sd.strategy_id=cs.id AND sd.district_id=${dist})`);if(intent.pending)where.push("cs.status<>'APPROVED'");if(!global||user.roles.includes('executive')||(intent.approved&&!intent.pending))where.push("cs.status='APPROVED'");
 }else if(intent.domain==='publication'){where.push(intent.pending?"w.published_at IS NULL AND w.workflow_status='STRATEGY'":'w.published_at IS NOT NULL');}
 else if(intent.domain==='monitoring'){if(intent.pending)where.push("w.workflow_status='MONITORING'");where.push("(w.workflow_status='MONITORING' OR ma.id IS NOT NULL)");if(intent.resolved)where.push("w.workflow_status='CLOSED'");}
 const dateColumn=['library','evaluation'].includes(intent.domain)?'ke.created_at':intent.domain==='history'?'w.closed_at':intent.domain==='gap'?'gs.analyzed_at':intent.domain==='content'?'cp.updated_at':intent.domain==='publication'?'w.published_at':intent.domain==='monitoring'?'COALESCE(ma.analyzed_at,w.updated_at)':intent.domain==='strategy'?'cs.updated_at':intent.domain==='clarification'?'w.assigned_at':'i.updated_at';
 where.push(periodSql(dateColumn,intent.period));
 const rows=(await pool.query(`SELECT i.id,i.title,i.status,i.risk_level,w.cycle_number,w.workflow_status,rs.status response_status,cs.status strategy_status,w.published_at,ma.analyzed_at monitoring_analyzed_at,${intent.domain==='gap'?'gs.result':intent.domain==='history'?"CASE WHEN gs.id IS NULL THEN NULL ELSE '{}'::jsonb END":'NULL::jsonb'} gap_result,${intent.domain==='strategy'&&intent.details&&!districtRole?'cs.executive_summary':'NULL::text'} executive_summary,${intent.domain==='strategy'&&intent.details&&!districtRole?'cs.key_messages':"'[]'::jsonb"} key_messages,${intent.domain==='clarification'&&intent.details?'rs.key_message':'NULL::text'} response_message,${intent.domain==='publication'&&intent.details?'pa.result':'NULL::jsonb'} publication_result,${intent.domain==='monitoring'&&intent.details?'ma.result':'NULL::jsonb'} monitoring_result,ke.event_type evaluation_status,${['library','evaluation'].includes(intent.domain)?'ke.metadata':'NULL::jsonb'} evaluation_metadata,cp.status content_status,cp.item_count,cp.ready_count,COUNT(*) OVER()::int total
 FROM issues i ${intent.cycle||['library','evaluation','history'].includes(intent.domain)?'JOIN issue_workflows w ON w.issue_id=i.id':'LEFT JOIN LATERAL(SELECT * FROM issue_workflows x WHERE x.issue_id=i.id ORDER BY x.cycle_number DESC,x.id DESC LIMIT 1)w ON TRUE'}
 LEFT JOIN LATERAL(SELECT id,status,updated_at,executive_summary,key_messages FROM communication_strategies x WHERE x.workflow_id=w.id ORDER BY x.version DESC LIMIT 1)cs ON TRUE
 LEFT JOIN LATERAL(SELECT status,key_message FROM issue_response_submissions x WHERE x.workflow_id=w.id ${manager?'':"AND x.status='APPROVED'"} ORDER BY x.version DESC LIMIT 1)rs ON TRUE
 LEFT JOIN LATERAL(SELECT id,analyzed_at,result FROM issue_monitoring_analysis_snapshots x WHERE x.workflow_id=w.id ORDER BY x.period_number DESC,x.id DESC LIMIT 1)ma ON TRUE
 LEFT JOIN LATERAL(SELECT id,result,analyzed_at FROM issue_communication_gap_snapshots x WHERE x.workflow_id=w.id ORDER BY x.id DESC LIMIT 1)gs ON TRUE
 LEFT JOIN LATERAL(SELECT result FROM issue_publication_analysis_snapshots x WHERE x.workflow_id=w.id LIMIT 1)pa ON TRUE
 LEFT JOIN LATERAL(SELECT id,event_type,metadata,created_at FROM issue_workflow_events x WHERE x.workflow_id=w.id AND x.event_type IN('KNOWLEDGE_EVALUATION_DRAFTED','KNOWLEDGE_EVALUATION_APPROVED') ${intent.domain==='evaluation'&&manager?'':"AND x.event_type='KNOWLEDGE_EVALUATION_APPROVED'"} ORDER BY x.id DESC LIMIT 1)ke ON TRUE
 LEFT JOIN LATERAL(SELECT p.id,p.status,p.updated_at,(SELECT COUNT(*) FROM content_project_items ci WHERE ci.project_id=p.id)::int item_count,(SELECT COUNT(*) FROM content_project_items ci WHERE ci.project_id=p.id AND ci.status='PROMPT_READY')::int ready_count FROM content_projects p WHERE p.workflow_id=w.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 1)cp ON TRUE
 WHERE ${where.join(' AND ')} ORDER BY i.updated_at DESC,i.id DESC,w.cycle_number DESC LIMIT ${intent.details||['library','evaluation'].includes(intent.domain)?3:5}`,params)).rows;
 const label=({issue:'isu',clarification:'klarifikasi',strategy:'Strakom',publication:'publikasi',monitoring:'monitoring',gap:'analisis Gap',content:'Content Studio',history:'riwayat siklus',evaluation:'evaluasi tersimpan',library:'pembelajaran disetujui'})[intent.domain];
 const text=(v:any,max=360)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
 const points=(v:any)=>Array.isArray(v)?v.slice(0,2).map(x=>text(x,160)).filter(Boolean).join('; '):'';
 const detail=(r:any)=>{
  const gap=r.gap_result?.data||r.gap_result||{},pub=r.publication_result?.data||r.publication_result||{},mon=r.monitoring_result?.analysis?.focusAssessment||{},evaluation=r.evaluation_metadata?.evaluation||{};
  if(intent.domain==='library'||intent.domain==='evaluation')return `${r.evaluation_status==='KNOWLEDGE_EVALUATION_APPROVED'?'Disetujui Humas':'Draft evaluasi'}\n${text(evaluation.summary)}${points(evaluation.lessons)?'\nPelajaran: '+points(evaluation.lessons):''}${points(evaluation.recommendations)?'\nRekomendasi: '+points(evaluation.recommendations):''}`;
  if(intent.domain==='history')return `alur ${r.workflow_status}; Gap ${r.gap_result?'tersimpan':'tidak dilalui'}; klarifikasi ${r.response_status||'tidak dilalui'}; Strakom ${r.strategy_status||'tidak dilalui'}; Content Studio ${manager?r.content_status||'tidak dilalui':'khusus Humas'}; publikasi ${r.published_at?'ada':'tidak dilalui'}; monitoring ${r.monitoring_analyzed_at?'tersimpan':'tidak dilalui'}; pembelajaran ${r.evaluation_status==='KNOWLEDGE_EVALUATION_APPROVED'?'disetujui':'belum disetujui'}`;
  if(intent.domain==='gap')return `${gap.semanticAssessment?.status||gap.baselineStatus||'Status belum tersedia'}\n${points((gap.semanticAssessment?.coverage||gap.externalAngles?.claims||gap.externalAngles?.angles||[]).map((x:any)=>x.claim||x.label))||'Rincian klaim belum tersedia.'}${text(gap.geographicAnalysis?.implication||gap.externalAngles?.geographicAnalysis?.implication)?'\nKewilayahan: '+text(gap.geographicAnalysis?.implication||gap.externalAngles?.geographicAnalysis?.implication):''}`;
  if(intent.domain==='content')return `status ${r.content_status}; ${r.ready_count||0}/${r.item_count||0} prompt siap (hasil tersimpan).`;
  if(intent.domain==='issue')return `status ${r.status}; alur ${r.workflow_status||'belum dimulai'}; risiko ${r.risk_level||'belum dinilai'}`;
  if(intent.domain==='strategy')return `Strakom ${r.strategy_status}`+(intent.details?'\n'+(districtRole?'Pesan lokal kecamatan dapat dilihat di aplikasi.':text(r.executive_summary)||'Ringkasan belum tersedia.')+(points(r.key_messages)?'\nPesan utama: '+points(r.key_messages):''):'');
  if(intent.domain==='clarification')return `klarifikasi ${r.response_status||'belum dikirim'}; alur ${r.workflow_status}`+(intent.details&&r.response_message?'\nPesan utama: '+text(r.response_message):'');
  if(intent.domain==='publication')return (r.published_at?`dipublikasikan ${new Date(r.published_at).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}`:'belum dipublikasikan')+(intent.details?'\n'+(text(pub.executionAssessment?.assessment||pub.summary)||'Analisis publikasi belum tersedia.'):'');
  return `alur ${r.workflow_status}; analisis tersimpan ${r.monitoring_analyzed_at?'tersedia':'belum tersedia'}`+(intent.details?'\n'+(text(mon.cycleConclusion)||'Kesimpulan monitoring belum tersedia.')+(points(mon.strengths)?'\nKekuatan: '+points(mon.strengths):''):'');
 };
 const body=`Ditemukan ${Number(rows[0]?.total||0)} ${label}${intent.period?' '+periodLabel[intent.period]:''}${intent.pending?' yang belum selesai':''}.`+(rows.length?'\n'+rows.map((r,i)=>`${i+1}. ${r.title} · siklus #${r.cycle_number||1}\n${detail(r)}`).join('\n\n'):' Belum ada data yang cocok pada akses akun ini.');
 return body.slice(0,3550)+footer;
}
