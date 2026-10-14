import type {Pool} from 'pg';
import {previewApifyPlatform} from './apify-shared-preview.js';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
import {loadApifyMonthlyLedgerCommitment} from './apify-monthly-ledger-summary.js';
import {loadApifyAdminCollectorSettings} from './apify-admin-collector-settings.js';
import {decryptIntegrationCredential} from './integration-credentials.js';
import {inspectApifyActorPricing,type ApifyPricingLookup} from './apify-actor-pricing-client.js';
import {buildApifyManualChargeQuote} from './apify-manual-charge-quote.js';
import {loadApifyAccountHeadroom} from './apify-account-headroom.js';
import {inspectApifyActorInputSchema} from './apify-actor-input-schema.js';
import {loadApifyGeographicSearchPlan} from './apify-geographic-search.js';
import {previewGeographicActorInput} from './apify-geographic-input.js';

/** Read-only manual preview using the same authorization scope as scheduler. */
export async function previewManualApifyCollection(pool:Pool,input:{
 platform:'tiktok'|'instagram';requestedBy:string;maxVideos?:10|20|50;
}):Promise<{ready:false;reason:string;collectors:string[];actorDetails:{kind:string;actorId:string;adminMaxCostUsd:number|null;pricingModel:string|null;minimumChargeUsd:number|null;pricingCapCandidate:boolean;pricingLookupStatus:ApifyPricingLookup['reason']|'CREDENTIAL_UNAVAILABLE';pricingMetadataShape:string|null;inputSchemaVerified:boolean;inputSchemaReason:string|null;missingInputKeys:string[];geographicInputReady:boolean;geographicInputReason:string|null;searchTerms:string[];requestedVideoLimit:number|null;proposedResultsPerPage:number|null}[];billableRunStarted:false;requiresExplicitConfirmation:true;adminMonthlyBudgetUsd:number|null;adminMonthlyCommittedUsd:number|null;adminMonthlyRemainingUsd:number|null;accountMonthlyHeadroomUsd:number|null;executionBlockers:string[];chargeQuotes:{kind:string;actorId:string;readyForConfirmation:boolean;maximumChargeUsd:number|null;adminLimitUsd:number|null;monthlyHeadroomUsd:number|null;blockers:string[]}[]}>{
 const maxVideos=input.maxVideos??10;
 if(![10,20,50].includes(maxVideos))throw Error('APIFY_VIDEO_LIMIT_INVALID');
 const result=await previewApifyPlatform(pool,{trigger:'manual',platform:input.platform,requestedBy:input.requestedBy});
 // Display-only monthly budget; it is not a verified per-Actor price or authorization.
 const adminMonthlyBudgetUsd=await loadApifyAdminBudget(pool).catch(()=>null);
 // This is the provider's read-only account headroom, not spend authorization.
 const accountMonthlyHeadroomUsd=await loadApifyAccountHeadroom(pool).catch(()=>null);
 const adminMonthlyCommittedUsd=await loadApifyMonthlyLedgerCommitment(pool);
 const adminMonthlyRemainingUsd=adminMonthlyBudgetUsd===null||adminMonthlyCommittedUsd===null?null:Math.max(0,adminMonthlyBudgetUsd-adminMonthlyCommittedUsd);
 const {rows:limitRows}=await pool.query(`SELECT s.settings->'actorMaxCostUsd' AS limits FROM integration_settings s JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true JOIN organizations o ON o.id=s.organization_id AND o.active=true LIMIT 2`).catch(()=>({rows:[]}));
 const limits=limitRows.length===1&&limitRows[0]?.limits&&typeof limitRows[0].limits==='object'&&!Array.isArray(limitRows[0].limits)?limitRows[0].limits as Record<string,unknown>:{};
 const actorDetails=result.collectors.map(c=>({kind:c.kind,actorId:c.actorId,adminMaxCostUsd:typeof limits[c.kind]==='number'&&Number.isFinite(limits[c.kind])&&(limits[c.kind] as number)>=0.01&&(limits[c.kind] as number)<=5&&!(c.kind==='tiktok_posts'&&(limits[c.kind] as number)<0.5)?limits[c.kind] as number:null,pricingModel:null as string|null,minimumChargeUsd:null as number|null,pricingCapCandidate:false,pricingLookupStatus:'CREDENTIAL_UNAVAILABLE' as ApifyPricingLookup['reason']|'CREDENTIAL_UNAVAILABLE',pricingMetadataShape:null as string|null,inputSchemaVerified:false,inputSchemaReason:null as string|null,missingInputKeys:[] as string[],geographicInputReady:false,geographicInputReason:null as string|null,searchTerms:[] as string[],requestedVideoLimit:null as number|null,proposedResultsPerPage:null as number|null}));
 // Use the existing Organization Scope database for a bounded search proposal.
 // No paid Actor is called here. A valid plan is not proof of provider schema compatibility.
 try{
  const plan=await loadApifyGeographicSearchPlan(pool);
  for(const actor of actorDetails){
   if(actor.actorId!=='clockworks/tiktok-scraper'&&actor.actorId!=='apify/instagram-scraper')continue;
   const proposal=previewGeographicActorInput({actorId:actor.actorId,plan,maxQueries:5,maxVideos});
   actor.searchTerms=proposal.searchTerms;
   actor.requestedVideoLimit=maxVideos;
   actor.proposedResultsPerPage=typeof proposal.proposedInput.resultsPerPage==='number'?proposal.proposedInput.resultsPerPage:null;
   actor.geographicInputReady=proposal.searchTerms.length>0;
   actor.geographicInputReason=actor.geographicInputReady?'APIFY_GEOGRAPHIC_PLAN_PREPARED':'APIFY_GEOGRAPHIC_PLAN_EMPTY';
  }
 }catch(error){
  const reason=error instanceof Error?error.message:'APIFY_GEOGRAPHIC_PLAN_UNAVAILABLE';
  const safeReason=/^APIFY_[A-Z0-9_]+$/.test(reason)?reason:'APIFY_GEOGRAPHIC_PLAN_UNAVAILABLE';
  for(const actor of actorDetails)actor.geographicInputReason=safeReason;
 }
 // Read-only provider metadata. Missing credentials or failed lookups never authorize a run.
 let credentialReadFailed=false;
 const {rows:credentials}=await pool.query(`SELECT c.credential_ciphertext FROM integration_credentials c JOIN integration_providers p ON p.id=c.provider_id AND p.code='apify' AND p.active=true JOIN organizations o ON o.id=c.organization_id AND o.active=true LIMIT 2`).catch(()=>{credentialReadFailed=true;return{rows:[]};});
 let credentialDecryptFailed=false;
 if(credentials.length===1&&credentials[0]?.credential_ciphertext){
  try{
   const token=decryptIntegrationCredential(credentials[0].credential_ciphertext);
   await Promise.all(actorDetails.map(async actor=>{
    if(actor.actorId==='clockworks/tiktok-scraper'||actor.actorId==='apify/instagram-scraper'){
     const schema=await inspectApifyActorInputSchema({actorId:actor.actorId,token});
     actor.inputSchemaReason=schema.reason;
     const requiredKeys=actor.actorId==='clockworks/tiktok-scraper'?['searchQueries','searchSection','resultsPerPage']:['search','searchType','resultsType','resultsLimit'];
     actor.missingInputKeys=requiredKeys.filter(key=>!schema.acceptedKeys.includes(key));
     const expectedTypes=actor.actorId==='clockworks/tiktok-scraper'?{searchQueries:'array',searchSection:'string',resultsPerPage:'integer'}:{search:'string',searchType:'string',resultsType:'string',resultsLimit:'integer'};
     // JSON schema may use number rather than integer for numeric inputs.
     const typesMatch=Object.entries(expectedTypes).every(([key,type])=>schema.propertyTypes[key]===type||(type==='integer'&&schema.propertyTypes[key]==='number'));
     actor.inputSchemaVerified=schema.verified&&actor.missingInputKeys.length===0&&typesMatch;
     if(schema.verified&&!typesMatch)actor.inputSchemaReason='APIFY_INPUT_SCHEMA_TYPE_MISMATCH';
    }
    const lookup=await inspectApifyActorPricing(actor.actorId,token);
    actor.pricingLookupStatus=lookup.reason;
    actor.pricingMetadataShape=lookup.metadataShape??null;
    const pricing=lookup.snapshot;
    if(pricing){actor.pricingModel=pricing.pricingModel;actor.minimumChargeUsd=pricing.minimalMaxTotalChargeUsd;actor.pricingCapCandidate=pricing.capEligible&&actor.adminMaxCostUsd!==null&&pricing.minimalMaxTotalChargeUsd!==null&&pricing.minimalMaxTotalChargeUsd<=actor.adminMaxCostUsd;}
   }));
  }catch{credentialDecryptFailed=true;/* Fail closed; no credentials or pricing details leave this server. */}
 }
 const executionBlockers:string[]=[];
 // Check all enabled collectors, including the other platform: an Actor ID
 // shared by TikTok and Instagram must not be considered safe for execution.
 const allConfigured=await loadApifyAdminCollectorSettings(pool).catch(()=>[]);
 const enabledIds=allConfigured.filter(c=>c.enabled&&c.actorId).map(c=>c.actorId);
 if(new Set(enabledIds).size!==enabledIds.length)executionBlockers.push('APIFY_ACTOR_ID_AMBIGUOUS');
 if(credentialReadFailed)executionBlockers.push('APIFY_CREDENTIAL_QUERY_FAILED');
 else if(credentials.length!==1||!credentials[0]?.credential_ciphertext)executionBlockers.push('APIFY_CREDENTIAL_UNAVAILABLE');
 else if(credentialDecryptFailed)executionBlockers.push('APIFY_CREDENTIAL_DECRYPT_FAILED');
 if(!result.configured)executionBlockers.push(result.reason);
 if(adminMonthlyBudgetUsd===null)executionBlockers.push('APIFY_ADMIN_BUDGET_UNAVAILABLE');
 if(adminMonthlyRemainingUsd===null)executionBlockers.push('APIFY_ADMIN_MONTHLY_LEDGER_UNAVAILABLE');
 if(accountMonthlyHeadroomUsd===null)executionBlockers.push('APIFY_ACCOUNT_HEADROOM_UNAVAILABLE');
 else if(accountMonthlyHeadroomUsd<=0)executionBlockers.push('APIFY_ACCOUNT_HEADROOM_EXHAUSTED');
 if(actorDetails.some(c=>(c.actorId==='clockworks/tiktok-scraper'||c.actorId==='apify/instagram-scraper')&&!c.geographicInputReady))executionBlockers.push('APIFY_GEOGRAPHIC_PLAN_UNAVAILABLE');
 if(actorDetails.some(c=>c.adminMaxCostUsd===null))executionBlockers.push('APIFY_ACTOR_LIMIT_UNAVAILABLE');
 if(actorDetails.some(c=>(c.actorId==='clockworks/tiktok-scraper'||c.actorId==='apify/instagram-scraper')&&!c.inputSchemaVerified))executionBlockers.push('APIFY_ACTOR_INPUT_SCHEMA_UNVERIFIED');
 if(actorDetails.some(c=>!c.pricingModel))executionBlockers.push('APIFY_ACTOR_PRICING_METADATA_UNAVAILABLE');
 if(actorDetails.some(c=>!c.pricingCapCandidate))executionBlockers.push('APIFY_ACTOR_PRICING_UNAVAILABLE_OR_UNSUPPORTED');
 // The Actor metadata's minimalMaxTotalChargeUsd is a floor, not an
 // upper-bound quote. Do not feed it into pricingApproval or maximumChargeUsd.
 // Quote uses only server-side verified inputs. Preview metadata is not an
 // approved upper bound and cannot establish provider-enforced billing caps.
 // Never accept charge approval or cap verification from this HTTP request.
 const chargeQuotes=actorDetails.map(actor=>({kind:actor.kind,actorId:actor.actorId,
  ...buildApifyManualChargeQuote({actorId:actor.actorId,configuredActorId:actor.actorId,
   configuredMaxUsd:actor.adminMaxCostUsd,collectorEnabled:result.configured,
   pricingApproval:null,providerChargeCapVerified:false,
   monthlyHeadroomUsd:accountMonthlyHeadroomUsd,adminMonthlyRemainingUsd})}));
 // Neither verified Actor pricing nor provider-enforced caps are wired to the
 // manual endpoint yet. Do not advertise payment readiness based on Admin limits.
 executionBlockers.push('APIFY_PRICING_NOT_VERIFIED','APIFY_CHARGE_CAP_NOT_VERIFIED','APIFY_MANUAL_EXECUTOR_NOT_CONNECTED');
 return{ready:false,reason:result.configured?'APIFY_MANUAL_EXECUTOR_NOT_CONNECTED':result.reason,
  collectors:result.collectors.map(c=>c.kind),actorDetails,
  billableRunStarted:false,requiresExplicitConfirmation:true,adminMonthlyBudgetUsd,adminMonthlyCommittedUsd,adminMonthlyRemainingUsd,accountMonthlyHeadroomUsd,executionBlockers,chargeQuotes};
}
