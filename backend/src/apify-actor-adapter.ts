import {z} from 'zod';
export type CollectionPeriod={timezone:'Asia/Jakarta';date:string;start:string;end:string};
export function yesterdayJakarta(now=new Date()):CollectionPeriod{
 if(!Number.isFinite(now.getTime()))throw Error('APIFY_COLLECTION_TIME_INVALID');
 const day=86400000,offset=7*3600000,today=Math.floor((now.getTime()+offset)/day)*day-offset;
 return{timezone:'Asia/Jakarta',date:new Date(today-day+offset).toISOString().slice(0,10),start:new Date(today-day).toISOString(),end:new Date(today).toISOString()};
}
export function publicationInPeriod(value:unknown,period:CollectionPeriod){
 if(value===null||value===undefined||value==='')return false;
 const time=value instanceof Date?value.getTime():Date.parse(String(value));
 return Number.isFinite(time)&&time>=Date.parse(period.start)&&time<Date.parse(period.end);
}
const path=z.string().min(1).max(160).refine(p=>p.split('.').every(k=>/^[a-zA-Z0-9_]+$/.test(k)&&!['__proto__','constructor','prototype'].includes(k)));
const paths=z.array(path).min(1).max(10);
export const actorAdapterSchema=z.object({actorId:z.string().regex(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/),inputTemplate:z.record(z.string(),z.unknown()),output:z.object({id:paths,text:paths,publishedAt:paths,url:paths.optional(),parentUrl:paths.optional(),parentId:paths.optional(),authorHandle:paths.optional(),authorName:paths.optional()}).strict()}).strict();
export type ActorAdapter=z.infer<typeof actorAdapterSchema>;
const variables=['queries','city','hashtag','hashtags','limit','perQueryLimit','parentUrls','commentsPerPost','maxComments','since','until','untilInclusive','sinceDate','untilDate'] as const;
export function validateActorAdapter(raw:unknown,actorId:string,comments:boolean):ActorAdapter{
 const result=actorAdapterSchema.safeParse(raw);
 if(!result.success||result.data.actorId!==actorId)throw Error('APIFY_ACTOR_ADAPTER_NOT_CONFIGURED');
 const adapter=result.data;
 if(comments?!adapter.output.parentUrl&&!adapter.output.parentId:!adapter.output.url)throw Error('APIFY_ACTOR_OUTPUT_MAPPING_INVALID');
 renderActorTemplate(adapter.inputTemplate,Object.fromEntries(variables.map(v=>[v,null])));
 return adapter;
}
export function renderActorTemplate(value:unknown,context:Record<string,unknown>,depth=0):unknown{
 if(depth>12)throw Error('APIFY_ACTOR_TEMPLATE_INVALID');
 if(typeof value==='string'){
  const exact=value.match(/^\{\{([a-zA-Z]+)\}\}$/);
  if(exact){if(!Object.hasOwn(context,exact[1]))throw Error('APIFY_ACTOR_TEMPLATE_VARIABLE_INVALID');return context[exact[1]];}
  return value.replace(/\{\{([a-zA-Z]+)\}\}/g,(_all,key)=>{if(!Object.hasOwn(context,key))throw Error('APIFY_ACTOR_TEMPLATE_VARIABLE_INVALID');const v=context[key];if(v!==null&&typeof v==='object')throw Error('APIFY_ACTOR_TEMPLATE_VARIABLE_TYPE_INVALID');return String(v??'');});
 }
 if(Array.isArray(value))return value.map(v=>renderActorTemplate(v,context,depth+1));
 if(value&&typeof value==='object'){
  const out:Record<string,unknown>={};
  for(const [key,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('APIFY_ACTOR_TEMPLATE_INVALID');out[key]=renderActorTemplate(v,context,depth+1);}
  return out;
 }
 return value;
}
export function mappedField(row:unknown,paths:string[]|undefined):unknown{
 for(const path of paths??[]){let value:any=row;for(const key of path.split('.'))value=value&&typeof value==='object'&&Object.hasOwn(value,key)?value[key]:undefined;if(value!==undefined&&value!==null&&value!=='')return value;}
 return null;
}
export function mappedDate(value:unknown):string|null{
 if(value===null||value===undefined||value==='')return null;
 const numeric=typeof value==='number'?value:typeof value==='string'&&/^\d{10,13}$/.test(value)?Number(value):null;
 const d=numeric===null?new Date(String(value)):new Date(numeric<1e12?numeric*1000:numeric);
 return Number.isFinite(d.getTime())?d.toISOString():null;
}
