import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path,deps){const out={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(id=>deps[id],out);return out;}
const conversion=load('server-module/src/lib/cms-price-conversion.ts',{});
const writes=[];
const pricing={defaultPricing:{rate:750,minimum:300,rounding:50},readPricing:async()=>({rate:750,minimum:300,rounding:50})};
const api=load('server-module/src/lib/cms-base-prices.ts',{'./cms-price-conversion':conversion,'./cms-pricing-settings':pricing,'@medusajs/framework/utils':{Modules:{LOCKING:'locking'}},'@medusajs/medusa/core-flows':Object.fromEntries(['updateProductVariantsWorkflow','updateProductsWorkflow'].map(name=>[name,()=>({run:async({input})=>writes.push({name,input})})]))});
test('base prices use the requested finish and fixed rounded CLP conversion',()=>{
 const printing={attributes:{scryfall_data:{prices:{usd:'4.00',usd_foil:'13.33',usd_etched:null}}}};
 assert.deepEqual(api.basePrices(printing),{non_foil:3000,foil:10000,etched:null});
 assert.equal(api.basePrice(printing,'foil'),10000);assert.equal(api.basePrice(printing,'etched'),null);
});
test('set refresh changes automatic prices and preserves custom and legacy prices',async()=>{
 writes.length=0;
 const printing={id:'p',attributes:{cms_sku:'keep',scryfall_data:{prices:{usd:'4.00'}}}};
 const listings=[{id:'custom',price_clp:5000,metadata:{price_source:'custom'}},{id:'legacy',price_clp:5000,metadata:{}},{id:'automatic',price_clp:1000,metadata:{price_source:'scryfall'}},{id:'pending',price_clp:0,metadata:{price_pending:true}}].map(l=>({...l,printing_id:'p',finish:'non_foil',variant_id:l.id,product_id:l.id}));
 const updated=[];let saved;
 const catalog={listCardSets:async()=>[{id:'set'}],listCardPrintings:async()=>[printing],updateCardPrintings:async p=>saved=p,listCardListings:async()=>listings,retrieveCardListing:async id=>listings.find(l=>l.id===id),updateCardListings:async l=>updated.push(l)};
 await api.refreshSetBasePrices({resolve:n=>n==='locking'?{execute:async(_key,fn)=>fn()}:catalog},'fra');
 assert.equal(saved.attributes.base_prices_clp.non_foil,3000);assert.equal(saved.attributes.cms_sku,'keep');
 assert.deepEqual(updated.map(l=>[l.id,l.price_clp]),[['automatic',3000],['pending',3000]]);
 assert.equal(writes.filter(w=>w.name==='updateProductsWorkflow').length,1);
 assert.equal(writes[0].input.product_variants[0].prices[0].amount,3000);
});
test('reset overrides custom and legacy prices but keeps a hand-set price when Scryfall has none',async()=>{
 writes.length=0;
 const printing={id:'p',attributes:{scryfall_data:{prices:{usd:'4.00'}}}};
 const listings=[{id:'custom',price_clp:5000,metadata:{price_source:'custom'}},{id:'legacy',price_clp:5000,metadata:{}},{id:'automatic',price_clp:1000,metadata:{price_source:'scryfall'}},{id:'noprice',price_clp:5000,finish:'etched',metadata:{price_source:'custom'}}].map(l=>({finish:'non_foil',...l,printing_id:'p',variant_id:l.id,product_id:l.id}));
 const updated=[];
 const catalog={listCardSets:async()=>[{id:'set'}],listCardPrintings:async()=>[printing],updateCardPrintings:async()=>{},listCardListings:async()=>listings,retrieveCardListing:async id=>listings.find(l=>l.id===id),updateCardListings:async l=>updated.push(l)};
 const summary=await api.refreshSetBasePrices({resolve:n=>n==='locking'?{execute:async(_key,fn)=>fn()}:catalog},'fra',{overrideCustom:true});
 assert.deepEqual(updated.map(l=>[l.id,l.price_clp,l.metadata.price_source]),[['custom',3000,'scryfall'],['legacy',3000,'scryfall'],['automatic',3000,'scryfall']]);
 assert.equal(summary.overridden,2);assert.equal(summary.custom,1);
});
