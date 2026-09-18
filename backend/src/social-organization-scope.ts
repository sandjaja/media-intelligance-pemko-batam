import type { OrganizationMediaScope, OrganizationScopeDecision } from './organization-media-scope.js';
import { buildSocialScopeText, type SocialConversationContext } from './social-context-adapter.js';

function normalize(value:unknown){return String(value??'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function terms(values:Array<string|null|undefined>){return [...new Set(values.map(normalize).filter(v=>v.length>=3))];}
function has(text:string,term:string){return !!text&&!!term&&(` ${text} `).includes(` ${term} `);}
function actorTerms(scope:OrganizationMediaScope){return terms(scope.actors.flatMap(actor=>actor.aliases));}
function organizationTerms(scope:OrganizationMediaScope){return terms([scope.organizationName,scope.governmentName,scope.shortName,...scope.governmentAliases]);}
function areaTerms(scope:OrganizationMediaScope){return terms([scope.cityName,...scope.districts]);}

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
 const currentOrg=org.filter(t=>has(current,t)),currentArea=areas.filter(t=>has(current,t)),currentActors=actors.filter(t=>has(current,t));
 const contextOrg=org.filter(t=>has(context,t)),contextArea=areas.filter(t=>has(context,t));
 const contextEvidence=[...new Set([...contextOrg,...contextArea])];

 if(currentOrg.length)return{status:'RELEVANT',reason:'social content explicitly identifies the active organization',matchedTerms:currentOrg};
 if(currentActors.length&&contextEvidence.length)return{status:'RELEVANT',reason:'social content names an internal actor and the conversation context confirms organization/area scope',matchedTerms:[...new Set([...currentActors,...contextEvidence])]};
 if(currentActors.length)return{status:'REVIEW',reason:'social content names a database-backed internal actor but conversation context does not confirm organization/area scope',matchedTerms:currentActors};
 if(currentArea.length||contextEvidence.length)return{status:'REVIEW',reason:'social conversation is geographically/organizationally contextual but has no explicit internal actor evidence',matchedTerms:[...new Set([...currentArea,...contextEvidence])]};
 return{status:'OUT_OF_SCOPE',reason:'social conversation has no database-backed organization, area, or internal-actor evidence',matchedTerms:[]};
}
