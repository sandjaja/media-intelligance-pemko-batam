import test from 'node:test';
import assert from 'node:assert/strict';
import {yesterdayJakarta,publicationInPeriod,mappedDate,validateActorAdapter,renderActorTemplate} from './apify-actor-adapter.js';
import {buildActiveApifySteps,buildActiveApifyInput,normalizeActiveApifyItems} from './apify-active-collection.js';
test('yesterday follows Jakarta midnight across month, year and leap day',()=>{
 for(const [now,date,start,end] of [
 ['2026-10-14T17:00:00Z','2026-10-14','2026-10-13T17:00:00.000Z','2026-10-14T17:00:00.000Z'],
 ['2026-10-14T16:59:59Z','2026-10-13','2026-10-12T17:00:00.000Z','2026-10-13T17:00:00.000Z'],
 ['2027-01-01T00:00:00Z','2026-12-31','2026-12-30T17:00:00.000Z','2026-12-31T17:00:00.000Z'],
 ['2024-03-01T00:00:00Z','2024-02-29','2024-02-28T17:00:00.000Z','2024-02-29T17:00:00.000Z']])assert.deepEqual(yesterdayJakarta(new Date(now)),{timezone:'Asia/Jakarta',date,start,end});
});
test('publication filter excludes older, today, missing and invalid dates',()=>{
 const p=yesterdayJakarta(new Date('2026-10-15T06:00:00Z'));
 for(const value of [p.start,'2026-10-14T23:59:59+07:00'])assert.equal(publicationInPeriod(value,p),true);
 for(const value of ['2026-10-13T16:59:59Z',p.end,null,undefined,'','bad-date'])assert.equal(publicationInPeriod(value,p),false);
 assert.equal(mappedDate(1791910800),mappedDate(1791910800000));
});
test('a different database Actor controls input and output without a runtime allowlist',()=>{
 const actorId='example/another-scraper';
 const adapter={actorId,inputTemplate:{terms:'{{queries}}',from:'{{since}}',to:'{{until}}',count:'{{limit}}',tag:'#{{hashtag}}'},output:{id:['post.key'],text:['post.description'],publishedAt:['post.date'],url:['post.link']}};
 const [step]=buildActiveApifySteps([{kind:'instagram_posts',actorId,enabled:true}],{actorAdapters:{instagram_posts:adapter},actorMaxCostUsd:{instagram_posts:.07},maxInstagramPerRun:10},'instagram',10);
 const period=yesterdayJakarta(new Date('2026-10-15T06:00:00Z'));
 assert.equal(step.actorId,actorId);assert.equal(step.cap,.07);
 assert.deepEqual(buildActiveApifyInput(step,'Batam',['Pemko Batam'],2,period),{terms:['Pemko Batam'],from:period.start,to:period.end,count:10,tag:'#batam'});
 const result=normalizeActiveApifyItems(step,[{post:{key:'ABCde123',description:'Pemko Batam',date:period.start,link:'https://www.instagram.com/p/ABCde123/'}}]);
 assert.equal(result.candidates.length,1);assert.equal((result.candidates[0].metadata as any).actorId,actorId);assert.equal(result.candidates[0].publishedAt,period.start);
 assert.throws(()=>validateActorAdapter(adapter,'other/actor',false),/NOT_CONFIGURED/);
 assert.throws(()=>renderActorTemplate({value:'{{secret}}'},{}),/VARIABLE_INVALID/);
 assert.throws(()=>validateActorAdapter({...adapter,output:{...adapter.output,id:['__proto__.value']}},actorId,false),/NOT_CONFIGURED/);
});
