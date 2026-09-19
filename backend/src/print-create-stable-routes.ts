import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { loadAuthorizationContext, hasPermission, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { printCreateStableAuth?: AuthorizationContext } }

export async function registerPrintCreateStableRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const auth=async(r:FastifyRequest,reply:any)=>{
    const t=r.cookies.access_token;
    if(!t)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(t,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const c=await loadAuthorizationContext(pool,d.sub);
      if(!c?.active)return reply.code(403).send({error:'ACCOUNT_INACTIVE'});
      r.printCreateStableAuth=c;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const canWrite=(u:AuthorizationContext)=>u.legacyRole==='admin'||u.roles.includes('super_admin')||u.roles.includes('humas')||hasPermission(u,'platform.admin')||hasPermission(u,'media.analyze')||hasPermission(u,'sources.manage')||hasPermission(u,'intelligence.write');

  app.post('/api/print/articles-v2',{preHandler:auth},async(r,reply)=>{
    if(!canWrite(r.printCreateStableAuth!))return reply.code(403).send({error:'FORBIDDEN'});
    const p=z.object({
      sourceId:z.coerce.number().int().positive(),
      editionDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      editionName:z.string().trim().max(120).optional().nullable(),
      title:z.string().trim().min(2).max(500),
      summary:z.string().trim().max(5000).optional().nullable(),
      bodyText:z.string().max(100000).optional().nullable(),
      opdId:z.coerce.number().int().positive().optional().nullable(),
      districtId:z.coerce.number().int().positive().optional().nullable(),
      isHeadline:z.boolean().default(false),
      isContinued:z.boolean().default(false),
      ocrConfidence:z.coerce.number().min(0).max(100).optional().nullable(),
      keywords:z.array(z.string().trim().min(1).max(150)).max(30).default([]),
      files:z.array(z.object({name:z.string().min(1).max(255),mimeType:z.enum(['application/pdf','image/jpeg','image/png']),byteSize:z.coerce.number().int().min(0).max(26214400),order:z.coerce.number().int().positive()})).min(1).max(20)
    }).safeParse(r.body);
    if(!p.success)return reply.code(400).send({error:'INVALID_PRINT_ARTICLE',details:p.error.flatten()});
    const src=(await pool.query(`SELECT id FROM media_sources WHERE id=$1 AND category='print' AND active=true`,[p.data.sourceId])).rows[0];
    if(!src)return reply.code(400).send({error:'INVALID_PRINT_SOURCE'});
    const client=await pool.connect();
    let stage='BEGIN';
    try{
      await client.query('BEGIN');
      stage='EDITION';
      const ed=(await client.query(`INSERT INTO print_editions(source_id,edition_date,edition_name) VALUES($1,$2,$3) ON CONFLICT (source_id,edition_date,(COALESCE(edition_name,''))) DO UPDATE SET edition_name=EXCLUDED.edition_name RETURNING id`,[p.data.sourceId,p.data.editionDate,p.data.editionName||null])).rows[0];
      stage='ARTICLE';
      const a=(await client.query(`INSERT INTO print_articles(edition_id,opd_id,district_id,title,summary,body_text,is_headline,is_continued,status,ocr_confidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'needs_review',$9,$10) RETURNING *`,[ed.id,p.data.opdId||null,p.data.districtId||null,p.data.title,p.data.summary||null,p.data.bodyText||null,p.data.isHeadline,p.data.isContinued,p.data.ocrConfidence??null,r.printCreateStableAuth!.id])).rows[0];
      stage='FILES';
      const uploadFiles:any[]=[];
      for(const f of p.data.files){const row=(await client.query(`INSERT INTO print_upload_files(edition_id,original_name,mime_type,byte_size,file_order,status) VALUES($1,$2,$3,$4,$5,'uploaded') RETURNING id,original_name,mime_type,byte_size,file_order`,[ed.id,f.name,f.mimeType,f.byteSize,f.order])).rows[0];uploadFiles.push(row);}
      stage='KEYWORDS';
      for(const k of [...new Set(p.data.keywords.map(x=>x.toLowerCase()))])await client.query(`INSERT INTO print_article_keywords(article_id,keyword_text,source) VALUES($1,$2,'operator') ON CONFLICT DO NOTHING`,[a.id,k]);
      stage='EVIDENCE_METADATA';
      try{
        await client.query(`INSERT INTO evidence_sources(print_article_id,source_type,source_label,metadata) VALUES($1,'print',$2,$3)`,[a.id,`${p.data.title} — ${p.data.editionDate}`,{sourceId:p.data.sourceId,files:[]}]);
      }catch(e:any){
        if(String(e?.code)==='42703'){
          await client.query(`INSERT INTO evidence_sources(print_article_id,source_type,source_id,metadata) VALUES($1,'print',$2,$3)`,[a.id,p.data.sourceId,{files:[]}]);
        }else throw e;
      }
      stage='AUDIT';
      await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PRINT_ARTICLE_CREATED',$2)`,[r.printCreateStableAuth!.id,{printArticleId:a.id,sourceId:p.data.sourceId,fileCount:p.data.files.length}]);
      await client.query('COMMIT');
      return reply.code(201).send({data:a,uploadFiles});
    }catch(e:any){
      try{await client.query('ROLLBACK');}catch{}
      r.log.error({err:e,stage,code:e?.code},'Stable print metadata creation failed');
      return reply.code(500).send({error:'PRINT_METADATA_CREATE_FAILED',stage,code:String(e?.code||''),message:String(e?.message||'Gagal menyimpan metadata clipping.')});
    }finally{client.release();}
  });
}
