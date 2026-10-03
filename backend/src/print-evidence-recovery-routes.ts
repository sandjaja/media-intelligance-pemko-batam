import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { get, put } from '@vercel/blob';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printEvidenceRecoveryAuth?: AuthorizationContext } }

const safeName=(name:string)=>String(name||'evidence').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(-140)||'evidence';

async function ensureFallbackTable(pool:Pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS print_evidence_binary (
    file_id BIGINT PRIMARY KEY REFERENCES print_upload_files(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

export async function registerPrintEvidenceRecoveryRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  try{app.addContentTypeParser(['image/jpeg','image/png','application/pdf'],{parseAs:'buffer',bodyLimit:4_000_000},(_req,body,done)=>done(null,body));}catch{}
  const auth=async(r:FastifyRequest,reply:any)=>{const t=r.cookies.access_token;if(!t)return reply.code(401).send({error:'UNAUTHENTICATED'});try{const d=jwt.verify(t,jwtSecret) as jwt.JwtPayload;if(typeof d.sub!=='string')throw new Error('invalid');const c=await loadAuthorizationContext(pool,d.sub);if(!c?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});r.printEvidenceRecoveryAuth=c;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}};
  const canWrite=(u:AuthorizationContext)=>u.legacyRole==='admin'||u.roles.includes('super_admin')||u.roles.includes('humas')||u.permissions.includes('platform.admin')||u.permissions.includes('media.analyze');

  app.post('/api/print/evidence/server-upload-v2',{preHandler:auth,bodyLimit:4_000_000},async(r,reply)=>{
    if(!canWrite(r.printEvidenceRecoveryAuth!))return reply.code(403).send({error:'FORBIDDEN'});
    const q=z.object({articleId:z.coerce.number().int().positive(),fileId:z.coerce.number().int().positive(),name:z.string().min(1).max(255),order:z.coerce.number().int().positive()}).safeParse(r.query);if(!q.success)return reply.code(400).send({error:'INVALID_EVIDENCE_METADATA'});
    const mime=String(r.headers['content-type']||'').split(';')[0].trim();if(!['application/pdf','image/jpeg','image/png'].includes(mime))return reply.code(415).send({error:'UNSUPPORTED_EVIDENCE_TYPE'});
    const body=r.body as Buffer;if(!Buffer.isBuffer(body)||!body.length)return reply.code(400).send({error:'EMPTY_EVIDENCE_FILE'});if(body.length>4_000_000)return reply.code(413).send({error:'EVIDENCE_TOO_LARGE',message:'Maksimum 4 MB per file untuk jalur upload aman.'});
    const row=(await pool.query(`SELECT puf.id FROM print_upload_files puf JOIN print_articles pa ON pa.edition_id=puf.edition_id WHERE puf.id=$1 AND pa.id=$2`,[q.data.fileId,q.data.articleId])).rows[0];if(!row)return reply.code(403).send({error:'EVIDENCE_FILE_NOT_AUTHORIZED'});
    let storageKey:string|null=null,storageMode:'blob'|'database'='database';
    try{const blob=await put(`print-evidence/${q.data.articleId}/${q.data.fileId}-${safeName(q.data.name)}`,body,{access:'private',contentType:mime,addRandomSuffix:false});storageKey=blob.pathname;storageMode='blob';}
    catch(e:any){r.log.warn({err:e},'Blob unavailable; using database evidence fallback');await ensureFallbackTable(pool);await pool.query(`INSERT INTO print_evidence_binary(file_id,mime_type,file_name,file_data) VALUES($1,$2,$3,$4) ON CONFLICT(file_id) DO UPDATE SET mime_type=EXCLUDED.mime_type,file_name=EXCLUDED.file_name,file_data=EXCLUDED.file_data`,[q.data.fileId,mime,q.data.name,body]);storageKey=`db:${q.data.fileId}`;}
    const c=await pool.connect();try{await c.query('BEGIN');await c.query(`UPDATE print_upload_files SET storage_key=$2,status='processed',error_message=NULL WHERE id=$1`,[q.data.fileId,storageKey]);const item=JSON.stringify({id:q.data.fileId,name:q.data.name,mimeType:mime,order:q.data.order,storageKey,storageMode});await c.query(`UPDATE evidence_sources SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{files}',(COALESCE(CASE WHEN jsonb_typeof(metadata->'files')='array' THEN metadata->'files' ELSE '[]'::jsonb END,'[]'::jsonb) - 0)||$2::jsonb,true) WHERE print_article_id=$1 AND source_type='print'`,[q.data.articleId,item]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e}finally{c.release();}
    return{data:{id:q.data.fileId,storageMode,size:body.length}};
  });

  app.get('/api/print/evidence-v2/:fileId',{preHandler:auth},async(r,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((r.params as any).fileId);if(!id.success)return reply.code(400).send({error:'INVALID_FILE_ID'});
    const f=(await pool.query(`SELECT id,original_name,mime_type,storage_key FROM print_upload_files WHERE id=$1`,[id.data])).rows[0];if(!f||!f.storage_key)return reply.code(404).send({error:'EVIDENCE_NOT_AVAILABLE'});
    if(String(f.storage_key).startsWith('db:')){try{await ensureFallbackTable(pool);const b=(await pool.query(`SELECT mime_type,file_name,file_data FROM print_evidence_binary WHERE file_id=$1`,[id.data])).rows[0];if(!b)return reply.code(404).send({error:'EVIDENCE_NOT_FOUND'});reply.header('Content-Type',b.mime_type||f.mime_type||'application/octet-stream');reply.header('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(b.file_name||f.original_name)}`);reply.header('Cache-Control','private, max-age=300');return reply.send(b.file_data);}catch(e){r.log.error(e);return reply.code(503).send({error:'EVIDENCE_DATABASE_UNAVAILABLE'});}}
    try{const result=await get(f.storage_key,{access:'private'});if(!result)return reply.code(404).send({error:'EVIDENCE_NOT_FOUND'});reply.header('Content-Type',result.blob.contentType||f.mime_type||'application/octet-stream');reply.header('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);reply.header('Cache-Control','private, max-age=300');return reply.send(Readable.fromWeb(result.stream as any));}catch(e){r.log.error(e);return reply.code(503).send({error:'EVIDENCE_STORAGE_UNAVAILABLE'});}
  });
}
