import type {Pool} from 'pg';
import {decryptIntegrationCredential} from './integration-credentials.js';
import {fetchApifyMonthlyHeadroom} from './apify-limits-client.js';

/** Fetch read-only Apify monthly usage headroom using Admin's encrypted key.
 * Missing/ambiguous organization, inactive credentials and API failures fail closed.
 * This does not execute Actors or authorize spending.
 */
export async function loadApifyAccountHeadroom(pool:Pool,fetcher:typeof fetch=fetch):Promise<number|null>{
 const {rows}=await pool.query(`
  SELECT c.credential_ciphertext
  FROM integration_credentials c
  JOIN integration_providers p ON p.id=c.provider_id AND p.code='apify' AND p.active=true
  JOIN organizations o ON o.id=c.organization_id AND o.active=true
  WHERE c.enabled=true
  LIMIT 2`);
 if(rows.length!==1||!rows[0]?.credential_ciphertext)return null;
 try{
  const apiKey=decryptIntegrationCredential(rows[0].credential_ciphertext);
  return await fetchApifyMonthlyHeadroom(apiKey,fetcher);
 }catch{return null}
}
