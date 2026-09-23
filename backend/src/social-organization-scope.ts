import { organizationScopeTerms, type OrganizationMediaScope, type OrganizationScopeDecision } from './organization-media-scope.js';
import { buildSocialScopeText, type SocialConversationContext } from './social-context-adapter.js';

function normalize(value:unknown){return String(value??'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function terms(values:Array<string|null|undefined>){return [...new Set(values.map(normalize).filter(v=>v.length>=3))];}
function has(text:string,term:string){return !!text&&!!term&&(` ${text} `).includes(` ${term} `);}
function organizationTerms(scope:OrganizationMediaScope){return organizationScopeTerms(scope);}
function areaTerms(scope:OrganizationMediaScope){return terms([scope.cityName,...scope.districts,...(scope.villages??[]),...(scope.areaAliases??[])]);}

export type SocialOrganizationScopeInput={
 title?:string|null;
 content?:string|null;
 context?:SocialConversationContext|null;
};

/**
 * Social-specific scope policy. Unlike Media Online, social conversation can
 * inherit geographic context from its parent post/thread. A generic OPD alias
 * in the current comment is accepted only when the current/parent conversation
 * also carries database-backed organization/area evidence.
 *
 * Area-only conversation is REVIEW, never automatically RELEVANT.
 */
export function classifySocialOrganizationScope(input:SocialOrganizationScopeInput,scope:OrganizationMediaScope):OrganizationScopeDecision{
 const envelope=buildSocialScopeText(input);
 const current=normalize(envelope.currentText);
 const context=normalize([envelope.currentText,envelope.parentCommentText,envelope.parentText].filter(Boolean).join(' '));
 const org=organizationTerms(scope),areas=areaTerms(scope),actors=actorTerms(scope);
 const currentOrg=org.strong.filter(t=>has(current,t)),currentSupportingOrg=org.supporting.filter(t=>has(current,t)),currentArea=areas.filter(t=>has(current,t)),currentActors=actors.filter(t=>has(current,t));
 const contextOrg=org.strong.filter(t=>has(context,t)),contextArea=areas.filter(t=>has(context,t));
 const contextEvidence=[...new Set([...contextOrg,...contextArea])];

 if(currentOrg.length)return{status:'RELEVANT',reason:'social content explicitly identifies the active organization',matchedTerms:currentOrg};
 if(currentActors.length&&contextEvidence.length)return{status:'RELEVANT',reason:'social content names an internal actor and the conversation context confirms organization/area scope',matchedTerms:[...new Set([...currentActors,...contextEvidence])]};
 if(currentArea.length||contextArea.length)return{status:'REVIEW',reason:'social conversation has database-backed local geographic evidence but no explicit active-organization/internal-actor evidence',matchedTerms:[...new Set([...currentArea,...contextArea])]};
 // External social discovery is intentionally stricter than editorial review after ingestion:
 // generic government aliases (for example "pemkot") and generic OPD names are not enough
 // to persist a public mention when no database-backed Batam organization/area evidence exists.
 // This prevents another city's Pemkot/Dishub/etc. from entering the active social dataset.
 if(currentActors.length||currentSupportingOrg.length)return{status:'OUT_OF_SCOPE',reason:'social content contains only generic government/internal-actor terms without database-backed local organization or area evidence',matchedTerms:[...new Set([...currentActors,...currentSupportingOrg])]};
 return{status:'OUT_OF_SCOPE',reason:'social conversation has no database-backed organization, area, or internal-actor evidence',matchedTerms:[]};
}
