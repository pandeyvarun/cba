import {query} from './duckdb.mjs';
export const sql=(_auth,statement,parameters=[])=>query(statement,parameters);
export const baseQuery=()=> 'WITH evidence AS (SELECT * FROM app_evidence) ';
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
