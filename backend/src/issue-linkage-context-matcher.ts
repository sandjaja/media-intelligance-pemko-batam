export type LinkageContextEvidence={sourceType:string;id:number;title?:string|null;summary?:string|null;occurredAt?:string|null;opdName?:string|null;accountName?:string|null};
export type LinkageContextResult={mode:'ai-context'|'deterministic-fallback';fallbackReason:string|null;groups:Array<{groupId:string;label:string;reason:string;evidenceRefs:string[]}>};

const ref=(e:LinkageContextEvidence)=>`${e.sourceType}:${e.id}`;
const fallback=(evidence:LinkageContextEvidence[],reason:string):LinkageContextResult=>({mode:'deterministic-fallback',fallbackReason:reason,groups:[{groupId:'deterministic',label:'Kelompok deterministik',reason:'Gemini tidak digunakan; pertahankan grouping deterministik.',evidenceRefs:evidence.map(ref)}]});

export async function matchIssueLinkageContext(issue:{issueId:number;title?:string|null},primaryKeyword:string|null,evidence:LinkageContextEvidence[]):Promise<LinkageContextResult>{
 if(evidence.length<2)return fallback(evidence,'INSUFFICIENT_EVIDENCE');
 const key=process.env.GEMINI_API_KEY;if(!key)return fallback(evidence,'GEMINI_API_KEY_MISSING');
 const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
 const source=evidence.slice(0,40).map(e=>({evidenceRef:ref(e),source:e.sourceType,title:String(e.title||'').slice(0,500),summary:String(e.summary||'').slice(0,1800),occurredAt:e.occurredAt||null,opd:e.opdName||null,account:e.accountName||null}));
 try{
  const prompt=`Anda adalah pemeriksa konteks untuk Issue Linkage media pemerintah. Semua berita di bawah sudah lolos grouping deterministik dan direkomendasikan ke Existing Issue yang sama. Tugas Anda HANYA memeriksa apakah mereka membahas KASUS/PERISTIWA yang sama.

Jangan menganggap sama hanya karena Primary Keyword, taxonomy, OPD, aktor umum, atau nama Issue sama. Bedakan kasus berbeda yang kebetulan bertopik sama. Pertimbangkan objek spesifik, pihak/entitas, lokasi, kejadian, waktu, tindakan, tuntutan, dan rangkaian peristiwa. Berita lanjutan/update dari kasus yang sama boleh satu kelompok meskipun judul berbeda.

Jangan menentukan apakah berita menjadi Evidence Issue dan jangan memilih Issue lain. Keputusan final tetap oleh Humas. Jangan menambah fakta.

Kembalikan JSON {"groups":[{"groupId":"A","label":"ringkasan konteks singkat","reason":"alasan singkat","evidenceRefs":["online:1"]}]}. Setiap evidenceRef yang diberikan harus muncul tepat satu kali. Maksimal 8 kelompok.

EXISTING ISSUE: ${JSON.stringify(issue)}
PRIMARY KEYWORD: ${JSON.stringify(primaryKeyword)}
EVIDENCE: ${JSON.stringify(source)}`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
  const payload=await response.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');if(!raw)throw new Error('Gemini returned no text');
  const parsed=JSON.parse(raw),valid=new Set(source.map(x=>x.evidenceRef)),seen=new Set<string>(),groups:any[]=[];
  for(const g of (Array.isArray(parsed.groups)?parsed.groups:[]).slice(0,8)){const refs=[...new Set<string>((Array.isArray(g.evidenceRefs)?g.evidenceRefs:[]).map(String).filter((x:string)=>valid.has(x)&&!seen.has(x)))];if(!refs.length)continue;refs.forEach(x=>seen.add(x));groups.push({groupId:String(g.groupId||groups.length+1).slice(0,40),label:String(g.label||'Konteks').slice(0,180),reason:String(g.reason||'').slice(0,400),evidenceRefs:refs});}
  for(const x of source)if(!seen.has(x.evidenceRef))groups.push({groupId:`single-${x.evidenceRef}`,label:x.title.slice(0,180)||x.evidenceRef,reason:'Tidak dikelompokkan AI dengan evidence lain.',evidenceRefs:[x.evidenceRef]});
  if(!groups.length)return fallback(evidence,'AI_RETURNED_NO_VALID_GROUPS');
  return{mode:'ai-context',fallbackReason:null,groups};
 }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,180);console.warn('[issue-linkage] context matcher fallback:',reason);return fallback(evidence,reason)}
}
