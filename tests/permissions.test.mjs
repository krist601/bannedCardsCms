import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const api={};new Function('exports',ts.transpileModule(fs.readFileSync('server-module/src/lib/cms-permissions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(api);
const member={metadata:{cmsAccess:{enabled:true,sections:['cards','stock'],warehouseIds:['shared','samuel']}}};
test('sealed creation requires explicit permission and section access, including bulk acceptance',()=>{
  const user=(permission,sections=['sealed'])=>({metadata:{cmsAccess:{enabled:true,sections,canCreateSealed:permission,warehouseIds:[]}}});
  for(const action of ['sealed_create','sealed_accept']) {
    for(const value of [undefined,false,'true']) assert.equal(api.canAccessCms(user(value),'POST',action),false);
    assert.equal(api.canAccessCms(user(true),'POST',action),true);
    assert.equal(api.canAccessCms(user(true,[]),'POST',action),false);
    assert.equal(api.canAccessCms({metadata:{isAdmin:true}},'POST',action),true);
  }
  for(const action of ['sealed_save','sealed_stock','sealed_price']) assert.equal(api.canAccessCms(user(false),'POST',action),true);
});
test('members are denied unassigned sections, administration, unknown actions and warehouses',()=>{
  assert.equal(api.canAccessCms(member,'GET','cards'),true);
  for(const key of ['users','orders','overview','sealed','unknown'])assert.equal(api.canAccessCms(member,'GET',key),false);
  for(const id of ['shared','samuel'])assert.equal(api.canAccessCms(member,'POST','quick_add',id),true);
  assert.equal(api.canAccessCms(member,'POST','quick_add','private'),false);
  assert.equal(api.canAccessCms(member,'POST','user_save'),false);
  assert.equal(api.canAccessCms({metadata:{cmsAccess:{...member.metadata.cmsAccess,enabled:false}}},'GET','me'),false);
});
test('warehouse filtering hides other levels and recomputes scoped listing quantities',()=>{
  const data={rows:[{quantity:105,levels:[{location_id:'shared',available_quantity:5},{location_id:'private',available_quantity:100}],variants:[{levels:[{location_id:'private',available_quantity:100}]}]}]};
  const result=api.scopeWarehouseResponse(data,['shared']);
  assert.equal(result.rows[0].quantity,5);assert.equal(result.rows[0].levels.length,1);assert.deepEqual(result.rows[0].variants[0].levels,[]);assert.equal(data.rows[0].quantity,105);
  assert.equal(api.scopeWarehouseResponse(data,null),data);
});
test('admins keep full access and members are never treated as admins',()=>{
  assert.equal(api.cmsPermissions(member).admin,false);
  assert.equal(api.canAccessCms({metadata:{isAdmin:true}},'POST','user_save'),true);
  assert.equal(api.canAccessCms({metadata:{isAdmin:true}},'POST','receive','private'),true);
});
