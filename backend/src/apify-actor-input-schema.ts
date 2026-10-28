/** Read-only Actor input schema inspection. No Actor run is started. */
export async function inspectApifyActorInputSchema(input:{actorId:'clockworks/tiktok-scraper'|'apify/instagram-scraper';token:string;fetcher?:typeof fetch}):Promise<{verified:boolean;reason:string;acceptedKeys:string[];propertyTypes:Record<string,string>}>{
 if(!input.token.trim())return{verified:false,reason:'APIFY_TOKEN_REQUIRED',acceptedKeys:[],propertyTypes:{}};
 const fetcher=input.fetcher??fetch;
 try{
  const url='https://api.apify.com/v2/acts/'+input.actorId.replace('/','~')+'/builds/default';
  const response=await fetcher(url,{headers:{Authorization:'Bearer '+input.token,Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return{verified:false,reason:'APIFY_INPUT_SCHEMA_HTTP_'+response.status,acceptedKeys:[],propertyTypes:{}};
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return{verified:false,reason:'APIFY_INPUT_SCHEMA_INVALID',acceptedKeys:[],propertyTypes:{}};
  const build=(payload as Record<string,unknown>).data??payload;
  const schema=build&&typeof build==='object'&&!Array.isArray(build)?((build as Record<string,unknown>).actorDefinition as Record<string,unknown>|undefined)?.input??(build as Record<string,unknown>).inputSchema??build:build;
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return{verified:false,reason:'APIFY_INPUT_SCHEMA_INVALID',acceptedKeys:[],propertyTypes:{}};
  const props=(schema as Record<string,unknown>).properties;
  if(!props||typeof props!=='object'||Array.isArray(props))return{verified:false,reason:'APIFY_INPUT_SCHEMA_PROPERTIES_UNAVAILABLE',acceptedKeys:[],propertyTypes:{}};
  const propertyTypes:Record<string,string>={};
  for(const [key,value] of Object.entries(props).slice(0,200)){
   if(value&&typeof value==='object'&&!Array.isArray(value)){
    const type=(value as Record<string,unknown>).type;
    if(typeof type==='string')propertyTypes[key]=type;
   }
  }
  return{verified:true,reason:'APIFY_INPUT_SCHEMA_READ',acceptedKeys:Object.keys(props).slice(0,200),propertyTypes};
 }catch{return{verified:false,reason:'APIFY_INPUT_SCHEMA_UNAVAILABLE',acceptedKeys:[],propertyTypes:{}}}
}
