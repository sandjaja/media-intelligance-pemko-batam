/** Fail-closed database identity gate for opt-in Apify integration tests.
 * The expected host must be separately configured from the connection URL.
 * A matching hostname alone is not proof of Preview: GitHub environment
 * protections must also restrict who may configure both secrets.
 */
// Verified via Neon branch br-round-cloud-ay2ed647 (Preview), not the default production branch.
const APPROVED_PREVIEW_HOST='ep-raspy-violet-ayau9ftu.c-5.us-east-2.aws.neon.tech';
export function isApifyPreviewTestConnection(input:{
 databaseUrl:string|undefined;expectedHost:string|undefined;previewFlag:string|undefined;
}):boolean{
 if(input.previewFlag!=='true'||!input.databaseUrl||!input.expectedHost)return false;
 try{
  const url=new URL(input.databaseUrl);
  const expected=input.expectedHost.trim().toLowerCase();
  return (url.protocol==='postgres:'||url.protocol==='postgresql:')&&
   url.hostname.toLowerCase()===expected&&
   expected===APPROVED_PREVIEW_HOST&&
   Boolean(url.username)&&Boolean(url.pathname.slice(1));
 }catch{return false;}
}
