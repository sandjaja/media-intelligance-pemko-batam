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
 INFORMATION_FACT:'Informasi / Fakta',
 ACHIEVEMENT_SUCCESS:'Capaian / Prestasi',
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
  const prompt=`Anda adalah Dynamic Communication Angle Extractor untuk analisis komunikasi pemerintah. Analisis evidence media dari SUDUT KOMUNIKASI, bukan hanya mencari masalah. Setiap evidence valid dapat membawa informasi, capaian, concern, risiko, dampak, tuntutan, ketidakpastian, atau sudut komunikasi lain yang relevan.

TUJUAN:
- Representasikan substansi utama pemberitaan yang penting bagi komunikasi pemerintah.
- Berita positif/netral/informatif TETAP diproses.
- Berita problematik tetap menghasilkan concern yang perlu dijawab/diklarifikasi/ditangani.
- Jangan memaksakan kesan masalah bila evidence hanya bersifat informatif atau capaian.

PILIH ANGLE:
INFORMATION_FACT = informasi/fakta publik yang substantif, kegiatan, keputusan, layanan, hasil acara, atau perkembangan faktual yang tidak dengan sendirinya merupakan masalah.
ACHIEVEMENT_SUCCESS = capaian, prestasi, keberhasilan, penghargaan, target yang tercapai, atau hasil positif.
DEMAND_COMPLAINT = tuntutan/keluhan/keberatan.
DISRUPTION = gangguan/hambatan.
IMPACT = dampak substantif.
CAUSE = penyebab yang relevan/dipersoalkan.
HANDLING = penanganan/tindak lanjut yang menjadi substansi penting; untuk berita problematik, gunakan ini hanya jika penanganannya sendiri dipersoalkan, belum selesai, belum jelas hasilnya, atau penting untuk menjelaskan perkembangan.
TARGET_PROGRESS = target/capaian/progres yang belum final atau sedang berjalan; jangan gunakan untuk prestasi yang sudah tercapai bila ACHIEVEMENT_SUCCESS lebih tepat.
TIMING_CERTAINTY = jadwal/kepastian/status/tanggung jawab yang belum jelas.
RISK_THREAT = risiko/ancaman.
OTHER = sudut komunikasi substantif yang tidak cocok kategori lain.

ATURAN PENTING:
1. Untuk berita informatif/positif, ekstrak informasi/capaian utamanya; jangan mengubahnya menjadi keluhan atau gap.
2. Untuk berita problematik, prioritaskan unresolved concern: apa yang belum jelas, belum selesai, dikeluhkan, berisiko, atau berdampak.
3. Fakta tindakan pemerintah seperti pejabat menemui warga, mengimbau, menerbitkan SE, membentuk tim, membuka/menutup kegiatan tidak boleh otomatis menjadi concern. Jika itu sekadar informasi netral yang memang merupakan substansi utama berita, boleh INFORMATION_FACT. Jika merupakan respons terhadap problem, jangan biarkan tindakan tersebut menutupi unresolved concern yang sebenarnya.
4. Jangan menambah fakta. Gabungkan angle/claim yang semakna.
5. Setiap claim harus spesifik, singkat, dan WAJIB menunjuk evidenceIds yang diberikan.
6. Setiap evidence valid harus diwakili oleh minimal satu claim yang paling substantif bila memang memiliki isi bermakna; jangan membuat claim hanya dari boilerplate.
7. angleType hanya salah satu: ${Object.keys(TYPES).join(', ')}. confidence 0..1.
8. Jangan menilai coverage Owned Channel; tahap lain yang melakukannya.

Output JSON object {"claims":[{"claim":"...","angleType":"...","confidence":0.0,"evidenceIds":["online:1"],"include":true,"excludeReason":null}]}. Maksimal 16 kandidat. Gunakan include=false hanya untuk boilerplate/noise/duplikasi yang tidak substantif.

EVIDENCE:
${JSON.stringify(source)}`
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
  const payload=await response.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');
  if(!raw)throw new Error('AI provider returned no text');
  const parsed=JSON.parse(raw),validIds=new Set(source.map(x=>x.evidenceId)),byId=new Map(evidence.map(e=>[ref(e),e]));
  const claims:DynamicClaim[]=(Array.isArray(parsed.claims)?parsed.claims:[]).slice(0,16).filter((c:any)=>c?.include===true).map((c:any)=>{
   const ids:string[]=[...new Set<string>((Array.isArray(c.evidenceIds)?c.evidenceIds:[]).map((x:any)=>String(x)).filter((x:string)=>validIds.has(x)))];
   const type=Object.prototype.hasOwnProperty.call(TYPES,String(c.angleType))?String(c.angleType):'OTHER';
   const ev=ids.map((id:string)=>byId.get(id)).filter(Boolean) as IssueAngleEvidence[];
   return{key:type,label:TYPES[type],claim:String(c.claim||'').trim().slice(0,500),confidence:Math.max(0,Math.min(1,Number(c.confidence)||0)),evidenceIds:ids,evidenceCount:ev.length,evidence:ev.map(e=>({id:String(e.id),source:e.source,title:e.title??null})),anchors:[]};
  }).filter((c:DynamicClaim)=>c.claim.length>=8&&c.evidenceIds.length>0&&c.confidence>=0.45);
  if(!claims.length)return fallback('AI_RETURNED_NO_VALID_CLAIMS');
  return{angles:claims,claims,unclassified:[],totalEvidence:evidence.length,mode:'ai-dynamic' as const,fallbackReason:null};
 }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,180);console.warn('[communication-gap] dynamic claim fallback:',reason);return fallback(reason)}
}
