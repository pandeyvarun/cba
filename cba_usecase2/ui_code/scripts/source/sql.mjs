import {AppError,databricks} from './auth.mjs';
import {classifiedQuery,PRODUCTS} from './classified.mjs';
export const WAREHOUSE='3256264e23292b2f';
export const TABLES={CommBank:PRODUCTS.product,ANZ:PRODUCTS.business,NAB:PRODUCTS.business,Westpac:PRODUCTS.business};
const MAX_ACTIVE=6,MAX_USER_ACTIVE=2,MAX_QUEUED=48,MAX_USER_QUEUED=12,QUEUE_TIMEOUT_MS=30000;
let active=0;const perUser=new Map(),waiting=[];
function drain(){
 while(active<MAX_ACTIVE){
  const index=waiting.findIndex(item=>(perUser.get(item.key)||0)<MAX_USER_ACTIVE);
  if(index<0)break;
  const item=waiting.splice(index,1)[0];clearTimeout(item.timer);active++;perUser.set(item.key,(perUser.get(item.key)||0)+1);
  let released=false;item.resolve(()=>{if(released)return;released=true;active--;const remaining=(perUser.get(item.key)||1)-1;if(remaining)perUser.set(item.key,remaining);else perUser.delete(item.key);drain();});
 }
}
function acquire(auth){
 if(waiting.length>=MAX_QUEUED||waiting.filter(item=>item.key===auth.userKey).length>=MAX_USER_QUEUED)throw new AppError(503,'SQL_QUEUE_FULL','The data service is busy. Please retry shortly.');
 return new Promise((resolve,reject)=>{const item={key:auth.userKey,resolve,reject};item.timer=setTimeout(()=>{const index=waiting.indexOf(item);if(index>=0)waiting.splice(index,1);reject(new AppError(503,'SQL_QUEUE_TIMEOUT','The data service is still busy. Please retry shortly.'));drain();},QUEUE_TIMEOUT_MS);waiting.push(item);drain();});
}
export async function sql(auth,statement,parameters=[]){
 const release=await acquire(auth);let id;
 try{
  let data=await databricks(auth,'/api/2.0/sql/statements',{body:{warehouse_id:WAREHOUSE,statement,parameters,disposition:'INLINE',format:'JSON_ARRAY',wait_timeout:'10s',on_wait_timeout:'CONTINUE',row_limit:2000},timeout:15000});id=data.statement_id;
  const deadline=Date.now()+45000;
  while(['PENDING','RUNNING'].includes(data.status?.state)&&Date.now()<deadline){await new Promise(r=>setTimeout(r,700));data=await databricks(auth,'/api/2.0/sql/statements/'+encodeURIComponent(id),{timeout:12000});}
  if(['PENDING','RUNNING'].includes(data.status?.state)){await databricks(auth,'/api/2.0/sql/statements/'+encodeURIComponent(id)+'/cancel',{method:'POST',body:{}}).catch(()=>{});throw new AppError(503,'WAREHOUSE_WARMING','The Databricks warehouse is warming or the query took too long. Please retry shortly.');}
  if(data.status?.state!=='SUCCEEDED')throw new AppError(502,'SQL_FAILED','The live data query failed. Please retry or check your access.');
  if(data.manifest?.truncated||data.manifest?.total_chunk_count>1)throw new AppError(502,'RESULT_BOUND','The bounded data result exceeded its limit. Narrow the filters.');
  const names=data.manifest?.schema?.columns?.map(c=>c.name)||[];
  return (data.result?.data_array||[]).map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i]])));
 }finally{release();}
}
export const baseQuery=classifiedQuery;
export const baseParameters=()=>[];
export function topicCondition(filters,parameters){if(filters.topic==='all')return 'TRUE';parameters.push({name:'topic_primary',value:filters.topicPrimary,type:'STRING'},{name:'topic_secondary',value:filters.topicLabel,type:'STRING'});return '(p_issue = :topic_primary AND topic = :topic_secondary)';}
export function filterSQL(filters,{ignoreTopic=false}={}){
 const parameters=[{name:'profile',value:filters.profile,type:'STRING'}],axis=filters.lens==='yaml'?'y':'p',clauses=[axis+'_profile = :profile'];
 if(filters.from){clauses.push('record_date >= CAST(:from_date AS DATE)');parameters.push({name:'from_date',value:filters.from,type:'STRING'});}
 if(filters.to){clauses.push('record_date <= CAST(:to_date AS DATE)');parameters.push({name:'to_date',value:filters.to,type:'STRING'});}
 for(const [key,column,values]of [['source','source',filters.sources],['bank','bank',['CommBank',...filters.competitors]]]){
  if(!values.length){clauses.push('FALSE');continue;}
  const names=values.map((value,i)=>{const name=key+i;parameters.push({name,value,type:'STRING'});return ':'+name;});clauses.push(column+' IN ('+names.join(',')+')');
 }
 if(filters.issue!=='all'){clauses.push(axis+'_issue = :issue');parameters.push({name:'issue',value:filters.issue,type:'STRING'});}
 if(!ignoreTopic)clauses.push(topicCondition(filters,parameters));
 return {where:clauses.join(' AND '),parameters};
}
export function recordSQL(filters,cursor=null,limit=20,bank=null){
 const {where,parameters}=filterSQL(filters),sort=filters.sort;
 if(bank!==null)parameters.push({name:'records_bank',value:bank,type:'STRING'});
 const keys=sort==='rating'?['coalesce(rating,99)',"coalesce(cast(record_date AS STRING),'')",'id']:sort==='newest'?["coalesce(cast(record_date AS STRING),'')",'id']:["CASE WHEN bank='CommBank' THEN 0 ELSE 1 END","coalesce(cast(record_date AS STRING),'')",'id'];
 const directions=sort==='rating'?['ASC','DESC','ASC']:sort==='newest'?['DESC','ASC']:['ASC','DESC','ASC'];let after='';
 if(cursor){const vals=sort==='rating'?[cursor.rating??99,cursor.date||'',cursor.id]:sort==='newest'?[cursor.date||'',cursor.id]:[cursor.bank==='CommBank'?0:1,cursor.date||'',cursor.id];vals.forEach((v,i)=>parameters.push({name:'cursor'+i,value:String(v),type:typeof v==='number'?'INT':'STRING'}));after=' AND ('+keys.map((key,i)=>'('+keys.slice(0,i).map((k,j)=>k+' = :cursor'+j).concat(key+' '+(directions[i]==='ASC'?'>':'<')+' :cursor'+i).join(' AND ')+')').join(' OR ')+')';}
 return {statement:baseQuery()+'SELECT id,bank,source,CAST(record_date AS STRING) date,rating,quote,p_profile,y_profile,p_issue,y_issue,topic,sentiment,primary_derived,label_product,'+keys.map((k,i)=>k+' sort'+i).join(',')+' FROM evidence WHERE '+where+(bank!==null?' AND bank = :records_bank':'')+after+' ORDER BY '+keys.map((k,i)=>'sort'+i+' '+directions[i]).join(',')+' LIMIT '+(limit+1),parameters};
}
