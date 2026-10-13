/** Strictly interpret a provider-confirmed USD balance.
 * Account identity or a successful API key test is NOT proof of balance.
 * Do not infer dollars from credits, limits, plan tiers or missing fields.
 */
export function parseApifyUsdBalance(payload:unknown):number|null{
 if(!payload||typeof payload!=='object')return null;
 const data=(payload as Record<string,unknown>).data;
 if(!data||typeof data!=='object')return null;
 const row=data as Record<string,unknown>;
 const value=row.availableBalanceUsd;
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
 return value;
}
