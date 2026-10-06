import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const math={};
new Function('exports',ts.transpileModule(fs.readFileSync('server-module/src/lib/cms-price-conversion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(math);
test('USD pricing uses fixed 750 rate and rounds upward to 50 without float boundary errors',()=>{
  for(const [usd,clp] of [['1.40',1050],['1.41',1100],['0.01',300],['1',750],['1.01',800],['12.99',9750]]) assert.equal(math.usdToClp(usd),clp);
  assert.equal(math.usdToClp('0.10',{rate:800,minimum:500}),500);
  assert.equal(math.usdToClp('1.01',{rate:800,minimum:500}),850);
  assert.equal(math.usdToClp('1.01',{rate:800,minimum:300,rounding:100}),900);
  assert.equal(math.usdToClp('1.01',{rate:800,minimum:300,rounding:500}),1000);
  assert.equal(math.usdToClp('0.01',{rate:750,minimum:300,rounding:500}),500);
  for(const usd of [null,undefined,'',0,'0.00','-1','NaN','1.001',Infinity,'999999999999999'])assert.equal(math.usdToClp(usd),null);
});
