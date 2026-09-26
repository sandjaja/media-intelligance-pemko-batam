export type CoverageAngle={key:string;label:string;anchors?:string[];evidence:Array<{id:string;source:string;title:string|null}>};
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
