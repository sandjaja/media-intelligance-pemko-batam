export type InstagramPublicProbeStatus='public_metrics_available'|'page_only'|'login_wall'|'challenge'|'blocked'|'unverified_html';

export type InstagramPublicProbeResult={
 status:InstagramPublicProbeStatus;
 httpStatus:number;
 finalUrl:string;
 htmlBytes:number;
 loginWall:boolean;
 challenge:boolean;
 blocked:boolean;
 profileSignals:boolean;
 title:string|null;
 description:string|null;
 publicMetrics:{followers:number|null;following:number|null;posts:number|null;source:string|null};
 diagnostics:{jsonScriptCount:number;hasHandle:boolean;signals:Record<string,boolean>;candidateValues:Record<string,number|null>};
};

function decodeMeta(value:string|null|undefined){
 return value?value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"):null;
}


function parseCompactNumber(value:string|undefined){
 if(!value)return null;
 const normalized=value.trim().toLowerCase().replace(/,/g,'');
 const match=normalized.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/);
 if(!match)return null;
 const number=Number(match[1]);
 const multiplier=match[2]==='k'?1000:match[2]==='m'?1000000:match[2]==='b'?1000000000:1;
 return Number.isFinite(number)?Math.round(number*multiplier):null;
}
function parsePublicMetrics(description:string|null){
 if(!description)return{followers:null,following:null,posts:null,source:null};
 const read=(label:string)=>{const match=description.match(new RegExp('([0-9][0-9.,]*[KMB]?)\\s*'+label,'i'));return parseCompactNumber(match?.[1])};
 const followers=read('followers?'),following=read('following'),posts=read('posts?');
 return{followers,following,posts,source:followers!=null||following!=null||posts!=null?'meta_description':null};
}

// Diagnostic only: inspect public payload without persisting raw Instagram HTML.
function inspectPublicHtml(html:string,handle:string){
 const lower=html.toLowerCase();
 const keys=['follower_count','following_count','media_count','edge_followed_by','edge_follow','edge_owner_to_timeline_media','profile_id','user_id','shortcode'];
 const signals=Object.fromEntries(keys.map(key=>[key,lower.includes(key)])) as Record<string,boolean>;
 const read=(key:string)=>{const escaped=key.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');const direct=html.match(new RegExp('["\\']'+escaped+'["\\']\\s*:\\s*([0-9]+)','i'));if(direct){const n=Number(direct[1]);return Number.isFinite(n)?n:null}const counted=html.match(new RegExp('["\\']'+escaped+'["\\']\\s*:\\s*\\{[^}]{0,160}?["\\']count["\\']\\s*:\\s*([0-9]+)','i'));if(counted){const n=Number(counted[1]);return Number.isFinite(n)?n:null}return null};
 const candidateValues:Record<string,number|null>={follower_count:read('follower_count'),following_count:read('following_count'),media_count:read('media_count'),edge_followed_by:read('edge_followed_by'),edge_follow:read('edge_follow'),edge_owner_to_timeline_media:read('edge_owner_to_timeline_media')};
 const jsonScriptCount=(html.match(/<script[^>]+type=["']application\\/(?:ld\\+json|json)["'][^>]*>/gi)||[]).length;
 return{jsonScriptCount,hasHandle:lower.includes(handle.toLowerCase()),signals,candidateValues};
}

export async function probeInstagramPublicProfile(handleInput:string):Promise<InstagramPublicProbeResult>{
 const handle=String(handleInput||'').trim().replace(/^@/,'');
 if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))throw new Error('INVALID_INSTAGRAM_HANDLE');
 const url='https://www.instagram.com/'+encodeURIComponent(handle)+'/';
 const response=await fetch(url,{redirect:'follow',headers:{
  accept:'text/html,application/xhtml+xml',
  'accept-language':'id-ID,id;q=0.9,en;q=0.7',
  'user-agent':'Mozilla/5.0 (compatible; MediaIntelligencePemkoBatam/1.0)'
 }});
 const html=await response.text();
 const lower=html.toLowerCase();
 const loginWall=lower.includes('accounts/login')||lower.includes('login • instagram')||lower.includes('log in • instagram');
 const challenge=lower.includes('/challenge/')||lower.includes('checkpoint_required');
 const blocked=response.status===403||response.status===429;
 const profileSignals=lower.includes(handle.toLowerCase())&&(lower.includes('follower')||lower.includes('instagram'));
 const description=decodeMeta(html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']*)/i)?.[1]);
 const title=decodeMeta(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i)?.[1]);
 const publicMetrics=parsePublicMetrics(description);
 const diagnostics=inspectPublicHtml(html,handle);
 if(publicMetrics.followers==null&&diagnostics.candidateValues.follower_count!=null){publicMetrics.followers=diagnostics.candidateValues.follower_count;publicMetrics.source='structured_html'}
 if(publicMetrics.following==null&&diagnostics.candidateValues.following_count!=null){publicMetrics.following=diagnostics.candidateValues.following_count;publicMetrics.source='structured_html'}
 if(publicMetrics.posts==null&&diagnostics.candidateValues.media_count!=null){publicMetrics.posts=diagnostics.candidateValues.media_count;publicMetrics.source='structured_html'}
 const hasPublicMetrics=publicMetrics.followers!=null||publicMetrics.following!=null||publicMetrics.posts!=null;
 const status:InstagramPublicProbeStatus=blocked?'blocked':challenge?'challenge':loginWall&&!profileSignals?'login_wall':response.ok&&hasPublicMetrics?'public_metrics_available':response.ok&&profileSignals?'page_only':'unverified_html';
 return{status,httpStatus:response.status,finalUrl:response.url,htmlBytes:html.length,loginWall,challenge,blocked,profileSignals,title,description,publicMetrics,diagnostics};
}
