import { Pool } from 'pg';
import { analyzeArticle, rankDailyHighlights, topNarrativeTerms, type IntelligenceArticle } from './media-intelligence-core.js';

type DailyRow = { id:string|number; title:string; summary:string|null; content:string|null; url:string|null; published_at:string|null; sentiment:string|null; risk_score:number|null; risk_level:string|null; impact_score:number|null; velocity_score:number|null; importance_score:number|null; source_name:string|null; source_tier:number|null; media_kind:'online'|'print'|'social'|null; opd_id:string|number|null; opd_name:string|null };

function statusFromRisk(score:number){ return score>=80?'CRITICAL':score>=60?'ESCALATING':score>=35?'WATCH':'NORMAL'; }
function responseWindow(score:number){ return score>=80?'0–1 JAM':score>=60?'1–6 JAM':score>=35?'6–24 JAM':'MONITOR'; }
function incidentSeverity(status:string){ return status==='CRITICAL'?'CRITICAL':status==='ESCALATING'?'HIGH':status==='WATCH'?'MEDIUM':'LOW'; }

async function syncDailyIncident(pool:Pool, result:any, topArticle:DailyRow|undefined, opdId?:string|null){
  if (!topArticle || !['ESCALATING','CRITICAL'].includes(result.status)) return null;
  const incidentKey=`DAILY-${result.date}-${opdId??'ALL'}`;
  const severity=incidentSeverity(result.status);
  const decisionRequired=`Validasi isu “${topArticle.title}”, tetapkan PIC lintas-OPD, dan siapkan narasi resmi.`;
  const existing=await pool.query(`SELECT id,status,severity FROM incidents WHERE incident_key=$1`,[incidentKey]);
  if(existing.rows.length){
    const current=existing.rows[0];
    await pool.query(`UPDATE incidents SET signal_article_id=$2,severity=$3,decision_required=$4,updated_at=NOW(),status=CASE WHEN status='RESOLVED' THEN status ELSE 'ESCALATED' END WHERE id=$1`,[current.id,topArticle.id,severity,decisionRequired]);
    return {id:current.id,key:incidentKey,created:false,severity};
  }
  const inserted=await pool.query(`INSERT INTO incidents(incident_key,opd_id,signal_article_id,severity,status,decision_required,first_detected_at,created_by,updated_at,created_at) VALUES($1,$2,$3,$4,'ESCALATED',$5,NOW(),NULL,NOW(),NOW()) RETURNING id`,[incidentKey,opdId??topArticle.opd_id??null,topArticle.id,severity,decisionRequired]);
  const incidentId=inserted.rows[0]?.id;
  if(incidentId){
    const tasks=[['VERIFY','Validasi fakta, angka, dan sumber utama.'],['COORDINATE','Koordinasikan OPD terkait dan tetapkan PIC.'],['MESSAGE','Siapkan holding statement, key message, dan Q&A.'],['MONITOR','Pantau amplifikasi media dan perubahan risk.']];
    for(const [taskKey,label] of tasks) await pool.query(`INSERT INTO incident_tasks(incident_id,task_key,label,status) VALUES($1,$2,$3,'OPEN') ON CONFLICT(incident_id,task_key) DO NOTHING`,[incidentId,taskKey,label]);
    await pool.query(`INSERT INTO incident_events(incident_id,event_type,payload,created_by) VALUES($1,'DAILY_INTELLIGENCE_ESCALATION',$2,NULL)`,[incidentId,{date:result.date,status:result.status,risk:result.topIssue?.riskScore,responseWindow:result.responseWindow,title:topArticle.title}]);
  }
  return {id:incidentId,key:incidentKey,created:true,severity};
}

