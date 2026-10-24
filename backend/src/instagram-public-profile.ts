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
 metricSources:{followers:string|null;following:string|null;posts:string|null};
 publicMetrics:{followers:number|null;following:number|null;posts:number|null;source:string|null};
 diagnostics:{jsonScriptCount:number;hasHandle:boolean;signals:Record<string,boolean>;candidateValues:Record<string,number|null>};
};

function decodeMeta(value:string|null|undefined){
 return value?value.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>=0&&code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"):null;
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
 const read=(key:string)=>{
  const marker='"'+key+'"';
  const pos=html.indexOf(marker);
  if(pos<0)return null;
  const chunk=html.slice(pos+marker.length,pos+marker.length+220);
  const direct=chunk.match(/^\s*:\s*(\d+)/);
  if(direct)return Number(direct[1]);
  const counted=chunk.match(/^\s*:\s*\{[^}]{0,180}?"count"\s*:\s*(\d+)/);
  return counted?Number(counted[1]):null;
 };
 const candidateValues:Record<string,number|null>={follower_count:read('follower_count'),following_count:read('following_count'),media_count:read('media_count'),edge_followed_by:read('edge_followed_by'),edge_follow:read('edge_follow'),edge_owner_to_timeline_media:read('edge_owner_to_timeline_media')};
 const jsonScriptCount=(html.match(/<script[^>]+type=["']application\\\/(?:ld\\+json|json)["'][^>]*>/gi)||[]).length;
 return{jsonScriptCount,hasHandle:lower.includes(handle.toLowerCase()),signals,candidateValues};
}

export function parseInstagramProfileHtml(html:string, handle:string) {
 const meta=(name:string)=>{
  for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){
   const attrs=Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
   if(attrs.property===name||attrs.name===name)return decodeMeta(attrs.content);
  }
  return null;
 };
 const title=meta('og:title'),description=meta('og:description')||meta('description');
 const matchingDescription=description?.toLowerCase().includes('@'+handle.toLowerCase())?description:null;
 const publicMetrics=parsePublicMetrics(matchingDescription);
 const metricSources={followers:publicMetrics.followers==null?null:'meta_description',following:publicMetrics.following==null?null:'meta_description',posts:publicMetrics.posts==null?null:'meta_description'};
 let user:Record<string,unknown>|null=null;
 const visit=(value:unknown,depth=0):void=>{
  if(!value||typeof value!=='object'||depth>35||user)return;
  const obj=value as Record<string,unknown>;
  if(typeof obj.username==='string'&&obj.username.toLowerCase()===handle.toLowerCase()&&typeof obj.follower_count==='number'){user=obj;return}
  for(const child of Object.values(obj))visit(child,depth+1);
 };
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{visit(JSON.parse(match[1]));}catch{/* Non-JSON scripts are not profile evidence. */}
 }
 const record=user as Record<string,unknown>|null;
 for(const [field,key] of [['followers','follower_count'],['following','following_count'],['posts','media_count']] as const){
  const value=record?.[key];
  if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0){publicMetrics[field]=value;metricSources[field]='structured_profile';}
 }
 publicMetrics.source=Object.values(metricSources).some(x=>x==='structured_profile')?'structured_profile':publicMetrics.source;
 return{title,description,publicMetrics,metricSources};
}

export async function probeInstagramPublicProfile(handleInput:string):Promise<InstagramPublicProbeResult>{
 const handle=String(handleInput||'').trim().replace(/^@/,'');
 if(!/^[A-Za-z0-9._]{1,30}$/.test(handle))throw new Error('INVALID_INSTAGRAM_HANDLE');
 const url='https://www.instagram.com/'+encodeURIComponent(handle)+'/';
 const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{
  accept:'text/html,application/xhtml+xml',
  'accept-language':'id-ID,id;q=0.9,en;q=0.7',
  'user-agent':'Mozilla/5.0'
 }});
 const html=await response.text(),lower=html.toLowerCase();
 // Login links can appear on a valid public profile; only the final route is a wall.
 const loginWall=/\/accounts\/login(?:\/|\?|$)/i.test(response.url);
 const challenge=/\/(?:challenge|checkpoint)\//i.test(response.url)||lower.includes('checkpoint_required');
 const blocked=response.status===403||response.status===429;
 const parsed=parseInstagramProfileHtml(html,handle);
 const profileSignals=!!parsed.title?.toLowerCase().includes('@'+handle.toLowerCase());
 if(loginWall||challenge||blocked||!response.ok){
  parsed.publicMetrics={followers:null,following:null,posts:null,source:null};
  parsed.metricSources={followers:null,following:null,posts:null};
 }
 const hasPublicMetrics=Object.values(parsed.metricSources).some(Boolean);
 const status:InstagramPublicProbeStatus=blocked?'blocked':challenge?'challenge':loginWall?'login_wall':response.ok&&hasPublicMetrics?'public_metrics_available':response.ok&&profileSignals?'page_only':'unverified_html';
 return{status,httpStatus:response.status,finalUrl:response.url,htmlBytes:html.length,loginWall,challenge,blocked,profileSignals,...parsed,diagnostics:inspectPublicHtml(html,handle)};
}
