/* Network failures never imply IndexedDB failure. No learning-state writes. */
(function(S){'use strict';
S.bankRead=async function(url,format='json',options={}){
 const {timeoutMs=15000,...request}=options,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(url,{...request,signal:controller.signal});
  if(!response.ok)throw Object.assign(Error('题库请求失败（HTTP '+response.status+'）'),{name:'BankRequestError',category:'bank-http',status:response.status});
  return format==='buffer'?await response.arrayBuffer():await response.json();
 }catch(error){
  if(error.name==='BankRequestError')throw error;
  if(error.name==='SyntaxError')throw Object.assign(Error('题库清单或分片未返回有效JSON，请核对题库站部署'),{name:'BankFormatError',category:'bank-format'});
  const interrupted=controller.signal.aborted||error.name==='AbortError'||/abort|cancel/i.test(error.message||'');
  throw Object.assign(Error(interrupted?'题库请求超时或被中断，已有题库仍可使用':'题库网络连接未完成，请联网后重试'),{name:'BankRequestError',category:interrupted?'bank-interrupted':'bank-network'});
 }finally{clearTimeout(timer);}
};
S.bankErrorMessage=function(error){
 if(String(error?.category||'').startsWith('bank-'))return error.message+'；本机学习记录保留。';
 if(S.isLocalStorageError?.(error))return '本地数据库暂时不可用：'+error.message+'。请保留当前页面并先导出学习备份。';
 return '题库接入未完成：'+String(error?.message||error)+'。已成功接入的分片和本机记录保留。';
};
})(window.Study=window.Study||{});
