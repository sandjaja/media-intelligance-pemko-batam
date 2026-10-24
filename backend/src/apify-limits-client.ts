import {parseApifyMonthlyHeadroom} from './apify-monthly-headroom.js';

/** Read-only Apify limits request. Never invokes Actors or updates limits.
 * Returns null on timeout, HTTP failure or unrecognized response.
 */
export async function fetchApifyMonthlyHeadroom(apiKey:string,fetcher:typeof fetch=fetch):Promise<number|null>{
 if(typeof apiKey!=='string'||!apiKey.trim())return null;
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetcher('https://api.apify.com/v2/users/me/limits',{
   method:'GET',headers:{authorization:'Bearer '+apiKey,accept:'application/json'},
   signal:controller.signal
  });
  if(!response.ok)return null;
  return parseApifyMonthlyHeadroom(await response.json());
 }catch{return null}
 finally{clearTimeout(timeout)}
}
