// Non-staged release operator. Dry-run performs reads only. No app creation,
// compute start/stop, permission updates, resource changes or catalog operations.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,readdir,lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const HOST='https://adb-7405609252709772.12.azuredatabricks.net',APP='commbank-customer-insights',APP_ID='7c05b422-8a65-4a79-ae32-5f8fa06b32d2',OWNER='misha_tolmachev@epam.com';
const BASE='/Workspace/Users/'+OWNER+'/commbank-customer-insights-releases';
const proposalFile=join(root,'docs/databricks-redeploy-proposal.json'),proofFile=join(root,'qa/databricks-redeploy-applied.json');
const stage=join(root,'deploy-stage'),sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=value=>JSON.stringify(normalize(value));
function normalize(v){if(Array.isArray(v))return v.map(normalize).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));return v;}
const args=process.argv.slice(2),apply=args.includes('--apply');
if(args.some(a=>!['--apply','--dry-run'].includes(a))||apply&&args.includes('--dry-run'))throw Error('Use --dry-run (default) or --apply.');
const selfHash=sha(await readFile(fileURLToPath(import.meta.url))),files=[];
async function walk(relative=''){
 for(const entry of await readdir(join(stage,relative),{withFileTypes:true})){
  const path=relative?relative+'/'+entry.name:entry.name;
  if(entry.isSymbolicLink())throw Error('Stage symlink forbidden.');
  if(entry.isDirectory())await walk(path);
  else if(entry.isFile()){
   const allowed=/^data\/snapshot-(?:manifest\.json|[0-9]{3}\.bin)$/.test(path)||['app.yaml','package.json','package-lock.json','server.mjs','config/taxonomy.json','config/taxonomy-source.yaml'].includes(path)||/^server\/[A-Za-z0-9_./-]+\.(?:mjs|js|json)$/.test(path)||/^public\/[A-Za-z0-9_./-]+\.(?:html|css|js|svg|png|jpe?g|webp|ico|woff2?)$/.test(path);
   if(!allowed||path.startsWith('public/data/')||path==='public/assets/axe.min.js'||path.split('/').some(p=>p.startsWith('.'))||/\.(?:test|spec)\./.test(path))throw Error('Non-allowlisted staged file.');
   const bytes=await readFile(join(stage,path));
   if(sha(await readFile(join(root,path)))!==sha(bytes))throw Error('Stage differs from current source: '+path);
   files.push({path,bytes:bytes.length,sha256:sha(bytes),content:bytes});
  }else throw Error('Stage requires regular files.');
 }
}
const stageStat=await lstat(stage);if(!stageStat.isDirectory()||stageStat.isSymbolicLink())throw Error('Stage is not a real directory.');await walk();files.sort((a,b)=>a.path.localeCompare(b.path));
for(const p of ['app.yaml','package.json','package-lock.json','server.mjs','config/taxonomy.json','config/taxonomy-source.yaml'])if(!files.some(f=>f.path===p))throw Error('Incomplete stage.');
const manifest=files.map(({path,bytes,sha256})=>({path,bytes,sha256})),manifestHash=sha(JSON.stringify(manifest)),sourceHash=manifestHash;
let reviewed;
if(apply){reviewed=JSON.parse(await readFile(proposalFile,'utf8'));if(reviewed.host!==HOST||reviewed.appName!==APP||reviewed.appId!==APP_ID||reviewed.selfHash!==selfHash||reviewed.sourceHash!==sourceHash||reviewed.manifestHash!==manifestHash||!reviewed.runId||!new RegExp('^'+BASE.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/[0-9TZ-]+-[a-f0-9]{8}$').test(reviewed.sourceCodePath))throw Error('Reviewed proposal does not match operator/source/stage.');}
let token;
try{const {stdout}=await promisify(execFile)('az',['account','get-access-token','--resource','2ff814a6-3304-4ab8-85cb-cd0e6f879c1d','--query','accessToken','-o','tsv','--only-show-errors'],{maxBuffer:256*1024,timeout:20000});token=stdout.trim();if(!token)throw Error();}catch{throw Error('Azure CLI user authorization unavailable.');}
let source=reviewed?.sourceCodePath;
async function api(path,{method='GET',body,missing=false}={}){
 const inSource=p=>typeof p==='string'&&(p===source||p.startsWith(source+'/'))&&!p.split('/').includes('..');
 const mutationAllowed=apply&&((path==='/api/2.0/workspace/mkdirs'&&method==='POST'&&inSource(body?.path))||(path==='/api/2.0/workspace/import'&&method==='POST'&&inSource(body?.path)&&body?.format==='RAW'&&body?.overwrite===false)||(path==='/api/2.0/apps/'+APP+'/deployments'&&method==='POST'&&body?.mode==='SNAPSHOT'&&body?.source_code_path===source));
 if(!path.startsWith('/api/2.0/')||(method!=='GET'&&!mutationAllowed))throw Error('Operator API operation is forbidden.');
 let r;try{r=await fetch(HOST+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Error('API transport failure: '+method+' '+path.split('?')[0]);}
 if(missing&&r.status===404){await r.body?.cancel();return null;}
 if(!r.ok){await r.body?.cancel();throw Error('API HTTP '+r.status+': '+method+' '+path.split('?')[0]);}
 try{return await r.json();}catch{throw Error('API invalid JSON: '+method+' '+path.split('?')[0]);}
}
const appPath='/api/2.0/apps/'+APP;
function activeId(app){return app.active_deployment?.deployment_id||app.active_deployment?.id||null;}
function fingerprintACL(payload){const rows=(payload.access_control_list||[]).map(a=>({user:a.user_name||null,group:a.group_name||null,servicePrincipal:a.service_principal_name||null,permissions:a.all_permissions||[]}));return {sha256:sha(canonical(rows)),principals:rows.length,users:rows.filter(a=>a.user).length,groups:rows.filter(a=>a.group).length,servicePrincipals:rows.filter(a=>a.servicePrincipal).length,canUsePrincipals:rows.filter(a=>a.permissions.some(p=>p.permission_level==='CAN_USE')).length};}
async function snapshot(){const app=await api(appPath),permissions=await api('/api/2.0/permissions/apps/'+APP);if(app.id!==APP_ID)throw Error('Unexpected app identity.');const scopes=app.user_api_scopes||[],resources=app.resources||[];return {appId:app.id,scopes:[...scopes].sort(),resourcesHash:sha(canonical(resources)),resourceCount:resources.length,acl:fingerprintACL(permissions),activeDeploymentId:activeId(app),computeState:app.compute_status?.state||null,appState:app.app_status?.state||null};}
function sameConfig(current,baseline){return current.appId===baseline.appId&&canonical(current.scopes)===canonical(baseline.scopes)&&current.resourcesHash===baseline.resourcesHash&&current.resourceCount===baseline.resourceCount&&current.acl.sha256===baseline.acl.sha256;}
try{
 const me=await api('/api/2.0/preview/scim/v2/Me');if(me.userName!==OWNER)throw Error('Workspace user differs from release owner.');
 const current=await snapshot();if(current.computeState!=='ACTIVE')throw Error('Existing app compute must already be ACTIVE.');
 if(!apply){
  if(!current.activeDeploymentId)throw Error('Cannot identify active deployment baseline.');
  const runId=randomUUID(),release=new Date().toISOString().replace(/[:.]/g,'-')+'-'+runId.slice(0,8);source=BASE+'/'+release;
  const existing=await api('/api/2.0/workspace/get-status?path='+encodeURIComponent(source),{missing:true});if(existing)throw Error('Release folder already exists.');
  const proposal={createdAt:new Date().toISOString(),runId,host:HOST,appName:APP,appId:APP_ID,sourceCodePath:source,selfHash,sourceHash,manifestHash,files:manifest,baseline:current,verifiedWorkspaceUserHash:sha(me.userName),mode:'SNAPSHOT',permittedMutations:['mkdirs/import within this new release folder','POST existing app deployment only']};
  await writeFile(proposalFile,JSON.stringify(proposal,null,2)+'\n');console.log(JSON.stringify({dryRun:true,proposalFile,manifestHash,fileCount:files.length,acl:current.acl}));
 }else{
  let state;try{state=JSON.parse(await readFile(proofFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(state&&(state.runId!==reviewed.runId||state.manifestHash!==manifestHash||state.selfHash!==selfHash||state.sourceCodePath!==source))throw Error('Existing release proof belongs to another run; preserve it before proceeding.');
  if(!sameConfig(current,reviewed.baseline))throw Error('App ACL/scopes/resources changed since review.');
  const permittedActiveIds=[reviewed.baseline.activeDeploymentId,state?.deploymentId].filter(Boolean);
  if(!permittedActiveIds.includes(current.activeDeploymentId))throw Error('Active deployment changed since review.');
  state??={runId:reviewed.runId,createdAt:new Date().toISOString(),host:HOST,appName:APP,appId:APP_ID,sourceCodePath:source,selfHash,sourceHash,manifestHash,files:manifest,baseline:reviewed.baseline,status:'starting'};
  const save=async()=>{state.updatedAt=new Date().toISOString();await writeFile(proofFile,JSON.stringify(state,null,2)+'\n');};
  const status=()=>api('/api/2.0/workspace/get-status?path='+encodeURIComponent(source),{missing:true});
  async function remoteFiles(){const found=[];async function visit(path){const listing=await api('/api/2.0/workspace/list?path='+encodeURIComponent(path));if(listing.has_more)throw Error('Workspace listing truncated.');for(const item of listing.objects||[]){if(!item.path?.startsWith(source+'/'))throw Error('Unexpected listing path.');if(item.object_type==='DIRECTORY')await visit(item.path);else if(item.object_type==='FILE')found.push(item.path.slice(source.length+1));else throw Error('Unexpected workspace object type.');}}await visit(source);return found.sort();}
  async function verify(file){const result=await api('/api/2.0/workspace/export?path='+encodeURIComponent(source+'/'+file.path)+'&format=AUTO');if(typeof result.content!=='string')throw Error('Export missing file bytes.');const bytes=Buffer.from(result.content,'base64');if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('Remote hash mismatch: '+file.path);}
  try{
   let folder=await status();if(folder&&(!state.sourceObjectId||String(folder.object_id)!==state.sourceObjectId||folder.object_type!=='DIRECTORY'))throw Error('Unknown release folder; refusing to resume.');
   if(!folder){if(state.sourceObjectId)throw Error('Recorded release folder disappeared.');await save();await api('/api/2.0/workspace/mkdirs',{method:'POST',body:{path:source}});folder=await status();if(!folder?.object_id||folder.object_type!=='DIRECTORY')throw Error('Release folder verification failed.');state.sourceObjectId=String(folder.object_id);state.status='uploading';await save();}
   if(!state.deploymentId){
    const dirs=[...new Set(files.map(f=>dirname(f.path)).filter(d=>d!=='.'))].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));for(const dir of dirs)await api('/api/2.0/workspace/mkdirs',{method:'POST',body:{path:source+'/'+dir}});
    const present=new Set(await remoteFiles());if([...present].some(p=>!files.some(f=>f.path===p)))throw Error('Unknown files in release.');
    for(const file of files){if(present.has(file.path))await verify(file);else await api('/api/2.0/workspace/import',{method:'POST',body:{path:source+'/'+file.path,format:'RAW',overwrite:false,content:file.content.toString('base64')}});}
   }
   const listed=await remoteFiles();if(JSON.stringify(listed)!==JSON.stringify(files.map(f=>f.path).sort()))throw Error('Release file list differs from reviewed manifest.');for(const file of files)await verify(file);state.remoteByteVerification={fileCount:files.length,manifestHash,verifiedAt:new Date().toISOString()};state.status='uploaded-byte-verified';await save();
   const beforeDeploy=await snapshot();if(!sameConfig(beforeDeploy,reviewed.baseline)||!permittedActiveIds.includes(beforeDeploy.activeDeploymentId)||beforeDeploy.computeState!=='ACTIVE')throw Error('App baseline changed before deployment.');
   if(!state.deploymentId){
    // A recorded intent prevents duplicate deployment after an ambiguous network
    // outcome. Such an outcome needs an operator to reconcile the deployment ID.
    if(state.deploymentIntentAt)throw Error('Deployment outcome ambiguous; reconcile existing deployment before resuming.');
    state.deploymentIntentAt=new Date().toISOString();await save();
    const deployment=await api(appPath+'/deployments',{method:'POST',body:{source_code_path:source,mode:'SNAPSHOT'}});state.deploymentId=deployment.deployment_id||deployment.id;if(!state.deploymentId)throw Error('Deployment ID missing.');state.status='deployment-requested';await save();
   }
   const deadline=Date.now()+8*60*1000;
   while(true){
    const deployment=await api(appPath+'/deployments/'+encodeURIComponent(state.deploymentId)),latest=await snapshot();state.deploymentState=deployment.status?.state||null;state.latest=latest;
    if(!sameConfig(latest,reviewed.baseline))throw Error('ACL/scopes/resources changed during deployment.');
    if(['FAILED','STOPPED','CANCELLED','CANCELED'].includes(state.deploymentState))throw Error('Release deployment failed.');
    if(state.deploymentState==='SUCCEEDED'&&latest.appState==='RUNNING'&&latest.computeState==='ACTIVE'&&latest.activeDeploymentId===state.deploymentId){state.status='deployed';state.finishedAt=new Date().toISOString();await save();break;}
    if(Date.now()>=deadline){state.status='waiting-for-deployment';state.resumable=true;await save();break;}
    state.status='deploying';await save();await new Promise(resolve=>setTimeout(resolve,5000));
   }
   console.log(JSON.stringify({proofFile,status:state.status,sourceCodePath:source,manifestHash,deploymentId:state.deploymentId,acl:state.latest?.acl}));
  }catch(error){state.status='stopped';state.error=error.message;await save();throw error;}
 }
}finally{token=undefined;}
