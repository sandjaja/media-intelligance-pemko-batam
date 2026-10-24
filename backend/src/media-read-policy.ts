import type {AuthorizationContext} from './rbac.js';
export function isGlobalOperator(ctx:AuthorizationContext){return !!ctx?.active&&(ctx.legacyRole==='admin'||ctx.roles.some(r=>r==='super_admin'||r==='humas'));}
export function appendMediaReadScope(ctx:AuthorizationContext,params:unknown[],where:string[],kind:'online'|'print',alias=kind==='online'?'a':'pa'){
 if(isGlobalOperator(ctx))return;
 if(!ctx?.active){where.push('FALSE');return;}
 // Scoped roles always take precedence over broad reader roles.
 if(ctx.roles.includes('opd')){
  if(!ctx.opdId){where.push('FALSE');return;}params.push(ctx.opdId);where.push(`${alias}.opd_id=$${params.length}`);
 }else if(ctx.roles.includes('district')){
  if(!ctx.districtId){where.push('FALSE');return;}params.push(ctx.districtId);where.push(`${alias}.district_id=$${params.length}`);
 }else if(!ctx.roles.some(r=>r==='executive'||r==='viewer')){where.push('FALSE');return;}
 if(kind==='print')where.push(`${alias}.status='analyzed'`);
 else where.push(`${alias}.news_classification='UTAMA'`,`(SELECT al.action FROM audit_logs al WHERE al.action IN ('ARTICLE_CLASSIFICATION_VERIFIED','ARTICLE_CLASSIFICATION_REOPENED') AND al.metadata->>'articleId'=${alias}.id::text ORDER BY al.created_at DESC,al.id DESC LIMIT 1)='ARTICLE_CLASSIFICATION_VERIFIED'`);
}
