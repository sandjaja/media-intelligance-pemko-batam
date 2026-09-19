import { youtubeShortCommentToSocialCandidate, youtubeShortToSocialCandidate, type YouTubeCommentInput, type YouTubeShortParent } from './youtube-shorts-adapter.js';
import type { SocialCandidate } from './social-collector.js';
import type { SocialDiscoveryContext } from './social-context-adapter.js';

const API='https://www.googleapis.com/youtube/v3';

export type YouTubeShortsDiagnostics={searchedVideos:number;shortCandidates:number;videosWithComments:number;commentsCollected:number};
export type YouTubeShortsCollection={candidates:SocialCandidate[];diagnostics:YouTubeShortsDiagnostics};

export type YouTubeShortsCollectorOptions={
 apiKey?:string;
 query:string;
 maxResults?:number;
 publishedAfter?:string;
};

function key(explicit?:string){const value=explicit||process.env.YOUTUBE_API_KEY;if(!value)throw new Error('YOUTUBE_API_KEY_NOT_CONFIGURED');return value;}
async function getJson(path:string,params:Record<string,string|number|undefined>,apiKey:string){
 const url=new URL(API+path); for(const [k,v] of Object.entries(params))if(v!==undefined&&v!=='')url.searchParams.set(k,String(v)); url.searchParams.set('key',apiKey);
 const response=await fetch(url); if(!response.ok)throw new Error(`YOUTUBE_API_ERROR_${response.status}`);
 return response.json() as Promise<any>;
}
function isoDurationSeconds(value:string){
 const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value||''); if(!m)return null;
 return Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0);
}
function looksLikeShort(item:any){
 const seconds=isoDurationSeconds(item?.contentDetails?.duration||'');
 // Duration is only a conservative candidate guard; YouTube search's "short"
 // duration bucket is not itself proof that a video is a Shorts surface item.
 return seconds!==null&&seconds>0&&seconds<=180;
}
function videoParent(item:any):YouTubeShortParent{return{
 videoId:String(item.id),title:item.snippet?.title??null,description:item.snippet?.description??null,
 channelTitle:item.snippet?.channelTitle??null,channelId:item.snippet?.channelId??null,
 publishedAt:item.snippet?.publishedAt??null,canonicalUrl:`https://www.youtube.com/shorts/${encodeURIComponent(String(item.id))}`
};}
function commentInput(item:any,parentCommentId?:string):YouTubeCommentInput{
 const s=item?.snippet??{};
 return{commentId:String(item.id),text:String(s.textDisplay??s.textOriginal??''),authorName:s.authorDisplayName??null,authorChannelUrl:s.authorChannelUrl??null,publishedAt:s.publishedAt??null,parentCommentId:parentCommentId??s.parentId??null,rawPayload:item};
}

export async function collectYouTubeShortCandidatesWithDiagnostics(options:YouTubeShortsCollectorOptions):Promise<YouTubeShortsCollection>{
 const apiKey=key(options.apiKey),max=Math.max(1,Math.min(50,options.maxResults??10));
 const discovery:SocialDiscoveryContext={method:'keyword',query:options.query};
 const search=await getJson('/search',{part:'snippet',type:'video',q:options.query,maxResults:max,order:'date',publishedAfter:options.publishedAfter},apiKey);
 const ids=(search.items??[]).map((x:any)=>x?.id?.videoId).filter(Boolean); if(!ids.length)return{candidates:[],diagnostics:{searchedVideos:0,shortCandidates:0,videosWithComments:0,commentsCollected:0}};
 const details=await getJson('/videos',{part:'snippet,contentDetails',id:ids.join(',')},apiKey);
 const candidates:SocialCandidate[]=[];
 const shortVideos=(details.items??[]).filter(looksLikeShort); let videosWithComments=0;
 for(const video of shortVideos){
  const parent=videoParent(video);
  candidates.push(youtubeShortToSocialCandidate({video:parent,discovery,rawPayload:video}));
  const threads=await getJson('/commentThreads',{part:'snippet,replies',videoId:parent.videoId,maxResults:100,textFormat:'plainText'},apiKey);
  if((threads.items??[]).length)videosWithComments++;
  for(const thread of threads.items??[]){
   const top=thread?.snippet?.topLevelComment;if(!top)continue;
   candidates.push(youtubeShortCommentToSocialCandidate({video:parent,comment:commentInput(top),discovery}));
   const inlineReplies=thread?.replies?.comments??[];
   for(const reply of inlineReplies)candidates.push(youtubeShortCommentToSocialCandidate({video:parent,comment:commentInput(reply,top.id),discovery}));
   const total=Number(thread?.snippet?.totalReplyCount??0);
   if(total>inlineReplies.length){
    let pageToken:string|undefined;
    do{
     const page=await getJson('/comments',{part:'snippet',parentId:top.id,maxResults:100,pageToken},apiKey);
     const seen=new Set(inlineReplies.map((r:any)=>String(r.id)));
     for(const reply of page.items??[])if(!seen.has(String(reply.id)))candidates.push(youtubeShortCommentToSocialCandidate({video:parent,comment:commentInput(reply,top.id),discovery}));
     pageToken=page.nextPageToken;
    }while(pageToken);
   }
  }
 }
 return{candidates,diagnostics:{searchedVideos:ids.length,shortCandidates:shortVideos.length,videosWithComments,commentsCollected:candidates.filter(c=>c.contentType==='comment'||c.contentType==='reply').length}};
}

export async function collectYouTubeShortCandidates(options:YouTubeShortsCollectorOptions):Promise<SocialCandidate[]>{
 return (await collectYouTubeShortCandidatesWithDiagnostics(options)).candidates;
}
