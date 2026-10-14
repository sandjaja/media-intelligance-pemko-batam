import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeApifyInstagramPosts} from './apify-instagram-post-normalizer.js';
test('maps Instagram reel and removes tracking query',()=>{
 const result=normalizeApifyInstagramPosts([{shortCode:'C1234abc',caption:'Kabar Batam hari ini',url:'https://www.instagram.com/reel/C1234abc/?utm_source=x',ownerUsername:'batamnews',timestamp:'2026-10-13T10:00:00.000Z'}]);
 assert.equal(result.rejected,0);
 assert.equal(result.candidates[0].platform,'instagram');
 assert.equal(result.candidates[0].contentType,'reel');
 assert.equal(result.candidates[0].canonicalUrl,'https://www.instagram.com/reel/C1234abc/');
});
test('rejects forged domain, mismatched shortcode, and missing caption',()=>{
 const result=normalizeApifyInstagramPosts([
  {shortCode:'C1234abc',caption:'Batam',url:'https://instagram.com.evil.test/p/C1234abc/'},
  {shortCode:'C1234abc',caption:'Batam',url:'https://www.instagram.com/p/C1234xyz/'},
  {shortCode:'C1234abc',url:'https://www.instagram.com/p/C1234abc/'}
 ]);
 assert.equal(result.rejected,3);
 assert.equal(result.candidates.length,0);
});
