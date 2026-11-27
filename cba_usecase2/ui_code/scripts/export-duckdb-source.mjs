// Operator only; never staged. Read-only, version-pinned full application snapshot.
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {authenticate,databricks} from './source/auth.mjs';
import {sql} from './source/sql.mjs';
import {classifiedQuery,PRODUCTS} from './source/classified.mjs';
const dir=new URL('../private-export/',import.meta.url);await mkdir(dir,{recursive:true,mode:0o700});
const auth=await authenticate({headers:{}}),catalog='ai_lab_in_usecase4',schema=catalog+'.landing';
const quote=s=>'`'+s.replaceAll('`','``')+'`';
const run=(q)=>sql(auth,q);
let manifest;try{manifest=JSON.parse(await readFile(new URL('source-manifest.json',dir),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const inventory=await run(`SELECT table_name,table_type FROM ${catalog}.information_schema.tables WHERE table_schema='landing' ORDER BY table_name`);
if(inventory.some(r=>r.table_type!=='MANAGED'))throw Error('Unexpected non-managed application object');
const [timezone]=await run('SELECT current_timezone() timezone');if(timezone.timezone!=='Etc/UTC'&&timezone.timezone!=='UTC')throw Error('Snapshot timezone must be UTC');
const filters=await run(`SELECT table_name FROM ${catalog}.information_schema.row_filters WHERE table_schema='landing'`);
const masks=await run(`SELECT table_name FROM ${catalog}.information_schema.column_masks WHERE table_schema='landing'`);
if(filters.length||masks.length)throw Error('Source row filters or column masks prohibit a complete archive');

if(!manifest){
 manifest={format:1,createdAt:new Date().toISOString(),sourceSchema:schema,tables:[]};
 for(const r of inventory){
  if(!/^[a-z][a-z0-9_]+$/.test(r.table_name))throw Error('Unsupported source name');
  const name=r.table_name,full=schema+'.'+name;
  const [history]=await run('DESCRIBE HISTORY '+full+' LIMIT 1');
  const version=Number(history.version);if(!Number.isSafeInteger(version)||version<0)throw Error('Missing Delta version');
  const columns=await run(`SELECT column_name,data_type,full_data_type,is_nullable,ordinal_position FROM ${catalog}.information_schema.columns WHERE table_schema='landing' AND table_name='${name}' ORDER BY ordinal_position`);
  if(!columns.length||columns.some(c=>!['STRING','INT','DOUBLE','DATE','BOOLEAN'].includes(c.data_type)))throw Error('Unsupported source types '+name);
  manifest.tables.push({name,version,timestamp:history.timestamp,columns});
 }
 await writeFile(new URL('source-manifest.json',dir),JSON.stringify(manifest,null,2));
}
if(JSON.stringify(inventory.map(r=>r.table_name))!==JSON.stringify(manifest.tables.map(t=>t.name)))throw Error('Source inventory changed: restart explicit new snapshot');
function pinned(q){for(const t of [...manifest.tables].sort((a,b)=>b.name.length-a.name.length))q=q.replace(new RegExp((schema+'.'+t.name).replaceAll('.', '\\.')+'(?![A-Za-z0-9_])','g'),schema+'.'+t.name+' VERSION AS OF '+t.version);return q;}
async function exportRows(name,base,statsColumns=[]){
 const destination=new URL(name+'.ndjson',dir),metadataFile=new URL(name+'.json',dir);
 try{const old=JSON.parse(await readFile(metadataFile,'utf8')),bytes=await readFile(destination);if(createHash('sha256').update(bytes).digest('hex')!==old.sha256)throw Error('Existing export corrupted');return old;}catch(e){if(e.code!=='ENOENT')throw e;}
 const hashes=Array.from({length:5},(_,i)=>`CAST(SUM(CAST(conv(substring(sha2(payload,256),${i*15+1},${i===4?4:15}),16,10) AS DECIMAL(38,0))) AS STRING) h${i}`).join(',');
 const [source]=await run(`WITH rows AS (${base}) SELECT COUNT(*) count,COUNT(DISTINCT payload) distinct_rows,SUM(length(payload)) characters,${hashes} FROM rows`);
 const expected=Number(source.count),lines=[];
 if(name==='app_evidence'){
  let response=await databricks(auth,'/api/2.0/sql/statements',{body:{warehouse_id:'3256264e23292b2f',statement:`WITH rows AS (${base}) SELECT payload FROM rows ORDER BY payload`,disposition:'INLINE',format:'JSON_ARRAY',wait_timeout:'0s',on_wait_timeout:'CONTINUE',row_limit:100000},timeout:15000});
  const id=response.statement_id,deadline=Date.now()+120000;
  while(['PENDING','RUNNING'].includes(response.status?.state)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,500));response=await databricks(auth,'/api/2.0/sql/statements/'+id);}
  if(response.status?.state!=='SUCCEEDED'||response.manifest?.truncated)throw Error('Single-statement evidence export incomplete');
  let chunk=response.result,chunkCount=0;while(chunk){lines.push(...(chunk.data_array||[]).map(r=>r[0]));chunkCount++;const next=chunk.next_chunk_internal_link;chunk=next?await databricks(auth,next):null;}
  if(lines.length!==expected||chunkCount!==response.manifest.total_chunk_count)throw Error('Evidence chunk reconciliation failed');
 }else for(let offset=0;offset<expected;offset+=1000){
  const page=await run(`WITH rows AS (${base}) SELECT payload FROM rows ORDER BY payload LIMIT 1000 OFFSET ${offset}`);
  if(page.length!==Math.min(1000,expected-offset))throw Error('Incomplete page '+name);
  lines.push(...page.map(r=>r.payload));
 }
 const sums=[0n,0n,0n,0n,0n];for(const line of lines){const hash=createHash('sha256').update(line).digest('hex');for(let i=0;i<5;i++)sums[i]+=BigInt('0x'+hash.slice(i*15,i===4?64:i*15+15));}
 if(sums.some((s,i)=>s.toString()!==String(source['h'+i]??'0'))||new Set(lines).size!==Number(source.distinct_rows)||lines.reduce((n,s)=>n+[...s].length,0)!==Number(source.characters))throw Error('Source content reconciliation failed '+name);
 const bytes=Buffer.from(lines.length?lines.join('\n')+'\n':'');await writeFile(new URL(name+'.partial',dir),bytes,{mode:0o600});await rename(new URL(name+'.partial',dir),destination);await chmod(destination,0o600);
 const result={name,rows:expected,distinctRows:Number(source.distinct_rows),characters:Number(source.characters),sha256:createHash('sha256').update(bytes).digest('hex'),sourceHashSums:sums.map(String)};
 await writeFile(metadataFile,JSON.stringify(result,null,2));console.log(JSON.stringify({exported:name,rows:expected,bytes:bytes.length,verified:true}));return result;
}
// No raw payloads are printed. Every table includes every original column.
for(const table of manifest.tables){
 const names=table.columns.map(c=>c.column_name),full=schema+'.'+table.name+' VERSION AS OF '+table.version;
 const [nulls]=await run('SELECT '+names.map((n,i)=>`COUNT_IF(${quote(n)} IS NULL) n${i}`).join(',')+' FROM '+full);
 table.nullCounts=Object.fromEntries(names.map((n,i)=>[n,Number(nulls['n'+i])]));
 const pairs=names.flatMap(n=>["'"+n.replaceAll("'","''")+"'",quote(n)]).join(',');
 Object.assign(table,await exportRows(table.name,`SELECT to_json(named_struct(${pairs}),map('ignoreNullFields','false')) payload FROM ${full}`));
 await writeFile(new URL('source-manifest.json',dir),JSON.stringify(manifest,null,2));
}
// Materialize the current Spark projection once to retain existing citation IDs.
const cte=pinned(classifiedQuery());
const names=['id','bank','source','record_date','rating','quote','p_profile','y_profile','p_issue','y_issue','topic','sentiment','primary_derived','label_product'];
const evidence=await exportRows('app_evidence',cte+`SELECT to_json(named_struct(${names.flatMap(n=>["'"+n+"'",quote(n)]).join(',')}),map('ignoreNullFields','false')) payload FROM evidence`);
// Build metadata using the same pinned query implementation, not a changing source.
const [check]=await run(cte+`SELECT (SELECT COUNT(*) FROM yaml_keys) yaml_rows,(SELECT COUNT(DISTINCT join_key) FROM yaml_keys) yaml_keys,(SELECT COUNT(*) FROM product_keys) product_rows,(SELECT COUNT(DISTINCT join_key) FROM product_keys) product_keys,COUNT(*) matched,COUNT(DISTINCT join_key) matched_keys,COUNT_IF(y_profile_label<>CASE account_type WHEN 'Business' THEN 'business profile' WHEN 'Personal' THEN 'personal profile' WHEN 'General' THEN 'general profile' ELSE '' END) lens_disagreement,COUNT_IF(account_type IS NULL OR account_type NOT IN ('Business','Personal','General') OR y_profile_label IS NULL OR y_profile_label NOT IN ('business profile','personal profile','general profile')) invalid_profiles FROM cba_joined`);
const nums=Object.fromEntries(Object.entries(check).map(([k,v])=>[k,Number(v)]));
if(!nums.matched||![nums.yaml_rows,nums.yaml_keys,nums.product_rows,nums.product_keys,nums.matched_keys].every(n=>n===nums.matched))throw Error('Classified join is not one-to-one');
const stats=await run(cte+`SELECT bank,source,p_profile,y_profile,COUNT(*) count,CAST(MIN(record_date) AS STRING) min_date,CAST(MAX(record_date) AS STRING) max_date,COUNT_IF(record_date IS NULL) undated FROM evidence GROUP BY ALL`);
const pairs=await run(cte+`SELECT t.primary_area,t.secondary_area,COUNT(b.primary_area) benchmark_rows FROM topic_pairs t LEFT JOIN ${schema}.intel_business_only VERSION AS OF ${manifest.tables.find(t=>t.name==='intel_business_only').version} b ON t.primary_area=b.primary_area AND t.secondary_area=b.secondary_area GROUP BY t.primary_area,t.secondary_area`);
manifest.projection={...evidence,stats,pairs,integrity:{cbaRows:nums.product_rows,joinMatched:nums.matched,lensDisagreement:nums.lens_disagreement,invalidProfiles:nums.invalid_profiles,competitorEvidence:stats.filter(r=>r.bank!=='CommBank').reduce((n,r)=>n+Number(r.count),0)}};
manifest.sourceControls={timezone:timezone.timezone,rowFilters:0,columnMasks:0,allObjectsInventoried:true,evidenceSingleStatement:true};
manifest.totalRows=manifest.tables.reduce((n,t)=>n+t.rows,0);manifest.completedAt=new Date().toISOString();
await writeFile(new URL('source-manifest.json',dir),JSON.stringify(manifest,null,2));console.log(JSON.stringify({complete:true,tables:manifest.tables.length,rows:manifest.totalRows,evidence:evidence.rows}));
