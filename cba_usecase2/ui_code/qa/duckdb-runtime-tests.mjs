import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {authenticate,databricks} from '../server/auth.mjs';
import {snapshot,query} from '../server/duckdb.mjs';
import {metadata,summary,records,record,benchmark,validateFilters,decodeCursor} from '../server/data.mjs';
const fetchBefore=globalThis.fetch;let networkCalls=0;globalThis.fetch=async()=>{networkCalls++;throw Error('Network disabled for data tests');};
const checks=[],check=(name,fn)=>{assert.ok(fn,name);checks.push({name,pass:true});};
const auth=await authenticate({headers:{}}),meta=await metadata(auth),{manifest}=await snapshot();
check('Local data auth has no token or AzureCLI dependency',!auth.token);
check('Complete archive and classified projection',manifest.totalRows===68919&&manifest.tableCount===10&&meta.total===10555);
check('Both classifier lenses and disagreements preserved',meta.integrity.lensDisagreement===1717&&meta.integrity.joinMatched===10413&&JSON.stringify(meta.lenses.product.profiles.map(p=>p.total))===JSON.stringify([182,2332,7899])&&meta.lenses.yaml.profiles[0].total===297);
const sums=[];let pages=0,seenTotal=0;
for(const lens of ['product','yaml'])for(const profile of ['business','personal','general']){
 const f=validateFilters({lens,profile},meta),s=await summary(auth,f);sums.push({lens,profile,total:s.total,banks:s.banks.map(b=>b.count)});
 check(lens+' '+profile+' cohort parity',s.banks[0].count===meta.lenses[lens].profiles.find(p=>p.key===profile).total);
 if(lens==='yaml'||profile!=='business')check(lens+' '+profile+' unavailable competitor coverage remains null',s.banks.slice(1).every(b=>b.count===null));
 for(const sort of ['relevance','newest','rating']){
  let cursor=null,ids=new Set();do{const p=await records(auth,{...f,sort},{limit:50,cursor});for(const r of p.records){assert.ok(!ids.has(r.id),'No repeated ID '+sort);ids.add(r.id);assert.ok(r.quote.length<=240);assert.ok(!('userid'in r)&&!('comment'in r));}cursor=decodeCursor(p.nextCursor);pages++;}while(cursor);
  check(lens+' '+profile+' '+sort+' complete duplicate-free paging',ids.size===s.total);seenTotal+=ids.size;
 }
}
const f=validateFilters({},meta),all=await summary(auth,f);check('All-time Business parity',JSON.stringify(all.banks.map(b=>b.count))===JSON.stringify([182,63,33,46]));
const recent=await summary(auth,validateFilters({from:'2025-11-22',to:'2026-11-21'},meta));check('Client default 12 month parity',JSON.stringify(recent.banks.map(b=>b.count))===JSON.stringify([116,43,20,21]));
let benchmarkCount=0;for(const t of meta.lenses.product.topics.slice(1)){
 const q=validateFilters({topic:t.id},meta),s=await summary(auth,q);check('Topic count '+t.label,s.total===(all.topicCounts[t.id]||0));
 if(t.hasBenchmark){const b=await benchmark(auth,t.id,meta);assert.equal(b.scope.cbaN,182);assert.equal(b.scope.competitorN,142);assert.ok(b.scope.guideCaveat.includes('New Zealand'));benchmarkCount++;}
}
check('All 29 fixed-sample analyses available',benchmarkCount===29);
const projection=[];for(let offset=0;offset<manifest.evidenceRows;offset+=1000){const rows=await query("SELECT payload FROM source_archive WHERE table_name='app_evidence' ORDER BY row_number LIMIT 1000 OFFSET "+offset);projection.push(...rows.map(r=>JSON.parse(r.payload)));}
const publicIds=new Set();for(let offset=0;offset<projection.length;offset+=1000){const rows=await query('SELECT id FROM app_evidence ORDER BY id LIMIT 1000 OFFSET '+offset);for(const r of rows)publicIds.add(r.id);}
check('Every citation ID preserved byte for byte',projection.every(r=>publicIds.has(r.id))&&publicIds.size===projection.length);
for(const row of [projection[0],...projection.filter(r=>r.bank!=='CommBank').slice(0,10)])check('Citation resolves '+row.id,(await record(auth,row.id)).record.id===row.id);
check('Snapshot provenance fixed and uses DuckDB',meta.provenance.engine==='DuckDB'&&meta.provenance.asOf===manifest.createdAt&&meta.provenance.snapshotSha256===manifest.sha256);
await assert.rejects(()=>query('DELETE FROM app_evidence'),/query failed/);checks.push({name:'Native database is read-only',pass:true});
await assert.rejects(()=>databricks({token:'never-transmitted'},'/api/2.0/sql/statements'),e=>e.code==='API_SCOPE');check('Data tests make zero network calls; SQL path forbidden',networkCalls===0);
const old=process.env.DATABRICKS_APP_NAME;process.env.DATABRICKS_APP_NAME='auth-test';try{
 await assert.rejects(()=>authenticate({headers:{}}),e=>e.status===401);
 const a=await authenticate({headers:{'x-forwarded-user':'user-a'}}),b=await authenticate({headers:{'x-forwarded-user':'user-b'}});check('Hosted data accepts viewer identity without SQL/model token and isolates users',!a.token&&a.namespace!==b.namespace);
 await assert.rejects(()=>authenticate({headers:{'x-forwarded-user':'user-a'}},{model:true}),e=>e.status===401);check('Model still requires forwarded user authorization',true);
}finally{if(old===undefined)delete process.env.DATABRICKS_APP_NAME;else process.env.DATABRICKS_APP_NAME=old;}
globalThis.fetch=fetchBefore;
const result={at:new Date().toISOString(),engine:'DuckDB',networkCalls,pages,recordsVisited:seenTotal,benchmarkCount,checks,scopeResults:sums,passed:checks.length,failed:0};await writeFile(new URL('./duckdb-runtime-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,networkCalls,pages,recordsVisited:seenTotal}));
