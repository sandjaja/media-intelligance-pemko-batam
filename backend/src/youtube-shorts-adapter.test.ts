import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeShortCommentToSocialCandidate } from './youtube-shorts-adapter.js';

const video={videoId:'abc123',title:'Keluhan parkir warga Kota Contoh',description:'Mohon perhatian pemerintah.',channelTitle:'Warga Contoh',channelId:'channel-1',publishedAt:'2026-09-19T00:00:00Z'};

test('YouTube Shorts top-level comment normalizes with parent and discovery context',()=>{
 const c=youtubeShortCommentToSocialCandidate({
  video,
  comment:{commentId:'comment-1',text:'Dishub tolong ditertibkan',authorName:'Warga',publishedAt:'2026-09-19T01:00:00Z'},
  discovery:{method:'keyword',query:'parkir Kota Contoh'}
 });
 assert.equal(c.platform,'youtube');
 assert.equal(c.contentType,'comment');
 assert.equal(c.externalId,'comment-1');
 assert.equal(c.context?.parentContent?.externalId,'abc123');
 assert.equal(c.context?.parentContent?.contentType,'short');
 assert.equal(c.context?.discovery?.query,'parkir Kota Contoh');
 assert.equal(c.metadata && (c.metadata as any).parentChannelId,'channel-1');
});

test('YouTube Shorts reply preserves parent comment relationship',()=>{
 const c=youtubeShortCommentToSocialCandidate({
  video,
  comment:{commentId:'reply-1',parentCommentId:'comment-1',text:'Saya juga mengalami hal yang sama'}
 });
 assert.equal(c.contentType,'reply');
 assert.equal(c.context?.parentComment?.externalId,'comment-1');
 assert.equal(c.context?.parentContent?.externalId,'abc123');
});

test('adapter contains provider normalization only and no credential input',()=>{
 const c:any=youtubeShortCommentToSocialCandidate({video,comment:{commentId:'comment-2',text:'Komentar'}});
 assert.equal('apiKey' in c,false);
 assert.equal(c.collector,'youtube-shorts');
});
