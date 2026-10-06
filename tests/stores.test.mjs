import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path,deps){const api={};new Function('require','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(!(n in deps))throw Error(n);return deps[n]},api);return api;}
const utils={Modules:{SALES_CHANNEL:'channels',INVENTORY:'inventory',CART:'cart',STORE:'store',API_KEY:'keys',PRODUCT:'products'},ContainerRegistrationKeys:{QUERY:'query'},ApiKeyType:{PUBLISHABLE:'publishable'}};
const scopeApi=load('server-module/src/lib/store-warehouse-scope.ts',{'@medusajs/framework/utils':utils});
const stockLocations=[{id:'one',sales_channels:[{id:'banned'},{id:'distrito'}]},{id:'two',sales_channels:[{id:'banned'},{id:'distrito'}]},{id:'three',sales_channels:[]},{id:'four',sales_channels:[{id:'banned'}]}];
const levels=[{inventory_item_id:'item',location_id:'one',available_quantity:2},{inventory_item_id:'item',location_id:'two',available_quantity:3},{inventory_item_id:'item',location_id:'three',available_quantity:10},{inventory_item_id:'item',location_id:'four',available_quantity:7}];
function request(channel){return {query:{},publishable_key_context:{sales_channel_ids:[channel]},scope:{resolve:n=>n==='query'?{graph:async({entity})=>({data:entity==='stock_location'?stockLocations:[{id:'variant',product:{status:'published',sales_channels:[{id:'banned'},{id:'distrito'}]},inventory_items:[{inventory_item_id:'item',required_quantity:1}]}]})}:n==='inventory'?{listInventoryLevels:async f=>levels.filter(l=>f.location_id.includes(l.location_id))}:null}}}
test('each storefront sees only live stock from its assigned warehouses',async()=>{
  const listings=[{id:'listing',variant_id:'variant',quantity:999,price_clp:750}];
  assert.equal((await scopeApi.scopeCardListings(request('banned'),listings))[0].quantity,12);
  assert.equal((await scopeApi.scopeCardListings(request('distrito'),listings))[0].quantity,5);
  assert.equal((await scopeApi.scopeCardListings(request('unassigned'),listings))[0].quantity,0);
  assert.equal(listings[0].quantity,999);
  assert.equal((await scopeApi.scopeCardListings(request('distrito'),listings))[0].price_clp,750);
});
test('ambiguous keys and foreign channel requests are rejected',()=>{
  assert.throws(()=>scopeApi.selectStoreChannel([]));assert.throws(()=>scopeApi.selectStoreChannel(['one','two']));assert.throws(()=>scopeApi.selectStoreChannel(['one'],'two'));
  assert.equal(scopeApi.selectStoreChannel(['one','two'],'two'),'two');
});
test('a store cannot reuse another stores cart or move it across stores',async()=>{
  let next=false;const res={status(c){this.code=c;return this},json(d){this.body=d;return this}};
  const req={...request('distrito'),originalUrl:'/store/carts/cart_1/line-items',method:'POST',body:{},scope:{resolve:()=>({retrieveCart:async()=>({sales_channel_id:'banned'})})}};
  await scopeApi.storeCartGuard(req,res,()=>next=true);assert.equal(res.code,403);assert.equal(next,false);
  req.originalUrl='/store/carts';req.validatedBody={region_id:'cl'};await scopeApi.storeCartGuard(req,res,()=>next=true);assert.equal(next,true);assert.equal(req.validatedBody.sales_channel_id,'distrito');
});
const flows=[];
const stores=load('server-module/src/lib/cms-stores.ts',{'@medusajs/framework/utils':utils,'@medusajs/medusa/core-flows':Object.fromEntries(['createApiKeysWorkflow','createStockLocationsWorkflow','linkSalesChannelsToApiKeyWorkflow','linkSalesChannelsToStockLocationWorkflow','linkProductsToSalesChannelWorkflow'].map(name=>[name,()=>({run:async({input})=>{flows.push({name,input});return {result:[]}}})]))});
test('store domains are normalized and reject paths and credentials',()=>{
  assert.equal(stores.storeDomain('https://WWW.DistritoTCG.cl/'),'distritotcg.cl');
  for(const s of ['localhost','https://a.cl/path','user:password@a.cl','a.cl:9000','*.a.cl'])assert.throws(()=>stores.storeDomain(s));
});
test('receiving stock cannot add a managed store to an excluded warehouse',async()=>{
  const scope={resolve:n=>n==='channels'?{listSalesChannels:async()=>[{id:'banned',metadata:{cms_store:{}}},{id:'distrito',metadata:{cms_store:{}}}]}:{graph:async()=>({data:stockLocations})}};
  assert.deepEqual(await stores.allowedStockChannels(scope,'four',['banned','distrito','legacy']),['banned','legacy']);
  assert.deepEqual(await stores.allowedStockChannels(scope,'three',['banned','distrito']),[]);
});
test('saving one store removes only its warehouse link and preserves other stores and metadata',async()=>{
  flows.length=0;let updated;
  const channel={id:'banned',name:'Banned',metadata:{other:'keep',cms_store:{domain:'bannedcards.cl',api_key_id:'key'}}};
  const scope={resolve:n=>({channels:{listSalesChannels:async()=>[channel],updateSalesChannels:async (id,value)=>{assert.equal(id,'banned');updated=value}},query:{graph:async()=>({data:stockLocations})},products:{listProducts:async()=>[]}})[n]};
  await stores.saveStore(scope,{id:'banned',name:'Banned Cards',domain:'bannedcards.cl',warehouse_ids:['one','two']},'admin');
  assert.deepEqual(flows,[{name:'linkSalesChannelsToStockLocationWorkflow',input:{id:'four',add:[],remove:['banned']}}]);
  assert.equal(updated.metadata.other,'keep');
});
