export type CoverageAngle={key:string;label:string;claim?:string;confidence?:number;anchors?:string[];evidence:Array<{id:string;source:string;title:string|null}>};
export type OwnedResponse={id:string|number;title?:string|null;content?:string|null;owned_account_id?:string|number|null;owned_account_name?:string|null};

const STOP=new Set(['yang','dan','dengan','untuk','dari','pada','dalam','oleh','atau','ini','itu','akan','telah','sudah','kota','batam','pemko','pemerintah','berita','terkait','mengenai']);
const norm=(v:any)=>String(v??'').toLocaleLowerCase('id-ID').replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&!STOP.has(x)))];

const CONCEPTS:Record<string,string[]>={
 AIR_QUALITY:['kualitas udara','ispu','udara tidak sehat','udara kurang sehat','pencemaran udara','kabut asap'],
 RESPIRATORY_HEALTH:['ispa','pernapasan','gangguan pernapasan','kesehatan','masker'],
 OUTDOOR_ACTIVITY:['aktivitas luar','aktivitas di luar','luar ruangan','belajar dari rumah','sekolah','ptm'],
 PREVENTION:['imbau','imbauan','waspada','kewaspadaan','masker','kurangi aktivitas','mengurangi aktivitas','hindari pembakaran','pembakaran sampah','pembakaran lahan'],
 PAYMENT_WAGES:['gaji','upah','pembayaran','hak pekerja','hak buruh'],
 TIMING:['jadwal','kapan','kepastian','batas waktu','tenggat'],
 HANDLING:['penanganan','ditangani','tindak lanjut','menindaklanjuti','solusi','penyelesaian','membentuk tim','kawal','mengawal']
};
const concepts=(v:any)=>{const t=norm(v);return Object.entries(CONCEPTS).filter(([,terms])=>terms.some(term=>t.includes(norm(term)))).map(([key])=>key)};

export function matchOfficialResponseCoverage(angles:CoverageAngle[],owned:OwnedResponse[]){
 const official=owned.map(o=>{const raw=[o.title,o.content].filter(Boolean).join(' ');return{id:String(o.id),title:o.title??null,account:o.owned_account_name??null,text:tokens(raw),concepts:concepts(raw)}});
 const coverage=angles.map(angle=>{
  const anchors=angle.anchors?.length?[...new Set(angle.anchors)]:[...new Set(angle.evidence.flatMap(e=>tokens(e.title)))];
  const angleRaw=angle.evidence.map(e=>e.title||'').join(' ')+' '+anchors.join(' '),angleConcepts=concepts(angleRaw);
  let best:{id:string;title:string|null;account:string|null;shared:string[];sharedConcepts:string[];score:number}|null=null;
  for(const o of official){
   const set=new Set(o.text),shared=anchors.filter(x=>set.has(x)),sharedConcepts=angleConcepts.filter(x=>o.concepts.includes(x));
   const lexical=anchors.length?shared.length/anchors.length:0,semantic=angleConcepts.length?sharedConcepts.length/angleConcepts.length:0;
   const score=Math.max(lexical,semantic);
   if(!best||score>best.score)best={id:o.id,title:o.title,account:o.account,shared,sharedConcepts,score};
  }
  const score=best?.score??0,semanticHits=best?.sharedConcepts.length??0,lexicalHits=best?.shared.length??0;
  const status=score>=0.6&&(semanticHits>=2||lexicalHits>=2)?'COVERED':(score>=0.3&&(semanticHits>=1||lexicalHits>=1))?'PARTIAL':'NOT_COVERED';
  return{key:angle.key,label:angle.label,status,matchScore:Math.round(score*100),matchedOfficial:status==='NOT_COVERED'?null:best&&{id:best.id,title:best.title,account:best.account,sharedAnchors:best.shared,sharedConcepts:best.sharedConcepts},externalEvidenceCount:angle.evidence.length};
 });
 const aggregate=coverage.length===0?'UNASSESSED':owned.length===0?'NO_RESPONSE':coverage.every(x=>x.status==='COVERED')?'ADDRESSED':coverage.some(x=>x.status==='COVERED'||x.status==='PARTIAL')?'PARTIAL_RESPONSE':'NO_RESPONSE';
 return{status:aggregate,coverage,officialResponseCount:owned.length};
}


