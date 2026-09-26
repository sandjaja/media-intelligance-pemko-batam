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
 const key=process.env.GEMINI_API_KEY;if(!evidence.length)return fallback('NO_VALID_EVIDENCE');if(!key)return fallback('GEMINI_API_KEY_MISSING');
 const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
 const source=evidence.slice(0,40).map(e=>({evidenceId:ref(e),source:e.source,title:clip(e.title,500),text:clip([e.summary,e.content,e.body_text].filter(Boolean).join(' '))}));
 try{
  const prompt=`Anda adalah Dynamic External Concern Extractor untuk Communication Gap pemerintah. Tujuan Anda BUKAN merangkum semua fakta berita, melainkan menemukan concern eksternal yang masih perlu dijelaskan, dijawab, diklarifikasi, atau ditangani dalam komunikasi pemerintah.\n\nINCLUDE hanya bila evidence menunjukkan substansi seperti: masalah/keluhan/tuntutan; dampak atau gangguan yang menjadi perhatian; penyebab yang dipersoalkan atau perlu dijelaskan; risiko/ancaman; ketidakpastian jadwal/status/tanggung jawab; target/capaian yang dipertanyakan atau belum terpenuhi; atau penanganan yang dipersoalkan, belum selesai, belum jelas hasilnya, atau dinilai belum memadai.\n\nEXCLUDE fakta yang hanya menyatakan tindakan/respons pemerintah tanpa gap tersisa, misalnya pejabat menemui warga/pekerja, pemerintah mengimbau memakai masker, menerbitkan surat edaran, membentuk tim, membuka/menutup kegiatan, atau tindakan resmi lain, KECUALI evidence secara eksplisit menunjukkan tindakan tersebut dipersoalkan, belum memadai, belum selesai, belum jelas hasilnya, atau menjadi sumber concern. EXCLUDE pula fakta latar belakang/deskriptif yang tidak memerlukan jawaban komunikasi. Jangan mengubah tindakan pemerintah menjadi tuntutan/keluhan.\n\nUntuk setiap kandidat tentukan include true/false. Jika include=true, claim harus menuliskan substansi concern/gap-nya, bukan sekadar peristiwa. Gabungkan claim yang semakna. Jangan menambah fakta yang tidak ada. Setiap claim WAJIB menunjuk evidenceIds yang diberikan. angleType hanya salah satu: ${Object.keys(TYPES).join(', ')}. Gunakan OTHER bila tidak cocok; jangan memaksa kategori. confidence 0..1 adalah keyakinan bahwa ini benar-benar external concern yang relevan untuk Communication Gap. Jangan menilai apakah Owned Channel sudah menjawabnya; tahap lain yang akan melakukan coverage matching.\n\nOutput JSON object {"claims":[{"claim":"...","angleType":"...","confidence":0.0,"evidenceIds":["online:1"],"include":true,"excludeReason":null}]}. Kandidat yang include=false boleh dikembalikan untuk audit tetapi akan dibuang sistem. Maksimal 16 kandidat; prioritaskan concern substantif.\n\nEVIDENCE:\n${JSON.stringify(source)}`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
  const payload=await response.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');
  if(!raw)throw new Error('AI provider returned no text');
  const parsed=JSON.parse(raw),validIds=new Set(source.map(x=>x.evidenceId)),byId=new Map(evidence.map(e=>[ref(e),e]));
  const claims:DynamicClaim[]=(Array.isArray(parsed.claims)?parsed.claims:[]).slice(0,16).filter((c:any)=>c?.include!==false).map((c:any)=>{
   const ids:string[]=[...new Set<string>((Array.isArray(c.evidenceIds)?c.evidenceIds:[]).map((x:any)=>String(x)).filter((x:string)=>validIds.has(x)))];
   const type=Object.prototype.hasOwnProperty.call(TYPES,String(c.angleType))?String(c.angleType):'OTHER';
   const ev=ids.map((id:string)=>byId.get(id)).filter(Boolean) as IssueAngleEvidence[];
   return{key:type,label:TYPES[type],claim:String(c.claim||'').trim().slice(0,500),confidence:Math.max(0,Math.min(1,Number(c.confidence)||0)),evidenceIds:ids,evidenceCount:ev.length,evidence:ev.map(e=>({id:String(e.id),source:e.source,title:e.title??null})),anchors:[]};
  }).filter((c:DynamicClaim)=>c.claim.length>=8&&c.evidenceIds.length>0&&c.confidence>=0.45);
  if(!claims.length)return fallback('AI_RETURNED_NO_VALID_CLAIMS');
  return{angles:claims,claims,unclassified:[],totalEvidence:evidence.length,mode:'ai-dynamic' as const,fallbackReason:null};
 }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,180);console.warn('[communication-gap] dynamic claim fallback:',reason);return fallback(reason)}
}
