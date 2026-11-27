// The only runtime data adapter. No warehouse or external-data fallback.
import {DuckDBInstance} from '@duckdb/node-api';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AppError} from './auth.mjs';
const dir=new URL('../data/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
let opening;
async function open(){
 const manifest=JSON.parse(await readFile(new URL('snapshot-manifest.json',dir),'utf8'));
 if(manifest.format!==1||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1||!manifest.parts?.length||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw Error('Invalid snapshot manifest');
 const chunks=[];for(const [i,p]of manifest.parts.entries()){
  if(p.name!=='snapshot-'+String(i).padStart(3,'0')+'.bin'||!Number.isSafeInteger(p.bytes)||p.bytes<1)throw Error('Invalid snapshot part');
  const b=await readFile(new URL(p.name,dir));if(b.length!==p.bytes||sha(b)!==p.sha256)throw Error('Snapshot part checksum mismatch');chunks.push(b);
 }
 const bytes=Buffer.concat(chunks);if(bytes.length!==manifest.bytes||sha(bytes)!==manifest.sha256)throw Error('Snapshot checksum mismatch');
 const privateDir=join(tmpdir(),'commbank-duckdb-'+manifest.sha256);await mkdir(privateDir,{recursive:true,mode:0o700});
 const path=join(privateDir,'snapshot.duckdb');
 // An atomic private-file replacement makes simultaneous replica starts safe.
 const temporary=join(privateDir,'snapshot-'+process.pid+'.tmp');await writeFile(temporary,bytes,{mode:0o600});await rename(temporary,path);
 const instance=await DuckDBInstance.create(path,{access_mode:'READ_ONLY',threads:'2',memory_limit:'512MB',enable_external_access:'false',allow_unsigned_extensions:'false',autoinstall_known_extensions:'false',autoload_known_extensions:'false',lock_configuration:'true'});
 const c=await instance.connect();let metadata;
 try{
  const read=async q=>{const r=await c.runAndReadAll(q);try{return r.getRowObjectsJson();}finally{r.closeSync();}};
  const [row]=await read('SELECT payload FROM app_metadata');metadata=JSON.parse(row.payload);
  const [count]=await read('SELECT COUNT(*) n,COUNT(DISTINCT id) ids FROM app_evidence');
  if(Number(count.n)!==manifest.evidenceRows||count.n!==count.ids)throw Error('Evidence snapshot integrity failed');
  const tables=await read("SELECT table_name FROM information_schema.tables WHERE table_schema='landing' ORDER BY table_name");
  if(tables.length!==manifest.tableCount||JSON.stringify(tables.map(t=>t.table_name))!==JSON.stringify(manifest.tables.map(t=>t.name).sort()))throw Error('Source snapshot schema incomplete');
  const [archived]=await read("SELECT COUNT(*) n FROM source_archive WHERE table_name<>'app_evidence'");if(Number(archived.n)!==manifest.totalRows)throw Error('Source snapshot archive incomplete');
 }finally{c.closeSync();}
 return{instance,manifest,metadata};
}
export async function snapshot(){if(!opening)opening=open().catch(e=>{opening=undefined;throw e;});try{return await opening;}catch{throw new AppError(503,'SNAPSHOT_UNAVAILABLE','The embedded data snapshot is unavailable or failed validation.');}}
export async function snapshotInfo(){const {manifest}=await snapshot();return{engine:'DuckDB',snapshotAt:manifest.createdAt,sha256:manifest.sha256,archivedTables:manifest.tableCount,archivedRows:manifest.totalRows};}
let active=0;const waiting=[];const MAX_QUEUED=48;
async function acquire(){if(active<4){active++;return;}if(waiting.length>=MAX_QUEUED)throw new AppError(503,'DATA_BUSY','The data service is busy. Please retry.');await new Promise((resolve,reject)=>{const item={resolve,timer:setTimeout(()=>{const i=waiting.indexOf(item);if(i>=0)waiting.splice(i,1);reject(new AppError(503,'DATA_BUSY','The data service is busy. Please retry.'));},30000)};waiting.push(item);});}
function release(){const item=waiting.shift();if(item){clearTimeout(item.timer);item.resolve();}else active--;}
export async function query(statement,parameters=[]){
 await acquire();let c;try{
  const {instance}=await snapshot();c=await instance.connect();
  // Only server-owned SELECT/CTE queries reach here. Values are always bound.
  const values=Object.fromEntries(parameters.map(p=>[p.name,p.type==='INT'?Number(p.value):p.value]));
  const q=statement.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g,'$$$1').replaceAll("date_format(record_date,'yyyy-MM')","strftime(record_date,'%Y-%m')");
  const r=await c.runAndReadAll(q,values);try{const rows=r.getRowObjectsJson();if(rows.length>2000)throw new AppError(502,'RESULT_BOUND','The bounded data result exceeded its limit.');return rows;}finally{r.closeSync();}
 }catch(e){if(e instanceof AppError)throw e;throw new AppError(500,'DATA_QUERY_FAILED','The embedded data query failed.');}finally{c?.closeSync();release();}
}
