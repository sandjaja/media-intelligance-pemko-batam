import type { SocialCandidate } from './social-collector.js';
import type { SocialDiscoveryContext } from './social-context-adapter.js';

export type YouTubeShortParent={
 videoId:string;
 title?:string|null;
 description?:string|null;
 channelTitle?:string|null;
 channelId?:string|null;
 publishedAt?:string|null;
 canonicalUrl?:string|null;
};

export type YouTubeCommentInput={
 commentId:string;
 text:string;
 authorName?:string|null;
 authorChannelUrl?:string|null;
 publishedAt?:string|null;
 parentCommentId?:string|null;
 rawPayload?:unknown;
};

function videoUrl(video:YouTubeShortParent){
 return video.canonicalUrl||`https://www.youtube.com/shorts/${encodeURIComponent(video.videoId)}`;
}

/**
 * Provider/normalization adapter only. It performs no network request and
 * contains no API credential. Eligibility as a YouTube Short must be decided
 * by the provider/collector before this adapter is called.
 */
export function youtubeShortToSocialCandidate(input:{video:YouTubeShortParent;discovery?:SocialDiscoveryContext|null;rawPayload?:unknown}):SocialCandidate{
 const {video}=input;
 return{
  platform:'youtube',externalId:video.videoId,contentType:'short',sourceKind:'external',
  authorName:video.channelTitle??null,canonicalUrl:videoUrl(video),title:video.title??null,
  content:video.description??null,publishedAt:video.publishedAt??null,collector:'youtube-shorts',
  rawPayload:input.rawPayload??{},context:{discovery:input.discovery??null},
  metadata:{provider:'youtube-data-api',channelId:video.channelId??null}
 };
}

export function youtubeShortCommentToSocialCandidate(input:{
 video:YouTubeShortParent;
 comment:YouTubeCommentInput;
 discovery?:SocialDiscoveryContext|null;
}):SocialCandidate{
 const {video,comment}=input;
 return{
  platform:'youtube',
  externalId:comment.commentId,
  contentType:comment.parentCommentId?'reply':'comment',
  sourceKind:'external',
  authorName:comment.authorName??null,
  authorProfileUrl:comment.authorChannelUrl??null,
  canonicalUrl:videoUrl(video),
  title:null,
  content:comment.text,
  publishedAt:comment.publishedAt??null,
  collector:'youtube-shorts',
  rawPayload:comment.rawPayload??{},
  context:{
   discovery:input.discovery??null,
   parentContent:{
    externalId:video.videoId,
    contentType:'short',
    authorName:video.channelTitle??null,
    canonicalUrl:videoUrl(video),
    title:video.title??null,
    content:video.description??null
   },
   parentComment:comment.parentCommentId?{externalId:comment.parentCommentId,contentType:'comment'}:null
  },
  metadata:{
   provider:'youtube-data-api',
   parentVideoId:video.videoId,
   parentChannelId:video.channelId??null,
   parentPublishedAt:video.publishedAt??null
  }
 };
}
