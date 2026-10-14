import type {Pool} from 'pg';
import {APIFY_PRIMARY_COLLECTORS,APIFY_STANDBY_COLLECTORS,type ApifyCollectorSetting} from './apify-collection-plan.js';

/** Load only persisted Admin configuration. Missing or ambiguous configuration
 * yields no enabled collectors; this never starts an Apify Actor. */
export async function loadApifyAdminCollectorSettings(pool:Pool):Promise<ApifyCollectorSetting[]>{
 const {rows}=await pool.query(`
  SELECT s.settings
  FROM integration_settings s
  JOIN integration_providers p ON p.id=s.provider_id AND p.code='apify' AND p.active=true
  JOIN organizations o ON o.id=s.organization_id AND o.active=true
  LIMIT 2`);
 if(rows.length!==1)return [];
 const settings=rows[0]?.settings;
 if(!settings||typeof settings!=='object'||Array.isArray(settings))return [];
 const actorKeys={
  tiktok_posts:'tiktokActor',instagram_posts:'instagramActor',
  tiktok_comments:'tiktokCommentsActor',instagram_comments:'instagramCommentsActor',
  tiktok_hashtag:'tiktokHashtagActor',instagram_hashtag:'instagramHashtagActor'
 } as const;
 const enabledKeys={tiktok_posts:'tiktokPostsEnabled',instagram_posts:'instagramPostsEnabled',tiktok_comments:'tiktokCommentsEnabled',instagram_comments:'instagramCommentsEnabled',tiktok_hashtag:'tiktokHashtagEnabled',instagram_hashtag:'instagramHashtagEnabled'} as const;
 return [...APIFY_PRIMARY_COLLECTORS,...APIFY_STANDBY_COLLECTORS].map(kind=>{
  const actorId=settings[actorKeys[kind]];
  const enabledKey=enabledKeys[kind];
  return{kind,actorId:typeof actorId==='string'?actorId.trim():'',enabled:typeof settings[enabledKey]==='boolean'?settings[enabledKey]===true:!['tiktok_hashtag','instagram_hashtag'].includes(kind)};
 });
}
