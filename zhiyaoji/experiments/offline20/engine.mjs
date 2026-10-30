// Isolated metadata-only experiment. No network, DOM, production DB, or ink access.
export const QUOTAS = Object.freeze({verbal: 8, reasoning: 7, data: 5});
export const RULE_VERSION = 'offline20-experiment-1';
const copy = x => structuredClone(x);
const DAY = 86400000;
export function beijingDate(time) { return new Date(time + 8 * 3600000).toISOString().slice(0,10); }
function randomRank(seed, id) {
  let n = 2166136261;
  for (const c of seed + ':' + id) n = Math.imul(n ^ c.codePointAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
const keys = q => [...new Set([`id:${q.id}`, ...(q.identities || [])])];

// Unite aliases transitively, so a canonical-ID record can meet a source-ID record.
function newIdentityIndex() {
  const parent = new Map();
  function root(k) { if (!parent.has(k)) parent.set(k,k); let x=k; while(parent.get(x)!==x)x=parent.get(x); while(parent.get(k)!==k){const n=parent.get(k);parent.set(k,x);k=n;} return x; }
  return {add(q){const ks=keys(q); const first=root(ks[0]);for(const k of ks)parent.set(root(k),first);},key: q=>root(keys(q)[0]), roots:ks=>new Set(ks.map(root))};
}
export function identityIndex(questions) {
  const index=newIdentityIndex();for(const q of questions)index.add(q);return index;
}
export function summarize(questions, sessions, {now, trainingWeight=3, minRecent=5, preparedIdentity}={}) {
  const byId=new Map(questions.map(q=>[q.id,q]));
  const identity=preparedIdentity||identityIndex(questions);
  const latest=new Map();
  for(const s of sessions){const old=latest.get(s.id);if(!old || (s.revision||0)>(old.revision||0) || ((s.revision||0)===(old.revision||0)&&(s.updatedAt||0)>(old.updatedAt||0)))latest.set(s.id,s);}
  const seenKeys=new Set(), samples=[], diagnostics={unconfirmed:0,excluded:0,unanswered:0,lowConfidence:0,unknownConfidence:0};
  for(const s of latest.values()) {
    const unique=new Set();
    for(const r of s.rows||[]) {
      const q=byId.get(r.questionId);
      // All exposed rows count as seen, even excluded, unconfirmed, or unfinished.
      for(const k of q?keys(q):[`id:${r.questionId}`,...(r.identities||[])])seenKeys.add(k);
      if(!q)continue;
      const key=identity.key(q);if(unique.has(key))continue;unique.add(key);
      if(!s.finished || !s.confirmed){diagnostics.unconfirmed++;continue;}
      if(!r.included){diagnostics.excluded++;continue;}
      if(r.outcome==='unanswered'){diagnostics.unanswered++;continue;}
      if(!['correct','wrong'].includes(r.outcome))continue;
      if(r.confidence==='unknown'||!r.confidence)diagnostics.unknownConfidence++;
      const low = r.outcome==='correct' && (['A1','A2'].includes(r.confidence)||r.prompted===true||r.guessed===true);
      if(low)diagnostics.lowConfidence++;
      if(!Number.isFinite(s.finishedAt)||s.finishedAt>now)continue;
      samples.push({q,sessionId:s.id,date:s.finishedAt,training:s.training===true,weight:s.training===true?trainingWeight:1,outcome:r.outcome,low,key});
    }
  }
  const windows={};
  for(const sub of Object.keys(QUOTAS)){const count=samples.filter(x=>x.q.subject===sub&&now-x.date<=7*DAY).length;windows[sub]=count>=minRecent?7:14;}
  const stats=new Map();
  // One original question is one independent sample, latest eligible observation wins.
  const independent=new Map();
  for(const x of samples){if(now-x.date>windows[x.q.subject]*DAY)continue;const old=independent.get(x.key);if(!old||x.date>old.date)independent.set(x.key,x);}
  for(const x of independent.values()) {
    const k=x.q.subject+':'+x.q.topic;
    if(!stats.has(k))stats.set(k,{key:k,subject:x.q.subject,topic:x.q.topic,n:0,wrong:0,denominator:0,errorWeight:0,wrongSessions:new Set(),lastWrong:0,lastTraining:null,difficulties:[],uncertain:0});
    const t=stats.get(k);t.n++;
    if(x.low)t.uncertain++;else {t.denominator+=x.weight;if(x.outcome==='wrong'){t.wrong++;t.errorWeight+=x.weight;t.wrongSessions.add(x.sessionId);t.lastWrong=Math.max(t.lastWrong,x.date);}}
    if(x.training&&(!t.lastTraining||x.date>t.lastTraining.date))t.lastTraining={date:x.date,outcome:x.low?'uncertain':x.outcome};
    if(x.q.difficulty!==null&&x.q.difficulty!==undefined&&Number.isFinite(x.q.difficulty))t.difficulties.push(x.q.difficulty);
  }
  const ranked=[...stats.values()].map(t=>{
    const repeated=t.wrongSessions.size>=2;
    const trainWrong=t.lastTraining?.outcome==='wrong';
    const tier=t.wrong?(repeated||trainWrong?2:1):0;
    const rate=t.denominator?t.errorWeight/t.denominator:0;
    const ds=t.difficulties.sort((a,b)=>a-b);
    return {...t,wrongSessions:t.wrongSessions.size,tier,rate,priority:tier*100+rate*50+(t.uncertain?5:0),difficulty:ds.length?ds[Math.floor(ds.length/2)]:null};
  }).sort((a,b)=>b.priority-a.priority||b.lastWrong-a.lastWrong||a.key.localeCompare(b.key));
  return {stats:ranked,seenKeys:[...seenKeys],windows,diagnostics,sessionCount:latest.size};
}

export async function generate({questions,sessions,now,owner,mode='strict',seed=beijingDate(now),blockedKeys=[],policy={},signal,yieldControl=()=>new Promise(r=>setTimeout(r,0))}) {
  if(!owner)throw Error('owner required');
  if(!Number.isFinite(now))throw Error('valid now required');
  const aliases=newIdentityIndex();
  for(let i=0;i<questions.length;i++){if(signal?.aborted)throw Error('cancelled');aliases.add(questions[i]);if(i%256===255)await yieldControl();}
  const summary=summarize(questions,sessions,{now,...policy,preparedIdentity:aliases});
  const seen=aliases.roots([...summary.seenKeys,...blockedKeys]);
  const stats=new Map(summary.stats.map(t=>[t.key,t]));
  const excluded={}, units=new Map();let processed=0;
  const reject=why=>{excluded[why]=(excluded[why]||0)+1;};
  for(const q of questions) {
    if(signal?.aborted)throw Error('cancelled');
    if(++processed%500===0)await yieldControl();
    if(!Object.hasOwn(QUOTAS,q.subject))continue;
    const unitKey=q.materialId?`${q.subject}:material:${q.materialId}`:`${q.subject}:question:${q.id}`;
    if(!units.has(unitKey))units.set(unitKey,{id:unitKey,subject:q.subject,rows:[],valid:true,reasons:new Set()});
    const u=units.get(unitKey);u.rows.push(q);
    const invalid=why=>{u.valid=false;u.reasons.add(why);reject(why);};
    if(q.complete!==true)invalid('incomplete');
    if(q.disputed===true)invalid('disputed');
    if(q.suspectedDuplicate===true)invalid('suspected_duplicate');
    if(seen.has(aliases.key(q)))invalid('seen');
    if(mode==='strict' && q.verified!==true)invalid('unverified_answer');
    if(mode==='strict' && q.offlineMedia!==true)invalid('offline_media_unavailable');
    if(!q.topic||q.topicKnown!==true)invalid('unknown_topic');
    if(!Number.isFinite(q.difficulty))invalid('unknown_difficulty');
    const t=stats.get(q.subject+':'+q.topic);
    if(t?.difficulty!==null&&t?.difficulty!==undefined&&Math.abs(q.difficulty-t.difficulty)>(policy.difficultyTolerance??15))invalid('difficulty_mismatch');
    if(q.recentJiangsu===true)invalid('reserved_jiangsu');
  }
  let candidates=[...units.values()].filter(u=>{
    if(!u.valid)return false;
    if(u.rows[0].materialId){const n=u.rows[0].expectedCount;if(!Number.isInteger(n)||n!==u.rows.length||u.rows.some(q=>q.expectedCount!==n)){reject('incomplete_material_group');return false;}}
    const ks=u.rows.map(q=>aliases.key(q));if(new Set(ks).size!==ks.length){reject('duplicate_inside_group');return false;}return true;
  });
  const selected=[],shortages=[],balanceExceptions=[];const selectedIdentities=new Set();let searchLimited=false;
  for(const [subject,quota] of Object.entries(QUOTAS)) {
    const all=candidates.filter(u=>u.subject===subject).map(u=>{
      const labels=u.rows.map(q=>stats.get(q.subject+':'+q.topic));
      const score=labels.reduce((n,t)=>n+(t?.priority||1),0)+u.rows.reduce((n,q)=>n+randomRank(seed,q.id)*.01,0);
      return {...u,score};
    }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    const bucketCounts=new Map(),bucketAliases=new Map(),pool=[];
    for(const u of all){
      const shape=u.rows.map(q=>q.topic).sort().join('|');
      const fingerprint=u.rows.map(q=>aliases.key(q)).sort().join('|');
      if(!bucketAliases.has(shape))bucketAliases.set(shape,new Set());
      if(bucketAliases.get(shape).has(fingerprint))continue;
      bucketAliases.get(shape).add(fingerprint);
      const n=bucketCounts.get(shape)||0;
      if(n>=(policy.unitsPerShape??24)){searchLimited=true;continue;}
      bucketCounts.set(shape,n+1);pool.push(u);
    }
    // Bounded beam search reports its own limitation rather than claiming impossibility.
    const dp=Array.from({length:quota+1},()=>[]);dp[0]=[{rows:[],units:[],identities:new Set(),types:{},score:0,focus:0}];
    const beam=policy.beamWidth??24;
    let lastYield=performance.now();
    for(let i=0;i<pool.length;i++) {
      if(signal?.aborted)throw Error('cancelled');
      if(performance.now()-lastYield>=8){await yieldControl();lastYield=performance.now();}
      const u=pool[i],n=u.rows.length;if(n>quota)continue;
      const ukeys=u.rows.map(q=>aliases.key(q));if(ukeys.some(k=>selectedIdentities.has(k)))continue;
      for(let count=quota-n;count>=0;count--) {
        for(const state of [...dp[count]]) {
          if(ukeys.some(k=>state.identities.has(k)))continue;
          const types={...state.types};for(const q of u.rows)types[q.topic]=(types[q.topic]||0)+1;
          let allowed=true;for(const [topic,num]of Object.entries(types)){const sameUnit=u.rows.filter(q=>q.topic===topic).length;const limit=sameUnit>4?sameUnit:4;if(num>limit)allowed=false;}
          if(!allowed)continue;
          const identities=new Set([...state.identities,...ukeys]);
          dp[count+n].push({rows:[...state.rows,...u.rows],units:[...state.units,u.id],identities,types,score:state.score+u.score,focus:state.focus+u.rows.filter(q=>stats.get(q.subject+':'+q.topic)?.wrong>0).length});
        }
        dp[count+n].sort((a,b)=>b.score-a.score);
        const sizes=new Map();dp[count+n]=dp[count+n].filter(s=>{const size=sizes.get(s.focus)||0;sizes.set(s.focus,size+1);if(size>=beam){searchLimited=true;return false;}return true;});
      }
    }
    const balanced=dp[quota].filter(s=>s.focus<=Math.ceil(quota*2/3));
    const best=balanced[0]||dp[quota][0];
    if(!best){shortages.push({subject,required:quota,eligibleUnits:pool.length,reason:searchLimited?'search_budget_no_plan':'insufficient_compatible_units'});continue;}
    if(!balanced.length&&best.focus>Math.ceil(quota*2/3))balanceExceptions.push({subject,reason:'complete_group_or_available_pool',focus:best.focus,total:quota});
    for(const k of best.identities)selectedIdentities.add(k);
    selected.push(...best.rows);
  }
  const ready=!shortages.length&&selected.length===20;
  return {version:RULE_VERSION,date:beijingDate(now),owner,mode,status:ready?(mode==='strict'?'ready':'preview_only'):'blocked',canStart:ready&&mode==='strict',quotas:QUOTAS,questions:selected.map(q=>({id:q.id,subject:q.subject,topic:q.topic,difficulty:q.difficulty,materialId:q.materialId||null,reason:stats.get(q.subject+':'+q.topic)?.wrong?'近期纳入证据中该细型有错题':'保持或诊断',verification:q.verified===true?'verified':'unverified',difficultyBasis:q.difficultyBasis||'unknown'})),summary,shortages,excluded,searchLimited,balanceExceptions,eligibleUnits:candidates.length};
}

// Adapter contract: createIfAbsent must be atomic (real integration requires an IDB transaction).
export class PlanManager {
  constructor(store){this.store=store;}
  async open(input){
    const active=await this.store.findActive(input.owner);if(active)return copy(active);
    const key=input.owner+':'+beijingDate(input.now);
    const existing=await this.store.get(key);if(existing)return copy(existing);
    const p=await generate(input);if(!p.canStart)return p;
    return copy(await this.store.createIfAbsent(key,p));
  }
}
