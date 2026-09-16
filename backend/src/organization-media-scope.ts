import type { Pool } from 'pg';
import type { OnlineArticle } from './online-media-collector.js';

export type OrganizationUnitActor = { kind:'OPD'|'UPTD'; id:number; name:string; code?:string|null; aliases:string[]; opdId?:number|null };
export type OrganizationMediaScope = {
  organizationId: number;
  organizationName: string;
  organizationCode?: string | null;
  governmentName?: string | null;
  shortName?: string | null;
  governmentAliases: string[];
  cityName?: string | null;
  tagline?: string | null;
  districts: string[];
  actors: OrganizationUnitActor[];
};

export type OrganizationScopeStatus = 'RELEVANT' | 'REVIEW' | 'OUT_OF_SCOPE';
export type OrganizationScopeDecision = { status: OrganizationScopeStatus; reason: string; matchedTerms: string[] };

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function uniqueTerms(values: Array<string | null | undefined>): string[] { return [...new Set(values.map(normalize).filter(v => v.length >= 3))]; }
function containsTerm(text: string, term: string): boolean { return !!text && !!term && (` ${text} `).includes(` ${term} `); }
function roundupHeadline(title:string){return /\b(?:daftar\s+\d+\s+berita|berita\s+pilihan|rangkuman\s+berita|berita\s+terpopuler|berita\s+populer|top\s+\d+\s+berita)\b/i.test(normalize(title));}

export async function loadOrganizationMediaScope(pool: Pool, organizationId?: number | null): Promise<OrganizationMediaScope | null> {
  let org:any;
  if (organizationId) org = (await pool.query(`SELECT id,name,code FROM organizations WHERE id=$1 AND active=true LIMIT 1`, [organizationId])).rows[0];
  else { const rows=(await pool.query(`SELECT id,name,code FROM organizations WHERE active=true ORDER BY id LIMIT 2`)).rows; if(rows.length!==1)return null; org=rows[0]; }
  if(!org)return null;
  // government_branding currently has no organization_id column, so retain the single active branding row.
  const branding=(await pool.query(`SELECT government_name,short_name,aliases,city_name,tagline FROM government_branding WHERE is_active=true ORDER BY id LIMIT 1`)).rows[0]??{};
  const governmentAliases=uniqueTerms(Array.isArray(branding.aliases)?branding.aliases:[]);
  const districts=(await pool.query(`SELECT name FROM districts WHERE organization_id=$1 AND active=true ORDER BY name`,[org.id])).rows.map(r=>String(r.name||'').trim()).filter(Boolean);
  const opdRows=(await pool.query(`SELECT id,name,code FROM opd WHERE organization_id=$1 AND active=true ORDER BY name`,[org.id])).rows;
  const uptdRows=(await pool.query(`SELECT id,opd_id,name,code,aliases FROM uptd WHERE organization_id=$1 AND active=true ORDER BY name`,[org.id])).rows;
  const actors:OrganizationUnitActor[]=[
    ...opdRows.map(r=>({kind:'OPD' as const,id:Number(r.id),name:String(r.name||''),code:r.code??null,aliases:uniqueTerms([r.name,r.code])})),
    ...uptdRows.map(r=>({kind:'UPTD' as const,id:Number(r.id),name:String(r.name||''),code:r.code??null,aliases:uniqueTerms([r.name,r.code,...(Array.isArray(r.aliases)?r.aliases:[])]),opdId:r.opd_id==null?null:Number(r.opd_id)}))
  ];
  return {organizationId:Number(org.id),organizationName:String(org.name||''),organizationCode:org.code??null,governmentName:branding.government_name??null,shortName:branding.short_name??null,governmentAliases,cityName:branding.city_name??null,tagline:branding.tagline??null,districts,actors};
}

export function organizationScopeTerms(scope:OrganizationMediaScope){
  const strong=uniqueTerms([scope.cityName,scope.organizationName,scope.governmentName,scope.shortName,...scope.governmentAliases,...scope.districts]);
  const supporting=uniqueTerms([scope.tagline,scope.organizationCode?.replace(/_/g,' ')]);
  return{strong,supporting};
}
export function organizationScopeTokens(scope:OrganizationMediaScope):string[]{const{strong,supporting}=organizationScopeTerms(scope);return[...new Set([...strong,...supporting].flatMap(term=>term.split(/\s+/)).filter(token=>token.length>=3))];}

export function classifyArticleOrganizationScope(article:OnlineArticle,scope:OrganizationMediaScope):OrganizationScopeDecision{
  const {strong,supporting}=organizationScopeTerms(scope);if(!strong.length)return{status:'OUT_OF_SCOPE',reason:'organization scope has no strong terms',matchedTerms:[]};
  const title=normalize(article.title),strongHits=strong.filter(term=>containsTerm(title,term)),supportingHits=supporting.filter(term=>containsTerm(title,term));
  const internalActorHits=[
    ...uniqueTerms([scope.organizationName,scope.governmentName,scope.shortName,...scope.governmentAliases]).filter(term=>containsTerm(title,term)),
    ...scope.actors.flatMap(actor=>actor.aliases.filter(term=>containsTerm(title,term))),
    ...scope.districts.map(d=>normalize(d)).filter(d=>d&&containsTerm(title,`kecamatan ${d}`)).map(d=>`kecamatan ${d}`)
  ];
  // Internal organization actors are sufficient scope evidence even when the event is outside the city.
  if(internalActorHits.length)return{status:'RELEVANT',reason:'headline contains a database-backed internal government actor',matchedTerms:[...new Set(internalActorHits)]};
  if(roundupHeadline(title))return{status:'REVIEW',reason:'roundup/list headline requires editorial review',matchedTerms:[...strongHits,...supportingHits]};
  if(strongHits.length)return{status:'RELEVANT',reason:'headline contains organization/city/district scope term',matchedTerms:strongHits};
  if(supportingHits.length)return{status:'REVIEW',reason:'headline contains only supporting organization term',matchedTerms:supportingHits};
  return{status:'OUT_OF_SCOPE',reason:'headline has no organization/city/district/internal-actor scope term',matchedTerms:[]};
}

export function isArticleInOrganizationScope(article:OnlineArticle,scope:OrganizationMediaScope):boolean{return classifyArticleOrganizationScope(article,scope).status!=='OUT_OF_SCOPE';}
export function filterArticlesByOrganizationScope(articles:OnlineArticle[],scope:OrganizationMediaScope|null):OnlineArticle[]{if(!scope)return[];return articles.filter(article=>classifyArticleOrganizationScope(article,scope).status==='RELEVANT');}
