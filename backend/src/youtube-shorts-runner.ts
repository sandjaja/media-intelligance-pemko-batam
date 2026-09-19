import type { Pool } from 'pg';
import { collectYouTubeShortCandidatesWithDiagnostics, type YouTubeShortsCollectorOptions, type YouTubeShortsDiagnostics } from './youtube-shorts-collector.js';
import { ingestSocialBatch } from './social-collector.js';

export type YouTubeShortsRunResult={
 received:number;
 succeeded:number;
 failed:number;
 skipped:number;
 results:Record<string,unknown>[];
 diagnostics:YouTubeShortsDiagnostics;
};

/**
 * Manual/shared runner boundary for YouTube Shorts.
 * Collection and ingestion remain separate from the scheduler until a real
 * provider run has been validated with authorized credentials.
 */
export async function runYouTubeShortsCollection(pool:Pool,options:YouTubeShortsCollectorOptions):Promise<YouTubeShortsRunResult>{
 const {candidates,diagnostics}=await collectYouTubeShortCandidatesWithDiagnostics(options);
 if(!candidates.length)return{received:0,succeeded:0,failed:0,skipped:0,results:[],diagnostics};
 const ingested=await ingestSocialBatch(pool,candidates,'youtube-shorts');
 const results=ingested.results as Record<string,unknown>[];
 return{
  received:ingested.received,
  succeeded:results.filter(r=>r.ok===true&&r.skipped!==true).length,
  failed:ingested.failed,
  skipped:results.filter(r=>r.skipped===true).length,
  results,
  diagnostics
 };
}
