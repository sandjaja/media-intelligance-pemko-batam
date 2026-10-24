export const SOCIAL_PLATFORMS=['youtube','instagram','tiktok'] as const;
export type ScheduledSocialPlatform=typeof SOCIAL_PLATFORMS[number];
export function scheduledSocialPlatforms(value:unknown):ScheduledSocialPlatform[]{
 // Absent means an existing installation before platform selection was added.
 if(value==null)return [...SOCIAL_PLATFORMS];
 if(!Array.isArray(value)||value.some(p=>!SOCIAL_PLATFORMS.includes(p)))throw Error('INVALID_SCHEDULER_SOCIAL_PLATFORMS');
 return SOCIAL_PLATFORMS.filter(p=>value.includes(p));
}
