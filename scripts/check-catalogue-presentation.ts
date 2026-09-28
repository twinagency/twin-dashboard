import assert from 'node:assert/strict';
import { cataloguePresentation, compactCategories, compactItems, remainingBundles, salePercent, shortCatalogueTitle } from '../lib/catalogue-presentation';
import type { CatalogueItem } from '../lib/catalogue-core';
import type { CatalogueBundle } from '../lib/catalogue-commerce';

const photo = { id:'photo-1',type:'photo',description:'  White outfit  and a long description that remains searchable  ',stars:280,free:false,purchased:false,received:false,createdAt:'2026-09-27' } as CatalogueItem;
const free:CatalogueItem = { ...photo,id:'free-1',description:'Free introduction',free:true,stars:0 };
const video:CatalogueItem = { ...photo,id:'video-1',type:'video',description:'A longer video description',received:true };
const items:CatalogueItem[] = [photo,free,video];
const bundle = (id:string):CatalogueBundle => ({id,title:'Collection',kind:'photo',photoIds:['a','b','c','d','e'],videoIds:[],stars:1400,regularStars:1750,owned:false,partial:false});
const bundles = [bundle('featured'),bundle('other')];

assert.equal(cataloguePresentation('compact'),'compact');
assert.equal(cataloguePresentation('anything else'),'standard');
assert.deepEqual(compactCategories,['Explore','Videos','Photos','Bundles']);
assert.deepEqual(remainingBundles(bundles,'featured').map(b=>b.id),['other']);
assert.deepEqual(remainingBundles([bundles[0]],'featured'),[]);
assert.deepEqual(remainingBundles(bundles,'missing').map(b=>b.id),['featured','other']);
assert.equal(salePercent(bundle('featured')),20);
assert.equal(salePercent({...bundle('a'),stars:100,regularStars:101}),0);
assert.equal(salePercent({...bundle('a'),stars:1750}),null);
assert.deepEqual(compactItems(items,'Explore','').map(i=>i.id),['photo-1','free-1','video-1']);
assert.deepEqual(compactItems(items,'Photos','').map(i=>i.id),['photo-1','free-1']);
assert.deepEqual(compactItems(items,'Videos','').map(i=>i.id),['video-1']);
assert.deepEqual(compactItems(items,'Bundles','long description').map(i=>i.id),['photo-1']);
assert.deepEqual(compactItems(items,'My Purchases','').map(i=>i.id),['video-1']);
assert.equal(shortCatalogueTitle(photo.description),'White outfit and a long description that remains searchable');
assert.equal(photo.description,'  White outfit  and a long description that remains searchable  ');
console.log('Catalogue presentation checks passed: creator variant, bundle dedup, discounts, free media, search and full captions.');
