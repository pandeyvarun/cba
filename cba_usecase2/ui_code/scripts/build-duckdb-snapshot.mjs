// Offline operator only. Never staged. Retains full-fidelity source archive.
import {DuckDBInstance} from '@duckdb/node-api';
import {readFile,writeFile,mkdir,rm,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),source=new URL('private-export/',root),target=new URL('data/',root);
const manifest=JSON.parse(await readFile(new URL('source-manifest.json',source),'utf8'));
if(!manifest.completedAt||!manifest.projection)throw Error('Export incomplete');
await mkdir(target,{recursive:true,mode:0o700});
const database=new URL('snapshot.build.duckdb',source);await rm(database,{force:true});
const instance=await DuckDBInstance.create(fileURLToPath(database),{threads:'1',preserve_insertion_order:'true'}),c=await instance.connect();
const run=async(q,p)=>{const r=await c.runAndReadAll(q,p);try{return r.getRowObjectsJson();}finally{r.closeSync();}};
const ident=s=>'"'+s.replaceAll('"','""')+'"',literal=s=>"'"+s.replaceAll("'","''")+"'";
const types={STRING:'VARCHAR',INT:'INTEGER',DOUBLE:'DOUBLE',DATE:'DATE',BIGINT:'BIGINT',BOOLEAN:'BOOLEAN'};
const report={at:new Date().toISOString(),checks:[],tables:[]};
await run('CREATE SCHEMA landing');
await run('CREATE TABLE source_archive(table_name VARCHAR,row_number INTEGER,payload VARCHAR)');
await run('CREATE TABLE source_schema(table_name VARCHAR,delta_version BIGINT,column_ordinal INTEGER,column_name VARCHAR,source_type VARCHAR,source_nullable VARCHAR)');
for(const t of [...manifest.tables,{...manifest.projection,name:'app_evidence',columns:['id','bank','source','record_date','rating','quote','p_profile','y_profile','p_issue','y_issue','topic','sentiment','primary_derived','label_product'].map(column_name=>({column_name,data_type:column_name==='record_date'?'DATE':column_name==='rating'?'INT':column_name==='primary_derived'?'BOOLEAN':'STRING'}))}]){
 const bytes=await readFile(new URL(t.name+'.ndjson',source)),sha=createHash('sha256').update(bytes).digest('hex');if(sha!==t.sha256)throw Error('Source payload SHA changed '+t.name);
 const lines=bytes.toString('utf8').split('\n');if(lines.at(-1)==='')lines.pop();if(lines.length!==t.rows)throw Error('Source line count mismatch');
 const app=await c.createAppender('source_archive');for(let i=0;i<lines.length;i++){app.appendVarchar(t.name);app.appendInteger(i);app.appendVarchar(lines[i]);app.endRow();}app.closeSync();
 if(t.name!=='app_evidence'){
  const schemaApp=await c.createAppender('source_schema');for(const [i,col]of t.columns.entries()){schemaApp.appendVarchar(t.name);schemaApp.appendBigInt(BigInt(t.version));schemaApp.appendInteger(i+1);schemaApp.appendVarchar(col.column_name);schemaApp.appendVarchar(col.full_data_type);schemaApp.appendVarchar(col.is_nullable);schemaApp.endRow();}schemaApp.closeSync();
 }
 const table=t.name==='app_evidence'?'app_evidence':'landing.'+ident(t.name);
 // A strict typed import retains primitive source values and source column order.
 const columns='{'+t.columns.map(col=>literal(col.column_name)+':'+literal(types[col.data_type])).join(',')+'}';
 await run(`CREATE TABLE ${table} AS SELECT * FROM read_json(${literal(fileURLToPath(new URL(t.name+'.ndjson',source)))},format='newline_delimited',columns=${columns},ignore_errors=false,auto_detect=false)`);
 const restored=await run('SELECT payload FROM source_archive WHERE table_name=$name ORDER BY row_number',{name:t.name});
 const restoredBytes=Buffer.from(restored.map(r=>r.payload).join('\n')+(restored.length?'\n':''));if(!restoredBytes.equals(bytes))throw Error('Archive byte reconciliation failed '+t.name);
 const [stats]=await run('SELECT COUNT(*) n,'+t.columns.map((col,i)=>`COUNT(*) FILTER(WHERE ${ident(col.column_name)} IS NULL) n${i}`).join(',')+' FROM '+table);
 if(Number(stats.n)!==t.rows)throw Error('Typed row count mismatch');
 for(const [i,col]of t.columns.entries())if(t.nullCounts&&Number(stats['n'+i])!==t.nullCounts[col.column_name])throw Error('Typed null mismatch '+t.name+'.'+col.column_name);
 // Compare every native value back to the source payload, including duplicates.
 // Sort by source row ordinal using a temporary import with ordinality.
 const native=await run('SELECT * FROM '+table);
 for(let i=0;i<lines.length;i++){
  const expected=JSON.parse(lines[i]),actual=native[i];
  for(const col of t.columns){let a=actual[col.column_name],b=expected[col.column_name];if(col.data_type==='BIGINT'&&a!==null)b=String(b);if(typeof a==='number'&&Object.is(a,-0))a=0;if(typeof b==='number'&&Object.is(b,-0))b=0;if(a!==b)throw Error('Native value mismatch '+t.name+' row '+i+' column '+col.column_name);}
 }
 report.tables.push({name:t.name,rows:t.rows,columns:t.columns.length,archiveSha256:sha,archiveBytesVerified:true,nativeValuesVerified:true,nullCountsVerified:!!t.nullCounts,duplicatesPreserved:t.rows-t.distinctRows});
 console.log(JSON.stringify({built:t.name,rows:t.rows,allValuesVerified:true}));
}
await run('ALTER TABLE app_evidence ADD PRIMARY KEY (id)');
await run('CREATE TABLE app_metadata(payload VARCHAR)');await run('INSERT INTO app_metadata VALUES ($payload)',{payload:JSON.stringify(manifest.projection)});
await run('CREATE TABLE snapshot_manifest(payload VARCHAR)');await run('INSERT INTO snapshot_manifest VALUES ($payload)',{payload:JSON.stringify(manifest)});
await run('CHECKPOINT');c.closeSync();instance.closeSync();
const bytes=await readFile(database),sha256=createHash('sha256').update(bytes).digest('hex'),parts=[];
for(let i=0;i<bytes.length;i+=3*1024*1024){const part=bytes.subarray(i,i+3*1024*1024),name='snapshot-'+String(parts.length).padStart(3,'0')+'.bin';await writeFile(new URL(name,target),part,{mode:0o600});parts.push({name,bytes:part.length,sha256:createHash('sha256').update(part).digest('hex')});}
const release={format:1,createdAt:manifest.completedAt,sha256,bytes:bytes.length,parts,totalRows:manifest.totalRows,tableCount:manifest.tables.length,evidenceRows:manifest.projection.rows,tables:manifest.tables.map(t=>({name:t.name,version:t.version,rows:t.rows,columns:t.columns.length,archiveSha256:t.sha256}))};
await writeFile(new URL('snapshot-manifest.json',target),JSON.stringify(release,null,2)+'\n',{mode:0o600});
report.snapshot=release;report.success=true;await writeFile(new URL('qa/duckdb-lossless-verification.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({success:true,rows:release.totalRows,tables:release.tableCount,bytes:bytes.length,parts:parts.length,sha256}));
