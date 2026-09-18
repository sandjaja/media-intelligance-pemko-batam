import type { Pool } from 'pg';
import { collectYouTubeShortCandidates, type YouTubeShortsCollectorOptions } from './youtube-shorts-collector.js';
import { ingestSocialBatch } from './social-collector.js';

export type YouTubeShortsRunResult={
 received:number;
 succeeded:number;
 failed:number;
 skipped:number;
 results:Record<string,unknown>[];
};

/**
 * Manual/shared runner boundary for YouTube Shorts.
 * Collection and ingestion remain separate from the scheduler until a real
 * provider run has been validated with authorized credentials.
 */
export async function runYouTubeShortsCollection(pool:Pool,options:YouTubeShortsCollectorOptions):Promise<YouTubeShortsRunResult>{
 const candidates=await collectYouTubeShortCandidates(options);
 if(!candidates.length)return{received:0,succeeded:0,failed:0,skipped:0,results:[]};
 const ingested=await ingestSocialBatch(pool,candidates,'youtube-shorts');
 const results=ingested.results as Record<string,unknown>[];
 return{
  received:ingested.received,
  succeeded:ingested.succeeded,
  failed:ingested.failed,
  skipped:results.filter(r=>r.skipped===true).length,
  results
 };
}
