import type { Pool } from 'pg';
import type { SocialCandidate, SocialPlatform } from './social-collector.js';
import { decryptIntegrationCredential } from './integration-credentials.js';

export type ExternalSocialProviderCode='youtube'|'instagram'|'facebook'|'threads'|'tiktok'|'x';
export type ExternalSocialDiscovery={query:string;publishedAfter?:string;maxResults?:number};
export type ExternalSocialCollection={candidates:SocialCandidate[];diagnostics?:Record<string,unknown>};
export type ExternalSocialProviderContext={organizationId:number;credential:string;settings:Record<string,unknown>};

export interface ExternalSocialProviderAdapter {
 code:ExternalSocialProviderCode;
 platform:SocialPlatform;
 collect(context:ExternalSocialProviderContext,discovery:ExternalSocialDiscovery):Promise<ExternalSocialCollection>;
}

/**
 * Provider-neutral registry for external social listening.
 * Credentials/settings always come from Admin integration tables; adapters must
 * never embed tenant names, API keys, tokens, or classification rules.
 */
const adapters=new Map<ExternalSocialProviderCode,ExternalSocialProviderAdapter>();

export function registerExternalSocialProvider(adapter:ExternalSocialProviderAdapter){
 adapters.set(adapter.code,adapter);
}

export function getExternalSocialProvider(code:ExternalSocialProviderCode){
 return adapters.get(code)??null;
}

export async function loadExternalSocialProviderContext(pool:Pool,organizationId:number,code:ExternalSocialProviderCode){
 const {rows}=await pool.query(`SELECT c.credential_ciphertext,c.enabled,COALESCE(s.settings,'{}'::jsonb) settings
   FROM integration_credentials c
   JOIN integration_providers p ON p.id=c.provider_id
   LEFT JOIN integration_settings s ON s.provider_id=p.id AND s.organization_id=c.organization_id
   WHERE c.organization_id=$1 AND p.code=$2
   LIMIT 1`,[organizationId,code]);
 const row=rows[0];
 if(!row?.enabled)return null;
 return{organizationId,credential:decryptIntegrationCredential(row.credential_ciphertext),settings:row.settings||{}} as ExternalSocialProviderContext;
}
