import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(file,deps={}) {const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(!(name in deps))throw Error(name);return deps[name]},exports);return exports;}
const policy=load('server-module/src/lib/database-backup-policy.ts');
test('backup day follows Santiago midnight in summer and winter',()=>{
  assert.equal(policy.backupDay(new Date('2026-10-06T02:59:00Z')),'2026-10-05');
  assert.equal(policy.backupDay(new Date('2026-10-06T03:00:00Z')),'2026-10-06');
  assert.equal(policy.backupDay(new Date('2026-06-06T03:59:00Z')),'2026-06-05');
  assert.equal(policy.backupDay(new Date('2026-06-06T04:00:00Z')),'2026-06-06');
});
test('retention expires at exactly fourteen days and rejects malformed dates',()=>{
  const now=Date.parse('2026-10-06T03:00:00Z');
  assert.equal(policy.expiredBackup(new Date(now-policy.BACKUP_RETENTION_MS).toISOString(),now),true);
  assert.equal(policy.expiredBackup(new Date(now-policy.BACKUP_RETENTION_MS+1).toISOString(),now),false);
  assert.equal(policy.expiredBackup('invalid',now),false);
  assert.equal(policy.validBackupId('../../other-bucket'),false);
});
test('schema fingerprint ignores pg_dump random restrict tokens but detects changed DDL',()=>{
  const first='-- Dumped by version 15\n\\restrict first\nCREATE TABLE example (id int);\n\\unrestrict first\n';
  assert.equal(policy.normalizedSchema(first),policy.normalizedSchema(first.replaceAll('first','second')));
  assert.notEqual(policy.normalizedSchema(first),policy.normalizedSchema(first.replace('id int','id text')));
});
const permissions=load('server-module/src/lib/cms-permissions.ts');
test('backup access cannot be granted through staff section metadata',()=>{
  const staff={metadata:{cmsAccess:{enabled:true,sections:['backups'],warehouseIds:[]}}};
  for(const action of ['backup_create','backup_restore','backup_resume']) {
    assert.equal(permissions.canAccessCms(staff,'POST',action),false);
    assert.equal(permissions.canAccessCms({metadata:{isAdmin:true}},'POST',action),true);
  }
  assert.equal(permissions.canAccessCms(staff,'GET','backups'),false);
});
test('restore requires admin authorization and confirmation tied to the selected backup',async()=>{
  const queued=[];
  const api=load('server-module/src/lib/cms-backups.ts',{'@medusajs/framework/utils':{Modules:{USER:'user'}},'./database-backup-policy':policy,'./database-backups':{queueBackup:async(...args)=>{queued.push(args);return {}},backupStatus:async()=>({rows:[]}),resumeAfterFailedRestore:async()=>{}}});
  const backupId='1791255600000-12345678-1234-1234-1234-123456789abc';
  const req=(admin,confirmation)=>({method:'POST',auth_context:{actor_id:'u'},scope:{resolve:()=>({retrieveUser:async()=>({metadata:{isAdmin:admin}})})},body:{action:'backup_restore',backupId,confirmation}});
  const response=()=>({code:200,status(v){this.code=v;return this},json(v){this.body=v;return this}});
  for(const [admin,confirmation,code] of [[false,`RESTORE ${backupId}`,403],[true,'RESTORE',400],[true,'RESTORE different',400],[true,`RESTORE ${backupId}`,202]]) {
    const res=response();await api.cmsBackups(req(admin,confirmation),res);assert.equal(res.code,code);
  }
  assert.deepEqual(queued,[['restore',backupId]]);
});
