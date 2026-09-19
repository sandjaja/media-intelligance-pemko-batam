import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { registerAskIntelligence as registerAskIntelligenceCore } from './ask-intelligence-core.js';
import { registerOnlineStoryClusterRoutes } from './online-story-cluster-routes.js';

export async function registerAskIntelligence(app: FastifyInstance, pool: Pool, jwtSecret: string) {
  await registerAskIntelligenceCore(app, pool, jwtSecret);
  await registerOnlineStoryClusterRoutes(app, pool, jwtSecret);
}
