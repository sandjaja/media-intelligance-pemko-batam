export type CoverageAngle={key:string;label:string;anchors?:string[];evidence:Array<{id:string;source:string;title:string|null}>};
export type OwnedResponse={id:string|number;title?:string|null;content?:string|null;owned_account_id?:string|number|null;owned_account_name?:string|null};

const STOP=new Set(['yang','dan','dengan','untuk','dari','pada','dalam','oleh','atau','ini','itu','akan','telah','sudah','kota','batam','pemko','pemerintah','berita','terkait','mengenai']);
const norm=(v:any)=>String(v??'').toLocaleLowerCase('id-ID').replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const tokens=(v:any)=>[...new Set(norm(v).split(' ').filter(x=>x.length>=4&&!STOP.has(x)))];

export function matchOfficialResponseCoverage(angles:CoverageAngle[],owned:OwnedResponse[]){
 const official=owned.map(o=>({id:String(o.id),title:o.title??null,account:o.owned_account_name??null,text:tokens([o.title,o.content].filter(Boolean).join(' '))}));
 const coverage=angles.map(angle=>{
  const anchors=angle.anchors?.length?[...new Set(angle.anchors)]:[...new Set(angle.evidence.flatMap(e=>tokens(e.title)))];
  let best:{id:string;title:string|null;account:string|null;shared:string[];score:number}|null=null;
  for(const o of official){
   const set=new Set(o.text),shared=anchors.filter(x=>set.has(x));
   const score=anchors.length?shared.length/anchors.length:0;
   if(!best||score>best.score)best={id:o.id,title:o.title,account:o.account,shared,score};
  }
  const score=best?.score??0;
  const status=score>=0.6&&((best?.shared.length??0)>=2)?'COVERED':score>=0.3&&(best?.shared.length??0)>=1?'PARTIAL':'NOT_COVERED';
  return{key:angle.key,label:angle.label,status,matchScore:Math.round(score*100),matchedOfficial:status==='NOT_COVERED'?null:best&&{id:best.id,title:best.title,account:best.account,sharedAnchors:best.shared},externalEvidenceCount:angle.evidence.length};
 });
 const aggregate=coverage.length===0?'UNASSESSED':owned.length===0?'NO_RESPONSE':coverage.every(x=>x.status==='COVERED')?'ADDRESSED':coverage.some(x=>x.status==='COVERED'||x.status==='PARTIAL')?'PARTIAL_RESPONSE':'NO_RESPONSE';
 return{status:aggregate,coverage,officialResponseCount:owned.length};
}
