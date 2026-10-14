import type {Pool} from 'pg';
import {loadOrganizationMediaScope,type OrganizationMediaScope} from './organization-media-scope.js';

export type GeographicSearchPlan={organizationId:number;city:string;queries:string[];excludedAmbiguousTerms:string[]};
/** Build provider-independent search terms from the active tenant's database.
 * These are discovery hints, NOT proof that a video was recorded in the city.
 * No Actor is started and no billing occurs here.
 */
export function buildGeographicSearchPlan(scope:OrganizationMediaScope):GeographicSearchPlan{
 const city=(scope.cityName||'').trim();
 if(!city||city.length<3)throw Error('APIFY_CITY_SCOPE_UNAVAILABLE');
 const clean=(v:string)=>v.normalize('NFKC').replace(/\s+/g,' ').trim();
 const names=[...scope.districts,...(scope.villages??[]),...(scope.areaAliases??[])];
 const seen=new Set<string>();
 const queries:string[]=[];
 const excludedAmbiguousTerms:string[]=[];
 const add=(value:string)=>{const q=clean(value);const key=q.toLocaleLowerCase('id');if(q.length>=3&&q.length<=100&&!seen.has(key)){seen.add(key);queries.push(q);}};
 add(city);
 for(const raw of names){
  const name=clean(raw);
  if(name.length<3||name.length>75)continue;
  // Never use bare district/village names: they can occur in other regions.
  if(name.toLocaleLowerCase('id')===city.toLocaleLowerCase('id'))continue;
  if(/^[\p{L}\p{N} .'-]+$/u.test(name))add(name+' '+city);
  else excludedAmbiguousTerms.push(name);
 }
 return{organizationId:scope.organizationId,city,queries:queries.slice(0,100),excludedAmbiguousTerms};
}
export async function loadApifyGeographicSearchPlan(pool:Pool):Promise<GeographicSearchPlan>{
 const scope=await loadOrganizationMediaScope(pool);
 if(!scope)throw Error('APIFY_ORGANIZATION_SCOPE_UNAVAILABLE');
 const base=buildGeographicSearchPlan(scope);
 const city=base.city,seen=new Set<string>(),queries:string[]=[];
 const add=(value:unknown)=>{
  const term=String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
  if(term.length<3||term.length>75||! /^[\p{L}\p{N} .'-]+$/u.test(term))return;
  const query=term.toLocaleLowerCase('id').includes(city.toLocaleLowerCase('id'))?term:term+' '+city;
  const key=query.toLocaleLowerCase('id');
  if(query.length<=100&&!seen.has(key)){seen.add(key);queries.push(query);}
 };
 add(city);
 try{
  const {rows}=await pool.query("SELECT DISTINCT k.keyword FROM issues i JOIN issue_keywords ik ON ik.issue_id=i.id AND ik.keyword_role='PRIMARY' JOIN keywords k ON k.id=ik.keyword_id AND k.active=true WHERE i.organization_id=$1 AND LOWER(i.status) IN ('watch','active') ORDER BY k.keyword LIMIT 12",[scope.organizationId]);
  for(const row of rows)add(row.keyword);
 }catch{/* Geographic discovery remains available if issue lookup fails. */}
 try{
  const {rows}=await pool.query("SELECT keyword FROM keywords WHERE organization_id=$1 AND active=true ORDER BY priority DESC NULLS LAST,keyword LIMIT 12",[scope.organizationId]);
  for(const row of rows)add(row.keyword);
 }catch{/* Geographic discovery remains available if keyword lookup fails. */}
 for(const term of base.queries.slice(1))add(term);
 return {...base,queries:queries.slice(0,100)};
}
