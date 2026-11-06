'use strict';
importScripts('./local-review-engine.js?v=r74');
self.onmessage=function(event){
 const data=event.data;if(!data||data.protocol!==1)return;
 try{
  const aliases=data.aliases||{},canonical=q=>{let c=q.canonicalId||q.id||q.questionId||'',n=0;while(aliases[c]&&aliases[c]!==c&&n++<8)c=aliases[c];return c;};
  const result=LocalReviewEngine.select(data.state,{...data.options,canonical,paths:q=>q.localTopicPaths||[],allow:q=>q._allowed!==false,groupKey:q=>q._groupKey,expectedCount:q=>q._expected||0});
  const {questions,...plan}=result;
  self.postMessage({protocol:1,id:data.id,plan});
 }catch(error){self.postMessage({protocol:1,id:data.id,error:String(error.message||error)});}
};
