export type InstagramPublicProbeStatus='public_html_available'|'login_wall'|'challenge'|'blocked'|'unverified_html';

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
 const status:InstagramPublicProbeStatus=blocked?'blocked':challenge?'challenge':loginWall&&!profileSignals?'login_wall':response.ok&&profileSignals?'public_html_available':'unverified_html';
 const publicMetrics=parsePublicMetrics(description);
 return{status,httpStatus:response.status,finalUrl:response.url,htmlBytes:html.length,loginWall,challenge,blocked,profileSignals,title,description,publicMetrics};
}
