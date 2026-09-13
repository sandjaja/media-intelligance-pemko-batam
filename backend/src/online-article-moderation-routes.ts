import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export async function registerOnlineArticleModerationRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  void app; void pool; void jwtSecret;
}
