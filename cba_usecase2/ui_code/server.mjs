import http from 'node:http';
import {snapshot,snapshotInfo} from './server/duckdb.mjs';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {authenticate,AppError,deployed,authMode} from './server/auth.mjs';
import {metadata,summary,records,record,validateFilters,decodeCursor,validateBank,taxonomyValid,taxonomy,benchmark} from './server/data.mjs';
import {model} from './server/model.mjs';
import {RECORD_ID} from './server/classified.mjs';
import {mockMeta,mockSummary,mockRecords,mockRecord,mockModel,mockBenchmark} from './server/mock.mjs';
const root=await realpath(fileURLToPath(new URL('./public/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'sha256-62lPaUtpvg47KrxPOXYc0Ki8fkE6PNsbY5I9DpyEwZ4='; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
// AWS/TLS proxy configuration is explicit; Databricks retains its existing defaults.
let configuredOrigin;
if(!deployed()&&process.env.APP_ORIGIN){
 try{const value=new URL(process.env.APP_ORIGIN);if(!['http:','https:'].includes(value.protocol)||value.origin!==process.env.APP_ORIGIN)throw Error();configuredOrigin=value.origin;}catch{throw new Error('APP_ORIGIN must be an exact HTTP(S) origin without path, credentials or trailing slash.');}
}
if(!deployed()&&authMode()==='local'&&configuredOrigin?.startsWith('https:'))throw new Error('HTTPS deployments require AUTH_MODE=user behind an authenticated proxy.');
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp});res.end(JSON.stringify(body));};
async function bodyJSON(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AppError(415,'CONTENT_TYPE','Use JSON content type.');
 const host=process.env.DATABRICKS_APP_URL?new URL(process.env.DATABRICKS_APP_URL).host:req.headers.host;
 const allowed=configuredOrigin||((deployed()?'https://':'http://')+host);
 if(req.headers.origin!==allowed)throw new AppError(403,'ORIGIN_INVALID','This request must originate from the app.');
 let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw new AppError(413,'BODY_TOO_LARGE','The request is too large.');parts.push(chunk);}
 try{const body=JSON.parse(Buffer.concat(parts).toString());if(!body||Array.isArray(body)||typeof body!=='object')throw Error();return body;}catch{throw new AppError(400,'JSON_INVALID','Invalid JSON request.');}
}
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/api/')){
   const modelRoute=['/api/assistant','/api/suggestions'].includes(pathname);
   if((modelRoute&&req.method!=='POST')||(!modelRoute&&req.method!=='GET'))throw new AppError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
   if(pathname==='/api/health')return json(res,200,{status:'ok'});
   if(pathname==='/api/ready'){if(process.env.MOCK_DATABRICKS!=='1')await snapshot();return json(res,taxonomyValid?200:503,{status:taxonomyValid?'ready':'configuration error',taxonomyValid,authMode:authMode(),engine:'DuckDB'});}
   if(!taxonomyValid)throw new AppError(503,'TAXONOMY_INVALID','Taxonomy source hash verification failed.');
   const knownRoute=['/api/meta','/api/summary','/api/records','/api/benchmark','/api/assistant','/api/suggestions'].includes(pathname)||(pathname.startsWith('/api/records/')&&(RECORD_ID.test(pathname.slice(13))||/^[a-f0-9]{32}$/.test(pathname.slice(13))));
   if(!knownRoute)throw new AppError(404,'NOT_FOUND','API route not found.');
   const auth=await authenticate(req,{model:modelRoute}),mock=process.env.MOCK_DATABRICKS==='1';
   const modelBody=modelRoute?await bodyJSON(req):null;
   if(mock&&process.env.MOCK_DATA_FAILURE==='1')throw new AppError(503,'WAREHOUSE_WARMING','The synthetic warehouse is warming. Please retry shortly.');
   if(pathname==='/api/meta')return json(res,200,mock?mockMeta():await metadata(auth));
   const meta=mock?mockMeta():await metadata(auth);
   if(pathname==='/api/summary'){const f=validateFilters(url.searchParams,meta);return json(res,200,mock?mockSummary(f):await summary(auth,f));}
   if(pathname==='/api/records'){const f=validateFilters(url.searchParams,meta),limitText=url.searchParams.get('limit')||'20',limit=Number(limitText);if(!/^\d+$/.test(limitText)||!Number.isInteger(limit)||limit<1||limit>50)throw new AppError(400,'LIMIT_INVALID','Page size must be between 1 and 50.');const options={limit,cursor:decodeCursor(url.searchParams.get('cursor')),bank:validateBank(url.searchParams.get('bank'))};return json(res,200,mock?mockRecords(f,options):await records(auth,f,options));}
   if(pathname.startsWith('/api/records/')){const id=pathname.split('/').at(-1),lens=url.searchParams.get('lens')||'product';if(!['product','yaml'].includes(lens))throw new AppError(400,'FILTER_INVALID','Invalid classification lens.');return json(res,200,mock?mockRecord(id,lens):await record(auth,id,lens));}
   if(pathname==='/api/benchmark'){if([...url.searchParams.keys()].some(k=>k!=='topic'))throw new AppError(400,'FILTER_INVALID','Fixed-sample analysis takes only a topic; current filters do not apply.');const id=url.searchParams.get('topic');return json(res,200,mock?mockBenchmark(id,meta):await benchmark(auth,id,meta));}
   if(modelRoute){const body=modelBody,f=validateFilters(body.filters||{},meta),options={kind:pathname==='/api/assistant'?'assistant':'suggestions',question:body.question};if(options.kind==='assistant'&&(typeof options.question!=='string'||!options.question.trim()||options.question.length>300))throw new AppError(400,'QUESTION_INVALID','Enter a question up to 300 characters.');return json(res,200,mock?mockModel(f,options):await model(auth,f,options));}
   throw new AppError(404,'NOT_FOUND','API route not found.');
  }
  if(!['GET','HEAD'].includes(req.method))throw new AppError(405,'METHOD_NOT_ALLOWED','Method not allowed.');
  if(pathname.startsWith('/data/')||pathname==='/assets/axe.min.js')throw new AppError(404,'NOT_FOUND','Not found.');
  const candidate=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!candidate.startsWith(root+path.sep))throw new AppError(403,'FORBIDDEN','Forbidden');
  const actual=await realpath(candidate);
  if(!actual.startsWith(root+path.sep)||!(await stat(actual)).isFile())throw new AppError(404,'NOT_FOUND','Not found.');
  res.writeHead(200,{'Content-Type':mime[path.extname(actual)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,'Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:await readFile(actual));
 }catch(error){const known=error instanceof AppError;json(res,known?error.status:error?.code==='ENOENT'?404:500,{error:{code:known?error.code:error?.code==='ENOENT'?'NOT_FOUND':'SERVER_ERROR',message:known?error.message:error?.code==='ENOENT'?'Not found.':'The app could not complete this request.'}});}
});
if(process.env.MOCK_DATABRICKS==='1'&&deployed())throw new Error('Synthetic mode cannot run in Databricks Apps.');
const port=Number(process.env.DATABRICKS_APP_PORT||process.env.PORT||5187),host=deployed()?'0.0.0.0':(process.env.APP_HOST||'127.0.0.1');
if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('APP_HOST must be 127.0.0.1 or 0.0.0.0.');
if(!['user','local'].includes(authMode()))throw new Error('AUTH_MODE must be user or local.');
if(process.env.MOCK_DATABRICKS!=='1')await snapshot();
server.listen(port,host,()=>console.log(`CommBank insights listening on ${host}:${port}; auth=${authMode()}; mode=${process.env.MOCK_DATABRICKS==='1'?'synthetic':'classified'}`));
