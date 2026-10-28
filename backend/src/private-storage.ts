/** Private object storage. Local files are never exposed as a static directory. */
import { put as blobPut,get as blobGet,del as blobDel } from '@vercel/blob';
import { mkdir,writeFile,readFile,unlink,rename,open } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { Readable } from 'node:stream';
export function localStorageEnabled(){return process.env.STORAGE_DRIVER==='local'}
function root(){if(!process.env.LOCAL_STORAGE_PATH)throw Error('LOCAL_STORAGE_PATH_REQUIRED');return resolve(process.env.LOCAL_STORAGE_PATH)}
function validateKey(key:string){if(!key||key.length>1500||key.startsWith('/')||key.includes('\\')||key.split('/').some(x=>!x||x==='.'||x==='..')||/^[a-z]+:/i.test(key)||/[\x00-\x1f]/.test(key))throw Error('INVALID_STORAGE_KEY');return key}
function location(pathname:string){const key=validateKey(pathname.slice(6));return join(root(),createHash('sha256').update(key).digest('hex'))}
export async function put(pathname:string,body:Buffer|string|Uint8Array,options:{access:'private';contentType?:string;addRandomSuffix?:boolean}){
  if(!localStorageEnabled())return blobPut(pathname,typeof body==='string'?body:Buffer.from(body),options);
  validateKey(pathname);if(options.access!=='private')throw Error('PRIVATE_STORAGE_REQUIRED');
  const key='local:'+pathname+(options.addRandomSuffix?'-'+randomUUID():''),file=location(key),temp=file+'.'+randomUUID()+'.tmp';
  await mkdir(root(),{recursive:true,mode:0o700});
  try{await writeFile(temp,body,{mode:0o600,flag:'wx'});await rename(temp,file);await writeFile(file+'.json',JSON.stringify({contentType:options.contentType||'application/octet-stream'}),{mode:0o600});}finally{await unlink(temp).catch(()=>undefined)}
  return {pathname:key,url:key,downloadUrl:key,contentType:options.contentType||'application/octet-stream',contentDisposition:'inline'};
}
export async function get(pathname:string,options:{access:'private'}){
  if(!pathname.startsWith('local:'))return blobGet(pathname,options);
  const file=location(pathname);
  try{
    const meta=JSON.parse(await readFile(file+'.json','utf8'));
    const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stream=handle.createReadStream();
    return {stream:Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>,blob:{contentType:String(meta.contentType)},statusCode:200};
  }catch(e:any){if(e.code==='ENOENT')return null;throw e}
}
export async function del(pathname:string|string[]){
  for(const key of typeof pathname==='string'?[pathname]:pathname){
    if(!key.startsWith('local:')){await blobDel(key);continue}
    const file=location(key);await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e});await unlink(file+'.json').catch(e=>{if(e.code!=='ENOENT')throw e});
  }
}
export async function checkLocalStorage(){
  const blob=await put('install-check/'+randomUUID(),Buffer.from('private-storage-check'),{access:'private',contentType:'text/plain'});
  try{const result=await get(blob.pathname,{access:'private'});if(!result||await new Response(result.stream as ReadableStream).text()!=='private-storage-check')throw Error('STORAGE_CHECK_FAILED')}finally{await del(blob.pathname)}
}
