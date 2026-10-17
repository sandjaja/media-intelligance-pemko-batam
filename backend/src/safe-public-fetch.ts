import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
const blocked=new BlockList();
for(const [ip,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as const)blocked.addSubnet(ip,prefix,'ipv4');
const globalV6=new BlockList();globalV6.addSubnet('2000::',3,'ipv6');
for(const [ip,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const)blocked.addSubnet(ip,prefix,'ipv6');
export function isPublicAddress(address:string){
 const family=isIP(address);
 return family===4?!blocked.check(address,'ipv4'):family===6&&globalV6.check(address,'ipv6')&&!blocked.check(address,'ipv6');
}
export type PublicFetchResult={status:number;ok:boolean;headers:http.IncomingHttpHeaders;text:string;url:string};
type Options={maxBytes?:number;timeoutMs?:number;resolve?:typeof lookup;request?:typeof http.request;headers?:Record<string,string>;signal?:AbortSignal};
export async function safePublicFetch(raw:string,options:Options={}):Promise<PublicFetchResult>{
 const maxBytes=options.maxBytes??2_000_000;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>50_000_000)throw Error('INVALID_FETCH_LIMIT');
 const signal=options.signal??AbortSignal.timeout(options.timeoutMs??15000);
 let url=new URL(raw);
 for(let redirects=0;redirects<=3;redirects++){
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('SOURCE_URL_NOT_ALLOWED');
  const hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(hostname==='localhost'||hostname.endsWith('.localhost')||hostname.endsWith('.local')||hostname.endsWith('.internal')||hostname.endsWith('.'))throw Error('SOURCE_HOST_NOT_ALLOWED');
  if(url.port&&!['80','443'].includes(url.port))throw Error('SOURCE_PORT_NOT_ALLOWED');
  const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await new Promise<Array<{address:string;family:number}>>((resolve,reject)=>{
   const abort=()=>reject(Error('SOURCE_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});
   (options.resolve??lookup)(hostname,{all:true,verbatim:true}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   if(signal.aborted)abort();
  });
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw Error('SOURCE_HOST_NOT_ALLOWED');
  const pinned=addresses[0];
  const response=await new Promise<PublicFetchResult>((resolve,reject)=>{
   const transport=options.request??(url.protocol==='https:'?https.request:http.request);
   const req=transport(url,{method:'GET',signal,headers:{'user-agent':'MediaIntelligencePemkoBatam/1.0','accept':'text/html,text/plain',...options.headers,'accept-encoding':'identity'},lookup:((_host:any,opts:any,cb:any)=>{if(typeof opts==='function'){cb=opts;opts={};}if(opts?.all)cb(null,[pinned]);else cb(null,pinned.address,pinned.family);}) as any},res=>{
    const status=res.statusCode??502;
    if([301,302,303,307,308].includes(status)){res.destroy();resolve({status,ok:false,headers:res.headers,text:'',url:url.toString()});return;}
    if(Number(res.headers['content-length'])>maxBytes||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();reject(Error('SOURCE_TOO_LARGE_OR_ENCODED'));return;}
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(part:Buffer)=>{size+=part.length;if(size>maxBytes){res.destroy();reject(Error('SOURCE_TOO_LARGE'));}else chunks.push(Buffer.from(part));});
    res.on('error',reject);res.on('end',()=>resolve({status,ok:status>=200&&status<300,headers:res.headers,text:Buffer.concat(chunks,size).toString('utf8'),url:url.toString()}));
   });
   req.on('error',reject);req.end();
  });
  if(![301,302,303,307,308].includes(response.status))return response;
  if(!response.headers.location)throw Error('SOURCE_REDIRECT_INVALID');
  url=new URL(response.headers.location,url);
 }
 throw Error('SOURCE_TOO_MANY_REDIRECTS');
}

/** Bounded, pinned transport for collectors that consume the Fetch Response API. */
export async function safePublicResponse(url:string,init:{headers?:Record<string,string>;signal?:AbortSignal;redirect?:string}={},maxBytes=2_000_000){
 const result=await safePublicFetch(url,{headers:init.headers,signal:init.signal,maxBytes});
 const headers=new Headers();for(const [key,value] of Object.entries(result.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value));
 const response=new Response([204,205,304].includes(result.status)?null:result.text,{status:result.status,headers});
 Object.defineProperty(response,'url',{value:result.url});return response;
}
