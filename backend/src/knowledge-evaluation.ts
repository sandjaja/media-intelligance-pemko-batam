import { z } from 'zod';

export const knowledgeEvaluationSchema=z.object({
  summary:z.string().trim().max(4000),
  strengths:z.array(z.string().trim().min(1).max(1200)).max(10),
  weaknesses:z.array(z.string().trim().min(1).max(1200)).max(10),
  lessons:z.array(z.string().trim().min(1).max(1200)).max(10),
  recommendations:z.array(z.string().trim().min(1).max(1200)).max(10),
  tags:z.array(z.string().trim().min(1).max(80)).max(10),
});
export type KnowledgeEvaluation=z.infer<typeof knowledgeEvaluationSchema>;
const texts=(value:any):string[]=>Array.isArray(value)?value.map(v=>typeof v==='string'?v:v?.recommendation||v?.assessment||v?.signal||'').filter(Boolean).slice(0,10).map(v=>String(v).slice(0,1200)):[];
const hours=(a:any,b:any)=>{
 if(!a||!b)return null;
 const n=(new Date(b).getTime()-new Date(a).getTime())/3600000;
 return Number.isFinite(n)&&n>=0?Math.round(n*10)/10:null;
};
/** Observations come exclusively from saved cycle results, never from a new evidence analysis. */
export function summarizeKnowledgeSources(source:any){
 const assessment=source.monitoring?.assessment||{};
 const counts=source.monitoring?.evidence||{};
 const total=counts.total==null?null:Number(counts.total);
 const raw=String(assessment.evidenceSufficiency||'INSUFFICIENT');
 const sufficiency=total===0?'INSUFFICIENT':['SUFFICIENT','LIMITED','INSUFFICIENT'].includes(raw)?raw:'INSUFFICIENT';
 const metrics={
  cycleHours:hours(source.workflow.created_at,source.workflow.closed_at),
  publicationHours:hours(source.workflow.created_at,source.workflow.published_at),
  clarificationHours:hours(source.workflow.assigned_at,source.response?.approved_at),
  evidenceTotal:Number.isFinite(total)?total:null,
  evidenceSufficiency:sufficiency,
  executionStatus:source.publication?.analysis?.executionAssessment?.status||null,
  outcomeStatus:assessment.issueOutlook?.status||null,
  conclusion:sufficiency==='SUFFICIENT'?'Bukti tersedia untuk ditinjau Humas. Kecukupan bukti tidak otomatis membuktikan keberhasilan strategi.':'Efektivitas komunikasi belum dapat disimpulkan dengan kuat; bukti monitoring terbatas atau belum memadai.',
 };
 const next=assessment.nextCommunication?.recommendation;
 const evaluation:KnowledgeEvaluation={
  summary:String(assessment.cycleConclusion||'Belum ada kesimpulan monitoring tersimpan. Tinjau kelengkapan data siklus sebelum menyetujui evaluasi.').slice(0,4000),
  strengths:texts(assessment.strengths?.length?assessment.strengths:source.publication?.analysis?.strengths),
  weaknesses:texts(assessment.weaknesses?.length?assessment.weaknesses:source.publication?.analysis?.gaps),
  lessons:[],
  recommendations:next?texts([next]):texts(source.publication?.analysis?.improvements),
  tags:texts(source.keywords?.map((k:any)=>k.keyword)).map(t=>t.slice(0,80)),
 };
 return {metrics,proposal:evaluation};
}
