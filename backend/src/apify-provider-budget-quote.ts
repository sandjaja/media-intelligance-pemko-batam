import {parseApifyBillingEvidence} from './apify-billing-evidence.js';
import {evaluateApifyManualBudget} from './apify-manual-budget.js';
import type {ApifyPricingApproval} from './apify-pricing-approval.js';

/** Server-side read-only quote. Caller cannot assert its own billing mode.
 * The parser intentionally does not certify undocumented provider schemas.
 * Never accepts billingModeVerified or billingEvidenceSource from HTTP input.
 */
export function quoteApifyBudgetFromProvider(input:{
 actorId:string;configuredActorId:string;collectorEnabled:boolean;
 pricingApproval:ApifyPricingApproval|null;providerChargeCapVerified:boolean;
 monthlyHeadroomUsd:number|null;adminMonthlyRemainingUsd:number|null;
 providerAccountResponse:unknown;
}){
 const evidence=parseApifyBillingEvidence(input.providerAccountResponse);
 return evaluateApifyManualBudget({
  actorId:input.actorId,configuredActorId:input.configuredActorId,
  collectorEnabled:input.collectorEnabled,pricingApproval:input.pricingApproval,
  providerChargeCapVerified:input.providerChargeCapVerified,
  monthlyHeadroomUsd:input.monthlyHeadroomUsd,
  adminMonthlyRemainingUsd:input.adminMonthlyRemainingUsd,
  billingMode:evidence.mode,billingModeVerified:evidence.verified,
  billingEvidenceSource:'UNVERIFIED',
  cashBalanceUsd:evidence.cashBalanceUsd
 });
}
