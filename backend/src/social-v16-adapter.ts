import type { Pool } from 'pg';
import { getV16HeadlineTaxonomies, getV16PrimaryEvidenceForInput, type V16HeadlineTaxonomy, type V16PrimaryEvidence } from './context-dominance-v16.js';

export const SOCIAL_CLASSIFICATION_VERSION='social-opd-v17-20260926-master-keyword-gate';

export type SocialV16Input={
 title?:string|null;
 content?:string|null;
 manualKeywordId?:string|number|null;
};

type NamedOpd={id:string;code:string|null;name:string};

export type SocialV16RoutingResult={
 engine:typeof SOCIAL_CLASSIFICATION_VERSION;
 generatedAt:string;
 routingStatus:'ROUTED'|'AMBIGUOUS'|'UNROUTED';
 newsClassification:'UTAMA'|'AMBIGU'|'PENDUKUNG';
 newsClassificationSource:'AUTO'|'MANUAL';
 primaryOpdId:string|null;
 primaryOpdName:string|null;
 primaryOpdCode:string|null;
 supportingOpdIds:string[];
 supportingOpds:NamedOpd[];
 keywordId:string|null;
 keyword:string|null;
 keywordSource:'AUTO'|'MANUAL';
 taxonomyId:string|null;
 taxonomyName:string|null;
 matchType:V16PrimaryEvidence['matchType']|null;
 score:number;
 headlineTaxonomies:V16HeadlineTaxonomy[];
 needsVerification:boolean;
 note:string;
};

/**
 * Decision-only adapter for external/public social-media conversation.
 * It deliberately performs no sentiment/risk calculation and no persistence:
 * those belong to the shared analysis/persistence layers.
 */
export async function analyzeSocialRoutingV16(pool:Pool,input:SocialV16Input):Promise<SocialV16RoutingResult>{
 const title=String(input.title||'').trim();
 const content=String(input.content||'').replace(/\s+/g,' ').trim();
 const lead=content.slice(0,900);
 const manualKeywordIds=input.manualKeywordId==null?[]:[input.manualKeywordId];
 const keywordSource:SocialV16RoutingResult['keywordSource']=manualKeywordIds.length?'MANUAL':'AUTO';
 const headlineTaxonomies=await getV16HeadlineTaxonomies(pool,title);
 const evidence=await getV16PrimaryEvidenceForInput(pool,{title,summary:lead,content,manualKeywordIds});

 if(!evidence){
  // Machine 2 parity with Media Online: taxonomy/OPD context without a Master Keyword
  // is AMBIGUOUS and must be resolved by Humas; no evidence at all is PENDUKUNG.
  const routingStatus:SocialV16RoutingResult['routingStatus']=headlineTaxonomies.length?'AMBIGUOUS':'UNROUTED';
  return{
   engine:SOCIAL_CLASSIFICATION_VERSION,generatedAt:new Date().toISOString(),routingStatus,
   newsClassification:headlineTaxonomies.length?'AMBIGU':'PENDUKUNG',newsClassificationSource:keywordSource,
   primaryOpdId:null,primaryOpdName:null,primaryOpdCode:null,supportingOpdIds:[],supportingOpds:[],
   keywordId:null,keyword:null,keywordSource,
   taxonomyId:headlineTaxonomies[0]?.id||null,taxonomyName:headlineTaxonomies[0]?.name||null,
   matchType:null,score:0,headlineTaxonomies,needsVerification:true,
   note:manualKeywordIds.length
    ?'Master Keyword pilihan tidak memiliki mapping aktif yang cukup untuk routing V17.'
    :headlineTaxonomies.length
     ?'Taxonomy/OPD context terdeteksi tetapi Master Keyword belum ditemukan; perlu koreksi Humas.'
     :'Tidak ada Master Keyword maupun evidence OPD yang cukup; diklasifikasikan sebagai PENDUKUNG.'
  };
 }

 const routedIds=[...new Set([evidence.opdId,...evidence.supportingOpdIds])];
 const opdRows=(await pool.query(`SELECT id,code,name FROM opd WHERE id=ANY($1::bigint[])`,[routedIds])).rows;
 const opdMap=new Map(opdRows.map((r:any)=>[String(r.id),{id:String(r.id),code:r.code?String(r.code):null,name:String(r.name||'')}]));
 const primaryOpd=opdMap.get(String(evidence.opdId))||null;
 const supportingOpds=evidence.supportingOpdIds.map(id=>opdMap.get(String(id))).filter(Boolean) as NamedOpd[];

 return{
  engine:SOCIAL_CLASSIFICATION_VERSION,generatedAt:new Date().toISOString(),routingStatus:'ROUTED',
  newsClassification:'UTAMA',newsClassificationSource:keywordSource,
  primaryOpdId:evidence.opdId,primaryOpdName:primaryOpd?.name||null,primaryOpdCode:primaryOpd?.code||null,
  supportingOpdIds:evidence.supportingOpdIds,supportingOpds,
  keywordId:evidence.keywordId,keyword:evidence.keyword,keywordSource,
  taxonomyId:evidence.taxonomyId,taxonomyName:evidence.taxonomyName,
  matchType:evidence.matchType,score:evidence.score,headlineTaxonomies,needsVerification:false,
  note:'Routing Media Sosial menggunakan Master Classification V17. Master Keyword adalah evidence UTAMA; identitas akun/author bukan Primary OPD evidence.'
 };
}
