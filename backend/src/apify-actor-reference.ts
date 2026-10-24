import {validateActorAdapter,type ActorAdapter} from './apify-actor-adapter.js';
import type {ApifyCollectorKind} from './apify-collection-plan.js';

const slug=/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/;
const internalId=/^[a-zA-Z0-9]{17}$/;
export function parseApifyActorReference(value:string):string {
 const input=value.trim();
 if(input.length>1000)throw Error('Link Actor terlalu panjang.');
 if(slug.test(input))return input;
 if(slug.test(input.replace('~','/')))return input.replace('~','/');
 if(internalId.test(input))return input;
 let url:URL;try{url=new URL(input);}catch{throw Error('Masukkan link halaman Actor Apify, Actor ID, atau pemilik/nama-actor.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Gunakan link HTTPS halaman Actor di Apify.');
 const parts=url.pathname.split('/').filter(Boolean);
 if(url.hostname==='console.apify.com'&&parts[0]==='actors'&&parts.length>=2&&parts.length<=3&&internalId.test(parts[1])&&(!parts[2]||['input','information','settings','source','versions','builds','issues','api'].includes(parts[2])))return parts[1];
 if(['apify.com','www.apify.com'].includes(url.hostname)&&parts.length>=2&&parts.length<=3&&(!parts[2]||['input-schema','api','readme','issues','pricing'].includes(parts[2]))&&slug.test(parts.slice(0,2).join('/')))return parts.slice(0,2).join('/');
 throw Error('Link harus menuju halaman Actor di Apify Store atau Apify Console, bukan Run atau Dataset.');
}

/** Reads Actor metadata only. Never follows a pasted URL or starts a paid run. */
export async function resolveApifyActorReference(reference:string,token:string,fetcher:typeof fetch=fetch){
 const id=parseApifyActorReference(reference);
 if(!token.trim())throw Error('Simpan API token Apify terlebih dahulu untuk memeriksa link Actor.');
 let response:Response;
 try{response=await fetcher('https://api.apify.com/v2/actors/'+encodeURIComponent(id.replace('/','~')),{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw Error('Apify belum dapat dihubungi. Konfigurasi lama tetap digunakan.');}
 if(!response.ok)throw Error(response.status===401||response.status===403?'API token tidak memiliki akses ke Actor ini.':response.status===404?'Actor tidak ditemukan. Periksa kembali link-nya.':'Pemeriksaan Actor gagal. Coba lagi nanti.');
 let actor:any;try{actor=(await response.json())?.data;}catch{throw Error('Informasi Actor dari Apify tidak valid.');}
 const actorId=typeof actor?.username==='string'&&typeof actor?.name==='string'?actor.username+'/'+actor.name:'';
 if(!slug.test(actorId)||typeof actor.id!=='string'||!internalId.test(actor.id))throw Error('Identitas Actor dari Apify tidak valid.');
 if(internalId.test(id)?actor.id!==id:actorId!==id)throw Error('Identitas Actor tidak sesuai dengan link.');
 return{actorId,internalId:actor.id,title:typeof actor.title==='string'?actor.title:actor.name};
}

export function matchingActorAdapter(kind:ApifyCollectorKind,actorId:string,catalog:Record<string,unknown>):ActorAdapter {
 try{return validateActorAdapter(catalog[kind],actorId,kind.endsWith('_comments'));}
 catch{throw Error('Actor ini belum memiliki konfigurasi yang sesuai untuk jenis penarikan tersebut. Perlu penyesuaian teknis; konfigurasi lama tetap digunakan.');}
}

export const APIFY_ACTOR_FIELDS={tiktokActor:'tiktok_posts',instagramActor:'instagram_posts',tiktokCommentsActor:'tiktok_comments',instagramCommentsActor:'instagram_comments',tiktokHashtagActor:'tiktok_hashtag',instagramHashtagActor:'instagram_hashtag'} as const;

export async function normalizeApifyActorSettings(raw:Record<string,any>,saved:Record<string,any>,getToken:()=>Promise<string>,fetcher:typeof fetch=fetch){
 const result:Record<string,any>={...raw,actorAdapters:{...(saved.actorAdapters||{}),...(raw.actorAdapters||{})}};
 const catalog=result.actorAdapters;
 let token:string|undefined;
 for(const [field,kind] of Object.entries(APIFY_ACTOR_FIELDS)){
  if(raw[field]===undefined)continue;
  const value=raw[field];
  if(typeof value!=='string')throw Error('Link Actor harus berupa teks.');
  if(!value.trim()){result[field]='';continue;}
  const parsed=parseApifyActorReference(value);
  let actorId=parsed;
  if(internalId.test(parsed)){
   token??=await getToken();actorId=(await resolveApifyActorReference(parsed,token,fetcher)).actorId;
  }
  // A known persisted adapter can be reused without any billable test run.
  const enabledKey={tiktok_posts:'tiktokPostsEnabled',instagram_posts:'instagramPostsEnabled',tiktok_comments:'tiktokCommentsEnabled',instagram_comments:'instagramCommentsEnabled',tiktok_hashtag:'tiktokHashtagEnabled',instagram_hashtag:'instagramHashtagEnabled'}[kind];
  const changed=actorId!==String(saved[field]||'').replace('~','/');
  if(changed||raw[enabledKey]===true){result.actorAdapters[kind]=matchingActorAdapter(kind,actorId,catalog);}
  result[field]=actorId;
 }
 return result;
}
