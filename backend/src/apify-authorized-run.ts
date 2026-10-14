import {conservativeApifyRunEstimate,type ApifyPricingApproval} from './apify-pricing-approval.js';
import {prepareApifyRunRequest} from './apify-run-request.js';

/** Pure authorization boundary: an untrusted boolean cannot stand in for
 * independently verified pricing. No database writes or Apify calls.
 * The caller must first atomically reserve the exact approved estimate and
 * pass the resulting reservation amount from the ledger.
 */
export function authorizePreparedApifyRun(input:{
 actorId:string;configuredActorId:string;configuredMaxUsd:number|null;
 reservedUsd:number|null;collectorEnabled:boolean;
 pricingApproval:ApifyPricingApproval|null;
}):{method:'POST';path:string;query:{maxTotalChargeUsd:number}}|null{
 const estimated=conservativeApifyRunEstimate(input.actorId,input.pricingApproval);
 if(estimated===null||input.reservedUsd===null||!Number.isFinite(input.reservedUsd))return null;
 // No partial reservations: the full conservative estimate must be covered.
 if(input.reservedUsd<estimated)return null;
 if(input.configuredMaxUsd===null||input.configuredMaxUsd<estimated)return null;
 return prepareApifyRunRequest({
  actorId:input.actorId,configuredActorId:input.configuredActorId,
  configuredMaxUsd:input.configuredMaxUsd,reservedUsd:input.reservedUsd,
  collectorEnabled:input.collectorEnabled,pricingVerified:true
 });
}
