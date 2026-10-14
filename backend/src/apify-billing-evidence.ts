/** Read-only billing evidence parser. Unknown or undocumented fields never
 * authorize postpaid spending. Provider documentation must establish a stable
 * billing field before this parser can return a verified billing mode.
 */
export type ApifyBillingEvidence={
 mode:'UNKNOWN';verified:false;cashBalanceUsd:null;
 source:'UNVERIFIED_PROVIDER_SCHEMA';
};
export function parseApifyBillingEvidence(_payload:unknown):ApifyBillingEvidence{
 return{mode:'UNKNOWN',verified:false,cashBalanceUsd:null,
  source:'UNVERIFIED_PROVIDER_SCHEMA'};
}
