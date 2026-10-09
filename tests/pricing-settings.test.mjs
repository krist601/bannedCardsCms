import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const api={};new Function('require','exports',ts.transpileModule(fs.readFileSync('server-module/src/lib/cms-pricing-settings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>id==='./storefront-sections'?{normalizeSections:value=>({family:true,...(value??{})})}:{Modules:{STORE:'store',USER:'user',LOCKING:'lock'}},api);
test('pricing settings are admin-only, validated and preserve other store metadata',async()=>{
 let admin=false;const store={id:'s',metadata:{keep:true}};
 const scope={resolve:n=>n==='store'?{listStores:async()=>[store],updateStores:async(id,update)=>{assert.equal(id,'s');Object.assign(store,update)}}:n==='user'?{retrieveUser:async()=>({metadata:{isAdmin:admin}})}:{execute:async(_key,fn)=>fn()}};
 const req={scope,method:'POST',auth_context:{actor_id:'u'},body:{rate:800,minimum:500,rounding:100}};
 const res={status(n){this.code=n;return this},json(data){this.body=data;return this},setHeader(){}};
 await api.pricingSettings(req,res);assert.equal(res.code,403);assert.equal(store.metadata.card_pricing,undefined);
 admin=true;await api.pricingSettings(req,res);assert.deepEqual(res.body.settings,{rate:800,minimum:500,rounding:100,source:'scryfall'});assert.equal(store.metadata.keep,true);assert.equal(store.metadata.storefront_sections.cardKingdomPrices,false);
 req.body.rounding=0;await api.pricingSettings(req,res);assert.equal(res.code,400);assert.deepEqual(await api.readPricing(scope),{rate:800,minimum:500,rounding:100,source:'scryfall'});
 req.body.rounding=100;req.body.source='cardkingdom';await api.pricingSettings(req,res);assert.equal(res.body.settings.source,'cardkingdom');assert.equal(store.metadata.card_pricing.source,'cardkingdom');assert.equal(store.metadata.storefront_sections.cardKingdomPrices,true);
 req.body.source='tcgplayer';await api.pricingSettings(req,res);assert.equal(res.code,400);assert.equal(store.metadata.card_pricing.source,'cardkingdom');
 delete req.body.source;await api.pricingSettings(req,res);assert.equal(res.body.settings.source,'cardkingdom');
});
