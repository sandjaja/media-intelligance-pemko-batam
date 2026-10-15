import { FastifyInstance, FastifyRequest } from 'fastify';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { decryptIntegrationCredential, encryptIntegrationCredential, integrationCredentialHint } from './integration-credentials.js';
import { loadAuthorizationContext, type AuthorizationContext } from './rbac.js';

declare module 'fastify' { interface FastifyRequest { aiAdminAuthz?: AuthorizationContext } }

export async function registerAiAdminRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  const guard=async(request:FastifyRequest,reply:any)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    try{
      const d=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof d.sub!=='string')throw new Error('invalid');
      const c=await loadAuthorizationContext(pool,d.sub);
      if(!c?.active)return reply.code(401).send({error:'USER_INACTIVE_OR_MISSING'});
      if(!c.roles.includes('super_admin')&&c.legacyRole!=='admin')return reply.code(403).send({error:'FORBIDDEN',permission:'platform.admin'});
      request.aiAdminAuthz=c;
    }catch{if(reply.sent)return;return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  };
  const audit=async(request:FastifyRequest,action:string,id:any)=>{try{await pool.query('INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,$2,$3::jsonb)',[(request.aiAdminAuthz as any)?.userId||null,action,JSON.stringify({id})]);}catch{}};

  app.get('/api/admin/ai/credentials/status',{preHandler:guard},async()=>({data:(await pool.query('SELECT p.code,c.credential_hint,c.updated_at FROM ai_providers p LEFT JOIN ai_provider_credentials c ON c.provider_id=p.id ORDER BY p.code')).rows}));
  app.put('/api/admin/ai/credentials/:code',{preHandler:guard},async(request,reply)=>{
    const code=z.enum(['gemini','openai','anthropic']).safeParse((request.params as any).code);
    const body=z.object({credential:z.string().trim().min(8).max(10000)}).safeParse(request.body);
    if(!code.success||!body.success)return reply.code(400).send({error:'INVALID_AI_CREDENTIAL'});
    const provider=(await pool.query(`INSERT INTO ai_providers(code,name,enabled) VALUES($1,$2,false) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id`,[code.data,{gemini:'Gemini',openai:'OpenAI',anthropic:'Claude (Anthropic)'}[code.data]])).rows[0];
    let encrypted:string;
    try{encrypted=encryptIntegrationCredential(body.data.credential);}catch{return reply.code(503).send({error:'CREDENTIAL_ENCRYPTION_UNAVAILABLE'});}
    const hint=integrationCredentialHint(body.data.credential);
    await pool.query('INSERT INTO ai_provider_credentials(provider_id,credential_ciphertext,credential_hint) VALUES($1,$2,$3) ON CONFLICT(provider_id) DO UPDATE SET credential_ciphertext=EXCLUDED.credential_ciphertext,credential_hint=EXCLUDED.credential_hint,updated_at=NOW()',[provider.id,encrypted,hint]);
    await audit(request,'AI_CREDENTIAL_UPDATED',provider.id);
    return{data:{code:code.data,credential_hint:hint}};
  });
  app.post('/api/admin/ai/credentials/:code/test',{preHandler:guard},async(request,reply)=>{
    const parsed=z.enum(['gemini','openai','anthropic']).safeParse((request.params as any).code);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_AI_PROVIDER'});
    const {rows}=await pool.query('SELECT c.credential_ciphertext FROM ai_provider_credentials c JOIN ai_providers p ON p.id=c.provider_id WHERE p.code=$1',[parsed.data]);
    if(!rows[0])return reply.code(409).send({error:'AI_CREDENTIAL_NOT_CONFIGURED'});
    let credential:string;
    try{credential=decryptIntegrationCredential(rows[0].credential_ciphertext);}catch{return reply.code(503).send({error:'AI_CREDENTIAL_DECRYPT_FAILED'});}
    const endpoints:{[key:string]:{url:string,headers:Record<string,string>}}={
      gemini:{url:'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',headers:{'x-goog-api-key':credential}},
      openai:{url:'https://api.openai.com/v1/models',headers:{Authorization:'Bearer '+credential}},
      anthropic:{url:'https://api.anthropic.com/v1/models?limit=1',headers:{'x-api-key':credential,'anthropic-version':'2023-06-01'}}
    };
    const target=endpoints[parsed.data];
    try{const response=await fetch(target.url,{method:'GET',headers:target.headers,signal:AbortSignal.timeout(12000)});
      await audit(request,'AI_CREDENTIAL_CONNECTION_TEST',parsed.data);
      return{data:{provider:parsed.data,connected:response.ok,httpStatus:response.status}};
    }catch{return reply.code(502).send({error:'AI_CONNECTION_TEST_FAILED'});}
  });
  app.get('/api/admin/ai/models/verify',{preHandler:guard},async(request,reply)=>{
    const parsed=z.enum(['gemini','openai','anthropic']).safeParse((request.query as any)?.provider);
    if(!parsed.success)return reply.code(400).send({error:'INVALID_AI_PROVIDER'});
    const code=parsed.data;
    const rows=(await pool.query('SELECT c.credential_ciphertext FROM ai_provider_credentials c JOIN ai_providers p ON p.id=c.provider_id WHERE p.code=$1',[code])).rows;
    if(!rows.length)return reply.code(409).send({error:'AI_CREDENTIAL_NOT_CONFIGURED'});
    let key:string;
    try{key=decryptIntegrationCredential(rows[0].credential_ciphertext);}catch{return reply.code(503).send({error:'AI_CREDENTIAL_DECRYPT_FAILED'});}
    const endpoint=code==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000':code==='openai'?'https://api.openai.com/v1/models':'https://api.anthropic.com/v1/models?limit=100';
    const headers:Record<string,string>=code==='gemini'?{'x-goog-api-key':key}:code==='openai'?{Authorization:'Bearer '+key}:{'x-api-key':key,'anthropic-version':'2023-06-01'};
    try{
      const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(15000)});
      if(!response.ok)return reply.code(502).send({error:'AI_MODEL_LIST_UNAVAILABLE',providerStatus:response.status});
      const data:any=await response.json();
      const ids=new Set<string>((code==='gemini'?(data.models||[]).map((m:any)=>String(m.name||'').replace('models/','')):(data.data||[]).map((m:any)=>String(m.id||''))).filter(Boolean));
      const models=(await pool.query('SELECT m.id,m.code FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id WHERE p.code=$1 ORDER BY m.id',[code])).rows;
      await audit(request,'AI_MODEL_LIST_VERIFIED',code);
      return {data:{provider:code,models:models.map((m:any)=>({id:m.id,code:m.code,available:ids.has(m.code)})),partial:code==='anthropic'&&Boolean(data.has_more),count:ids.size}};
    }catch{return reply.code(502).send({error:'AI_MODEL_LIST_REQUEST_FAILED'});}
  });
  app.get('/api/admin/ai/providers',{preHandler:guard},async()=>({data:(await pool.query('SELECT id,code,name,base_url,enabled,secret_reference,created_at,updated_at FROM ai_providers ORDER BY name,id')).rows}));
  app.post('/api/admin/ai/providers',{preHandler:guard},async(request,reply)=>{
    const p=z.object({code:z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/),name:z.string().trim().min(2).max(150),baseUrl:z.string().trim().max(500).optional().nullable(),enabled:z.boolean().default(true),secretReference:z.string().trim().max(200).optional().nullable()}).safeParse(request.body);
    if(!p.success)return reply.code(400).send({error:'INVALID_AI_PROVIDER'});
    try{const r=await pool.query('INSERT INTO ai_providers(code,name,base_url,enabled,secret_reference) VALUES($1,$2,$3,$4,$5) RETURNING id,code,name,base_url,enabled,secret_reference,created_at,updated_at',[p.data.code,p.data.name,p.data.baseUrl||null,p.data.enabled,p.data.secretReference||null]);await audit(request,'AI_PROVIDER_CREATED',r.rows[0].id);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_PROVIDER_SAVE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });
  app.patch('/api/admin/ai/providers/:id',{preHandler:guard},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);const p=z.object({code:z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),name:z.string().trim().min(2).max(150).optional(),baseUrl:z.string().trim().max(500).optional().nullable(),enabled:z.boolean().optional(),secretReference:z.string().trim().max(200).optional().nullable()}).safeParse(request.body);if(!id.success||!p.success)return reply.code(400).send({error:'INVALID_AI_PROVIDER'});
    const c=(await pool.query('SELECT * FROM ai_providers WHERE id=$1',[id.data])).rows[0];if(!c)return reply.code(404).send({error:'AI_PROVIDER_NOT_FOUND'});
    const v=[p.data.code??c.code,p.data.name??c.name,p.data.baseUrl===undefined?c.base_url:p.data.baseUrl,p.data.enabled===undefined?c.enabled:p.data.enabled,p.data.secretReference===undefined?c.secret_reference:p.data.secretReference];
    try{const r=await pool.query('UPDATE ai_providers SET code=$2,name=$3,base_url=$4,enabled=$5,secret_reference=$6,updated_at=NOW() WHERE id=$1 RETURNING id,code,name,base_url,enabled,secret_reference,created_at,updated_at',[id.data,...v]);await audit(request,'AI_PROVIDER_UPDATED',id.data);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_PROVIDER_UPDATE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });

  app.get('/api/admin/ai/models',{preHandler:guard},async()=>({data:(await pool.query('SELECT m.id,m.provider_id,m.code,m.name,m.capabilities,m.enabled,m.created_at,m.updated_at,p.code provider_code,p.name provider_name FROM ai_models m JOIN ai_providers p ON p.id=m.provider_id ORDER BY p.name,m.name,m.id')).rows}));
  app.post('/api/admin/ai/models',{preHandler:guard},async(request,reply)=>{
    const p=z.object({providerId:z.coerce.number().int().positive(),code:z.string().trim().min(2).max(150),name:z.string().trim().min(2).max(200),capabilities:z.record(z.string(),z.any()).default({}),enabled:z.boolean().default(true)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_AI_MODEL'});
    try{const r=await pool.query('INSERT INTO ai_models(provider_id,code,name,capabilities,enabled) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id,provider_id,code,name,capabilities,enabled,created_at,updated_at',[p.data.providerId,p.data.code,p.data.name,JSON.stringify(p.data.capabilities),p.data.enabled]);await audit(request,'AI_MODEL_CREATED',r.rows[0].id);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_MODEL_SAVE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });
  app.patch('/api/admin/ai/models/:id',{preHandler:guard},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);const p=z.object({providerId:z.coerce.number().int().positive().optional(),code:z.string().trim().min(2).max(150).optional(),name:z.string().trim().min(2).max(200).optional(),capabilities:z.record(z.string(),z.any()).optional(),enabled:z.boolean().optional()}).safeParse(request.body);if(!id.success||!p.success)return reply.code(400).send({error:'INVALID_AI_MODEL'});
    const c=(await pool.query('SELECT * FROM ai_models WHERE id=$1',[id.data])).rows[0];if(!c)return reply.code(404).send({error:'AI_MODEL_NOT_FOUND'});
    const v=[p.data.providerId??c.provider_id,p.data.code??c.code,p.data.name??c.name,p.data.capabilities??c.capabilities,p.data.enabled===undefined?c.enabled:p.data.enabled];
    try{const r=await pool.query('UPDATE ai_models SET provider_id=$2,code=$3,name=$4,capabilities=$5::jsonb,enabled=$6,updated_at=NOW() WHERE id=$1 RETURNING id,provider_id,code,name,capabilities,enabled,created_at,updated_at',[id.data,v[0],v[1],v[2],JSON.stringify(v[3]),v[4]]);await audit(request,'AI_MODEL_UPDATED',id.data);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_MODEL_UPDATE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });

  app.delete('/api/admin/ai/models/:id',{preHandler:guard},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);
    if(!id.success)return reply.code(400).send({error:'INVALID_AI_MODEL'});
    try{
      const result=await pool.query('DELETE FROM ai_models WHERE id=$1 RETURNING id',[id.data]);
      if(!result.rowCount)return reply.code(404).send({error:'AI_MODEL_NOT_FOUND'});
      await audit(request,'AI_MODEL_DELETED',id.data);
      return {data:{deleted:true,id:id.data}};
    }catch(e:any){
      if(e?.code==='23503')return reply.code(409).send({error:'AI_MODEL_IN_USE'});
      return reply.code(500).send({error:'AI_MODEL_DELETE_FAILED'});
    }
  });

  app.get('/api/admin/ai/tasks',{preHandler:guard},async()=>({data:(await pool.query('SELECT id,code,name,description,enabled,created_at,updated_at FROM ai_tasks ORDER BY name,id')).rows}));
  app.post('/api/admin/ai/tasks',{preHandler:guard},async(request,reply)=>{
    const p=z.object({code:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9_-]+$/),name:z.string().trim().min(2).max(200),description:z.string().trim().max(1000).optional().nullable(),enabled:z.boolean().default(true)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_AI_TASK'});
    try{const r=await pool.query('INSERT INTO ai_tasks(code,name,description,enabled) VALUES($1,$2,$3,$4) RETURNING id,code,name,description,enabled,created_at,updated_at',[p.data.code,p.data.name,p.data.description||null,p.data.enabled]);await audit(request,'AI_TASK_CREATED',r.rows[0].id);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_TASK_SAVE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });
  app.patch('/api/admin/ai/tasks/:id',{preHandler:guard},async(request,reply)=>{
    const id=z.coerce.number().int().positive().safeParse((request.params as any).id);const p=z.object({code:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),name:z.string().trim().min(2).max(200).optional(),description:z.string().trim().max(1000).optional().nullable(),enabled:z.boolean().optional()}).safeParse(request.body);if(!id.success||!p.success)return reply.code(400).send({error:'INVALID_AI_TASK'});
    const c=(await pool.query('SELECT * FROM ai_tasks WHERE id=$1',[id.data])).rows[0];if(!c)return reply.code(404).send({error:'AI_TASK_NOT_FOUND'});
    const v=[p.data.code??c.code,p.data.name??c.name,p.data.description===undefined?c.description:p.data.description,p.data.enabled===undefined?c.enabled:p.data.enabled];
    try{const r=await pool.query('UPDATE ai_tasks SET code=$2,name=$3,description=$4,enabled=$5,updated_at=NOW() WHERE id=$1 RETURNING id,code,name,description,enabled,created_at,updated_at',[id.data,...v]);await audit(request,'AI_TASK_UPDATED',id.data);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_TASK_UPDATE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });

  app.get('/api/admin/ai/routes',{preHandler:guard},async()=>({data:(await pool.query('SELECT r.id,r.task_id,r.provider_id,r.model_id,r.priority,r.enabled,r.fallback_enabled,t.code task_code,t.name task_name,p.code provider_code,p.name provider_name,m.code model_code,m.name model_name FROM ai_task_routes r JOIN ai_tasks t ON t.id=r.task_id JOIN ai_providers p ON p.id=r.provider_id JOIN ai_models m ON m.id=r.model_id ORDER BY t.name,r.priority,r.id')).rows}));
  app.post('/api/admin/ai/routes',{preHandler:guard},async(request,reply)=>{
    const p=z.object({taskId:z.coerce.number().int().positive(),providerId:z.coerce.number().int().positive(),modelId:z.coerce.number().int().positive(),priority:z.coerce.number().int().positive().default(1),enabled:z.boolean().default(true),fallbackEnabled:z.boolean().default(false)}).safeParse(request.body);if(!p.success)return reply.code(400).send({error:'INVALID_AI_ROUTE'});
    const m=(await pool.query('SELECT provider_id FROM ai_models WHERE id=$1',[p.data.modelId])).rows[0];if(!m||String(m.provider_id)!==String(p.data.providerId))return reply.code(400).send({error:'AI_MODEL_PROVIDER_MISMATCH'});
    try{const r=await pool.query('INSERT INTO ai_task_routes(task_id,provider_id,model_id,priority,enabled,fallback_enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,task_id,provider_id,model_id,priority,enabled,fallback_enabled',[p.data.taskId,p.data.providerId,p.data.modelId,p.data.priority,p.data.enabled,p.data.fallbackEnabled]);await audit(request,'AI_ROUTE_CREATED',r.rows[0].id);return{data:r.rows[0]};}catch(e:any){return reply.code(409).send({error:'AI_ROUTE_SAVE_FAILED',detail:String(e?.message||e).slice(0,200)});}
  });
  app.delete('/api/admin/ai/routes/:id',{preHandler:guard},async(request,reply)=>{const id=z.coerce.number().int().positive().safeParse((request.params as any).id);if(!id.success)return reply.code(400).send({error:'INVALID_AI_ROUTE'});const r=await pool.query('DELETE FROM ai_task_routes WHERE id=$1 RETURNING id',[id.data]);if(!r.rows[0])return reply.code(404).send({error:'AI_ROUTE_NOT_FOUND'});await audit(request,'AI_ROUTE_DELETED',id.data);return{ok:true};});

  app.get('/api/admin/ai/budgets',{preHandler:guard},async()=>{
    const result=await pool.query(`SELECT p.id AS provider_id,p.code AS provider_code,p.name AS provider_name,b.id AS budget_id,b.period_start,b.period_end,b.limit_usd,b.enabled,COALESCE((SELECT SUM(CASE WHEN r.status='settled' THEN r.settled_usd WHEN r.status='reserved' THEN r.reserved_usd ELSE 0 END) FROM ai_budget_reservations r WHERE r.budget_id=b.id),0) AS committed_usd FROM ai_providers p LEFT JOIN ai_provider_budgets b ON b.provider_id=p.id AND CURRENT_DATE>=b.period_start AND CURRENT_DATE<b.period_end ORDER BY p.code,b.period_start DESC`);
    return {data:result.rows};
  });

  app.get('/api/ai/usage/me',async(request,reply)=>{
    const token=request.cookies.access_token;
    if(!token)return reply.code(401).send({error:'UNAUTHENTICATED'});
    let userId:string;
    try{
      const payload=jwt.verify(token,jwtSecret) as jwt.JwtPayload;
      if(typeof payload.sub!=='string')return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});
      userId=payload.sub;
    }catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
    const auth=await loadAuthorizationContext(pool,userId);
    if(!auth?.active)return reply.code(401).send({error:'USER_INACTIVE_OR_MISSING'});
    if(!auth.roles.includes('humas')&&!auth.roles.includes('super_admin')&&auth.legacyRole!=='admin')return reply.code(403).send({error:'FORBIDDEN'});
    const parsed=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)}).safeParse(request.query);
    const limit=parsed.success?parsed.data.limit:30;
    const result=await pool.query('SELECT l.id,l.status,l.input_tokens,l.output_tokens,(COALESCE(l.input_tokens,0)+COALESCE(l.output_tokens,0)) AS total_tokens,l.created_at,t.code AS task_code,p.code AS provider_code,m.code AS model_code FROM ai_usage_logs l LEFT JOIN ai_tasks t ON t.id=l.task_id LEFT JOIN ai_providers p ON p.id=l.provider_id LEFT JOIN ai_models m ON m.id=l.model_id WHERE l.user_id=$1 ORDER BY l.created_at DESC,l.id DESC LIMIT $2',[auth.id,limit]);
    return {data:result.rows};
  });

  app.get('/api/admin/ai/usage',{preHandler:guard},async(request)=>{const q=z.object({limit:z.coerce.number().int().min(1).max(200).default(50)}).safeParse(request.query);const limit=q.success?q.data.limit:50;return{data:(await pool.query('SELECT l.id,l.user_id,u.email AS user_email,l.status,l.latency_ms,l.input_tokens,l.output_tokens,(COALESCE(l.input_tokens,0)+COALESCE(l.output_tokens,0)) AS total_tokens,l.error_code,l.created_at,t.code task_code,p.code provider_code,m.code model_code FROM ai_usage_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN ai_tasks t ON t.id=l.task_id LEFT JOIN ai_providers p ON p.id=l.provider_id LEFT JOIN ai_models m ON m.id=l.model_id ORDER BY l.created_at DESC,l.id DESC LIMIT $1',[limit])).rows};});
}