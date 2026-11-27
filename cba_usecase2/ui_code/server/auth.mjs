import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHmac,randomBytes} from 'node:crypto';
const namespaceKey=randomBytes(32);
const digest=value=>createHmac('sha256',namespaceKey).update(value).digest('hex');
export const deployed=()=>Boolean(process.env.DATABRICKS_APP_NAME||process.env.DATABRICKS_APP_PORT);
export const authMode=()=>deployed()?'user':(process.env.AUTH_MODE||'local');
const exec=promisify(execFile);
let localToken=null;
export const HOST='https://adb-7405609252709772.12.azuredatabricks.net';
export class AppError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code});}}
export async function authenticate(req,{model=false}={}){
 if(process.env.MOCK_DATABRICKS==='1'){
  if(deployed())throw new AppError(503,'MOCK_DISABLED','Synthetic mode is unavailable in deployed apps.');
  return {token:'synthetic-only',namespace:digest(req.headers['x-synthetic-user']||'synthetic'),userKey:digest(req.headers['x-synthetic-user']||'synthetic')};
 }
 const viewer=authMode()==='user'?req.headers['x-forwarded-user']:'local-loopback';
 if(authMode()==='user'&&(typeof viewer!=='string'||!viewer.trim()||viewer.length>1000))throw new AppError(401,'AUTH_REQUIRED','Sign in to access this app.');
 const principal=digest(viewer);
 if(!model)return {namespace:principal,userKey:principal};
 let token;
 if(authMode()==='user'){
  token=req.headers['x-forwarded-access-token'];
  if(typeof token!=='string'||!token.trim())throw new AppError(401,'AUTH_REQUIRED','Sign in and authorize model access for this app.');
 }else{
  if(!localToken||localToken.expires<Date.now()){
   try{const {stdout}=await exec('az',['account','get-access-token','--resource','2ff814a6-3304-4ab8-85cb-cd0e6f879c1d','--query','accessToken','-o','tsv','--only-show-errors'],{maxBuffer:256*1024,timeout:20000});localToken={value:stdout.trim(),expires:Date.now()+5*60*1000};}catch{throw new AppError(401,'LOCAL_AUTH_REQUIRED','Local Azure CLI sign-in is required.');}
  }
  token=localToken.value;
 }
 if(!token||token.length>16000)throw new AppError(401,'AUTH_REQUIRED','Authorization is unavailable.');
 return {token,namespace:digest(principal+':'+token),userKey:principal};
}
export async function databricks(auth,path,{body,method,timeout=30000}={}){
 if(!path.startsWith('/api/2.0/serving-endpoints/')&&!path.startsWith('/serving-endpoints/'))throw new AppError(500,'API_SCOPE','Invalid backend path.');
 let response;
 try{response=await fetch(HOST+path,{method:method||(body?'POST':'GET'),headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeout),redirect:'error'});}catch{throw new AppError(504,'BACKEND_TIMEOUT','Databricks did not respond in time. Please retry.');}
 if(!response.ok){const status=response.status;await response.body?.cancel();throw new AppError(status===401?401:status===403?403:502,status===403?'ACCESS_DENIED':'BACKEND_ERROR',status===403?'Your Databricks identity does not have access to this resource.':'Databricks could not complete the request.');}
 try{return await response.json();}catch{throw new AppError(502,'BACKEND_RESPONSE','Databricks returned an invalid response.');}
}
