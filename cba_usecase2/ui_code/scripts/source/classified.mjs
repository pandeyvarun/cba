import {createHash} from 'node:crypto';
export const PRODUCTS={yaml:'ai_lab_in_usecase4.landing.commbank_user_comments_categorized',product:'ai_lab_in_usecase4.landing.comments_classified',business:'ai_lab_in_usecase4.landing.intel_business_only'};
export const BANKS=['CommBank','ANZ','NAB','Westpac'];
export const PROFILES=['business','personal','general'];
export const AREAS=['Statements','Transaction','Non Functional','Onboarding','Other (not classifiable)'];
export const SENTIMENTS=['Negative','Mixed','Neutral','Positive'];
export const ALIASES=['CommBank YAML labels','CommBank product labels','Business competitor evidence and analysis'];
export const topicId=(primary,secondary)=>'topic-'+createHash('sha256').update(JSON.stringify(['product',primary,secondary])).digest('hex').slice(0,20);
export const RECORD_ID=/^(?:cba-[a-f0-9]{32}|bi-[a-f0-9]{32}-[1-9][0-9]{0,5})$/;
const fingerprint=`sha2(concat_ws(chr(31),coalesce(source,''),coalesce(userid,''),coalesce(cast(try_cast(date AS DATE) AS STRING),''),coalesce(comment,'')),256)`;
const safeArea=column=>`CASE WHEN ${column} IN (${AREAS.map(a=>"'"+a+"'").join(',')}) THEN ${column} ELSE 'Other (not classifiable)' END`;
// These CTEs are shared by totals, filtered rows, citation lookups and prompts.
// Classification axes remain separate. No keyword classification or raw-bank inference.
export function classifiedQuery(){return `WITH yaml_keys AS (
 SELECT *,${fingerprint} join_key FROM ${PRODUCTS.yaml}
), product_keys AS (
 SELECT *,${fingerprint} join_key FROM ${PRODUCTS.product}
), cba_joined AS (
 SELECT p.*,y.category1 y_profile_label,y.category2 y_issue FROM product_keys p INNER JOIN yaml_keys y ON p.join_key=y.join_key
), topic_pairs AS (
 SELECT DISTINCT ${safeArea('primary_area')} primary_area,coalesce(nullif(trim(secondary_area),''),'Unmapped topic') secondary_area FROM product_keys
 UNION SELECT DISTINCT primary_area,secondary_area FROM ${PRODUCTS.business} WHERE primary_area IN ('Statements','Transaction','Non Functional','Onboarding') AND secondary_area IS NOT NULL
), topic_map AS (
 SELECT secondary_area,CASE WHEN COUNT(DISTINCT primary_area)=1 THEN MIN(primary_area) ELSE 'Other (not classifiable)' END primary_area FROM topic_pairs GROUP BY secondary_area
), bi_keys AS (
 SELECT *,sha2(to_json(named_struct('bank',evidence_bank,'source',evidence_source,'date',evidence_date,'rating',evidence_rating,'topic',evidence_secondary_area,'comment',evidence_comment)),256) evidence_key
 FROM ${PRODUCTS.business} WHERE evidence_bank IN ('ANZ','NAB','Westpac') AND evidence_comment IS NOT NULL AND trim(evidence_comment)<>''
), evidence AS (
 SELECT concat('cba-',substring(join_key,1,32)) id,'CommBank' bank,coalesce(source,'Unknown') source,try_cast(date AS DATE) record_date,try_cast(rating AS INT) rating,substring(coalesce(comment,''),1,240) quote,
 CASE account_type WHEN 'Business' THEN 'business' WHEN 'Personal' THEN 'personal' WHEN 'General' THEN 'general' END p_profile,
 CASE y_profile_label WHEN 'business profile' THEN 'business' WHEN 'personal profile' THEN 'personal' WHEN 'general profile' THEN 'general' END y_profile,
 ${safeArea('primary_area')} p_issue,y_issue,coalesce(nullif(trim(secondary_area),''),'Unmapped topic') topic,
 CASE WHEN sentiment IN ('Negative','Mixed','Neutral','Positive') THEN sentiment ELSE 'Unknown' END sentiment,false primary_derived,'CommBank product labels' label_product
 FROM cba_joined
 UNION ALL
 SELECT concat('bi-',substring(b.evidence_key,1,32),'-',cast(row_number() OVER (PARTITION BY b.evidence_key ORDER BY b.evidence_key) AS STRING)) id,
 b.evidence_bank bank,coalesce(b.evidence_source,'Unknown') source,try_cast(b.evidence_date AS DATE) record_date,try_cast(b.evidence_rating AS INT) rating,substring(b.evidence_comment,1,240) quote,
 'business' p_profile,cast(NULL AS STRING) y_profile,coalesce(m.primary_area,'Other (not classifiable)') p_issue,cast(NULL AS STRING) y_issue,coalesce(nullif(trim(b.evidence_secondary_area),''),'Unmapped topic') topic,
 CASE WHEN b.evidence_sentiment IN ('Negative','Mixed','Neutral','Positive') THEN b.evidence_sentiment ELSE 'Unknown' END sentiment,true primary_derived,'Business competitor evidence' label_product
 FROM bi_keys b LEFT JOIN topic_map m ON b.evidence_secondary_area=m.secondary_area
) `;}
export const coverage=(lens,profile,bank)=>bank==='CommBank'||(lens==='product'&&profile==='business')?'classified':'not_classified';
