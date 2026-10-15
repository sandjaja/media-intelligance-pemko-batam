import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthorizationContext } from './rbac.js';
import { probeInstagramPublicProfile } from './instagram-public-profile.js';

export function canReadInstagramAccount(ctx: AuthorizationContext, account: {opd_id: unknown; district_id: unknown}) {
  if (ctx.legacyRole === 'admin' || ctx.roles.some(r => ['super_admin','humas','executive'].includes(r))) return true;
  if (ctx.roles.includes('district')) return ctx.districtId != null && String(account.district_id ?? '') === ctx.districtId;
  return ctx.roles.includes('opd') && ctx.opdId != null && String(account.opd_id ?? '') === ctx.opdId;
}

export function registerInstagramPerformanceRoutes(app: FastifyInstance, pool: Pool, hooks: {
  read: preHandlerHookHandler[];
  write: preHandlerHookHandler[];
}, probe = probeInstagramPublicProfile) {
  const accountFor = async (id: number) => (await pool.query(`SELECT a.id,a.opd_id,a.district_id,a.account_name,a.handle,a.profile_url,o.name opd_name
    FROM owned_social_accounts a LEFT JOIN opd o ON o.id=a.opd_id
    WHERE a.id=$1 AND a.active=true AND a.platform='instagram'`, [id])).rows[0];
  const historyFor = async (id: number) => (await pool.query(`SELECT measured_at,followers,following,total_posts,source,raw_payload
    FROM owned_social_account_metrics WHERE account_id=$1 AND source='instagram_public_html'
    ORDER BY measured_at DESC LIMIT 100`, [id])).rows;

  app.get('/api/social/instagram/account-performance/:accountId', {preHandler: hooks.read}, async (request, reply) => {
    const id = z.coerce.number().int().positive().safeParse((request.params as any).accountId);
    if (!id.success) return reply.code(400).send({error:'INVALID_ACCOUNT_ID'});
    const account = await accountFor(id.data);
    if (!account) return reply.code(404).send({error:'INSTAGRAM_OWNED_ACCOUNT_NOT_FOUND'});
    if (!canReadInstagramAccount(request.ownedClusterAuth!, account)) return reply.code(403).send({error:'FORBIDDEN'});
    const history = await historyFor(id.data);
    return {data:{account,latest:history[0] ?? null,history}};
  });

  app.post('/api/social/instagram/account-performance/collect', {preHandler: hooks.write}, async (request, reply) => {
    const body = z.object({accountId:z.coerce.number().int().positive()}).safeParse(request.body);
    if (!body.success) return reply.code(400).send({error:'INVALID_ACCOUNT_ID'});
    const account = await accountFor(body.data.accountId);
    if (!account) return reply.code(404).send({error:'INSTAGRAM_OWNED_ACCOUNT_NOT_FOUND'});
    if (!canReadInstagramAccount(request.ownedClusterAuth!, account)) return reply.code(403).send({error:'FORBIDDEN'});
    const history = await historyFor(body.data.accountId);
    // Repeated clicks reuse the last successful reading to reduce requests to Instagram.
    if (history[0] && Date.now()-new Date(history[0].measured_at).getTime() < 5*60_000) {
      return {data:{account,latest:history[0],history,cached:true}};
    }
    const handle = String(account.handle || '').trim().replace(/^@/,'');
    try {
      const result = await probe(handle);
      if (result.status !== 'public_metrics_available') {
        return reply.code(422).send({error:'Statistik publik Instagram belum tersedia. Coba lagi nanti; pengukuran terakhir tetap tersimpan.'});
      }
      const m = result.publicMetrics;
      const payload = {handle,metricSources:result.metricSources,httpStatus:result.httpStatus};
      await pool.query(`INSERT INTO owned_social_account_metrics(account_id,measured_at,followers,following,total_posts,data_scope,source,raw_payload)
        VALUES($1,now(),$2,$3,$4,'snapshot','instagram_public_html',$5::jsonb)`,
        [account.id,m.followers,m.following,m.posts,JSON.stringify(payload)]);
      const updated = await historyFor(body.data.accountId);
      return {data:{account,latest:updated[0] ?? null,history:updated,cached:false}};
    } catch (error) {
      request.log.warn({err:error,accountId:account.id},'Instagram public performance collection failed');
      return reply.code(502).send({error:'Pengambilan statistik Instagram gagal. Pengukuran terakhir tetap tersimpan.'});
    }
  });
}
