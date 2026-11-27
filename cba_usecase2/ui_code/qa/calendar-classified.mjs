import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {defaultFilters,readFilters,filterHash,normalizeRange,resolveRange,isISODate} from '../public/domain.js';
import {parseDateText} from '../public/calendar.js';
const startedAt=new Date().toISOString(),live=JSON.parse(await readFile(new URL('./classified-live-results.json',import.meta.url),'utf8'));
assert.deepEqual(live.meta.bounds,{min:'2025-01-01',max:'2026-11-21'},'Recorded live bounds changed; update explicit independent expected dates.');
const scenarios=[
 {name:'verified classified corpus',bounds:live.meta.bounds,expected:{all:'2025-01-01','3m':'2026-08-22','12m':'2025-11-22'}},
 {name:'current synthetic API',bounds:{min:'2025-01-01',max:'2026-11-21'},expected:{all:'2025-01-01','3m':'2026-08-22','12m':'2025-11-22'}},
 {name:'leap-day maximum',bounds:{min:'2023-01-01',max:'2024-02-29'},expected:{all:'2023-01-01','3m':'2023-11-30','12m':'2023-03-01'}},
 {name:'month-end clamping',bounds:{min:'2024-01-01',max:'2024-05-31'},expected:{all:'2024-01-01','3m':'2024-03-01','12m':'2024-01-01'}},
 {name:'short corpus floor',bounds:{min:'2026-11-01',max:'2026-11-21'},expected:{all:'2026-11-01','3m':'2026-11-01','12m':'2026-11-01'}}
],combinations=[],checks=[];
for(const scenario of scenarios)for(const range of ['all','3m','12m'])for(const context of [{lens:'product',profile:'business',issue:'all',topic:'all'},{lens:'product',profile:'personal',issue:'Statements',topic:'all'},{lens:'yaml',profile:'business',issue:'statements',topic:'all'},{lens:'yaml',profile:'general',issue:'security',topic:'all'}]){
 const f={...defaultFilters(),range,...context},actual=resolveRange(scenario,f),expected={from:scenario.expected[range],to:scenario.bounds.max};assert.deepEqual(actual,expected);
 const normalized=normalizeRange(scenario,{...f,range:'custom',...actual});assert.deepEqual(resolveRange(scenario,normalized),expected);assert.equal(normalized.lens,context.lens);
 const roundtrip=readFilters('#'+filterHash({...f,range:'custom',...actual}));assert.equal(roundtrip.issue,context.issue);assert.equal(roundtrip.from,expected.from);assert.equal(roundtrip.to,expected.to);
 combinations.push({scenario:scenario.name,bounds:scenario.bounds,range,...context,expected,actual,passed:true});
}
function test(name,fn){fn();checks.push({name,passed:true});}
test('all 60 independently expected live/mock/edge preset combinations',()=>assert.equal(combinations.length,60));
test('profile and issue axes retain independent hash values',()=>{for(const profile of ['business','personal','general']){const f={...defaultFilters(),profile,lens:'yaml',issue:'statements',sources:['Synthetic app store']};assert.deepEqual(readFilters(filterHash(f)),f);}});
test('legacy category links reset explicitly to All classified topics',()=>{for(const [category,issue]of Object.entries({profile:'all',statements:'statements',payments:'transactions',nfr:'non functional requirement',onboarding:'onboarding and login'}))assert.equal(readFilters('#category='+category).issue,'all');});
test('invalid and reversed dates reset safely',()=>{for(const [from,to]of [['2026-02-31','2026-11-21'],['2026-07-01','2026-03-01'],['2025-02-29','2026-11-21'],['2026-01-01','']])assert.equal(readFilters('#range=custom&from='+from+'&to='+to).range,'12m');});
test('strict dates and leap-day parsing',()=>{assert.equal(parseDateText('29/02/2024'),'2024-02-29');for(const value of ['29/02/2025','31/04/2026','1/03/2026','2026-03-01'])assert.equal(parseDateText(value),null);assert(isISODate('2024-02-29'));assert(!isISODate('2026-02-29'));});
const sourceHashes={};for(const file of ['public/domain.js','public/calendar.js','server/mock.mjs','qa/calendar-classified.mjs','qa/classified-live-results.json'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex');
const result={startedAt,finishedAt:new Date().toISOString(),scope:'Current live metadata bounds and current mock bounds plus independent leap/month-end/short-corpus expectations; no historical fixture',sourceHashes,presetCombinations:combinations.length,checks,combinations,passed:checks.length,failed:0};await writeFile(new URL('./calendar-classified-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');await writeFile(new URL('../../output/playwright/classified-calendar.log',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,failed:0,presetCombinations:combinations.length,bounds:live.meta.bounds}));
