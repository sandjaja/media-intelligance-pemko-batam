export type IssueAngleEvidence={id:string|number;source:'online'|'print'|'social';title?:string|null;summary?:string|null;content?:string|null;body_text?:string|null};
export type IssueAngle={key:string;label:string;evidenceCount:number;evidence:Array<{id:string;source:string;title:string|null}>;anchors:string[]};

const ANGLES=[
 ['DEMAND_COMPLAINT','Tuntutan / Keluhan',['tuntut','tuntutan','menuntut','keluh','keluhan','aduan','protes','keberatan']],
 ['DISRUPTION','Gangguan / Hambatan',['gangguan','terganggu','terhambat','hambatan','terputus','macet','tergenang']],
 ['IMPACT','Dampak',['dampak','berdampak','terdampak','akibat','kerugian','merugikan']],
 ['CAUSE','Penyebab',['penyebab','disebabkan','karena','pemicu']],
 ['HANDLING','Penanganan / Tindak Lanjut',['penanganan','ditangani','tindak lanjut','menindaklanjuti','perbaikan','diperbaiki','solusi','penyelesaian']],
 ['TARGET_PROGRESS','Target / Capaian',['target','capaian','realisasi','progres','perkembangan']],
 ['TIMING_CERTAINTY','Jadwal / Kepastian',['jadwal','kapan','kepastian','dipastikan','batas waktu','tenggat']],
 ['RISK_THREAT','Risiko / Ancaman',['risiko','berisiko','ancaman','darurat','bahaya','rawan']]
] as const;

const norm=(v:any)=>String(v??'').toLocaleLowerCase('id-ID').replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const hit=(text:string,term:string)=>(' '+text+' ').includes(' '+norm(term)+' ');
const STOP=new Set(['yang','dan','dengan','untuk','dari','pada','dalam','oleh','atau','ini','itu','akan','telah','sudah','kota','batam','pemko','pemerintah','berita','terkait','mengenai']);
const anchorTokens=(text:string,terms:readonly string[])=>[...new Set(text.split(' ').filter(x=>x.length>=4&&!STOP.has(x)&&!terms.some(t=>norm(t).split(' ').includes(x))))];

export function extractIssueAngles(evidence:IssueAngleEvidence[]){
 const buckets=new Map<string,IssueAngle>();
 const unclassified:Array<{id:string;source:string;title:string|null}>=[];
 for(const e of evidence){
  const text=norm([e.title,e.summary,e.content,e.body_text].filter(Boolean).join(' '));
  const ref={id:String(e.id),source:e.source,title:e.title??null};
  let matched=false;
  for(const [key,label,terms] of ANGLES){
   if(!terms.some(t=>hit(text,t)))continue;
   matched=true;
   const current=buckets.get(key)??{key,label,evidenceCount:0,evidence:[],anchors:[]};
   if(!current.evidence.some(x=>x.id===ref.id&&x.source===ref.source)){current.evidence.push(ref);current.evidenceCount=current.evidence.length;}
   current.anchors=[...new Set([...current.anchors,...anchorTokens(text,terms)])].slice(0,40);
   buckets.set(key,current);
  }
  if(!matched)unclassified.push(ref);
 }
 return{angles:[...buckets.values()].sort((a,b)=>b.evidenceCount-a.evidenceCount||a.label.localeCompare(b.label,'id-ID')),unclassified,totalEvidence:evidence.length};
}
