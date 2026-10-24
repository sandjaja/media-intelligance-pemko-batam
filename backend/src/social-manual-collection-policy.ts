/** Manual collection policy: the combined action may run free YouTube
 * collection but must never authorize a billable Apify Actor.
 * Paid TikTok/Instagram execution requires a separate explicit flow.
 */
export type ManualSocialPlatform='semua'|'youtube'|'tiktok'|'instagram'|'apify';
export function resolveManualSocialCollectionPolicy(platform:ManualSocialPlatform){
 return{
  runYouTube:platform==='semua'||platform==='youtube',
  previewApifyPlatforms:((platform==='semua'||platform==='apify')?['tiktok','instagram']:platform==='youtube'?[]:[platform]) as ('tiktok'|'instagram')[],
  apifyExecutionMode:'PREVIEW_ONLY' as const,
  paidApifyAuthorized:false as const,
 };
}