export async function matchDynamicOfficialResponseCoverage(angles:CoverageAngle[],owned:OwnedResponse[]){
 if(!angles.length)return{status:'UNASSESSED',coverage:[],officialResponseCount:owned.length,mode:'dynamic'};
 if(!owned.length)return{status:'NO_RESPONSE',coverage:angles.map(a=>({key:a.key,label:a.label,claim:a.claim||a.label,status:'NOT_COVERED',matchScore:0,matchedOfficial:null,externalEvidenceCount:a.evidence.length})),officialResponseCount:0,mode:'dynamic'};
 const key=process.env.GEMINI_API_KEY;
 if(!key)return{...matchOfficialResponseCoverage(angles,owned),mode:'deterministic-fallback',fallbackReason:'GEMINI_API_KEY_MISSING'};
 if(!angles.some(a=>a.claim))return{...matchOfficialResponseCoverage(angles,owned),mode:'deterministic-fallback',fallbackReason:'NO_DYNAMIC_CLAIMS'};
 const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite',claims=angles.map((a,i)=>({claimId:String(i),claim:a.claim||a.label,angleType:a.key})),responses=owned.slice(0,20).map(o=>({responseId:String(o.id),title:o.title||'',content:String(o.content||'').slice(0,4000)}));
 try{
  const prompt=`Anda adalah evaluator Communication Gap pemerintah. Nilai SEBERAPA JAUH substansi inti setiap external claim benar-benar dijawab oleh respons resmi. Ini bukan similarity/topic matching. Kesamaan nama isu, kata, aktor, lokasi, atau pengakuan bahwa masalah ada TIDAK cukup untuk skor tinggi.\n\nATURAN UTAMA:\n1. Identifikasi terlebih dahulu inti yang diminta claim: misalnya siapa yang bertanggung jawab, kapan selesai/dibayar, berapa/apa hasilnya, mengapa terjadi, bagaimana dampaknya, atau tindakan konkret apa yang sudah menghasilkan penyelesaian.\n2. Bedakan PROSES dari HASIL. Pernyataan seperti akan menelusuri, akan berkoordinasi, membentuk tim, mengawal, mengupayakan, mengimbau, sedang membahas, atau berjanji mencari solusi hanya membuktikan proses. Jangan anggap itu menjawab kepastian hasil, pihak bertanggung jawab, pembayaran, jadwal penyelesaian, atau outcome konkret kecuali respons memang menyebut jawabannya.\n3. Jika claim memiliki beberapa unsur, nilai hanya unsur yang benar-benar dijawab. Jangan memberi kredit untuk detail respons yang relevan dengan isu tetapi tidak menjawab unsur claim.\n4. Gunakan evidence respons yang tertulis; jangan mengasumsikan hasil di masa depan.\n\nANCHOR SCORE:\n0 = tidak menjawab substansi inti sama sekali.\n1-25 = hanya mengakui masalah/konteks atau respons sangat periferal.\n26-50 = ada tindakan/proses/mitigasi relevan, tetapi inti pertanyaan/hasil masih belum jelas.\n51-75 = sebagian besar substansi dijawab, tetapi masih ada unsur penting seperti kepastian, hasil, pihak, nilai, atau waktu yang belum terjawab.\n76-99 = hampir seluruh substansi inti dijawab dan hanya detail minor yang tersisa. Jangan gunakan rentang ini bila outcome utama masih belum diketahui.\n100 = seluruh substansi inti claim dijawab eksplisit dan tidak ada elemen material yang tersisa.\n\nContoh prinsip: claim 'belum jelas siapa yang bertanggung jawab' + respons 'Pemko membentuk tim untuk menelusuri pihak yang bertanggung jawab' = proses relevan tetapi identitas pihak masih belum diketahui; skor tidak boleh tinggi. Claim 'gaji belum dibayar dan meminta kepastian pembayaran' + respons 'pemerintah akan mengawal hak pekerja' = relevan tetapi belum memberi kepastian pembayaran konkret; jangan beri skor tinggi.\n\nStatus mengikuti score: 0 NOT_COVERED; 1-99 PARTIAL; 100 COVERED. responseId harus berasal dari daftar atau null. reason harus menjelaskan tepat bagian yang sudah dijawab dan bagian material yang masih kosong. Output JSON {"coverage":[{"claimId":"0","status":"COVERED|PARTIAL|NOT_COVERED","score":0,"responseId":"1","reason":"..."}]}.\n\nDATA:\n${JSON.stringify({claims,responses})}`;
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json'}})});
  if(!response.ok)throw new Error(`Gemini HTTP ${response.status}`);
  const payload=await response.json() as any,raw=payload.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||'').join('');if(!raw)throw new Error('Gemini returned no text');
  const parsed=JSON.parse(raw),rows=Array.isArray(parsed.coverage)?parsed.coverage:[],byClaim=new Map(rows.map((x:any)=>[String(x.claimId),x])),byResponse=new Map(responses.map(x=>[x.responseId,x]));
  const coverage=angles.map((a,i)=>{const x:any=byClaim.get(String(i))||{},score=Math.max(0,Math.min(100,Math.round(Number(x.score)||0))),status=score===100?'COVERED':score>0?'PARTIAL':'NOT_COVERED',r=byResponse.get(String(x.responseId));return{key:a.key,label:a.label,claim:a.claim||a.label,status,matchScore:score,reason:String(x.reason||'').slice(0,500),matchedOfficial:status==='NOT_COVERED'?null:(r?{id:r.responseId,title:r.title,account:null}:null),externalEvidenceCount:a.evidence.length}});
  const aggregate=coverage.every(x=>x.status==='COVERED')?'ADDRESSED':coverage.some(x=>x.status==='COVERED'||x.status==='PARTIAL')?'PARTIAL_RESPONSE':'NO_RESPONSE';
  return{status:aggregate,coverage,officialResponseCount:owned.length,mode:'ai-dynamic',fallbackReason:null};
 }catch(error:any){const reason=String(error?.message||error||'UNKNOWN').slice(0,180);console.warn('[communication-gap] response coverage fallback:',reason);return{...matchOfficialResponseCoverage(angles,owned),mode:'deterministic-fallback',fallbackReason:reason}}
}
