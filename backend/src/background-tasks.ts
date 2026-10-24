import {randomUUID} from 'node:crypto';
// Correlate inner loopback requests with the outer Vercel request context.
// Adapter overwrites this header; clients cannot register work in another scope.
const scopes=new Map<string,Promise<unknown>[]>();
export function createBackgroundScope(){
 const id=randomUUID();scopes.set(id,[]);
 return{id,finish(){const tasks=scopes.get(id)||[];scopes.delete(id);return Promise.allSettled(tasks);}};
}
export function queueBackgroundTask(id:unknown,task:Promise<unknown>){
 const tasks=typeof id==='string'?scopes.get(id):undefined;
 if(!tasks)return false;tasks.push(task);return true;
}
