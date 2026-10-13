/** Build the official Apify per-run charge cap without making a network request.
 * This is only a request builder; it does not authorize or execute a run.
 * A caller must separately verify pricing, reserve budget atomically and
 * reconcile the actual run charge.
 */
export function buildApifyChargeCap(input:{
 actorId:string;configuredActorId:string;configuredMaxUsd:number|null;
 reservedUsd:number|null;pricingVerified:boolean;collectorEnabled:boolean;
}):{maxTotalChargeUsd:number}|null{
 if(!input.collectorEnabled||!input.pricingVerified||input.actorId!==input.configuredActorId)return null;
 const {configuredMaxUsd:cap,reservedUsd:reserved}=input;
 if(cap===null||reserved===null||!Number.isFinite(cap)||!Number.isFinite(reserved)||cap<=0||reserved<=0)return null;
 if(input.actorId==='clockworks/tiktok-scraper'&&cap<0.5)return null;
 if(reserved>cap)return null;
 // Always pass a provider-side cap; a locally persisted Admin limit alone is insufficient.
 return{maxTotalChargeUsd:Math.round(Math.min(cap,reserved)*100)/100};
}