export async function generateDailyIntelligence(pool:Pool,date=new Date().toISOString().slice(0,10),opdId?:string|null){
  const params:unknown[]=[date]; const where=[`a.published_at >= $1::date`,`a.published_at < ($1::date + INTERVAL '1 day')`];
  if(opdId){params.push(opdId);where.push(`a.opd_id=$${params.length}`);}
  const {rows}=await pool.query(`SELECT a.id,a.opd_id,a.title,a.summary,a.content,a.url,a.published_at,a.sentiment,a.risk_score,a.risk_level,a.impact_score,a.velocity_score,a.importance_score,ms.name source_name,ms.tier source_tier,ms.category media_kind,o.name opd_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id LEFT JOIN opd o ON o.id=a.opd_id WHERE ${where.join(' AND ')} ORDER BY a.published_at DESC`,params);
  const articles=rows as DailyRow[];
  const intelligence=articles.map((a):IntelligenceArticle=>({id:a.id,title:a.title,summary:a.summary,content:a.content,sourceName:a.source_name,sourceTier:a.source_tier,mediaKind:a.media_kind,opdId:a.opd_id??null,publishedAt:a.published_at}));
  const analyses=articles.map((a,i)=>({
    ...analyzeArticle(intelligence[i]),
    sentiment:(a.sentiment??undefined) as any,
    riskScore:Number(a.risk_score??0),riskLevel:(a.risk_level??'low') as any,
    impactScore:Number(a.impact_score??0),velocityScore:Number(a.velocity_score??0),importanceScore:Number(a.importance_score??0)
  }));
  const ranked=rankDailyHighlights(intelligence,analyses);
  const highlights=ranked.slice(0,10).map(({article,analysis})=>{const row=articles.find(a=>String(a.id)===String(article.id));return{id:article.id,title:article.title,url:row?.url??null,source:row?.source_name??'Unknown',opd:row?.opd_name??null,publishedAt:row?.published_at??null,sentiment:analysis.sentiment,riskScore:analysis.riskScore,riskLevel:analysis.riskLevel,impactScore:analysis.impactScore,velocityScore:analysis.velocityScore,importanceScore:analysis.importanceScore};});
  const negative=[...articles].filter(a=>a.sentiment==='negative').sort((a,b)=>Number(b.risk_score??0)-Number(a.risk_score??0)).slice(0,5);
  const sources=new Map<string,number>(); const opds=new Map<string,number>();
  for(const a of articles){if(a.source_name)sources.set(a.source_name,(sources.get(a.source_name)??0)+1);if(a.opd_name)opds.set(a.opd_name,(opds.get(a.opd_name)??0)+1);}
  const sourceSpread=[...sources.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count}));
  const opdSpread=[...opds.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count}));
  const top=ranked[0]?.analysis; const topArticle=ranked[0]?.article; const topRow=topArticle?articles.find(a=>String(a.id)===String(topArticle.id)):undefined; const avgRisk=articles.length?Math.round(articles.reduce((s,a)=>s+Number(a.risk_score??0),0)/articles.length):0;
  const negativeCount=articles.filter(a=>a.sentiment==='negative').length; const highRiskCount=articles.filter(a=>['high','critical'].includes(String(a.risk_level))).length;
  const topRisk=Number(top?.riskScore??avgRisk); const status=statusFromRisk(Math.max(avgRisk,topRisk));
  const result:any={date,generatedAt:new Date().toISOString(),scope:{opdId:opdId??null},status,responseWindow:responseWindow(topRisk),metrics:{totalArticles:articles.length,negativeCount,highRiskCount,sourceCount:sources.size,opdCount:opds.size,averageRisk:avgRisk,mediaSpread:sourceSpread.length},dailyHighlight:highlights[0]??null,highlights,topNegative:negative.map(a=>({id:a.id,title:a.title,source:a.source_name??'Unknown',riskScore:Number(a.risk_score??0),url:a.url??null})),topIssue:topArticle?{title:topArticle.title,source:topRow?.source_name??'Unknown',opd:topRow?.opd_name??null,riskScore:topRisk,impactScore:Number(top?.impactScore??0)}:null,topMedia:sourceSpread[0]??null,topOpd:opdSpread[0]??null,mediaSpread:sourceSpread,opdSpread,narrativeMovement:topNarrativeTerms(intelligence,15),executiveBrief:topArticle?`Hari ini terdeteksi ${articles.length} pemberitaan. Fokus utama adalah “${topArticle.title}”. Tingkat status ${status} dengan kebutuhan respons ${responseWindow(topRisk)}. ${negativeCount} pemberitaan bernada negatif dan ${highRiskCount} berada pada risiko tinggi/kritis.`:'Belum ada pemberitaan terdeteksi pada periode ini.',recommendedActions:topArticle?[topRisk>=60?'Validasi fakta dan tetapkan PIC lintas-OPD segera.':'Pantau perkembangan isu dan siapkan data pendukung.',topRisk>=60?'Siapkan holding statement dan satu narasi resmi.':'Pastikan kanal resmi memiliki informasi yang konsisten.','Pantau media yang memperluas isu dan identifikasi potensi eskalasi berikutnya.']:['Pastikan sumber media aktif dan ingestion berjalan normal.'],disclaimer:'Analisis bersifat decision support. Verifikasi fakta dan konteks lapangan tetap diperlukan sebelum keputusan resmi.'};
  const incident=await syncDailyIncident(pool,result,topRow,opdId);
  result.incident=incident;
  await pool.query(`INSERT INTO daily_intelligence_runs(run_date,opd_id,status,payload,created_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(run_date,opd_id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,created_at=NOW()`,[date,opdId??null,status,result]);
  return result;
}
