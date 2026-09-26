import { extractIssueAngles, type IssueAngleEvidence } from './issue-angle-extractor.js';

export type DynamicClaim={
 key:string;
 label:string;
 claim:string;
 confidence:number;
 evidenceIds:string[];
 evidenceCount:number;
 evidence:Array<{id:string;source:string;title:string|null}>;
 anchors:string[];
};

const TYPES:Record<string,string>={
 DEMAND_COMPLAINT:'Tuntutan / Keluhan',
 DISRUPTION:'Gangguan / Hambatan',
 IMPACT:'Dampak',
 CAUSE:'Penyebab',
 HANDLING:'Penanganan / Tindak Lanjut',
 TARGET_PROGRESS:'Target / Capaian',
 TIMING_CERTAINTY:'Jadwal / Kepastian',
 RISK_THREAT:'Risiko / Ancaman',
 OTHER:'Lainnya'
};
const ref=(e:IssueAngleEvidence)=>`${e.source}:${e.id}`;
const clip=(v:any,n=2400)=>String(v??'').slice(0,n);

export async function extractDynamicIssueClaims(evidence:IssueAngleEvidence[]){
 const fallback=(reason='UNKNOWN')=>{const r=extractIssueAngles(evidence);return{...r,mode:'deterministic-fallback' as const,fallbackReason:reason,claims:r.angles.map(a=>({...a,claim:a.label,confidence:0,evidenceIds:a.evidence.map(x=>`${x.source}:${x.id}`)}))}};
 const key=process.env.OPENAI_API_KEY;if(!evidence.length)return fallback('NO_VALID_EVIDENCE');if(!key)return fallback('OPENAI_API_KEY_MISSING');
 const model=process.env.OPENAI_MODEL||'gpt-5-mini';
 const source=evidence.slice(0,40).map(e=>({evidenceId:ref(e),source:e.source,title:clip(e.title,500),text:clip([e.summary,e.content,e.body_text].filter(Boolean).join(' '))}));
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({
   model,
   input:[
    {role:'system',content:[{type:'input_text',text:`Anda mengekstrak concern/claim faktual dari evidence media untuk Communication Gap pemerintah. Jangan menambah fakta yang tidak ada. Gabungkan claim yang semakna. Claim harus spesifik dan singkat, bukan label generik. Setiap claim WAJIB menunjuk evidenceIds yang diberikan. angleType hanya salah satu: ${Object.keys(TYPES).join(', ')}. Gunakan OTHER bila tidak cocok; jangan memaksa kategori. confidence 0..1. Jangan menilai apakah pemerintah sudah menjawab claim. Output JSON object {"claims":[{"claim":"...","angleType":"...","confidence":0.0,"evidenceIds":["online:1"]}]}. Maksimal 12 claim.`}]},
    {role:'user',content:[{type:'input_text',text:JSON.stringify(source)}]}
   ],
   text:{format:{type:'json_object'}},max_output_tokens:1800
  })});
  if(!response.ok)throw new Error(`AI provider HTTP ${response.status}`);
  const payload=await response.json() as any,raw=payload.output_text||payload.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text;
  if(!raw)throw new Error('AI provider returned no text');
  const parsed=JSON.parse(raw),validIds=new Set(source.map(x=>x.evidenceId)),byId=new Map(evidence.map(e=>[ref(e),e]));
  const claims:DynamicClaim[]=(Array.isArray(parsed.claims)?parsed.claims:[]).slice(0,12).map((c:any)=>{
   const ids:string[]=[...new Set<string>((Array.isArray(c.evidenceIds)?c.evidenceIds:[]).map((x:any)=>String(x)).filter((x:string)=>validIds.has(x)))];
   const type=Object.prototype.hasOwnProperty.call(TYPES,String(c.angleType))?String(c.angleType):'OTHER';
   const ev=ids.map((id:string)=>byId.get(id)).filter(Boolean) as IssueAngleEvidence[];
   return{key:type,label:TYPES[type],claim:String(c.claim||'').trim().slice(0,500),confidence:Math.max(0,Math.min(1,Number(c.confidence)||0)),evidenceIds:ids,evidenceCount:ev.length,evidence:ev.map(e=>({id:String(e.id),source:e.source,title:e.title??null})),anchors:[]};
  }).filter((c:DynamicClaim)=>c.claim.length>=8&&c.evidenceIds.length>0&&c.confidence>=0.45);
  if(!claims.length)return fallback('AI_RETURNED_NO_VALID_CLAIMS');
  return{angles:claims,claims,unclassified:[],totalEvidence:evidence.length,mode:'ai-dynamic' as const,fallbackReason:null};
 }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,180);console.warn('[communication-gap] dynamic claim fallback:',reason);return fallback(reason)}
}
